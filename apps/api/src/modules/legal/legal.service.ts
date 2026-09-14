import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import { EmbeddingService } from './embedding.service';
import { extractAsOf } from './legal.asof';
import { evidenceInstruments, evidenceRetrieve, hsCodeSections, namedStatus, type RetrievedEvidence } from './legal.evidence';
import { generate, type PromptSource } from './legal.generation';
import { keepRelevant, numberMarkers } from './legal.grounding';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import {
  inIds,
  lookupGazette,
  lookupGazetteLoose,
  parseArticleNo,
  parseDocRef,
  parseLooseDocRef,
  resolveArticles,
  resolveDocuments,
} from './legal.scope';
import type { LegalAnswer, LegalCitation, LegalDocumentView, LegalProvisionView } from './legal.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOP_K = 6;
const MAX_CITATIONS = 5;
/** Evidence sections join the articles after them, never in place of one. */
const EVIDENCE_K = 3;
/**
 * Evidence relevance gate, measured 2026-09-14 on the seeded evidence layer (10 questions): the right sections sat at
 * cosine 0.27–0.41, the nearest section to an off-topic question at ≥ 0.57. Inside the domain distance alone cannot
 * tell them apart — an AEO note reached 0.34 for "thời hạn nộp thuế", whose nearest clause was 0.25, while the
 * 336/2026 status row was 0.29 against 0.25 — so a section must also stay within a margin of the best article.
 * ponytail: two in-domain data points; tune both against the notebook eval once POST /answer returns evidence.
 */
const EVIDENCE_MAX_DIST = 0.5;
const EVIDENCE_MARGIN = 0.05;
const HS_CODE = /(?<!\d)\d{4}\.\d{2}\.\d{2}(?!\d)/g;
/** Evidence enters the prompt cut here (≈ the embedded window); the citation keeps the whole body. */
const EVIDENCE_PROMPT_CHARS = 6000;

/**
 * Legal RAG lookup: embed the question → hybrid retrieve (keyword + dense, valid-
 * time hard-filtered) → keep only grounded provisions → optionally synthesise a
 * grounded prose answer → return the VERBATIM provisions as citations. Abstains
 * (empty citations) when nothing in the corpus is relevant. The prose answer is a
 * convenience layered on top of the citations, which are the load-bearing output.
 *
 * A question may also NAME a document ("Điều 18 Thông tư 38/2015"). That is scoped
 * as a hard filter, and — crucially — when the corpus does not hold that document
 * the answer says so instead of retrieving the nearest thing it does hold.
 */
@Injectable()
export class LegalService {
  private readonly log = new Logger(LegalService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly embedding: EmbeddingService,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** The corpus manifest. Small, stable, and the honest answer to "which docs do you have?". */
  async documents(): Promise<LegalDocumentView[]> {
    return (await this.db.execute(sql`
      SELECT number, doc_type AS "docType", title, consolidates,
             effective_from::text AS "effectiveFrom", effective_to::text AS "effectiveTo",
             effectiveness, verification, source_url AS "sourceUrl"
      FROM legal_document
      ORDER BY doc_type, number
    `)) as unknown as LegalDocumentView[];
  }

  /**
   * Fetch a provision by citation — no embedding, no retrieval, no model. "Cho tôi
   * Điều 18 Nghị định 08/2015" is a lookup, not a search, and answering it by
   * similarity would be a way to return the wrong Điều with confidence.
   */
  async provision(docRaw: string, articleRaw: string, clauseRaw?: string): Promise<LegalProvisionView[]> {
    const ref = parseDocRef(docRaw ?? '');
    if (!ref) throw new BadRequestException('doc must name a document number, e.g. 08/2015 or 46/VBHN-BTC');
    const article = String(articleRaw ?? '').replace(/\D/g, '');
    if (!article) throw new BadRequestException('article must be an Điều number');

    const docs = await resolveDocuments(this.db, ref);
    if (!docs.length) return [];
    const docIds = docs.map((d) => d.id);
    const clause = String(clauseRaw ?? '').replace(/\D/g, '');

    return (await this.db.execute(sql`
      SELECT d.number AS "documentNumber", d.title AS "documentTitle",
             p.citation_label AS "citationLabel", p.path, p.heading, coalesce(p.body, '') AS body,
             coalesce(p.effectiveness, d.effectiveness) AS effectiveness,
             coalesce(p.effective_from, d.effective_from)::text AS "effectiveFrom",
             coalesce(p.effective_to, d.effective_to)::text AS "effectiveTo",
             d.source_url AS "gazetteUrl", d.verification AS verification
      FROM legal_provision p
      JOIN legal_document d ON d.id = p.document_id
      WHERE p.document_id IN ${inIds(docIds)}
        AND ${clause ? sql`p.ptype = 'khoan' AND p.number = ${clause} AND p.parent_id IN (
              SELECT id FROM legal_provision
              WHERE document_id IN ${inIds(docIds)} AND ptype = 'dieu' AND number = ${article}
            )` : sql`p.ptype = 'dieu' AND p.number = ${article}`}
      ORDER BY p.document_id, p.order_index
    `)) as unknown as LegalProvisionView[];
  }

  async ask(qRaw: string, asOfParam?: string, docParam?: string, articleParam?: string): Promise<LegalAnswer> {
    const query = (qRaw ?? '').trim();
    if (query.length < 2) throw new BadRequestException('q must be a non-empty question');

    const asOf =
      asOfParam && ISO_DATE.test(asOfParam) ? asOfParam : (extractAsOf(query) ?? this.today());

    // An explicit `doc=` wins and is trusted as-is; a number found inside the question
    // only counts when it is unmistakably a document reference (see ParsedDocRef.confident).
    const inQuery = parseDocRef(query);
    const docRef = parseDocRef(docParam ?? '');
    // `doc=69/2018` from the bot carries no kind; "Nghị định 69/2018 …" in the question does. Without it the
    // catalogue lookup cannot drop same-serial circulars and decisions of other agencies.
    const ref = docRef
      ? { ...docRef, docType: docRef.docType ?? (inQuery?.core === docRef.core ? inQuery.docType : null) }
      : inQuery?.confident
        ? inQuery
        : null;
    let documentIds: number[] = [];
    let evidenceNumbers: string[] = [];
    let namedNumbers: string[] = [];
    if (ref) {
      const docs = await resolveDocuments(this.db, ref);
      // No full text, but the evidence layer may hold its status ("replaced by 292/2026/NĐ-CP from 05/09/2026") —
      // which IS the answer to "is it still in force?", and better than "we don't hold it".
      if (!docs.length) evidenceNumbers = await evidenceInstruments(this.db, ref);
      if (!docs.length && !evidenceNumbers.length) {
        // Not in the corpus — but the gazette catalogue may still know what it IS.
        // "We don't hold it" and "no such document" are different answers.
        const gazette = await lookupGazette(this.db, ref);
        return {
          query,
          asOf,
          requestedDoc: ref.core,
          missingDoc: ref.raw,
          gazetteMatchKind: gazette.exact ? 'exact' : gazette.matches.length ? 'similar' : 'none',
          gazetteMatches: gazette.matches.map(({ number, docType, title, sourceUrl }) => ({
            number,
            docType,
            title,
            sourceUrl,
          })),
          abstained: true,
          reason: `văn bản "${ref.raw}" chưa có trong cơ sở dữ liệu pháp luật đã kiểm chứng`,
          answer: '',
          citations: [],
        };
      }
      documentIds = docs.map((d) => d.id);
      namedNumbers = [...docs.map((d) => d.number), ...evidenceNumbers];
    }

    // No precise number, but the question may still NAME a document the way people say
    // it — "thông tư 36 của bộ Khoa học công nghệ". Answering that from whatever the
    // retriever happens to surface is how a Bộ Công Thương circular got returned for a
    // Bộ Khoa học question; ask the catalogue what they might mean instead.
    if (!ref) {
      const loose = parseLooseDocRef(query);
      if (loose) {
        const candidates = await lookupGazetteLoose(this.db, loose);
        const held = new Set(
          ((await this.documents()) as Array<{ number: string }>).map((d) => d.number.toUpperCase()),
        );
        if (!candidates.some((c) => held.has(c.number.toUpperCase()))) {
          return {
            query,
            asOf,
            requestedDoc: null,
            missingDoc: loose.label,
            gazetteMatchKind: candidates.length ? 'ambiguous' : 'none',
            gazetteMatches: candidates.map(({ number, docType, title, sourceUrl }) => ({
              number,
              docType,
              title,
              sourceUrl,
            })),
            abstained: true,
            reason: candidates.length
              ? `chưa nạp toàn văn; trên Công báo có ${candidates.length} thông tư khớp số ${loose.serial} của cơ quan này`
              : `không tìm thấy thông tư số ${loose.serial} của cơ quan này trên Công báo`,
            answer: '',
            citations: [],
          };
        }
      }
    }

    const articleNo = articleParam?.replace(/\D/g, '') || (ref ? parseArticleNo(query) : null);
    const articleProvisionIds =
      articleNo && documentIds.length ? await resolveArticles(this.db, documentIds, articleNo) : [];

    let vec: number[];
    try {
      vec = await this.embedding.embed(query);
    } catch (e) {
      this.log.error(`embedding failed: ${(e as Error).message}`);
      throw new BadRequestException('embedding service unavailable');
    }

    // A document held only as evidence has no clauses to search; a named Điều is a clause lookup, not evidence.
    const onlyEvidence = !documentIds.length && evidenceNumbers.length > 0;
    const [all, evidence, named, byCode] = await Promise.all([
      onlyEvidence
        ? Promise.resolve([] as RetrievedArticle[])
        : hybridRetrieve(this.db, { queryText: query, queryVec: vec, asOf, topK: TOP_K, documentIds, articleProvisionIds }),
      articleProvisionIds.length
        ? Promise.resolve([] as RetrievedEvidence[])
        : evidenceRetrieve(this.db, { queryText: query, queryVec: vec, asOf, documentNumbers: evidenceNumbers }),
      namedStatus(this.db, namedNumbers, asOf),
      hsCodeSections(this.db, [...new Set(query.match(HS_CODE) ?? [])], asOf),
    ]);

    // The relevance gate exists to stop the dense branch handing back its nearest
    // neighbours for an off-topic question. Naming an Điều already establishes intent
    // far more strongly than cosine distance can, so an explicit article bypasses it —
    // otherwise "cho tôi Điều 18" could abstain on the very article it asked for. The same
    // holds for a document the user named that only the evidence layer holds.
    const kept = (articleProvisionIds.length ? all : keepRelevant(all)).slice(0, MAX_CITATIONS);
    const limit = Math.min(EVIDENCE_MAX_DIST, Math.min(...all.map((a) => a.bestDist ?? Infinity)) + EVIDENCE_MARGIN);
    // What the question names outright — a document's status row, a section listing its HS code — may be the whole
    // answer ("replaced from 05/09/2026", "high-risk list of TT 36/2026"), so it is never cut.
    const pinned = [...named, ...byCode].filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);
    // Closest first: RRF lets a long section that merely repeats the query words outrank the right one.
    const ranked = (onlyEvidence ? evidence : evidence.filter((e) => e.bestDist != null && e.bestDist <= limit))
      .filter((e) => !pinned.some((p) => p.id === e.id))
      .sort((a, b) => (a.bestDist ?? 1) - (b.bestDist ?? 1));
    const keptEvidence = [...pinned, ...ranked].slice(0, Math.max(EVIDENCE_K, pinned.length));
    const sources = [...kept.map(articleSource), ...keptEvidence.map(evidenceSource)];
    const scope = {
      requestedDoc: ref?.core ?? null,
      missingDoc: null,
      gazetteMatchKind: 'none' as const,
      gazetteMatches: [],
    };

    if (sources.length === 0) {
      return {
        query,
        asOf,
        ...scope,
        abstained: true,
        reason: ref
          ? `không tìm thấy điều khoản liên quan trong ${ref.raw}`
          : 'không tìm thấy điều khoản liên quan trong cơ sở dữ liệu pháp luật đã kiểm chứng',
        answer: '',
        citations: [],
      };
    }

    const gen = await generate(query, asOf, sources);

    /**
     * The model READ these provisions and judged them insufficient. Returning them
     * anyway as "the most relevant provision" overrides that judgement with a shrug,
     * and the shrug is what the reader sees.
     *
     * Observed 2026-08-14: asked for "thông tư 36 của Bộ Khoa học công nghệ", the model
     * abstained and said exactly why — "các điều khoản đã cung cấp thuộc Thông tư
     * 36/2016/TT-BCT của Bộ Công Thương, không phải văn bản của Bộ Khoa học và Công
     * nghệ". The service printed those provisions regardless, under "đây là điều khoản
     * liên quan nhất". A correct refusal was turned into a confident near-miss by the
     * layer above it. An abstention is an ANSWER; carry it through.
     */
    if (gen?.abstain) {
      return {
        query,
        asOf,
        ...scope,
        abstained: true,
        reason: gen.reason ?? 'các điều khoản truy hồi được không đủ căn cứ để trả lời câu hỏi này',
        answer: '',
        citations: [],
      };
    }

    // No LLM available at all → the verbatim provisions stand on their own, as they did
    // before generation existed. Distinct from an abstention: nothing has judged them.
    if (!gen || !gen.answer) {
      return {
        query,
        asOf,
        ...scope,
        abstained: false,
        reason: gen?.reason ?? 'chưa tổng hợp được câu trả lời chắc chắn — dưới đây là điều khoản liên quan nhất để đối chiếu',
        answer: '',
        citations: sources.map((s) => s.citation),
      };
    }

    // Exactly what the model read for each [n], label and standing included.
    const texts = sources.map((s) => `${s.label}\n${s.note ?? ''}\n${s.text}`);
    const marked = numberMarkers(gen.answer, gen.citations, texts, query);
    if (!marked.answer || marked.order.length === 0) {
      // The model cited nothing we retrieved, or stated a rate or amount its source does not
      // contain → ungrounded. Drop the prose, keep the verbatim provisions as references.
      return {
        query,
        asOf,
        ...scope,
        abstained: false,
        reason: 'câu trả lời chưa dẫn được điều khoản đã truy hồi — hiển thị điều khoản liên quan để đối chiếu',
        answer: '',
        citations: sources.map((s) => s.citation),
      };
    }

    // Contract: [n] in `answer` points at citations[n-1].
    return {
      query,
      asOf,
      ...scope,
      abstained: false,
      reason: null,
      answer: marked.answer,
      citations: marked.order.map((n) => sources[n - 1]!.citation),
    };
  }
}

interface Source extends PromptSource {
  citation: LegalCitation;
}

function articleSource(a: RetrievedArticle): Source {
  return { label: a.articleCitation, note: null, text: a.articleBody, citation: toCitation(a) };
}

/** How each authority reads to the model and to the person (spec §4 principle 3). Binding needs no label. */
const AUTHORITY_NOTE: Record<string, string | null> = {
  binding: null,
  authoritative: 'tài liệu hướng dẫn áp dụng của cơ quan hải quan, không phải văn bản quy phạm pháp luật',
  administrative: 'công văn hành chính, kết luận áp cho đúng mặt hàng và hồ sơ được nêu',
  reference: 'ghi chú nghiệp vụ hoặc tài liệu nội bộ, không phải căn cứ pháp lý',
  undetermined: 'chưa xác định tình trạng, không dùng làm căn cứ',
};

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function evidenceSource(e: RetrievedEvidence): Source {
  const note =
    [
      AUTHORITY_NOTE[e.authority] ?? null,
      e.window === 'upcoming' && e.effectiveFrom ? `CHƯA CÓ HIỆU LỰC — có hiệu lực từ ${dmy(e.effectiveFrom)}` : null,
      e.status ? `tình trạng: ${e.status}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;
  return {
    label: e.title,
    note,
    text: e.body.slice(0, EVIDENCE_PROMPT_CHARS),
    citation: {
      documentNumber: e.documentNumber ?? e.instrument,
      documentTitle: e.title,
      articleLabel: e.title,
      provisionLabel: e.title,
      verbatimText: e.body,
      path: e.title,
      effectiveness: e.effectiveness,
      effectiveFrom: e.effectiveFrom,
      effectiveTo: e.effectiveTo,
      gazetteUrl: null,
      verification: e.verification,
      kind: e.kind,
      instrument: e.instrument,
      note,
    },
  };
}

function toCitation(a: RetrievedArticle): LegalCitation {
  return {
    documentNumber: a.documentNumber,
    documentTitle: a.documentTitle,
    articleLabel: a.articleCitation,
    provisionLabel: a.clauseCitation,
    verbatimText: a.clauseBody,
    path: a.path,
    effectiveness: a.effectiveness,
    effectiveFrom: a.effectiveFrom,
    effectiveTo: a.effectiveTo,
    gazetteUrl: a.gazetteUrl,
    verification: a.verification,
  };
}

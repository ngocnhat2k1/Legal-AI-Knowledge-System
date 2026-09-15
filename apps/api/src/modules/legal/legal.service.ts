import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import { EmbeddingService } from './embedding.service';
import { extractAsOf, isIsoDate, todayVN } from './legal.asof';
import {
  caseSections,
  evidenceInstruments,
  evidenceRetrieve,
  headingSections,
  hsCodeSections,
  namedStatus,
  type RetrievedEvidence,
  senSections,
  type StatusEnd,
} from './legal.evidence';
import { generate, type PromptSource } from './legal.generation';
import { dropInForceClaims, keepRelevant, numberMarkers } from './legal.grounding';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import {
  inIds,
  lookupGazette,
  lookupGazetteLoose,
  parseArticleNo,
  parseDocRef,
  type ParsedDocRef,
  parseLooseDocRef,
  resolveArticles,
  resolveDocuments,
} from './legal.scope';
import type { LegalAnswer, LegalCitation, LegalDocumentView, LegalProvisionView } from './legal.types';

const TOP_K = 6;
const MAX_CITATIONS = 5;
/** Evidence sections join the articles after them, never in place of one. */
const EVIDENCE_K = 3;
/** Pinned sections kept: GET /legal put twelve pins of up to 6,000 characters in one prompt, the shape that timed out at 100 s. */
const MAX_PINS = 8;
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

/**
 * Headings an HS question names, as `30.05`, from three shapes only: digits right after a word naming a code ("nhóm 3005",
 * "phân nhóm 3005.90", "mã HS 30051010", "HS: 30.05"); a full dotted code ("3005.10.10") in a question about codes; the
 * heading list a code check sends ("Các nhóm … cần phân biệt: 30.05, 33.07"). A free "12.50", "08.30" or "1500.00.00"
 * read as a heading capped the statute clauses of an ordinary legal question (review 2026-09-14).
 */
export function namedHeadings(query: string): string[] {
  const found: string[] = [];
  const add = (a: string, b: string) => found.push(`${a}.${b}`);
  for (const m of query.matchAll(/(?:nhóm|mã(?:\s*số)?(?:\s*hs)?|hs(?:\s*code)?)\s*:?\s*(\d{2})\.?(\d{2})(?:\.?\d{2}){0,2}(?![\d/%]|[.,]\d)/giu)) {
    add(m[1]!, m[2]!);
  }
  if (/mã|nhóm|hs|chương|chú giải|phân loại/i.test(query)) {
    for (const m of query.matchAll(/(?<![\d.])(\d{2})(\d{2})\.\d{2}\.\d{2}(?!\d|[.,]\d)/g)) add(m[1]!, m[2]!);
  }
  for (const m of query.matchAll(/nhóm[^:.\n]{0,60}:\s*((?:\d{2}\.\d{2}\s*,?\s*)+)/giu)) {
    for (const h of m[1]!.match(/\d{2}\.\d{2}/g) ?? []) add(h.slice(0, 2), h.slice(3));
  }
  // Four: a code check lists three candidates plus the user's own heading.
  return [...new Set(found)].slice(0, 4);
}
/** Evidence enters the prompt cut here (≈ the embedded window); the citation keeps the whole body. */
const EVIDENCE_PROMPT_CHARS = 6000;

/** What scope() found for the document a question names: the fields of a missing-document reply, and what gather() scopes to. */
export interface DocScope extends Pick<LegalAnswer, 'requestedDoc' | 'missingDoc' | 'gazetteMatchKind' | 'gazetteMatches' | 'reason'> {
  ref: ParsedDocRef | null;
  documentIds: number[];
  documentNumbers: string[];
  /** Named documents held only as evidence sections: a status row, no clauses. */
  evidenceNumbers: string[];
}

export interface GatherOpts {
  /** YYYY-MM-DD; otherwise a date the question states, else today. */
  asOf?: string | null;
  /** From scope(); absent = the whole corpus. */
  doc?: DocScope;
  /** An Điều number inside `doc`; otherwise read from the question when it names a document. */
  article?: string | null;
  /**
   * Codes whose listing sections are pinned; default: the codes the question spells (GET /legal). POST /answer must
   * always pass it, [] when the user's code is a premise: a default read from the question would pin the user's code (D1).
   */
  hsCodes?: string[];
  /** Dotted headings whose notes (and cases, with `cases`) are pinned; default: namedHeadings(query). POST /answer must always pass it, as `hsCodes`. */
  headings?: string[];
  /** Most statute clauses kept; 0 searches none. Default: 5, or 2 beside a named heading's Explanatory Note. */
  clauses?: number;
  /**
   * Also pin the classification cases of `headings`. Off by default: GET /legal (the live bot's code check) must not
   * spend its pins on cases when they are seeded. POST /answer passes true.
   */
  cases?: boolean;
  /** Most SEN rows pinned per heading of `headings`, ranked by heading alone (senSections); 0 (default) pins none. */
  sen?: number;
}

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

  private asOfFor(query: string, param?: string | null): string {
    return isIsoDate(param) ? param : (extractAsOf(query) ?? todayVN());
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

  /**
   * The document the question (or `doc`) names, resolved against the corpus, the evidence layer and the Công báo
   * catalogue. When none of the first two holds it, `missingDoc` is set and the caller says so instead of retrieving.
   */
  async scope(query: string, docParam?: string | null): Promise<DocScope> {
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
    const found: DocScope = {
      requestedDoc: ref?.core ?? null,
      missingDoc: null,
      gazetteMatchKind: 'none',
      gazetteMatches: [],
      reason: null,
      ref,
      documentIds: [],
      documentNumbers: [],
      evidenceNumbers: [],
    };
    if (ref) {
      const docs = await resolveDocuments(this.db, ref);
      // No full text, but the evidence layer may hold its status ("replaced by 292/2026/NĐ-CP from 05/09/2026") —
      // which IS the answer to "is it still in force?", and better than "we don't hold it".
      const evidenceNumbers = docs.length ? [] : await evidenceInstruments(this.db, ref);
      if (docs.length || evidenceNumbers.length) {
        return { ...found, documentIds: docs.map((d) => d.id), documentNumbers: docs.map((d) => d.number), evidenceNumbers };
      }
      // Not in the corpus — but the gazette catalogue may still know what it IS.
      // "We don't hold it" and "no such document" are different answers.
      const gazette = await lookupGazette(this.db, ref);
      return {
        ...found,
        missingDoc: ref.raw,
        gazetteMatchKind: gazette.exact ? 'exact' : gazette.matches.length ? 'similar' : 'none',
        gazetteMatches: gazette.matches.map(({ number, docType, title, sourceUrl }) => ({ number, docType, title, sourceUrl })),
        reason: `văn bản "${ref.raw}" chưa có trong cơ sở dữ liệu pháp luật đã kiểm chứng`,
      };
    }

    // No precise number, but the question may still NAME a document the way people say
    // it — "thông tư 36 của bộ Khoa học công nghệ". Answering that from whatever the
    // retriever happens to surface is how a Bộ Công Thương circular got returned for a
    // Bộ Khoa học question; ask the catalogue what they might mean instead.
    const loose = parseLooseDocRef(query);
    if (!loose) return found;
    const candidates = await lookupGazetteLoose(this.db, loose);
    const held = new Set(((await this.documents()) as Array<{ number: string }>).map((d) => d.number.toUpperCase()));
    if (candidates.some((c) => held.has(c.number.toUpperCase()))) return found;
    return {
      ...found,
      missingDoc: loose.label,
      gazetteMatchKind: candidates.length ? 'ambiguous' : 'none',
      gazetteMatches: candidates.map(({ number, docType, title, sourceUrl }) => ({ number, docType, title, sourceUrl })),
      reason: candidates.length
        ? `chưa nạp toàn văn; trên Công báo có ${candidates.length} thông tư khớp số ${loose.serial} của cơ quan này`
        : `không tìm thấy thông tư số ${loose.serial} của cơ quan này trên Công báo`,
    };
  }

  /**
   * Retrieval for one question, no model: statute clauses (relevance-gated) first, then evidence sections — what the
   * question names outright (status rows of `doc`, sections listing `hsCodes`, notes and cases of `headings`) ahead
   * of the rest by distance. GET /legal reads codes and headings from the question; POST /answer passes its own.
   */
  async gather(query: string, opts: GatherOpts = {}): Promise<{ asOf: string; sources: Source[] }> {
    const asOf = this.asOfFor(query, opts.asOf);
    const { doc } = opts;
    const documentIds = doc?.documentIds ?? [];
    const evidenceNumbers = doc?.evidenceNumbers ?? [];
    const articleNo = opts.article?.replace(/\D/g, '') || (doc?.ref ? parseArticleNo(query) : null);
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
    const hsCodes = opts.hsCodes ?? [...new Set(query.match(HS_CODE) ?? [])];
    const headings = articleProvisionIds.length ? [] : (opts.headings ?? namedHeadings(query));
    const [all, evidence, named, byCode, byHeading, cases, bySen] = await Promise.all([
      onlyEvidence || opts.clauses === 0
        ? Promise.resolve([] as RetrievedArticle[])
        : hybridRetrieve(this.db, { queryText: query, queryVec: vec, asOf, topK: TOP_K, documentIds, articleProvisionIds }),
      articleProvisionIds.length
        ? Promise.resolve([] as RetrievedEvidence[])
        : evidenceRetrieve(this.db, { queryText: query, queryVec: vec, asOf, documentNumbers: evidenceNumbers }),
      namedStatus(this.db, [...(doc?.documentNumbers ?? []), ...evidenceNumbers], asOf),
      hsCodeSections(this.db, hsCodes, asOf),
      headingSections(this.db, headings, asOf),
      opts.cases ? caseSections(this.db, headings, asOf) : Promise.resolve([] as RetrievedEvidence[]),
      opts.sen ? senSections(this.db, headings, asOf, opts.sen) : Promise.resolve([] as RetrievedEvidence[]),
    ]);

    // The relevance gate exists to stop the dense branch handing back its nearest
    // neighbours for an off-topic question. Naming an Điều already establishes intent
    // far more strongly than cosine distance can, so an explicit article bypasses it —
    // otherwise "cho tôi Điều 18" could abstain on the very article it asked for. The same
    // holds for a document the user named that only the evidence layer holds.
    // A named heading brings its notes, and a question about a heading is rarely about statute clauses: two at most, or
    // the prompt outgrows the writing call (a code check with five clauses and six notes timed out, 14/09/2026).
    // Only a heading whose Explanatory Note came back caps them: chapter notes alone must not cost a legal answer its clauses.
    const clauses = opts.clauses ?? (byHeading.some((e) => e.kind === 'en') ? 2 : MAX_CITATIONS);
    const kept = (articleProvisionIds.length ? all : keepRelevant(all)).slice(0, clauses);
    const limit = Math.min(EVIDENCE_MAX_DIST, Math.min(...all.map((a) => a.bestDist ?? Infinity)) + EVIDENCE_MARGIN);
    // What the question names outright — a document's status row, a section listing its HS code — may be the whole
    // answer ("replaced from 05/09/2026", "high-risk list of TT 36/2026"), so it leads the pins, which are cut at MAX_PINS.
    // Chapter and section notes bind (GRI 1), so they go before SEN rows, which are guidance.
    const naming = (e: RetrievedEvidence) => e.hsCodes.some((c) => hsCodes.includes(c));
    const pinned = [
      ...named,
      ...byCode.filter(naming),
      ...byHeading.filter((e) => e.kind === 'en'),
      ...byHeading.filter((e) => e.kind !== 'en'),
      ...bySen,
      ...cases,
      ...byCode.filter((e) => !naming(e)),
    ]
      .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
      .slice(0, MAX_PINS);
    // Closest first: RRF lets a long section that merely repeats the query words outrank the right one.
    const ranked = (onlyEvidence ? evidence : evidence.filter((e) => e.bestDist != null && e.bestDist <= limit))
      .filter((e) => !pinned.some((p) => p.id === e.id))
      .sort((a, b) => (a.bestDist ?? 1) - (b.bestDist ?? 1));
    const keptEvidence = [...pinned, ...ranked].slice(0, Math.max(EVIDENCE_K, pinned.length));
    return { asOf, sources: [...kept.map(articleSource), ...keptEvidence.map((e) => evidenceSource(e, asOf, hsCodes))] };
  }

  async ask(qRaw: string, asOfParam?: string, docParam?: string, articleParam?: string): Promise<LegalAnswer> {
    const query = (qRaw ?? '').trim();
    if (query.length < 2) throw new BadRequestException('q must be a non-empty question');

    const asOf = this.asOfFor(query, asOfParam);
    const doc = await this.scope(query, docParam);
    const head = {
      query,
      asOf,
      requestedDoc: doc.requestedDoc,
      missingDoc: doc.missingDoc,
      gazetteMatchKind: doc.gazetteMatchKind,
      gazetteMatches: doc.gazetteMatches,
    };
    if (doc.missingDoc) return { ...head, abstained: true, reason: doc.reason, answer: '', citations: [] };

    const { sources } = await this.gather(query, { asOf, doc, article: articleParam });
    if (sources.length === 0) {
      return {
        ...head,
        abstained: true,
        reason: doc.ref
          ? `không tìm thấy điều khoản liên quan trong ${doc.ref.raw}`
          : 'không tìm thấy điều khoản liên quan trong cơ sở dữ liệu pháp luật đã kiểm chứng',
        answer: '',
        citations: [],
      };
    }

    const expired = sources.map((s) => s.citation).filter((c) => c.expired);
    const gen = await generate(
      query,
      asOf,
      sources,
      expired.map((c) => c.expired!),
    );

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
        ...head,
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
        ...head,
        abstained: false,
        reason: gen?.reason ?? 'chưa tổng hợp được câu trả lời chắc chắn — dưới đây là điều khoản liên quan nhất để đối chiếu',
        answer: '',
        citations: sources.map((s) => s.citation),
      };
    }

    // Exactly what the model read for each [n], label and standing included.
    const texts = sources.map((s) => `${s.label}\n${s.note ?? ''}\n${s.text}`);
    const numbered = numberMarkers(gen.answer, gen.citations, texts, query);
    const marked = {
      ...numbered,
      answer: dropInForceClaims(
        numbered.answer,
        expired.map((c) => c.documentNumber),
        sources.map((s) => s.citation).filter((c) => !c.expired).map((c) => c.documentNumber),
      ),
    };
    if (!marked.answer || marked.order.length === 0) {
      // The model cited nothing we retrieved, or stated a rate or amount its source does not
      // contain → ungrounded. Drop the prose, keep the verbatim provisions as references.
      return {
        ...head,
        abstained: false,
        reason: 'câu trả lời chưa dẫn được điều khoản đã truy hồi — hiển thị điều khoản liên quan để đối chiếu',
        answer: '',
        citations: sources.map((s) => s.citation),
      };
    }

    // Contract: [n] in `answer` points at citations[n-1].
    return {
      ...head,
      abstained: false,
      reason: null,
      answer: marked.answer,
      citations: marked.order.map((n) => sources[n - 1]!.citation),
    };
  }
}

export interface Source extends PromptSource {
  /** 'p:<article provision id>' or 'e:<evidence section id>': what POST /answer merges and cites by. */
  key: string;
  /** The whole text `text` was cut from: the full article, or the section with the lines naming asked codes first. */
  body: string;
  hs: { heading: string | null; chapter: number | null; codes: string[] };
  /**
   * evidence_section.meta untouched (case_id, ahtn_2022, hs2022, anchor, …), plus what a list check reads (plan 08 §0):
   * hs_codes, document_number, anchor (annex title or clause label), effective_from, effective_to, effectiveness, verification.
   */
  meta: Record<string, unknown>;
  citation: LegalCitation;
}

export function articleSource(a: RetrievedArticle): Source {
  return {
    key: `p:${a.articleProvisionId}`,
    label: a.articleCitation,
    note: null,
    text: a.articleBody,
    body: a.articleBody,
    hs: { heading: null, chapter: null, codes: [] },
    meta: {
      hs_codes: [],
      document_number: a.documentNumber,
      anchor: a.clauseCitation,
      effective_from: a.effectiveFrom,
      effective_to: a.effectiveTo,
      effectiveness: a.effectiveness,
      verification: a.verification,
    },
    citation: toCitation(a),
  };
}

/** How each authority reads to the model and to the person (spec §4 principle 3). Binding needs no label. */
export const AUTHORITY_NOTE: Record<string, string | null> = {
  binding: null,
  authoritative: 'tài liệu hướng dẫn áp dụng của cơ quan hải quan, không phải văn bản quy phạm pháp luật',
  administrative: 'công văn hành chính, kết luận áp cho đúng mặt hàng và hồ sơ được nêu',
  reference: 'ghi chú nghiệp vụ hoặc tài liệu nội bộ, không phải căn cứ pháp lý',
  undetermined: 'chưa xác định tình trạng, không dùng làm căn cứ',
};

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Lines naming an HS code the question asks about move up under the section's label and table header, so the prompt
 * cut keeps them (spec §3.4). TT 36/2026 lists 6506.10.10 past character 6,000 of a 15,000-character annex block: cut
 * as it stood, the model never saw the helmet row and leaned on the internal summary sheet instead (2026-09-14).
 */
export function focusOn(body: string, codes: string[]): string {
  const lines = body.split('\n');
  const hit = (l: string) => codes.some((c) => l.includes(c));
  if (!codes.length || !lines.slice(2).some(hit)) return body;
  return [...lines.slice(0, 2), ...lines.slice(2).filter(hit), '…', ...lines.slice(2).filter((l) => !hit(l))].join('\n');
}

export function evidenceSource(e: RetrievedEvidence, asOf: string, codes: string[] = []): Source {
  const body = focusOn(e.body, codes);
  // Found by a window: the prompt reads that window, which a cut from the top of the whole section may never reach.
  // Lines naming an asked code, moved to the top, win over it.
  const text = (body === e.body && e.hitText ? e.hitText : body).slice(0, EVIDENCE_PROMPT_CHARS);
  const part = (x: StatusEnd) => (x.scope ? ` (phần: ${x.scope})` : '');
  const past = e.ends.filter((x) => x.from <= asOf);
  const coming = e.ends.filter((x) => x.from > asOf);
  // The as-of comparison is made here, from data, not left to the model: on 14/09/2026 it wrote that 43/2017/NĐ-CP
  // "vẫn còn hiệu lực … sẽ hết hiệu lực từ 23/01/2026" from the very row that says it ended then.
  const expired = past.length
    ? `${e.instrument} ĐÃ HẾT HIỆU LỰC ${past.map((x) => `từ ${dmy(x.from)} theo ${x.by}${part(x)}`).join('; ')}`
    : null;
  const note =
    [
      AUTHORITY_NOTE[e.authority] ?? null,
      // A status row's upcoming window is a coming end of force (85/2019 from 15/10/2026), not a document not yet in force.
      e.window === 'upcoming' && e.effectiveFrom && !e.ends.length ? `CHƯA CÓ HIỆU LỰC — có hiệu lực từ ${dmy(e.effectiveFrom)}` : null,
      ...coming.map((x) => `sẽ hết hiệu lực từ ${dmy(x.from)} theo ${x.by}${part(x)}`),
      e.status ? `tình trạng: ${e.status}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;
  return {
    key: `e:${e.id}`,
    label: e.title,
    note: [expired, note].filter(Boolean).join(' · ') || null,
    text,
    body,
    hs: { heading: e.hsHeading, chapter: e.hsChapter, codes: e.hsCodes },
    meta: {
      ...e.meta,
      // The walkthrough prints standing in words from this (walkthrough.ts row()); without it a SEN row read as binding.
      authority: e.authority,
      hs_codes: e.hsCodes,
      document_number: e.documentNumber,
      anchor: e.meta.anchor ?? e.title,
      effective_from: e.effectiveFrom,
      effective_to: e.effectiveTo,
      effectiveness: e.effectiveness,
      verification: e.verification,
    },
    citation: {
      documentNumber: e.documentNumber ?? e.instrument,
      documentTitle: e.title,
      articleLabel: e.title,
      provisionLabel: e.title,
      verbatimText: body, // the same verbatim lines, the ones naming the asked code first

      path: e.title,
      effectiveness: e.effectiveness,
      effectiveFrom: e.effectiveFrom,
      effectiveTo: e.effectiveTo,
      gazetteUrl: null,
      verification: e.verification,
      kind: e.kind,
      instrument: e.instrument,
      note,
      expired,
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

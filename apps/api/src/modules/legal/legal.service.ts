import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import { EmbeddingService } from '../../shared/adapters/embedding';
import { extractAsOf } from './legal.asof';
import { generate } from './legal.generation';
import { keepRelevant, validateCitations } from './legal.grounding';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import { inIds, parseArticleNo, parseDocRef, resolveArticles, resolveDocuments } from './legal.scope';
import type { LegalAnswer, LegalCitation, LegalDocumentView, LegalProvisionView } from './legal.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOP_K = 6;
const MAX_CITATIONS = 5;

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
             effectiveness, source_url AS "sourceUrl"
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
             d.source_url AS "gazetteUrl"
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
    const ref = parseDocRef(docParam ?? '') ?? (inQuery?.confident ? inQuery : null);
    let documentIds: number[] = [];
    if (ref) {
      const docs = await resolveDocuments(this.db, ref);
      if (!docs.length) {
        return {
          query,
          asOf,
          requestedDoc: ref.core,
          missingDoc: ref.raw,
          abstained: true,
          reason: `văn bản "${ref.raw}" chưa có trong cơ sở dữ liệu pháp luật đã kiểm chứng`,
          answer: '',
          citations: [],
        };
      }
      documentIds = docs.map((d) => d.id);
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

    const all = await hybridRetrieve(this.db, {
      queryText: query,
      queryVec: vec,
      asOf,
      topK: TOP_K,
      documentIds,
      articleProvisionIds,
    });

    // The relevance gate exists to stop the dense branch handing back its nearest
    // neighbours for an off-topic question. Naming an Điều already establishes intent
    // far more strongly than cosine distance can, so an explicit article bypasses it —
    // otherwise "cho tôi Điều 18" could abstain on the very article it asked for.
    const kept = (articleProvisionIds.length ? all : keepRelevant(all)).slice(0, MAX_CITATIONS);
    const scope = { requestedDoc: ref?.core ?? null, missingDoc: null };

    if (kept.length === 0) {
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

    const gen = await generate(query, asOf, kept);

    // No LLM available, or it declined → the verbatim provisions stand on their own.
    if (!gen || gen.abstain || !gen.answer) {
      return {
        query,
        asOf,
        ...scope,
        abstained: false,
        reason: gen?.reason ?? 'chưa tổng hợp được câu trả lời chắc chắn — dưới đây là điều khoản liên quan nhất để đối chiếu',
        answer: '',
        citations: kept.map(toCitation),
      };
    }

    const valid = validateCitations(gen.citations, kept);
    if (valid.length === 0) {
      // The model answered but cited nothing we retrieved → ungrounded. Drop the
      // prose, keep the verbatim provisions as references.
      return {
        query,
        asOf,
        ...scope,
        abstained: false,
        reason: 'câu trả lời chưa dẫn được điều khoản đã truy hồi — hiển thị điều khoản liên quan để đối chiếu',
        answer: '',
        citations: kept.map(toCitation),
      };
    }

    const citedSet = new Set(valid);
    const cited = kept.filter((a) => citedSet.has(a.articleProvisionId));
    return {
      query,
      asOf,
      ...scope,
      abstained: false,
      reason: null,
      answer: gen.answer,
      citations: (cited.length ? cited : kept).map(toCitation),
    };
  }
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
  };
}

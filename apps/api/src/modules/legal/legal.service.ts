import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import { EmbeddingService } from '../../shared/adapters/embedding';
import { extractAsOf } from './legal.asof';
import { generate } from './legal.generation';
import { keepRelevant, validateCitations } from './legal.grounding';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import type { LegalAnswer, LegalCitation } from './legal.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOP_K = 6;
const MAX_CITATIONS = 5;

/**
 * Legal RAG lookup: embed the question → hybrid retrieve (keyword + dense, valid-
 * time hard-filtered) → keep only grounded provisions → optionally synthesise a
 * grounded prose answer → return the VERBATIM provisions as citations. Abstains
 * (empty citations) when nothing in the corpus is relevant. The prose answer is a
 * convenience layered on top of the citations, which are the load-bearing output.
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

  async ask(qRaw: string, asOfParam?: string): Promise<LegalAnswer> {
    const query = (qRaw ?? '').trim();
    if (query.length < 2) throw new BadRequestException('q must be a non-empty question');

    const asOf =
      asOfParam && ISO_DATE.test(asOfParam) ? asOfParam : (extractAsOf(query) ?? this.today());

    let vec: number[];
    try {
      vec = await this.embedding.embed(query);
    } catch (e) {
      this.log.error(`embedding failed: ${(e as Error).message}`);
      throw new BadRequestException('embedding service unavailable');
    }

    const all = await hybridRetrieve(this.db, { queryText: query, queryVec: vec, asOf, topK: TOP_K });
    const kept = keepRelevant(all).slice(0, MAX_CITATIONS);

    if (kept.length === 0) {
      return {
        query,
        asOf,
        abstained: true,
        reason: 'không tìm thấy điều khoản liên quan trong cơ sở dữ liệu pháp luật đã kiểm chứng',
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

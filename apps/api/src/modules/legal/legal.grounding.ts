/**
 * Grounding gates (legal-rag-retrieval.md §7, R10). Two jobs:
 *
 *   1. keepRelevant — a PRE-generation gate. The dense branch always returns its
 *      nearest neighbours even for an off-topic query, so we drop articles that
 *      are neither a keyword hit nor within a cosine-distance threshold. If nothing
 *      survives, the caller abstains before spending a generation.
 *   2. validateCitations — a POST-generation check that verifies the model cited
 *      provisions that were actually retrieved. "The citation resolves to a real
 *      document" is the worthless guarantee (Wilgarten); this at least refuses a
 *      citation that points outside the evidence set. It is a floor, not proof of
 *      entailment — a stronger entailment check is a later slice.
 */
import type { RetrievedArticle } from './legal.retrieval';

/**
 * Max cosine distance (1 − cosine similarity) for an article to count as relevant.
 * Measured on the eval set: real customs questions land ≤ 0.46, off-topic questions
 * ("phở recipe", "football") sit ≥ 0.64 — so 0.58 separates them with margin. Tune
 * against the eval harness, not by feel.
 *
 * NOTE: the gate is SEMANTIC ONLY. A keyword hit is not a keep-reason on its own —
 * common words ("công", "nhà") match customs text for any query and would let an
 * off-topic question through. Keyword still drives RANKING (RRF); it just does not
 * decide relevance. An article with no dense proximity (bestDist null) is dropped.
 */
export const MAX_DIST = 0.58;

/** Keep only articles the dense retriever puts within the relevance threshold. */
export function keepRelevant(articles: RetrievedArticle[]): RetrievedArticle[] {
  return articles.filter((a) => a.bestDist != null && a.bestDist <= MAX_DIST);
}

/** Keep only the model's citations that point at a retrieved article. */
export function validateCitations(cited: number[], articles: RetrievedArticle[]): number[] {
  const ids = new Set(articles.map((a) => a.articleProvisionId));
  return [...new Set(cited)].filter((id) => ids.has(id));
}

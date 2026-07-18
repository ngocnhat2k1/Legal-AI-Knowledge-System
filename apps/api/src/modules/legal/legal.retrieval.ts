/**
 * Hybrid retrieval for legal RAG (legal-rag-retrieval.md §1, §3, §5).
 *
 *   - keyword branch: Postgres full-text over the `simple` config, which keeps
 *     diacritics and does not stem — so the decisive VN tokens ("phải" vs "có
 *     thể", "chậm nhất") match exactly. Terms are OR'd; ts_rank_cd ranks by how
 *     many/where they hit.
 *   - dense branch: pgvector cosine (`<=>`) over BGE-M3 embeddings.
 *   - the two ranked lists are fused with Reciprocal Rank Fusion, and scores are
 *     aggregated onto the parent ĐIỀU (a chunk is indexed at the Khoản but we
 *     return the article).
 *   - valid-time + effectiveness are a HARD FILTER inside each branch, applied
 *     BEFORE ranking — never a ranking signal.
 *
 * Weighting is left neutral (plain RRF); the concept note warns not to copy a
 * BM25/dense ratio from a paper whose embedding model you don't use — tune with
 * the project's own eval instead.
 */
import { sql } from 'drizzle-orm';

import { type Database } from '../../shared/adapters/database';

// Reciprocal-rank-fusion constant. Lower = the top ranks dominate more (a branch's
// #1 hit is worth much more than its #5). Kept low because a strong heading/semantic
// match should decide the article; tune against the eval harness in a later slice.
const RRF_K = 12;

/** A handful of high-frequency function words dropped from the keyword query. */
const STOP = new Set([
  'của', 'và', 'các', 'có', 'là', 'được', 'cho', 'trong', 'khi', 'nào', 'gì', 'thì',
  'một', 'những', 'về', 'theo', 'đối', 'với', 'hay', 'hoặc', 'này', 'đó', 'tại', 'ra',
  'từ', 'đến', 'bao', 'nhiêu', 'như', 'thế', 'bị', 'sẽ', 'đã',
]);

export interface RetrievedArticle {
  articleProvisionId: number;
  clauseProvisionId: number;
  documentId: number;
  documentNumber: string;
  documentTitle: string;
  articleCitation: string;
  clauseCitation: string;
  path: string;
  articleBody: string;
  clauseBody: string;
  effectiveness: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  gazetteUrl: string | null;
  score: number;
  bestDist: number | null; // min cosine distance (null = keyword-only hit)
  kwHit: boolean;
}

interface RawRow {
  article_provision_id: number;
  clause_provision_id: number;
  score: number;
  best_dist: number | null;
  kw_hit: boolean;
  article_citation: string;
  clause_citation: string;
  path: string;
  article_body: string;
  clause_body: string;
  document_id: number;
  document_number: string;
  document_title: string;
  gazette_url: string | null;
  effectiveness: string;
  effective_from: string | null;
  effective_to: string | null;
}

/** Build an OR'd `simple` tsquery from a natural-language question. */
export function toTsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
  return [...new Set(terms)].join(' | ');
}

export interface RetrieveOpts {
  queryText: string;
  queryVec: number[];
  asOf: string; // YYYY-MM-DD
  topK?: number;
  candPerBranch?: number;
}

export async function hybridRetrieve(db: Database, opts: RetrieveOpts): Promise<RetrievedArticle[]> {
  const { queryText, queryVec, asOf, topK = 6, candPerBranch = 50 } = opts;
  const vecLiteral = `[${queryVec.join(',')}]`;
  const tsq = toTsQuery(queryText);

  const rows = (await db.execute(sql`
    WITH params AS (
      SELECT ${vecLiteral}::vector AS qv, ${asOf}::date AS d, to_tsquery('simple', ${tsq}) AS q
    ),
    kw AS (
      SELECT c.article_provision_id AS aid, c.provision_id AS pid,
             row_number() OVER (ORDER BY ts_rank_cd(c.tsv, p.q, 1) DESC) AS rk,
             NULL::float8 AS dist
      FROM legal_chunk c, params p
      WHERE c.tsv @@ p.q
        AND c.effective_from <= p.d AND (c.effective_to IS NULL OR p.d <= c.effective_to)
        AND c.effectiveness <> 'het_hieu_luc'
      ORDER BY ts_rank_cd(c.tsv, p.q, 1) DESC
      LIMIT ${candPerBranch}
    ),
    vec AS (
      SELECT c.article_provision_id AS aid, c.provision_id AS pid,
             row_number() OVER (ORDER BY c.embedding <=> p.qv) AS rk,
             (c.embedding <=> p.qv) AS dist
      FROM legal_chunk c, params p
      WHERE c.embedding IS NOT NULL
        AND c.effective_from <= p.d AND (c.effective_to IS NULL OR p.d <= c.effective_to)
        AND c.effectiveness <> 'het_hieu_luc'
      ORDER BY c.embedding <=> p.qv
      LIMIT ${candPerBranch}
    ),
    u AS (SELECT * FROM kw UNION ALL SELECT * FROM vec),
    -- Article-level RRF: each branch contributes ONCE per article, via its best
    -- chunk. Summing over every chunk instead would let a many-clause article
    -- (e.g. a 17-Khoản "Giải thích từ ngữ") out-accumulate a focused article the
    -- dense branch ranked #1 — a fan-out bias, not relevance.
    agg AS (
      SELECT aid,
             min(rk) FILTER (WHERE dist IS NULL) AS kw_rk,
             min(rk) FILTER (WHERE dist IS NOT NULL) AS vec_rk,
             min(dist) AS best_dist,
             bool_or(dist IS NULL) AS kw_hit,
             (array_agg(pid ORDER BY rk))[1] AS best_pid
      FROM u
      GROUP BY aid
    ),
    fused AS (
      SELECT aid,
             coalesce(1.0 / (${RRF_K} + kw_rk), 0) + coalesce(1.0 / (${RRF_K} + vec_rk), 0) AS score,
             best_dist, kw_hit, best_pid
      FROM agg
      ORDER BY score DESC
      LIMIT ${topK}
    )
    SELECT f.aid AS article_provision_id, f.best_pid AS clause_provision_id,
           f.score::float8 AS score, f.best_dist::float8 AS best_dist, f.kw_hit,
           art.citation_label AS article_citation, art.path AS path, art.body AS article_body,
           cl.citation_label AS clause_citation, cl.body AS clause_body,
           d.id AS document_id, d.number AS document_number, d.title AS document_title,
           d.source_url AS gazette_url,
           coalesce(art.effectiveness, d.effectiveness) AS effectiveness,
           coalesce(art.effective_from, d.effective_from)::text AS effective_from,
           coalesce(art.effective_to, d.effective_to)::text AS effective_to
    FROM fused f
    JOIN legal_provision art ON art.id = f.aid
    JOIN legal_provision cl ON cl.id = f.best_pid
    JOIN legal_document d ON d.id = art.document_id
    ORDER BY f.score DESC
  `)) as unknown as RawRow[];

  return rows.map((r) => ({
    articleProvisionId: r.article_provision_id,
    clauseProvisionId: r.clause_provision_id,
    documentId: r.document_id,
    documentNumber: r.document_number,
    documentTitle: r.document_title,
    articleCitation: r.article_citation,
    clauseCitation: r.clause_citation,
    path: r.path,
    articleBody: r.article_body,
    clauseBody: r.clause_body,
    effectiveness: r.effectiveness,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    gazetteUrl: r.gazette_url,
    score: r.score,
    bestDist: r.best_dist,
    kwHit: r.kw_hit,
  }));
}

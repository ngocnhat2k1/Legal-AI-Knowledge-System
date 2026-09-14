/**
 * Evidence other than statute clauses (`evidence_section`: HS notes, Explanatory Notes, rulings, status rows,
 * annex tables, business notes — plan 05 milestone 2) for the GET /legal path. This is the first slice of
 * milestone 3: the same hybrid retrieval as legal_chunk (legal.retrieval.ts), two validity windows, and two
 * deterministic lookups for what the `simple` parser cannot match by keyword (document numbers, HS codes).
 * POST /answer (spec bot-answer-parity-design.md §3.3) takes it over.
 */
import { type SQL, sql } from 'drizzle-orm';

import { type Database } from '../../shared/adapters/database';
import { toTsQuery } from './legal.retrieval';
import { foldDocNumber, inIds, type ParsedDocRef } from './legal.scope';

const RRF_K = 12;
/**
 * A section starting this far ahead is still retrieved, labelled `upcoming`: "336/2026 replaces 85/2019 from
 * 15/10/2026" must be findable before that date, and must never read as current law (spec §2.4).
 */
const UPCOMING_MONTHS = 18;

/** An end of force recorded on a status row (db/seed/evidence-build.ts statusSections). */
export interface StatusEnd {
  from: string;
  by: string;
  relation: string;
  /** The part that ends, as the enacting provision words it; null = the whole instrument. */
  scope: string | null;
}

export interface RetrievedEvidence {
  id: number;
  kind: string;
  instrument: string;
  authority: string;
  title: string;
  body: string;
  documentNumber: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  effectiveness: string;
  verification: string;
  /** The notebook status sentence of a notebook-only document (meta.status). */
  status: string | null;
  /** Status rows only: when the instrument stops applying. Empty for every other kind. */
  ends: StatusEnd[];
  window: 'current' | 'upcoming';
  score: number;
  bestDist: number | null;
}

export interface EvidenceRetrieveOpts {
  queryText: string;
  queryVec: number[];
  asOf: string;
  topK?: number;
  candPerBranch?: number;
  /** Restrict to sections of these documents. Empty/absent = every section. */
  documentNumbers?: string[];
}

/** Validity as a hard filter, as for legal_chunk; effective_from NULL = no known start. `d` is the as-of date. */
const valid = (d: SQL) => sql`(e.effective_from IS NULL OR e.effective_from <= (${d} + ${`${UPCOMING_MONTHS} months`}::interval))
  AND (e.effective_to IS NULL OR ${d} <= e.effective_to) AND e.effectiveness <> 'het_hieu_luc'`;

const columns = (d: SQL) => sql`e.id, e.kind, e.instrument, e.authority, e.title, e.body, e.document_number,
  e.effective_from::text AS effective_from, e.effective_to::text AS effective_to,
  e.effectiveness, e.verification, e.meta->>'status' AS status, e.meta->'ends' AS ends,
  CASE WHEN e.effective_from > ${d} THEN 'upcoming' ELSE 'current' END AS "window"`;

export async function evidenceRetrieve(db: Database, opts: EvidenceRetrieveOpts): Promise<RetrievedEvidence[]> {
  const { queryText, queryVec, asOf, topK = 10, candPerBranch = 50 } = opts;
  const d = sql`p.d`;
  const scope = opts.documentNumbers?.length ? sql`AND e.document_number IN ${inIds(opts.documentNumbers)}` : sql``;

  const rows = (await db.execute(sql`
    WITH params AS (
      SELECT ${`[${queryVec.join(',')}]`}::vector AS qv, ${asOf}::date AS d, to_tsquery('simple', ${toTsQuery(queryText)}) AS q
    ),
    kw AS (
      SELECT e.id, row_number() OVER (ORDER BY ts_rank_cd(e.tsv, p.q, 1) DESC) AS rk, NULL::float8 AS dist
      FROM evidence_section e, params p
      WHERE e.tsv @@ p.q AND ${valid(d)} ${scope}
      ORDER BY ts_rank_cd(e.tsv, p.q, 1) DESC
      LIMIT ${candPerBranch}
    ),
    vec AS (
      SELECT e.id, row_number() OVER (ORDER BY e.embedding <=> p.qv) AS rk, (e.embedding <=> p.qv) AS dist
      FROM evidence_section e, params p
      WHERE e.embedding IS NOT NULL AND ${valid(d)} ${scope}
      ORDER BY e.embedding <=> p.qv
      LIMIT ${candPerBranch}
    ),
    fused AS (
      SELECT id, sum(1.0 / (${RRF_K} + rk)) AS score, min(dist) AS best_dist
      FROM (SELECT * FROM kw UNION ALL SELECT * FROM vec) u
      GROUP BY id
      ORDER BY score DESC
      LIMIT ${topK}
    )
    SELECT ${columns(d)}, f.score::float8 AS score, f.best_dist::float8 AS best_dist
    FROM fused f JOIN evidence_section e ON e.id = f.id, params p
    ORDER BY f.score DESC
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

/**
 * The status rows of the documents a question names. They travel with the answer whatever the ranking says:
 * a document the bot fetched on request can still read as in force (69/2018/NĐ-CP, replaced on 05/09/2026),
 * and the simple parser splits "69/2018/NĐ-CP" so the keyword branch cannot find its row by number.
 */
export async function namedStatus(db: Database, documentNumbers: string[], asOf: string): Promise<RetrievedEvidence[]> {
  if (!documentNumbers.length) return [];
  const rows = (await db.execute(sql`
    SELECT ${columns(sql`${asOf}::date`)}, 1::float8 AS score, NULL::float8 AS best_dist
    FROM evidence_section e
    WHERE e.kind = 'status' AND e.document_number IN ${inIds(documentNumbers)}
    ORDER BY e.id
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

/**
 * Sections whose text carries an 8-digit HS code the question names ("mũ bảo hiểm 6506.10.10 thuộc danh mục
 * nào") — the list that contains the code IS the answer, and the simple parser cannot match "6506.10.10" by
 * keyword. Binding sources first.
 */
export async function hsCodeSections(db: Database, codes: string[], asOf: string, limit = 3): Promise<RetrievedEvidence[]> {
  if (!codes.length) return [];
  const d = sql`${asOf}::date`;
  const rows = (await db.execute(sql`
    SELECT ${columns(d)}, 1::float8 AS score, NULL::float8 AS best_dist
    FROM evidence_section e
    WHERE e.hs_codes && ARRAY[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[] AND ${valid(d)}
    ORDER BY CASE e.authority WHEN 'binding' THEN 0 WHEN 'authoritative' THEN 1 WHEN 'administrative' THEN 2
                              WHEN 'reference' THEN 3 ELSE 4 END, e.id
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

function toEvidence(r: Record<string, unknown>): RetrievedEvidence {
  return {
    id: Number(r.id),
    kind: String(r.kind),
    instrument: String(r.instrument),
    authority: String(r.authority),
    title: String(r.title),
    body: String(r.body),
    documentNumber: (r.document_number as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    effectiveness: String(r.effectiveness),
    verification: String(r.verification),
    status: (r.status as string | null) ?? null,
    ends: Array.isArray(r.ends) ? (r.ends as StatusEnd[]) : [],
    window: r.window === 'upcoming' ? 'upcoming' : 'current',
    score: Number(r.score),
    bestDist: r.best_dist == null ? null : Number(r.best_dist),
  };
}

/** Issuer-segment prefix of each kind the user may name, after foldDocNumber (Đ → D). */
const KIND_PREFIX: Record<string, string> = { nghi_dinh: 'ND', thong_tu: 'TT', quyet_dinh: 'QD', nghi_quyet: 'NQ' };

/**
 * Document numbers the evidence layer holds sections for, matching a user-named document the corpus does not
 * hold as full text — "Nghị định 69/2018" has no clauses here, but it has a status row. Same matching as
 * resolveDocuments: the full number names one document; otherwise the named kind narrows when it leaves something.
 */
export async function evidenceInstruments(db: Database, ref: ParsedDocRef): Promise<string[]> {
  const bare = ref.core.replace(/^0+/, '');
  const heads = [...new Set([ref.core, bare, /^\d\//.test(ref.core) ? `0${ref.core}` : ref.core])];
  const rows = (await db.execute(sql`
    SELECT DISTINCT document_number AS number FROM evidence_section
    WHERE document_number IS NOT NULL
      AND (${sql.join(heads.map((h) => sql`upper(document_number) LIKE ${`${h}/%`}`), sql` OR `)})
  `)) as unknown as Array<{ number: string }>;
  const numbers = rows.map((r) => r.number);
  if (ref.full) return numbers.filter((n) => foldDocNumber(n) === foldDocNumber(ref.full));
  const prefix = ref.docType ? KIND_PREFIX[ref.docType] : undefined;
  const typed = prefix ? numbers.filter((n) => (foldDocNumber(n).split('/')[2] ?? '').startsWith(prefix)) : [];
  return typed.length ? typed : numbers;
}

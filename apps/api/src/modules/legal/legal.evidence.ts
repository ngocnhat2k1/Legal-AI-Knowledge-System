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
  /** The heading an Explanatory Note or a classification case is filed under ('30.05'). */
  hsHeading: string | null;
  /** The chapter of a chapter note. */
  hsChapter: number | null;
  /** HS codes the section lists, parent levels included. */
  hsCodes: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  effectiveness: string;
  verification: string;
  /** The notebook status sentence of a notebook-only document (meta.status). */
  status: string | null;
  /** Status rows only: when the instrument stops applying. Empty for every other kind. */
  ends: StatusEnd[];
  /** evidence_section.meta as stored: anchor, hs2022, also_headings, case_id, ahtn_2022, part, parent, … */
  meta: Record<string, unknown>;
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
  e.hs_heading, e.hs_chapter, e.hs_codes, e.meta,
  e.effective_from::text AS effective_from, e.effective_to::text AS effective_to, e.effectiveness, e.verification,
  CASE WHEN e.effective_from > ${d} THEN 'upcoming' ELSE 'current' END AS "window"`;

/**
 * A window row (meta.part) comes back as the whole section it was cut from (meta.parent = the parent's source_ref).
 * Classification cases never come from here: they enter by heading only (caseSections).
 */
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
    ),
    sections AS (
      SELECT coalesce(par.id, w.id) AS id, max(f.score) AS score, min(f.best_dist) AS best_dist
      FROM fused f
      JOIN evidence_section w ON w.id = f.id
      LEFT JOIN evidence_section par ON par.kind = w.kind AND par.instrument = w.instrument
        AND par.source_ref = w.meta->>'parent' AND par.meta->>'part' IS NULL
      GROUP BY 1
    )
    SELECT ${columns(d)}, s.score::float8 AS score, s.best_dist::float8 AS best_dist
    FROM sections s JOIN evidence_section e ON e.id = s.id, params p
    WHERE e.meta->>'case_id' IS NULL
    ORDER BY s.score DESC
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
    WHERE e.kind = 'status' AND e.document_number IN ${inIds(documentNumbers)} AND e.meta->>'part' IS NULL
    ORDER BY e.id
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

/**
 * Sections whose text carries an HS code the question names ("mũ bảo hiểm 6506.10.10 thuộc danh mục
 * nào") — the list that contains the code IS the answer, and the simple parser cannot match "6506.10.10" by
 * keyword. Binding sources first. A list entry covers its children ("2404.11" lists 2404.11.00), and a heading asked
 * finds its listed lines; entries shorter than four digits never match. Window rows (meta.part) are left to retrieval:
 * a pin returns the whole section. Classification cases list codes too, but enter by heading only (caseSections).
 */
export async function hsCodeSections(db: Database, codes: string[], asOf: string, limit = 3): Promise<RetrievedEvidence[]> {
  if (!codes.length) return [];
  const d = sql`${asOf}::date`;
  const rows = (await db.execute(sql`
    SELECT ${columns(d)}, 1::float8 AS score, NULL::float8 AS best_dist
    FROM evidence_section e
    WHERE e.meta->>'part' IS NULL AND e.meta->>'case_id' IS NULL AND ${valid(d)}
      AND EXISTS (
        SELECT 1 FROM unnest(e.hs_codes) c, unnest(ARRAY[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[]) q
        WHERE length(replace(c, '.', '')) >= 4
          AND (replace(q, '.', '') LIKE replace(c, '.', '') || '%' OR replace(c, '.', '') LIKE replace(q, '.', '') || '%')
      )
    ORDER BY CASE e.authority WHEN 'binding' THEN 0 WHEN 'authoritative' THEN 1 WHEN 'administrative' THEN 2
                              WHEN 'reference' THEN 3 ELSE 4 END, e.id
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

/**
 * The Explanatory Notes of the headings a question names (as `30.05`) and the HS notes of their chapters. "3005.10.10
 * gồm những hàng gì, khác 3005.90 chỗ nào" names heading 30.05 only as digits, which neither branch matches to the
 * note titled "nhóm 30.05": the model abstained with that note in the table (observed 2026-09-14). The default limit
 * leaves room for one note per heading and two notes per chapter: a flat 6 cut the chapter notes of a four-heading
 * code check (review 2026-09-14 #6).
 */
export async function headingSections(db: Database, headings: string[], asOf: string, limit?: number): Promise<RetrievedEvidence[]> {
  if (!headings.length) return [];
  const d = sql`${asOf}::date`;
  const chapters = [...new Set(headings.map((h) => Number(h.slice(0, 2))))];
  const rows = (await db.execute(sql`
    SELECT ${columns(d)}, 1::float8 AS score, NULL::float8 AS best_dist
    FROM evidence_section e
    WHERE ((e.kind = 'en' AND (e.hs_heading IN ${inIds(headings)}
              OR jsonb_exists_any(coalesce(e.meta->'also_headings', '[]'::jsonb), ARRAY[${sql.join(headings.map((h) => sql`${h}`), sql`, `)}]::text[])))
           OR (e.kind = 'hs_note' AND e.hs_chapter IN ${inIds(chapters)}))
      AND e.meta->>'part' IS NULL AND ${valid(d)}
    ORDER BY CASE e.kind WHEN 'en' THEN 0 ELSE 1 END, e.hs_heading, e.hs_chapter, e.id
    LIMIT ${limit ?? headings.length + 2 * chapters.length}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

/**
 * Classification cases (ruling rows carrying meta.case_id) filed under the headings asked, and only while the case's
 * code still stands in AHTN 2022: a case whose code was split or dropped concluded under an old catalogue (plan 08 §0,
 * G11). ponytail: two per heading on average, ordered by heading and id; the seed holds at most three per heading
 * (2026-09-14) — rank them when a heading gathers more.
 */
export async function caseSections(db: Database, headings: string[], asOf: string, limit = 2 * headings.length): Promise<RetrievedEvidence[]> {
  if (!headings.length) return [];
  const d = sql`${asOf}::date`;
  const rows = (await db.execute(sql`
    SELECT ${columns(d)}, 1::float8 AS score, NULL::float8 AS best_dist
    FROM evidence_section e
    WHERE e.kind = 'ruling' AND e.meta->>'case_id' IS NOT NULL AND e.hs_heading IN ${inIds(headings)}
      AND starts_with(e.meta->'ahtn_2022'->>'trang_thai', 'hien_hanh') AND e.meta->>'part' IS NULL AND ${valid(d)}
    ORDER BY e.hs_heading, e.id
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(toEvidence);
}

function toEvidence(r: Record<string, unknown>): RetrievedEvidence {
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  return {
    id: Number(r.id),
    kind: String(r.kind),
    instrument: String(r.instrument),
    authority: String(r.authority),
    title: String(r.title),
    body: String(r.body),
    documentNumber: (r.document_number as string | null) ?? null,
    hsHeading: (r.hs_heading as string | null) ?? null,
    hsChapter: r.hs_chapter == null ? null : Number(r.hs_chapter),
    hsCodes: Array.isArray(r.hs_codes) ? (r.hs_codes as string[]) : [],
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    effectiveness: String(r.effectiveness),
    verification: String(r.verification),
    status: typeof meta.status === 'string' ? meta.status : null,
    ends: Array.isArray(meta.ends) ? (meta.ends as StatusEnd[]) : [],
    meta,
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

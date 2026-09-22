/**
 * Contracts of the POST /answer path (plan 08). The classification walkthrough (walkthrough.ts) is written by a separate
 * work stream against these types, so they change only by agreement.
 */

export type Authority = 'binding' | 'authoritative' | 'administrative' | 'reference' | 'undetermined';

/** One evidence section as the model reads it; `id` is what every citation points at. */
export interface EvidenceRow {
  id: number;
  kind: string;
  authority: Authority;
  title: string;
  body: string;
  window: 'current' | 'upcoming';
  /** Passed through untouched (classification cases carry case_id, muc_lap_luan, rang_buoc, ahtn_2022, lien_ket). */
  meta: Record<string, unknown>;
}

export interface CandidateHeading {
  /** Four-digit heading, dotted as the notes print it: "30.05". */
  heading: string;
  headingText: string;
  /** The subheading and 8-digit lines under the heading, from hs_description. */
  lines: Array<{ code: string; path: string }>;
  /** Chapter/section notes, Explanatory Note, SEN and rulings for this heading. */
  evidence: EvidenceRow[];
}

/**
 * What the walkthrough prompt may see. The user's own code is deliberately absent (R4): the runner keeps it and compares
 * afterwards. A heading the user named may be among `candidates`, unlabelled, added after the blind candidate search
 * (owner decision 2026-09-14).
 */
export interface ClassifyInput {
  /** The standalone question, every HS code and heading the user wrote masked as [mã n]. */
  question: string;
  /** The goods as the user described them, same masking; only traits the user actually wrote. */
  goodsFacts: string;
  depth: 'brief' | 'full';
  asOf: string;
  /** Three to six headings. */
  candidates: CandidateHeading[];
  /**
   * Whole rate lines from /tariff for the leading candidates, for reasoning only. Rates never appear in prose: the
   * runner prints them in a code-built block under the answer (owner decision 2026-09-14).
   */
  tariffLines: Array<{ code: string; line: string }>;
  /** HS-keyed list rows (annex tables, list clauses) fetched by retrieve, for policyStatus. */
  policyRows: EvidenceRow[];
}

export type WalkthroughSectionKey =
  | 'facts'
  | 'nature'
  | 'candidates'
  | 'exclusions'
  | 'gir'
  | 'levels'
  | 'explanation'
  | 'policy'
  | 'risk'
  | 'conclusion';

/** Sections are what the checks work on, never a visible template: an empty section is omitted. */
export interface WalkthroughSection {
  key: WalkthroughSectionKey;
  /** Markdown in the md() subset, [n] markers pointing at `cites`. No rate or amount (owner decision 2026-09-14). */
  markdown: string;
  /**
   * [n] ↔ cites[n-1]: the evidence row id and the verbatim phrases the section quotes from it, which verify() keeps a
   * citation on (R10). Built by code from the section's own sentences, never re-pointed; `quotes: []` leaves G2 to decide.
   */
  cites: Array<{ id: number; quotes: string[] }>;
}

export type HeadingAssessment = 'phu_hop' | 'co_the_neu' | 'loai' | 'chua_du_du_kien';

export interface WalkthroughOutput {
  sections: WalkthroughSection[];
  /** One per candidate heading; `{heading, assessment}` is what the R4 invariance probe compares (right vs wrong user code). */
  candidates: Array<{ heading: string; assessment: HeadingAssessment; deciding_facts: string[]; cite_ids: number[] }>;
  /**
   * Zero to three headings: empty when the model abstains; never a single bare code as settled (R2, R5). At most three
   * missing facts.
   */
  conclusion: { headings: string[]; needs_advance_ruling: boolean; missing_facts: string[] };
  /**
   * At most one LINES line per concluded heading, the one the goods facts lead to; code prints it under that candidate and,
   * at full, looks it up for a block. Never a number in prose, never a rate.
   */
  tariff_ref: string[];
}

export interface Violation {
  rule: string;
  detail: string;
  sentence?: string;
  citation?: number;
}

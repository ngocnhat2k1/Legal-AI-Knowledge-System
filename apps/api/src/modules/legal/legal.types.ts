/**
 * Response shape for the legal RAG lookup (Phase 5).
 *
 * The discipline mirrors the tariff RateView: an answer is never a bare sentence.
 * Every response carries the VERBATIM provisions it is grounded in, each with its
 * document number, precise citation label, effectiveness and Công báo link — so a
 * human can verify the claim against the source (a research tool that shows its
 * sources, never an answer machine). When the corpus cannot ground an answer the
 * response abstains rather than guessing (abstention is a first-class output).
 */

/** One verbatim provision the answer rests on. */
export interface LegalCitation {
  documentNumber: string; // '31/2018/NĐ-CP'
  documentTitle: string;
  articleLabel: string; // 'Điều 15 Nghị định 31/2018/NĐ-CP'
  provisionLabel: string; // 'Khoản 1 Điều 15 Nghị định 31/2018/NĐ-CP' (the precise clause)
  verbatimText: string; // the clause text, quoted, never paraphrased
  path: string; // 'Nghị định 31/2018/NĐ-CP › Chương IV › Điều 15 › Khoản 1'
  effectiveness: string; // con_hieu_luc | het_hieu_luc | …
  effectiveFrom: string | null;
  effectiveTo: string | null;
  gazetteUrl: string | null;
}

export interface LegalAnswer {
  query: string;
  asOf: string; // the as-of date the corpus was filtered to (YYYY-MM-DD)
  /** True when no provision could ground the question — the honest "I don't know". */
  abstained: boolean;
  /** Present when abstained, or when a prose answer could not be grounded. */
  reason: string | null;
  /**
   * Grounded natural-language answer. Empty string when we could not synthesise a
   * grounded prose answer (no LLM available, or it declined) — the citations still
   * stand on their own as the verbatim, authoritative response.
   */
  answer: string;
  /** The verbatim provisions retrieved for this query. Empty only when abstained. */
  citations: LegalCitation[];
}

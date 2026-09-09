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
  /**
   * 'auto_unverified' means the bot fetched and parsed this document on request and
   * nobody has read it since. Answers resting on it are labelled, because machine-
   * fetched text must never quietly acquire the standing of text a human checked.
   */
  verification: string;
}

/** One document in the corpus — the manifest the bot shows when asked for something we lack. */
export interface LegalDocumentView {
  number: string; // '46/VBHN-BTC'
  docType: string; // 'vbhn' | 'nghi_dinh' | 'thong_tu' | …
  title: string;
  consolidates: string | null; // the base document a VBHN consolidates
  effectiveFrom: string;
  effectiveTo: string | null;
  effectiveness: string;
  sourceUrl: string | null;
}

/** A verbatim provision fetched by citation, with no retrieval and no model in the path. */
export interface LegalProvisionView {
  documentNumber: string;
  documentTitle: string;
  citationLabel: string;
  path: string;
  heading: string | null;
  body: string;
  effectiveness: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  gazetteUrl: string | null;
}

export interface LegalAnswer {
  query: string;
  asOf: string; // the as-of date the corpus was filtered to (YYYY-MM-DD)
  /** The document number the question named, normalised — null when it named none. */
  requestedDoc: string | null;
  /**
   * Set when the question named a document the corpus does not hold. This is a
   * DIFFERENT failure from "nothing relevant found", and the bot must say so
   * differently: the honest answer is "we don't carry that document", not a
   * near-miss from whichever document we happen to carry.
   */
  missingDoc: string | null;
  /**
   * When `missingDoc` is set, what the Công báo catalogue knows about that number.
   * Turns a dead end into a next step: the real title, the gazette link, and a
   * document we could offer to fetch. Empty when the catalogue has never seen it —
   * which is itself informative (the number may simply be wrong).
   */
  /**
   * WHAT the catalogue hits are, because the three cases need three different replies:
   *   'exact'     — this IS the document asked for; offer to fetch it.
   *   'ambiguous' — right issuer and serial, several years ("thông tư 36 của Bộ KH&CN");
   *                 ask which year. These are candidates, not wrong answers.
   *   'similar'   — merely near by number ("36/2016" also matches 36/2016/TT-BCT).
   *                 A different ministry's document; present as "did you mean", never
   *                 as the answer, and never offer to fetch one in its place.
   */
  gazetteMatchKind: 'exact' | 'ambiguous' | 'similar' | 'none';
  gazetteMatches: Array<{ number: string; docType: string; title: string; sourceUrl: string }>;
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

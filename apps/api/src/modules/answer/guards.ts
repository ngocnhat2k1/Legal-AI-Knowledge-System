/**
 * Code guards of the POST /answer path (plan 08), shared by the runner and the classification walkthrough. Every rule
 * the model is told in the prompt is also checked here, because a rule held only by prompt wording is not held (ADR
 * 2026-08-14). The sentence-level anchoring of numbers to their own citation stays in legal.grounding.ts numberMarkers.
 */

/** Sentences of Markdown prose: split after . ? ! ; or a line break, as numberMarkers does. */
export const splitSentences = (text: string): string[] =>
  String(text ?? '')
    .split(/(?<=[.?!;])(?= )|(?<=\n)/)
    .map((s) => s.trim())
    .filter(Boolean);

const RATE = /\d+(?:[.,]\d+)?\s*%|(?<![\p{L}])phần trăm(?![\p{L}])|\d[\d.,]*\s*(?:USD|VND|đồng|đ)(?![\p{L}\d])/iu;

/**
 * Sentences stating a rate or an amount. Rates never appear in prose: the reply prints them in a block built from /tariff
 * (owner decision 2026-09-14, stricter than R1 requires), so any such sentence is a violation whatever it cites.
 */
export const ratesInProse = (text: string): string[] => splitSentences(text).filter((s) => RATE.test(s));

const HEADING_OR_CODE = /(?<![\d.,/])(?:\d{2}\.\d{2}|\d{4}(?:\.\d{2}){0,2}|\d{8})(?![\d/%]|[.,]\d)/;
const SETTLING =
  /(?<![\p{L}])(?:phải\s+xét(?:\s+vào)?|chắc\s+chắn\s+(?:thuộc|là|vào)|chốt\s+(?:mã|nhóm)|nên\s+(?:khai|áp)(?:\s+(?:mã|nhóm|vào))?|đề\s+xuất\s+(?:khai\s+|áp\s+)?(?:mã|nhóm)|độ\s+tin\s+cậy|kết\s+luận\s+(?:là\s+)?(?:mã|nhóm)|thuộc\s+hẳn)(?![\p{L}])/iu;

/**
 * Sentences settling goods under one heading or code (R2, R3, R5): a heading or code next to "phải xét", "chắc chắn thuộc",
 * "chốt mã", "nên khai", "độ tin cậy". Observed 2026-09-14 on "miếng dán bàn chân ngải cứu": "chưa xác định được công dụng
 * cụ thể … nên phải xét vào 38.24". Conditional reasoning ("nếu có chỉ định điều trị thì hướng về 30.04") passes.
 */
export const settlementClaims = (text: string): string[] =>
  splitSentences(text).filter((s) => HEADING_OR_CODE.test(s) && SETTLING.test(s));

const digits = (s: string): string => s.replace(/\D/g, '');

/**
 * The user's own 8-digit codes found in texts sent to a model (R4). Check the question, goods facts, transcript and state —
 * not evidence bodies, which list every line under a candidate heading. The user's 4-digit heading may appear: it is a
 * comparison target (owner decision 2026-09-14).
 */
export function userCodesIn(texts: string[], userCodes: string[]): string[] {
  const hay = texts.map((t) => ` ${String(t ?? '').replace(/(\d)[.\s](?=\d)/g, '$1')} `).join(' ');
  return userCodes.filter((c) => digits(c).length === 8 && new RegExp(`(?<!\\d)${digits(c)}(?!\\d)`).test(hay));
}

/** Citation ids that were never retrieved for this answer. */
export const unknownCitations = (cited: number[], retrieved: number[]): number[] => {
  const known = new Set(retrieved);
  return [...new Set(cited)].filter((id) => !known.has(id));
};

const normQuote = (s: string): string =>
  String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’.,;:…-]+|[\s"'“”‘’.,;:…-]+$/g, '')
    .trim();

/** A quote proves nothing unless it is verbatim in the section it cites (spec §3.6 check 2, R10): string support, not entailment. */
export const quoteInBody = (quote: string, body: string): boolean => {
  const q = normQuote(quote);
  return q.length > 0 && normQuote(body).includes(q);
};

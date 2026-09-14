/**
 * Code guards of the POST /answer path (plan 08), shared by the runner and the classification walkthrough. Every rule
 * the model is told in the prompt is also checked here, because a rule held only by prompt wording is not held (ADR
 * 2026-08-14). The sentence-level anchoring of numbers to their own citation stays in legal.grounding.ts numberMarkers.
 */
import { dropInForceClaims, numberMarkers } from '../legal/legal.grounding';
import type { Violation } from './types';

const SENTENCE_END = /(?<=[.?!;])(?= )|(?<=\n)/;

/** Sentences of Markdown prose: split after . ? ! ; or a line break, as numberMarkers does. */
export const splitSentences = (text: string): string[] =>
  String(text ?? '')
    .split(SENTENCE_END)
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
  /(?<![\p{L}])(?:phải\s+xét(?:\s+vào)?|chắc\s+chắn\s+(?:thuộc|là|vào)|chỉ\s+có\s+thể\s+(?:thuộc|là|vào)|chốt\s+(?:mã|nhóm)|nên\s+(?:khai|áp)(?:\s+(?:mã|nhóm|vào))?|đề\s+xuất\s+(?:khai\s+|áp\s+)?(?:mã|nhóm)|kết\s+luận\s+(?:là\s+)?(?:mã|nhóm)|thuộc\s+hẳn)(?![\p{L}])/iu;
// "sau khi đối chiếu, chắc chắn thuộc …" reads as a condition but settles all the same.
const CONDITIONAL = /(?<![\p{L}])(?:nếu|(?<!(?:sau|trước)\s)khi|trường\s+hợp|tùy|tuỳ)(?![\p{L}])/iu;
const CONFIDENCE = /(?<![\p{L}])độ\s+tin\s+cậy(?![\p{L}])/iu;

/**
 * Sentences settling goods under one heading or code (R2, R3, R5): a heading or code next to "phải xét", "chắc chắn thuộc",
 * "chốt mã", "nên khai", outside a "nếu/khi/trường hợp/tùy" condition; and any "độ tin cậy". Observed 2026-09-14 on
 * "miếng dán bàn chân ngải cứu": "chưa xác định được công dụng cụ thể … nên phải xét vào 38.24". Conditional reasoning
 * ("nếu có chỉ định điều trị thì hướng về 30.04", "… khi đó phải xét tiếp nhóm 38.24") passes.
 */
export const settlementClaims = (text: string): string[] =>
  splitSentences(text).filter((s) => CONFIDENCE.test(s) || (HEADING_OR_CODE.test(s) && SETTLING.test(s) && !CONDITIONAL.test(s)));

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

/** What compose returns (plan 08 §3.1): [n] in `answerMd` and in `evidence` points at sources[n-1]. */
export interface Draft {
  answerMd: string;
  citations: Array<{ n: number; quotes: string[] }>;
  candidates: Array<{ hs: string; evidence: number[] }>;
  missingFacts: string[];
}

/** One section a draft may cite, as gather() retrieved it. */
export interface Source {
  kind: string;
  label: string;
  body: string;
  /** Dotted, as evidence_section stores it: "30.05". */
  hsHeading: string | null;
  hsCodes: string[];
  documentNumber: string | null;
  /** The data's end-of-force line when the instrument ended before the as-of date (evidenceSource); null otherwise. */
  expired: string | null;
}

export interface VerifyContext {
  /** The user's words as the compose prompt showed them — codes masked unless subject — so a figure they wrote needs no source. */
  userText: string;
  codeRole: 'none' | 'premise' | 'subject' | 'key';
  userCodes: string[];
  /** Dotted four-digit headings with lines in hs_description. */
  headings: Set<string>;
}

/** `sentence` is as the draft wrote it, so a repair can replace it; `repairOnly` asks for a repair and cuts nothing. */
export interface GuardViolation extends Violation {
  repairOnly?: boolean;
}

export interface VerifyResult {
  answerMd: string;
  /** Renumbered: [n] in `answerMd` and in candidates' `evidence` is citations[n-1]; `source` indexes the sources given. */
  citations: Array<{ n: number; source: number; quotes: string[] }>;
  candidates: Array<{ hs: string; evidence: number[] }>;
  violations: GuardViolation[];
  cut: number;
}

export const CUT_LINE = 'Một phần câu trả lời bị lược vì không dẫn được nguồn.';

const EVIDENCE_KINDS = new Set(['en', 'sen', 'hs_note', 'gri', 'ruling', 'guidance', 'annex_table']);
const CODE8 = /(?<![\d.,/])(?:\d{4}\.\d{2}\.\d{2}|\d{8})(?![\d/%]|[.,]\d)/g;
const PLACED_UNDER = new RegExp(`(?<!\\p{L})(?:thuộc|vào|áp|khai)\\s+(?:mã|nhóm)(?:\\s+(?:số|HS))?\\s+\\**(${HEADING_OR_CODE.source})`, 'giu');

/** "3005" → "30.05", "300510" → "3005.10", "30051010" → "3005.10.10". */
const dotted = (d: string): string =>
  d.length <= 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : [d.slice(0, 4), d.slice(4, 6), d.slice(6)].filter(Boolean).join('.');
const names = (text: string, d: string): boolean => new RegExp(`(?<![\\d.,/])${dotted(d).replace(/\./g, '\\.')}(?![\\d/%]|[.,]\\d)`).test(text);

/**
 * The code guards over a compose draft (plan 08 §4.1), pure: G2 keeps a citation only on verbatim quotes; G5 keeps one to
 * three candidates, each proven by a live note, SEN, ruling or annex naming it; G1, G4–G7 cut whole sentences, G3 cuts
 * those whose figures neither their quotes nor labels hold (numberMarkers). An unanchored rate or amount drops the prose.
 */
export function verify(draft: Draft, sources: Source[], ctx: VerifyContext): VerifyResult {
  const violations: GuardViolation[] = [];

  const quotes = new Map<number, string[]>();
  for (const { n, quotes: qs } of draft.citations) {
    for (const q of qs) {
      if (sources[n - 1] && quoteInBody(q, sources[n - 1]!.body)) quotes.set(n, [...(quotes.get(n) ?? []), q]);
      else violations.push({ rule: 'G2', detail: 'quote is not verbatim in its source', citation: n });
    }
  }

  const candidates: Draft['candidates'] = [];
  for (const c of draft.candidates) {
    if (candidates.length === 3) {
      violations.push({ rule: 'G5', detail: 'more than three candidates' });
      break;
    }
    const live = c.evidence.filter((n) => quotes.has(n) && EVIDENCE_KINDS.has(sources[n - 1]!.kind));
    let d = digits(c.hs);
    const deep = live.some((n) => quotes.get(n)!.some((q) => names(q, d)) && (d.length < 8 || ['ruling', 'annex_table'].includes(sources[n - 1]!.kind)));
    if (d.length > 4 && !deep) {
      violations.push({ rule: 'G5', detail: `${c.hs} is deeper than any quote naming it: kept as its heading` });
      d = d.slice(0, 4);
    }
    const hs = dotted(d);
    const evidence = live.filter((n) => {
      const s = sources[n - 1]!;
      return s.hsHeading === hs || s.hsCodes.some((code) => digits(code).startsWith(d)) || [s.label, ...quotes.get(n)!].some((t) => names(t, d));
    });
    if (!ctx.headings.has(dotted(d.slice(0, 4))) || !evidence.length || candidates.some((k) => k.hs === hs)) {
      violations.push({ rule: 'G5', detail: `${c.hs} has no hs_description line or no live evidence naming it` });
      continue;
    }
    candidates.push({ hs, evidence });
  }

  const quoteText = sources.map((_, i) => (quotes.get(i + 1) ?? []).join('\n'));
  const cited = [...quotes.keys()];
  const subject = ctx.codeRole === 'subject';
  const own = ctx.userCodes.map(digits).filter((u) => u.length >= 4);
  const eights = new Set(candidates.map((c) => digits(c.hs)).filter((d) => d.length === 8));
  const expired = sources.filter((s) => s.expired && s.documentNumber).map((s) => s.documentNumber!);
  const current = sources.filter((s) => !s.expired && s.documentNumber).map((s) => s.documentNumber!);
  const rates = ratesInProse(draft.answerMd);
  const settling = settlementClaims(draft.answerMd);
  const rules: Array<[string, string, (s: string) => boolean]> = [
    ['G1', 'rate or amount in prose', (s) => rates.includes(s)],
    ['G4', 'settles the goods under one heading', (s) => settling.includes(s)],
    ['G5', 'eight-digit code that is no candidate', (s) => [...s.matchAll(CODE8)].some(([c]) => !eights.has(digits(c)) && !(subject && own.includes(digits(c))))],
    ['G6', 'places the goods under the code asked about', (s) => subject && [...s.matchAll(PLACED_UNDER)].some(([, c]) => own.some((u) => u.startsWith(digits(c!)) || digits(c!).startsWith(u)))],
    ['G7', 'calls an ended instrument in force', (s) => dropInForceClaims(s, expired, current) !== s],
  ];
  const bad = new Set<string>();
  for (const s of splitSentences(draft.answerMd)) {
    for (const [rule, detail, broken] of rules) {
      if (!broken(s)) continue;
      bad.add(s);
      violations.push({ rule, detail, sentence: s });
    }
  }

  // Every rate sentence is cut; one whose figure its own quote lacks was made up, and so may be the rest (R1, R10).
  const dropped = rates.length > 0 && !numberMarkers(rates.join(' '), cited, quoteText, ctx.userText).answer;
  if (dropped) violations.push({ rule: 'G1', detail: 'a rate or amount its quote lacks: prose dropped' });
  const kept = dropped ? '' : draft.answerMd.split(SENTENCE_END).map((p) => (bad.has(p.trim()) ? p.replace(/[^\n]+/, '') : p)).join('');
  const labels = sources.map((s, i) => (quotes.has(i + 1) ? s.label : ''));
  const numbered = numberMarkers(kept, cited, quoteText, ctx.userText, { cut: true, labels });
  const unanchored = numbered.cut ?? [];
  for (const sentence of unanchored) violations.push({ rule: 'G3', detail: 'a figure neither its quotes nor its label hold', sentence });

  // numberMarkers kept markers of dead citations (in range, no quote): drop them, then append candidates' own evidence.
  const order = numbered.order.filter((n) => quotes.has(n));
  const at = (n: number): number => {
    if (!order.includes(n)) order.push(n);
    return order.indexOf(n) + 1;
  };
  let answer = numbered.answer
    .replace(/\s*\[(\d+)\]/g, (m, k: string) => {
      const n = numbered.order[Number(k) - 1]!;
      return quotes.has(n) ? m.replace(k, String(at(n))) : '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const outCandidates = candidates.map((c) => ({ hs: c.hs, evidence: c.evidence.map(at) }));

  const cut = dropped ? splitSentences(draft.answerMd).length : bad.size + unanchored.length;
  if (cut && answer && !answer.includes(CUT_LINE)) answer += `\n\n${CUT_LINE}`;
  if (candidates.length >= 2 && !draft.missingFacts.some((f) => f.trim())) {
    violations.push({ rule: 'G4', detail: 'two or more candidates and no missing fact', repairOnly: true });
  }
  return { answerMd: answer, citations: order.map((n, i) => ({ n: i + 1, source: n - 1, quotes: quotes.get(n)! })), candidates: outCandidates, violations, cut };
}

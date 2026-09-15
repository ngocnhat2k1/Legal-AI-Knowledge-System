/**
 * Code guards of the POST /answer path (plan 08), shared by the runner and the classification walkthrough. Every rule
 * the model is told in the prompt is also checked here, because a rule held only by prompt wording is not held (ADR
 * 2026-08-14). The sentence-level anchoring of numbers to their own citation stays in legal.grounding.ts numberMarkers.
 */
import { cutPieces, dropInForceClaims, numberMarkers } from '../legal/legal.grounding';
import type { Violation } from './types';

const SENTENCE_END = /(?<=[.?!;])(?= )|(?<=\n)/;

/** Sentences of Markdown prose: split after . ? ! ; or a line break, as numberMarkers does. */
export const splitSentences = (text: string): string[] =>
  String(text ?? '')
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);

// Guards run on every answer inside the API event loop, so every pattern here stays linear on 10,000 characters of
// adversarial prose (guards.spec.ts times them): a number is read from its first digit only ("(?<!\d)", "\d(?<!\d[.,]*\d)"),
// lookbehinds and spans are bounded, and no two adjacent quantifiers share a character.
const RATE = /(?<!\d)\d+(?:[.,]\d+)?\s*%|(?<![\p{L}])phần trăm(?![\p{L}])|\d(?<!\d[.,]*\d)[\d.,]*\s*(?:USD|VND|đồng|đ)(?![\p{L}\d])/iu;

/**
 * Sentences stating a rate or an amount. Rates never appear in prose: the reply prints them in a block built from /tariff
 * (owner decision 2026-09-14, stricter than R1 requires), so any such sentence is a violation whatever it cites.
 */
export const ratesInProse = (text: string): string[] => splitSentences(text).filter((s) => RATE.test(s));

const HEADING_OR_CODE = /(?<![\d.,/])(?:\d{2}\.\d{2}|\d{4}(?:\.\d{2}){0,2}|\d{8})(?![\d/%]|[.,]\d)/;
// A settling verb, any of "phải/xét/khai/áp/vào/là/thuộc", an optional "mã/nhóm (số/HS)", then the heading: "phải khai
// 38.24", "Mình chốt là 38.24". After "có/không/chưa (thể)" the verb asks or denies: "có phải 38.24 không" settles nothing;
// nor does "để" + verb opening the sentence or after an earlier "chưa/không" in its clause ("Để chốt 30.05 hay 38.24, cần …",
// "Chưa đủ căn cứ để chốt 38.24"), while "Đã đủ căn cứ để chốt 38.24" settles. Group 1 is a verdict label's ":" and stars
// right after the verb ("**Kết luận:** nhóm 38.24"); stars and spaces never share a quantifier. Bounds: at most 8 spaces
// between words the lookbehinds read, "chưa/không" at most 120 characters before "để", four verbs in a chain.
const SETTLING = new RegExp(
  `(?<![\\p{L}])(?<!(?:có|không|chưa)(?:\\s{1,8}thể)?\\s{1,8})(?<!^\\s{0,8}\\**\\s{0,8}để\\s{1,8})(?<!(?<![\\p{L}])(?:chưa|không)(?![\\p{L}])[^,;:]{0,120}\\sđể\\s{1,8})(?:(?:phải|nên|chỉ\\s+có\\s+thể|chắc\\s+chắn|chốt|đề\\s+xuất|kết\\s+luận)(:?\\**)(?:\\s+(?:phải|xét|khai|áp|vào|là|thuộc)){0,4}(?:\\s+(?:mã|nhóm)(?:\\s+(?:số|HS))?)?\\s+\\**${HEADING_OR_CODE.source}|thuộc\\s+hẳn(?![\\p{L}]))`,
  'giu',
);
// After a label the heading settles only alone, markers and end punctuation at most: "Kết luận: 30.05 hoặc 38.24" and
// "**Kết luận:** mã 3005.10.10 chỉ áp dụng cho …" pass as on main. Known ceiling: "Kết luận: 38.24 vì …".
const LONE = /^[\s*.;!?]*(?:\[\d+\][\s*.;!?]*)*$/;
const lone = (s: string, m: RegExpExecArray): boolean => {
  const rest = s.slice(m.index + m[0].length);
  return rest.length <= 40 && LONE.test(rest);
};
/** Every SETTLING match in `s`, overlapping ones too: each position is tried once, as `test` would try it. */
const settlingIn = (s: string): RegExpExecArray[] => {
  const out: RegExpExecArray[] = [];
  SETTLING.lastIndex = 0;
  for (let m = SETTLING.exec(s); m; m = SETTLING.exec(s)) {
    out.push(m);
    SETTLING.lastIndex = m.index + 1;
  }
  return out;
};
// "khi" and "trường hợp" make a condition only with a "thì" at most 200 characters on ("khi hàng có lớp dính thì …") or
// as "khi đó": "Khi chưa rõ công dụng, phải xét 38.24", "trong trường hợp này … chắc chắn thuộc" and "sau/trước khi đối
// chiếu (thì) chắc chắn thuộc" settle; "khiếu/khiến" is no "khi".
const CONDITIONAL =
  /(?<![\p{L}])(?:nếu|tùy|tuỳ|trừ\s+khi|khi\s+đó|(?:(?<!(?:sau|trước)\s)khi|trường\s+hợp(?!\s+này))(?![\p{L}])(?:[^.;?!]|\.(?=\d)){0,200}?\sthì)(?![\p{L}])/iu;
const CONFIDENCE = /(?<![\p{L}])độ\s+tin\s+cậy(?![\p{L}])/iu;

// A condition that says what is not known settles as surely as "Chưa rõ công dụng nên phải xét 38.24". The verb's own
// condition runs from the last "nếu/khi/trường hợp" in the 120 characters before it to its "thì" or comma, with no second
// break before the verb; as on main, the verb still settles nothing after a hedge ("chưa nên vội chốt", "rất khó kết
// luận"), before a listed heading ("30.05 và nhóm 38.24") or before a condition of its own ("chỉ nên khai 30.05 khi …").
// Known ceilings, left to the compose prompt and repair: ignorance in other words ("thông tin chưa đủ để xác định"), a
// finding read as ignorance ("kiểm nghiệm không xác định được dược chất nào"), a condition after the verb.
const OPENER = /(?<![\p{L}])(?:nếu|khi(?!\s+đó)|trường\s+hợp(?!\s+này))(?![\p{L}])/giu;
const IGNORANCE =
  /(?<![\p{L}])(?:(?:chưa|không)\s+(?:rõ|biết|xác\s+định)|(?:chưa\s+có|thiếu|không\s+có|chưa\s+đủ)\s+(?:thông\s+tin|căn\s+cứ|dữ\s+kiện|tài\s+liệu))(?![\p{L}])/iu;
const BREAK = /[,;:]\s*(?:thì(?![\p{L}]))?|(?<![\p{L}])thì(?![\p{L}])/iu;
const HEDGE = /(?<![\p{L}])(?:chưa|không|khó)(?![\p{L}])/iu;
const LISTED = /^\**(?:\s*\[\d+\])*\s*(?:,|(?<=\s)(?:và|hoặc|hay)(?![\p{L}]))\s*(?:(?:mã|nhóm|phân\s+nhóm)\s+)?\**\d/iu;
const unknownCondition = (s: string, m: RegExpExecArray): boolean => {
  const from = Math.max(0, m.index - 120);
  const before = s.slice(from, m.index);
  const open = [...before.matchAll(OPENER)].pop();
  if (!open || (open.index === 0 && /\p{L}/u.test(s[from - 1] ?? ''))) return false;
  const [condition, then = '', ...more] = before.slice(open.index + open[0].length).split(BREAK);
  const after = s.slice(m.index + m[0].length, m.index + m[0].length + 60);
  return !more.length && IGNORANCE.test(condition!) && !HEDGE.test(then) && !LISTED.test(after) && after.split(/[,;:]/)[0]!.search(OPENER) < 0;
};

/**
 * Sentences settling goods under one heading or code (R2, R3, R5): "phải (xét/khai/thuộc)", "nên (là/thuộc)", "chắc chắn
 * thuộc", "chốt (là)", "đề xuất", "kết luận" before a heading or code, outside a "nếu/tùy/trừ khi/khi đó" or "khi/trường
 * hợp … thì" condition or inside one saying what is not known; and any "độ tin cậy". Observed 2026-09-14 on "miếng dán bàn
 * chân ngải cứu": "chưa xác định được công dụng cụ thể … nên phải xét vào 38.24". Conditional reasoning ("nếu có chỉ định
 * điều trị thì hướng về 30.04", "… khi đó phải xét tiếp nhóm 38.24") and a heading still to check ("nên xét thêm nhóm
 * 38.24") pass.
 */
export const settlementClaims = (text: string): string[] =>
  splitSentences(text).filter((s) => {
    if (CONFIDENCE.test(s)) return true;
    if (!HEADING_OR_CODE.test(s)) return false;
    const conditional = CONDITIONAL.test(s);
    return settlingIn(s).some((m) => (!m[1] || lone(s, m)) && (!conditional || unknownCondition(s, m)));
  });

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

const QUOTE_EDGE = /[\s"'“”‘’.,;:…-]/;
/** Trimmed by index: a trailing `[…]+$` would rescan a run of these characters from each of its positions. */
const normQuote = (s: string): string => {
  const t = String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
  let [a, b] = [0, t.length];
  while (a < b && QUOTE_EDGE.test(t[a]!)) a++;
  while (b > a && QUOTE_EDGE.test(t[b - 1]!)) b--;
  return t.slice(a, b);
};

/**
 * A quote proves nothing unless it is verbatim in the section it cites (spec §3.6 check 2, R10): string support, not
 * entailment. Under 20 characters it must be the whole body: "5%" is inside "15%".
 */
export const quoteInBody = (quote: string, body: string): boolean => {
  const q = normQuote(quote);
  return q.length > 0 && (q.length >= 20 ? normQuote(body).includes(q) : q === normQuote(body));
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
  /** The user's words, so a figure they wrote needs no source; unless subject, verify strips `userCodes` and their headings. */
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
  /** Sentences taken out. formatAnswerMd prints the "bị lược" line when it is above 0; verify never writes it. */
  cut: number;
}

const EVIDENCE_KINDS = new Set(['en', 'sen', 'hs_note', 'gri', 'ruling', 'guidance', 'annex_table']);
const CODE8 = /(?<![\d.,/])(?:\d{4}\.\d{2}\.\d{2}|\d{8})(?![\d/%]|[.,]\d)/g;
const PLACED_UNDER = new RegExp(`(?<!\\p{L})(?:thuộc|vào|áp|khai)\\s+(?:mã|nhóm)(?:\\s+(?:số|HS))?\\s+\\**(${HEADING_OR_CODE.source})`, 'giu');

/** "3005" → "30.05", "300510" → "3005.10", "30051010" → "3005.10.10". */
const dotted = (d: string): string =>
  d.length <= 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : [d.slice(0, 4), d.slice(4, 6), d.slice(6)].filter(Boolean).join('.');
const names = (text: string, d: string): boolean => new RegExp(`(?<![\\d.,/])${dotted(d).replace(/\./g, '\\.')}(?![\\d/%]|[.,]\\d)`).test(text);
/** The digits `d` in any spelling: "3005.10.10", "30051010", "3005 10 10". */
const spelled = (d: string): RegExp => new RegExp(`(?<!\\d)${[...d].join('[.\\s]?')}(?!\\d)`, 'g');

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
  const markers = [...draft.answerMd.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap(([, list]) => list!.split(',').map(Number));
  for (const n of new Set([...draft.citations.map((c) => c.n), ...markers.filter((m) => m >= 1 && m <= sources.length)])) {
    if (!quotes.has(n) && !violations.some((v) => v.citation === n)) violations.push({ rule: 'G2', detail: 'no verbatim quote holds this citation', citation: n });
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
    // "Mã 3005.10.10 thuộc nhóm 30.05" explains the code itself: the user's code in the clause right before the verb is its
    // subject. "Với mã 3005.10.10, miếng dán thuộc mã …" and "… nên miếng dán cũng thuộc nhóm 30.05" place the goods.
    [
      'G6',
      'places the goods under the code asked about',
      (s) =>
        subject &&
        [...s.matchAll(PLACED_UNDER)].some((m) => {
          const head = s.slice(0, m.index).split(/[,;:]|\s(?:nên|và|vì|còn|nhưng)\s/).pop()!;
          return own.some((u) => u.startsWith(digits(m[1]!)) || digits(m[1]!).startsWith(u)) && !own.some((u) => spelled(u).test(head));
        }),
    ],
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

  // A code the user offered as a premise is never their evidence (R4), whatever the caller masked.
  const userText = subject ? ctx.userText : [...own, ...own.map((u) => u.slice(0, 4))].reduce((t, u) => t.replace(spelled(u), ' '), ctx.userText);
  // Every rate sentence is cut; one whose figure its own quote lacks was made up, and so may be the rest (R1, R10).
  const dropped = rates.length > 0 && !numberMarkers(rates.join(' '), cited, quoteText, userText).answer;
  if (dropped) violations.push({ rule: 'G1', detail: 'a rate or amount its quote lacks: prose dropped' });
  const kept = dropped ? '' : cutPieces(draft.answerMd.split(SENTENCE_END), (p) => bad.has(p.trim()));
  const labels = sources.map((s, i) => (quotes.has(i + 1) ? s.label : ''));
  const numbered = numberMarkers(kept, cited, quoteText, userText, { cut: true, labels });
  const unanchored = numbered.cut ?? [];
  for (const sentence of unanchored) violations.push({ rule: 'G3', detail: 'a figure neither its quotes nor its label hold', sentence });

  // numberMarkers kept markers of dead citations (in range, no quote): drop them, then append candidates' own evidence.
  const order = numbered.order.filter((n) => quotes.has(n));
  const at = (n: number): number => {
    if (!order.includes(n)) order.push(n);
    return order.indexOf(n) + 1;
  };
  const answer = numbered.answer
    .replace(/(?<!\s)\s*\[(\d+)\]/g, (m, k: string) => {
      const n = numbered.order[Number(k) - 1]!;
      return quotes.has(n) ? m.replace(k, String(at(n))) : '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const outCandidates = candidates.map((c) => ({ hs: c.hs, evidence: c.evidence.map(at) }));

  const cut = dropped ? splitSentences(draft.answerMd).length : bad.size + unanchored.length;
  if (candidates.length >= 2 && !draft.missingFacts.some((f) => f.trim())) {
    violations.push({ rule: 'G4', detail: 'two or more candidates and no missing fact', repairOnly: true });
  }
  return { answerMd: answer, citations: order.map((n, i) => ({ n: i + 1, source: n - 1, quotes: quotes.get(n)! })), candidates: outCandidates, violations, cut };
}

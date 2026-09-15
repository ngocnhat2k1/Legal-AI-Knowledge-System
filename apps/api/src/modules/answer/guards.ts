/**
 * Code guards of the POST /answer path (plan 08), shared by the runner and the classification walkthrough. Every rule
 * the model is told in the prompt is also checked here, because a rule held only by prompt wording is not held (ADR
 * 2026-08-14). The sentence-level anchoring of numbers to their own citation stays in legal.grounding.ts numberMarkers.
 */
import { AMOUNT, cutPieces, dropInForceClaims, numberMarkers } from '../legal/legal.grounding';
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
// The amount pattern is numberMarkers' own (AMOUNT), so a figure G1 flags is one G3 must anchor.
const RATE = new RegExp(`(?<!\\d)\\d+(?:[.,]\\d+)?\\s*%|(?<![\\p{L}])phần trăm(?![\\p{L}])|${AMOUNT.source}`, 'iu');

/**
 * Sentences stating a rate or an amount. Rates never appear in prose: the reply prints them in a block built from /tariff
 * (owner decision 2026-09-14, stricter than R1 requires), so any such sentence is a violation whatever it cites.
 */
export const ratesInProse = (text: string): string[] => splitSentences(text).filter((s) => RATE.test(s));

/** Not global, so `test` keeps no lastIndex: a caller that needs every match builds `new RegExp(HEADING_OR_CODE.source, 'g')`. */
export const HEADING_OR_CODE = /(?<![\d.,/])(?:\d{2}\.\d{2}|\d{4}(?:\.\d{2}){0,2}|\d{8})(?![\d/%]|[.,]\d)/;
// A settling verb, any of "phải/xét/khai/áp/vào/là/thuộc", an optional "mã/nhóm (số/HS)", then the heading: "phải khai
// 38.24", "Mình chốt là 38.24". After "có/không/chưa (thể)" the verb asks or denies: "có phải 38.24 không" settles nothing;
// nor does "để" + verb opening the sentence or after an earlier "chưa/không" in its clause ("Để chốt 30.05 hay 38.24, cần …",
// "Chưa đủ căn cứ để chốt 38.24"), while "Đã đủ căn cứ để chốt 38.24" settles. Group 1 is a verdict label's ":" and stars
// right after the verb ("**Kết luận:** nhóm 38.24"); stars and spaces never share a quantifier. Bounds: at most 8 spaces
// between words the lookbehinds read, "chưa/không" at most 300 characters before "để", four verbs in a chain.
const SETTLING = new RegExp(
  `(?<![\\p{L}])(?<!(?:có|không|chưa)(?:\\s{1,8}thể)?\\s{1,8})(?<!^\\s{0,8}\\**\\s{0,8}để\\s{1,8})(?<!(?<![\\p{L}])(?:chưa|không)(?![\\p{L}])[^,;:]{0,300}\\sđể\\s{1,8})(?:(?:phải|nên|chỉ\\s+có\\s+thể|chắc\\s+chắn|chốt|đề\\s+xuất|kết\\s+luận)(:?\\**)(?:\\s+(?:phải|xét|khai|áp|vào|là|thuộc)){0,4}(?:\\s+(?:mã|nhóm)(?:\\s+(?:số|HS))?)?\\s+\\**${HEADING_OR_CODE.source}|thuộc\\s+hẳn(?![\\p{L}]))`,
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
// "khi" and "trường hợp" make a condition only with a "thì" at most 400 characters on ("khi hàng có lớp dính thì …") or
// as "khi đó": "Khi chưa rõ công dụng, phải xét 38.24", "trong trường hợp này … chắc chắn thuộc" and "sau/trước khi đối
// chiếu (thì) chắc chắn thuộc" settle; "khiếu/khiến" is no "khi".
const CONDITIONAL =
  /(?<![\p{L}])(?:nếu|tùy|tuỳ|trừ\s+khi|khi\s+đó|(?:(?<!(?:sau|trước)\s)khi|trường\s+hợp(?!\s+này))(?![\p{L}])(?:[^.;?!]|\.(?=\d)){0,400}?\sthì)(?![\p{L}])/iu;
const CONFIDENCE = /(?<![\p{L}])độ\s+tin\s+cậy(?![\p{L}])/iu;

// A condition that says what is not known settles as surely as "Chưa rõ công dụng nên phải xét 38.24". The verb's own
// condition runs from the last "nếu/khi/trường hợp" in the 120 characters before it to its "thì" or comma, with no second
// break before the verb; as on main, the verb still settles nothing after a hedge ("chưa nên vội chốt", "rất khó kết
// luận"), with another heading or a "tùy" in the 120 characters after it ("30.05 (…) và nhóm 38.24", "tùy kết quả giám
// định") or before a condition of its own ("chỉ nên khai 30.05 khi …").
// Known ceilings, left to the compose prompt and repair: ignorance in other words ("thông tin chưa đủ để xác định"), a
// finding, a fact about the label or a Chapter test read as ignorance ("kiểm nghiệm không xác định được dược chất nào",
// "nhà sản xuất không xác định công dụng trên nhãn"), a heading to check read as settled after ignorance as it is with no
// condition ("nên xét 30.05 trước"), a condition after the verb, and "phải xét 38.24 thay vì 30.05", which passes as on main.
// Order counts, since only a heading after the verb exempts it: "Nếu chưa rõ thì phải xét 38.24, nếu có dược chất thì xét
// 30.05" passes, "Nếu có dược chất thì xét 30.05, nếu chưa rõ thì phải xét 38.24" is cut.
const OPENER = /(?<![\p{L}])(?:nếu|khi(?!\s+đó)|trường\s+hợp(?!\s+này))(?![\p{L}])/giu;
const IGNORANCE =
  /(?<![\p{L}])(?:(?:chưa|không)\s+(?:rõ|biết|xác\s+định)|(?:chưa\s+có|thiếu|không\s+có|chưa\s+đủ)\s+(?:thông\s+tin|căn\s+cứ|dữ\s+kiện|tài\s+liệu))(?![\p{L}])/iu;
const BREAK = /[,;:]\s*(?:thì(?![\p{L}]))?|(?<![\p{L}])thì(?![\p{L}])/iu;
const HEDGE = /(?<![\p{L}])(?:chưa|không|khó)(?![\p{L}])/iu;
const DEPENDS = /(?<![\p{L}])(?:tùy|tuỳ)(?![\p{L}])/iu;
const unknownCondition = (s: string, m: RegExpExecArray): boolean => {
  const from = Math.max(0, m.index - 120);
  const before = s.slice(from, m.index);
  const open = [...before.matchAll(OPENER)].pop();
  if (!open || (open.index === 0 && /\p{L}/u.test(s[from - 1] ?? ''))) return false;
  const [condition, then = '', ...more] = before.slice(open.index + open[0].length).split(BREAK);
  const after = s.slice(m.index + m[0].length, m.index + m[0].length + 120);
  return (
    !more.length &&
    IGNORANCE.test(condition!) &&
    !HEDGE.test(then) &&
    !HEADING_OR_CODE.test(after) &&
    !DEPENDS.test(after) &&
    after.split(/[,;:]/)[0]!.search(OPENER) < 0
  );
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

export const digits = (s: string): string => s.replace(/\D/g, '');

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
export const quoteInBody = (quote: string, body: string): boolean => holds(normQuote(quote), normQuote(body));
/** quoteInBody over texts already through normQuote, so a body is normalised once for many quotes. */
const holds = (q: string, body: string): boolean => q.length > 0 && (q.length >= 20 ? body.includes(q) : q === body);

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
  /**
   * Headings and 8-digit codes the runner put in the prompt from code (candidate headings and their lines): G3 holds them
   * anchored as it holds a label; G5 and G6 do not read them.
   */
  anchors?: string[];
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
// G6 lets a placement stand when its clause head is exactly the code itself ("Mã này thuộc nhóm 30.05") or goods of the
// code in general before what the code holds ("Các hàng thuộc mã 3005.10.10 gồm …"); "bạn" anywhere makes them the user's.
const THIS_CODE = /^(?:phân\s+)?(?:mã|nhóm)\s+này$/iu;
const GOODS_OF_CODE = /^(?:(?:các|những|mọi)\s+(?:mặt\s+)?(?:hàng|sản\s+phẩm)|hàng\s+h(?:óa|oá))$/iu;
const CODE_CONTENT = /^\**\s*(?:gồm|bao\s+gồm|áp\s+dụng\s+cho|dành\s+cho)(?![\p{L}])/iu;
const YOU = /(?<![\p{L}])bạn(?![\p{L}])/iu;

/** A code in any spelling, dotted: "3005" → "30.05", "300510" → "3005.10", "3005.10.10" and "30051010" → "3005.10.10". */
export const dotted = (code: string): string => {
  const d = digits(code);
  return (d.length <= 4 ? [d.slice(0, 2), d.slice(2)] : [d.slice(0, 4), d.slice(4, 6), d.slice(6)]).filter(Boolean).join('.');
};
const names = (text: string, d: string): boolean => new RegExp(`(?<![\\d.,/])${dotted(d).replace(/\./g, '\\.')}(?![\\d/%]|[.,]\\d)`).test(text);
/** The digits `d` in any spelling: "3005.10.10", "30051010", "3005 10 10". */
const spelled = (d: string): RegExp => new RegExp(`(?<!\\d)${[...d].join('[.\\s]?')}(?!\\d)`, 'g');

// Quoted criteria (agreed with the walkthrough session): a span in quote marks ("…", “…” or mixed) verbatim in the body of
// a cited note, SEN, GRI or ruling the sentence marks (any cited one when it marks none) is that source's wording, so G1
// and G4 read the sentence with the span as "…". Never a tariff table's wording, never in a sentence about any thuế, VAT,
// ưu đãi, MFN or FTA; G2 and G3 still read the sentence whole. Known ceiling: a span shortened with "…" is not blanked.
const CRITERIA_KINDS = new Set(['en', 'sen', 'hs_note', 'gri', 'ruling']);
const QUOTED = /["“]([^"“”\n]{1,300})["”]/g;
const TARIFF_WORDS = /(?<![\p{L}])(?:thuế|VAT|GTGT|ưu\s+đãi|MFN|[a-z]{0,4}FTA)(?![\p{L}])/iu;

/**
 * The code guards over a compose draft (plan 08 §4.1), pure: G2 keeps a citation only on verbatim quotes; G5 keeps one to
 * three candidates, each proven by a live note, SEN, ruling or annex naming it; G1, G4–G7 cut whole sentences, G3 cuts
 * those whose figures neither their quotes nor labels hold (numberMarkers). An unanchored rate or amount drops the prose.
 */
export function verify(draft: Draft, sources: Source[], ctx: VerifyContext): VerifyResult {
  const violations: GuardViolation[] = [];

  // Each body is normalised once, however many quotes cite it: a body can be a whole article.
  const bodies = new Map<number, string>();
  const bodyOf = (n: number): string => bodies.get(n) ?? bodies.set(n, normQuote(sources[n - 1]!.body)).get(n)!;
  const quotes = new Map<number, string[]>();
  for (const { n, quotes: qs } of draft.citations) {
    for (const q of qs) {
      if (sources[n - 1] && holds(normQuote(q), bodyOf(n))) (quotes.get(n) ?? quotes.set(n, []).get(n)!).push(q);
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
  // numberMarkers' id rule: the sentence's own in-range markers, else every cited source.
  const idsOf = (s: string): number[] => {
    const marks = [...s.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap(([, list]) => list!.split(',').map(Number)).filter((n) => n >= 1 && n <= sources.length);
    return marks.length ? marks : cited;
  };
  // A span is normalised once and what each body holds is remembered for the call (the rates and settling passes read the
  // same spans); only the first 20 spans of a sentence are read as wording, the rest as written, which fails closed.
  const held = new Map<string, boolean>();
  const heldIn = (n: number, q: string): boolean => {
    const key = `${n}\n${q}`;
    if (!held.has(key)) held.set(key, holds(q, bodyOf(n)));
    return held.get(key)!;
  };
  const unquoted = (s: string): string => {
    const criteria = idsOf(s).filter((n) => quotes.has(n) && CRITERIA_KINDS.has(sources[n - 1]!.kind));
    if (!criteria.length || TARIFF_WORDS.test(s)) return s;
    let read = 0;
    return s.replace(QUOTED, (span: string, a: string) => {
      if (++read > 20) return span;
      const q = normQuote(a);
      return criteria.some((n) => heldIn(n, q)) ? '…' : span;
    });
  };
  const sentences = splitSentences(draft.answerMd);
  const rates = new Set(sentences.filter((s) => ratesInProse(unquoted(s)).length > 0));
  const settling = new Set(sentences.filter((s) => settlementClaims(unquoted(s)).length > 0));
  const rules: Array<[string, string, (s: string) => boolean]> = [
    ['G1', 'rate or amount in prose', (s) => rates.has(s)],
    ['G4', 'settles the goods under one heading', (s) => settling.has(s)],
    ['G5', 'eight-digit code that is no candidate', (s) => [...s.matchAll(CODE8)].some(([c]) => !eights.has(digits(c)) && !(subject && own.includes(digits(c))))],
    // "Mã 3005.10.10 thuộc nhóm 30.05" explains the code itself: the user's code in the clause right before the verb is its
    // subject. "Với mã 3005.10.10, miếng dán thuộc mã …" and "… nên miếng dán cũng thuộc nhóm 30.05" place the goods.
    [
      'G6',
      'places the goods under the code asked about',
      (s) => {
        if (!subject) return false;
        const you = YOU.test(s);
        return [...s.matchAll(PLACED_UNDER)].some((m) => {
          if (!own.some((u) => u.startsWith(digits(m[1]!)) || digits(m[1]!).startsWith(u))) return false;
          // The clause head is read at most 300 characters back, so many placements in one sentence stay linear.
          const head = s.slice(Math.max(0, m.index - 300), m.index).split(/[,;:]|\s(?:nên|và|vì|còn|nhưng)\s/).pop()!.trim();
          const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
          const generic = !you && (THIS_CODE.test(head) || (GOODS_OF_CODE.test(head) && CODE_CONTENT.test(tail)));
          return !own.some((u) => spelled(u).test(head)) && !generic;
        });
      },
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
  // Every rate sentence is cut; one whose figure its own quote lacks was made up, and so may be the rest (R1, R10). The
  // check reads sentences as written, quoted criteria too, and a figure it misses after the re-join empties G3's pass
  // below (no `cut` list): either way the prose goes, and each rate sentence carries its G1 so repair can rewrite it.
  const raw = sentences.filter((s) => RATE.test(s));
  const unanchoredRate = raw.length > 0 && !numberMarkers(raw.join(' '), cited, quoteText, userText).answer;
  const kept = unanchoredRate ? '' : cutPieces(draft.answerMd.split(SENTENCE_END), (p) => bad.has(p.trim()));
  // Anchors came from code, not from the model: they stand beside the label of every source a quote holds, dotted as
  // FACTS reads codes.
  const anchors = (ctx.anchors ?? []).map(digits).filter(Boolean).map(dotted).join(' ');
  const labels = sources.map((s, i) => (quotes.has(i + 1) ? `${s.label} ${anchors}` : ''));
  const checked = numberMarkers(kept, cited, quoteText, userText, { cut: true, labels });
  const dropped = unanchoredRate || !checked.cut;
  const numbered = dropped ? numberMarkers('', cited, quoteText, userText, { cut: true, labels }) : checked;
  if (dropped) {
    violations.push({ rule: 'G1', detail: 'a rate or amount its quote lacks: prose dropped' });
    for (const s of raw) if (!rates.has(s)) violations.push({ rule: 'G1', detail: 'rate or amount in prose', sentence: s });
  }
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

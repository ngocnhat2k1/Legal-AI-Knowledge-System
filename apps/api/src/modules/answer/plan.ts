/**
 * The pure half of the plan step of POST /answer (plan 08 §4.2): mask every code before a model reads the conversation,
 * decide in code what a code in the message is, and hold the model's plan to a fixed shape carrying user data only where
 * the user wrote it. Masking and cues are ported from the bot's dispatch.mjs, the document-number checks from parse.mjs.
 */
import { statedIn } from '../legal/legal.grounding';
import { foldDocNumber, parseDocRef } from '../legal/legal.scope';

export const INTENTS = ['tariff', 'hs', 'legal', 'status', 'mixed', 'general', 'confirm', 'correction', 'refine'] as const;
export type Intent = (typeof INTENTS)[number];
export type CodeRole = 'none' | 'premise' | 'subject' | 'key';

/** A code or heading the user wrote. The service adds `exists` and `inCandidates` (§2.4). */
export interface UserCode {
  /** Dotted: "3005.10.10", "3005.10", "30.05", or a chapter "30". */
  code: string;
  level: number;
  heading: string | null;
}

/** The plan step's output after normalizePlan (§2.4). */
export interface Plan {
  intent: Intent;
  understanding: string | null;
  /** Standalone question, every code as [mã n]. */
  question: string;
  queries: string[];
  goods: { facts: string[]; missing: string[] };
  refines: boolean;
  scope: { doc: string | null; article: string | null; clause: string | null };
  keywords: string[];
  hsHints: string[];
  origin: string | null;
  date: string | null;
  reuseLastHs: boolean;
  verdict: 'correct' | 'wrong' | 'unsure' | null;
  reply: string | null;
}

/** A text a prompt is built from, named so a dropped one is logged without its content. */
export interface PromptPart {
  name: string;
  text: string;
}

export const fold = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd');

/**
 * Every spelling of a code or heading: an 8-digit code; digits after a word naming one ("nhóm hàng 3005", "mã số
 * 30.05.10.10", "HS: 3005", "chương 30"), with or without diacritics; a dotted "3005.10" or "30.05" standing alone. Only
 * structure exempts a number: a document number or date (a "/" or a further ".dddd"), "ngày 30.05", a rate "12.50%", and
 * a bare "dd.dd" before an accented money or time word ("12.50 triệu", "08.30 sáng"). Nothing after a keyword or a
 * "dddd.dd" is ever read as a unit: two review rounds found "3005.10 sang 3824.90", "mã 3005 ngay", "mã 7411 đồng tinh
 * luyện" and "3005.10 usd" leaking through unit words. Over-masking an amount costs nothing; a leaked code is R4.
 */
const HS_TOKEN = new RegExp(
  String.raw`\d{4}[.\s]?\d{2}[.\s]?\d{2}` +
    String.raw`|(?<=(?<!\[)(?:nh[oó]m(?:\s*h[aà]ng)?|m[aã](?:\s*s[oố])?(?:\s*hs)?|hs(?:\s*code)?|ch[uư][oơ]ng)\s*:?\s*)\d{2}(?:\.?\d{2}(?:\.\d{2}){0,2})?(?![\d/])` +
    String.raw`|(?<![\d.,/])\d{4}\.\d{2}(?![\d/]|[.,]\d)` +
    String.raw`|(?<![\d.,/]|ng[aà]y\s)\d{2}\.\d{2}(?:\.\d{2}){0,2}(?![\d/%]|[.,]\d|\s*(?:triệu|tỷ|giờ|sáng|chiều)(?![\p{L}]))`,
  'giu',
);
/**
 * A bare heading joined to one already masked: "nhóm [mã 1] hay 3824", "mã [mã 1] sang 3824", and a list "nhóm [mã 1]
 * hoặc 3824, và 3926" — a heading may end at punctuation, and connectors may follow each other (", và").
 */
const JOINED_HEADING = /(\[mã \d+\](?:\s*(?:,|hay|hoặc|hoac|và|va|sang))+\s*)(\d{4})(?![\d/]|[.,]\d)/giu;
export const CODE_MARK = /\[mã \d+\]/gu;

/**
 * Each code becomes `[mã n]`, the same n wherever it recurs: pass the returned `codes` on to the next part (quote, turns,
 * state line) so a rewritten question can be given its codes back. NFC first: Unikey's "Unicode tổ hợp" types "nhóm"
 * decomposed, and the keyword lookbehind would miss it.
 */
export function maskCodes(text: string, book: string[] = []): { text: string; codes: string[] } {
  const codes = [...book];
  const mark = (m: string): string => {
    const d = m.replace(/[.\s]/g, '');
    const key = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : m;
    const i = codes.indexOf(key);
    return `[mã ${i < 0 ? codes.push(key) : i + 1}]`;
  };
  let s = String(text ?? '')
    .normalize('NFC')
    .replace(HS_TOKEN, mark);
  for (let prev = ''; prev !== s; ) [prev, s] = [s, s.replace(JOINED_HEADING, (_, head: string, code: string) => head + mark(code))];
  return { text: s, codes };
}

export function userCodes(text: string): UserCode[] {
  const found = new Map<string, UserCode>();
  for (const c of maskCodes(text).codes) {
    const d = c.replace(/\D/g, '');
    const heading = d.length >= 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}` : null;
    const code = d.length === 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : [d.slice(0, 4), d.slice(4, 6), d.slice(6)].filter(Boolean).join('.');
    if (!found.has(code)) found.set(code, { code, level: d.length, heading });
  }
  return [...found.values()];
}

const cue = (words: string): RegExp => new RegExp(`(?<![a-z])(?:${words})(?![a-z])`);
/** The message doubts or defends the code (§4.2): "mã này được không", "vì sao … vào mã", "áp mã". */
const FIT = new RegExp(
  String.raw`(?<![a-z])(?:ma|code|hs)(?![a-z])[^.?!]{0,40}(?<![a-z])(?:duoc|dung|sai|phu hop|ok|chuan)\s*(?:khong|ko|k|chua|ha|a|nhi)(?![a-z])` +
    String.raw`|(?<![a-z])(?:vi sao|tai sao|sao lai|(?:ap|vao|thuoc|khai|dung|tham khao)\s+(?:ma|nhom|code))(?![a-z])`,
);
const LIST = cue(
  'danh muc|rui ro|kiem tra chuyen nganh|quan ly chuyen nganh|giay phep|hop quy|hop chuan|kiem dich|nang luong|thong tu|nghi dinh|quyet dinh|cong van|van ban|nhap khau duoc|co can|co phai',
);
const EXPLAIN = cue('gom|bao gom|khac|phan biet|giai thich|chu giai|nghia la|la gi|nhung hang');
const TARIFF = cue('thue|%|phan tram|xuat xu|c/o|mfn|fta|uu dai|bieu');
const STATUS = cue('con hieu luc|con ap dung|het hieu luc|thay the|bai bo');

/** Cues read on folded text with each code as "#": the dots of "3005.10.10" would otherwise end a FIT span. */
const cueText = (masked: string): string => fold(masked.replace(CODE_MARK, '#'));

/**
 * What a code in the message is (§4.2): premise unless a list, explanation or rate cue says otherwise, and always when the
 * message doubts the code. A plan may only tighten: an explanation question about goods the user described is a premise, and
 * a rate code under a plan that is not tariff is a premise.
 */
export function codeRole(text: string, plan?: Pick<Plan, 'goods' | 'intent'>): CodeRole {
  const { text: masked, codes } = maskCodes(text);
  if (!codes.length) return 'none';
  const t = cueText(masked);
  if (FIT.test(t)) return 'premise';
  const explains = EXPLAIN.test(t);
  if (explains || LIST.test(t)) return explains && plan?.goods.facts.length ? 'premise' : 'subject';
  return TARIFF.test(t) && (!plan || plan.intent === 'tariff') ? 'key' : 'premise';
}

/**
 * The closing latch before every spawn (§4.2 step 4): drop any part still holding a user's code joined, dotted or spaced;
 * for a premise, any code under its heading too (owner decision D1: the heading reaches compose only as an unlabelled pin).
 * Parts are message, quote, turns, state, question, understanding and goods — never evidence, which lists every line under
 * a heading. A chapter alone is not checked: two digits match every duration.
 */
export function assertNoUserCodes(parts: PromptPart[], codes: UserCode[], role: CodeRole): { parts: PromptPart[]; leakDrops: string[] } {
  const spellings = codes
    .filter((c) => c.level >= 4)
    .map((c) => {
      const d = c.code.replace(/\D/g, '');
      const [core, tail] = role === 'premise' ? [d.slice(0, 4), String.raw`(?:[.\s]?\d{2}){0,2}`] : [d, ''];
      return new RegExp(String.raw`(?<!\d)${core.match(/\d{2}/g)!.join(String.raw`[.\s]?`)}${tail}(?!\d)`);
    });
  const leaks = parts.filter((p) => spellings.some((re) => re.test(p.text)));
  return { parts: parts.filter((p) => !leaks.includes(p)), leakDrops: leaks.map((p) => p.name) };
}

const str = (x: unknown, max: number): string | null => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.map((s) => String(s ?? '').trim()).filter(Boolean) : []);
const number = (x: unknown): string | null => String(x ?? '').replace(/\D/g, '').slice(0, 4) || null;

/** A serial, model, lot or phone number with its value, or any group of four digits or more with the pairs of a code after it (G10, R14). */
const PRIVATE = String.raw`(?<![\p{L}])(?:sn|s\/n|serial|model|lô(?:\s*số)?|sđt|số điện thoại)(?![\p{L}])\s*[:#.]?\s*[\p{L}\d\/-]*\d[\p{L}\d\/-]*|\d{4,}(?:[.\s]\d{2}(?![\d/]))*`;
const DOC_NUMBER = String.raw`\d{1,4}\/\d{4}[^\s,;)]*`;
/** Function words a model adds when restating a fact; every other word of a fact must be the user's own. */
const FILLER = new Set('la va cua cho cac mot nhung bang tu de voi o trong co lam hang'.split(' '));
const words = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** The model's number with its issuer only when the user wrote that issuer: the API matches a full number exactly (parse.mjs). */
const statedDocNumber = (said: string, n: string): string => {
  const parts = n.split('/');
  return foldDocNumber(said).includes(foldDocNumber(parts.slice(2).join('/'))) ? n : parts.slice(0, 2).join('/');
};

/**
 * The model's plan in the §2.4 shape, or null when it names no known intent (the caller falls back to defaultPlan). The
 * model may recognise a document number, never mint one; goods facts and the understanding carry nothing the user did not
 * write and no serial, model, lot or phone number.
 */
export function normalizePlan(raw: unknown, userTexts: string[]): Plan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!INTENTS.includes(o.intent as Intent)) return null;
  const said = userTexts.join('\n');
  const own = new Set(words(said));
  const isPrivate = new RegExp(PRIVATE, 'iu');
  const goods = (o.goods ?? {}) as Record<string, unknown>;
  const scope = (o.scope ?? {}) as Record<string, unknown>;
  const doc = str(scope.doc, 48);
  const understanding = str(o.understanding, 400)
    ?.replace(new RegExp(`${DOC_NUMBER}|${PRIVATE}`, 'giu'), (m) => (/^\d{1,4}\/\d{4}/.test(m) && statedIn(said, m) ? statedDocNumber(said, m) : ''))
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 30)
    .join(' ');
  return {
    intent: o.intent as Intent,
    understanding: understanding || null,
    question: str(o.question, 600) ?? '',
    queries: arr(o.queries).slice(0, 2),
    goods: {
      facts: arr(goods.facts).filter((f) => !isPrivate.test(f) && words(f).every((w) => FILLER.has(w) || own.has(w))),
      missing: arr(goods.missing).filter((f) => !isPrivate.test(f)).slice(0, 3),
    },
    refines: o.refines === true,
    scope: { doc: doc && statedIn(said, doc) ? statedDocNumber(said, doc) : null, article: number(scope.article), clause: number(scope.clause) },
    keywords: arr(o.keywords),
    hsHints: arr(o.hsHints)
      .map((s) => s.replace(/\D/g, ''))
      .filter((s) => s.length >= 4 && s.length <= 6),
    origin: typeof o.origin === 'string' && /^[A-Za-z]{2}$/.test(o.origin) ? o.origin.toUpperCase() : null,
    date: typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
    reuseLastHs: o.reuseLastHs === true,
    verdict: o.verdict === 'correct' || o.verdict === 'wrong' || o.verdict === 'unsure' ? o.verdict : null,
    reply: str(o.reply, 1500),
  };
}

/**
 * No model, a timeout or is_error (§2.2 row 23): a code the message doubts → hs (one honest sentence, no rate block); a
 * code → tariff; a document number → status or legal (sources only); else stay on a legal thread, or search by keyword.
 */
export function defaultPlan(text: string, topic: string | null): Plan {
  const { text: question, codes } = maskCodes(text);
  const ref = parseDocRef(text);
  const doc = ref?.confident ? (ref.full ?? ref.core) : null;
  let intent: Intent = topic === 'legal' ? 'legal' : 'tariff';
  if (codes.length) intent = FIT.test(cueText(question)) ? 'hs' : 'tariff';
  else if (doc) intent = STATUS.test(fold(text)) ? 'status' : 'legal';
  return {
    intent,
    understanding: null,
    question,
    queries: [],
    goods: { facts: [], missing: [] },
    refines: false,
    scope: { doc, article: null, clause: null },
    keywords: [],
    hsHints: [],
    origin: null,
    date: null,
    reuseLastHs: false,
    verdict: null,
    reply: null,
  };
}

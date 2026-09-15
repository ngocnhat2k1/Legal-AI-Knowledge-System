/**
 * Section-level checks of the classification walkthrough (plan 08) and the output schema they walk. Pure: no DB, no model.
 * The runner parses the model's JSON (looseJson, compose.ts), normalises it (walkthrough.ts) and runs verify() (guards.ts) over
 * the prose, which owns rates
 * and amounts, settlement claims, unanchored figures and codes, unknown citations and quotes; nothing here repeats those.
 * These see only what the section contract shows. The violations feed ONE repair pass, so every detail says what to
 * change, and a type slip or a missing array is filled on a copy instead of hiding every rule after it.
 *
 * Rule ids, all prefixed "walkthrough-":
 *  shape                 walkthroughSchema walked by hand.
 *  section-duplicate, marker-range, cite-unused   one section per key; [n] is cites[n-1]; no decorative id (R10).
 *  candidate-missing, candidate-extra   one entry per input heading: {heading, assessment} is what the R4 probe compares.
 *  candidate-support     'phu_hop' rests on a Chú giải, GRI or EN row; 'loai' on a Chú giải or EN bearing on it (R2, R10).
 *  candidate-cite-scope  a neighbour's EN, SEN or ruling supports a heading only when its text names that heading.
 *  deciding-facts, item-length   name the deciding goods fact (unless a cited note excludes outright), in ≤ 12 words.
 *  conclusion-heading, conclusion-open   R2, R5: an open conclusion names the missing facts or the advance ruling.
 *  rate                  a rate in deciding or missing facts (verify() reads only prose), or rates compared in words (R1).
 *  tariff-ref            a given tariff line under a concluded heading.
 *  fact-number, mask-expanded   a figure with a unit comes from the user or the cited rows (R3); "[mã n]" stays masked (R4).
 *  exclusion-support, named-source, gir-rule, gir-order, sen-tier   the source named is the source cited, applied in order
 *                        and at its tier (R2, R10).
 *  duty-cite             a duty or C/O sentence does not borrow a classification row's authority (R10).
 *  policy-claim, risk-score, persona, ruling-reasoning   R3, R10, R12, audit §3; lists are printed by code.
 *  length, brief-headings, template-headings, markdown-subset   owner decision 4 and the markdown Zalo renders.
 */
import { digits, ratesInProse, splitSentences } from './guards';
import type { ClassifyInput, EvidenceRow, HeadingAssessment, Violation, WalkthroughOutput, WalkthroughSectionKey } from './types';

// --- Schema -------------------------------------------------------------------------------------

export type Schema = {
  $schema?: string;
  type?: 'object' | 'array' | 'string' | 'integer' | 'boolean';
  enum?: readonly string[];
  pattern?: string;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
};

const KEYS: WalkthroughSectionKey[] = ['facts', 'nature', 'candidates', 'exclusions', 'gir', 'levels', 'explanation', 'policy', 'risk', 'conclusion'];
const ASSESSMENTS: HeadingAssessment[] = ['phu_hop', 'co_the_neu', 'loai', 'chua_du_du_kien'];

const obj = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items: Schema, limits: Pick<Schema, 'minItems' | 'maxItems'> = {}): Schema => ({ type: 'array', items, ...limits });
const text: Schema = { type: 'string', minLength: 1 };
export const ids = list({ type: 'integer' });
const heading: Schema = { type: 'string', pattern: '^\\d{2}\\.\\d{2}$' };

export const SCHEMA: Schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  ...obj({
    sections: list(obj({ key: { type: 'string', enum: KEYS }, markdown: text, cites: list(obj({ id: { type: 'integer' }, quotes: list(text) })) })),
    candidates: list(obj({ heading, assessment: { type: 'string', enum: ASSESSMENTS }, deciding_facts: list(text, { maxItems: 3 }), cite_ids: ids }), { minItems: 1 }),
    // No minItems: abstaining is a success (R5); conclusion-open asks for the missing facts or the advance ruling instead.
    conclusion: obj({ headings: list(heading, { maxItems: 3 }), needs_advance_ruling: { type: 'boolean' }, missing_facts: list(text, { maxItems: 3 }) }),
    // The tariff block keys on the digits, so an undotted line (as hs_description stores it) costs no repair.
    tariff_ref: list({ type: 'string', pattern: '^\\d{4}\\.?\\d{2}\\.?\\d{2}$' }),
  }),
};

export const walkthroughSchema: Record<string, unknown> = SCHEMA;

type Finding = { detail: string; fatal: boolean };

/** The subset of JSON Schema above. A wrong type or a missing field is fatal: the checks after it read those fields. */
function shape(v: unknown, s: Schema, path: string, out: Finding[]): void {
  const t = Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : v === null ? 'null' : typeof v;
  if (s.type && t !== s.type) return void out.push({ detail: `${path}: expected ${s.type}, got ${t}`, fatal: true });
  const bad = (detail: string) => out.push({ detail: `${path}: ${detail}`, fatal: false });
  if (typeof v === 'string') {
    if (s.enum && !s.enum.includes(v)) bad(`"${v}" is not one of ${s.enum.join(', ')}`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) bad(`"${v}" does not match ${s.pattern}`);
    if (s.minLength && !v.trim()) bad('is empty (omit it instead)');
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) bad(`needs at least ${s.minItems} item(s)`);
    if (s.maxItems != null && v.length > s.maxItems) bad(`allows at most ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => shape(x, s.items!, `${path}[${i}]`, out));
  }
  if (s.properties && t === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) out.push({ detail: `${path}.${k}: missing`, fatal: true });
    for (const k of Object.keys(o)) if (!(k in s.properties)) bad(`unknown field "${k}"`);
    for (const [k, sub] of Object.entries(s.properties)) if (k in o) shape(o[k], sub, `${path}.${k}`, out);
  }
}

/**
 * Undoes, on a copy, the drift the 2026-09-14 dry run showed (cite_ids as "10043", deciding_facts as one string) and fills a
 * missing array with []. The shape findings are still reported; before this, the first slip returned early and hid 25, 11
 * and 9 real violations.
 */
export function coerce(v: unknown, s: Schema): unknown {
  if (s.type === 'integer' && typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
  if (s.type === 'array' && s.items && (Array.isArray(v) || typeof v === 'string')) return (Array.isArray(v) ? v : [v]).map((x) => coerce(x, s.items!));
  if (s.type === 'object' && s.properties && v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const missing = Object.entries(s.properties).filter(([k, sub]) => !(k in o) && sub.type === 'array');
    return Object.fromEntries([...Object.entries(o).map(([k, x]) => [k, s.properties![k] ? coerce(x, s.properties![k]) : x]), ...missing.map(([k]) => [k, []])]);
  }
  return v;
}

// --- Text helpers -------------------------------------------------------------------------------

const nfc = (s: unknown): string => String(s ?? '').normalize('NFC');
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const decimal = (s: string): string => s.replace(/(\d),(?=\d)/g, '$1.');
const textOf = (r: EvidenceRow): string => `${r.title}\n${r.body}`;

const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const MASK = /\[mã\s*\d+\]/giu;
/** Straight or curly, mixed too: the model opens with “ and closes with " (review probe 2026-09-15). */
export const QUOTED = /["“][^"“”\n]*["”]/g;
const markers = (s: string): number[] => [...s.matchAll(MARKER)].flatMap((m) => m[1].split(',').map(Number));
/** A four-digit heading as prose writes it, not part of a code (3005.10) or a date (14.09.2026). */
// Not guards' HEADING_OR_CODE: that also reads "3005.10.10" and "HS 2022" as codes, and neither is an excluded heading.
const HEADING = /(?<![\d.])\d{2}\.\d{2}(?!\d|\.\d)/g;

/** A figure with a unit; the unit must match the user's, not only the digits ("5 g" ≠ "5 kg"). */
const UNIT = /\d+(?:[.,]\d+)?\s*(?:mm|cm|km|m|kg|mg|g|tấn|ml|lít|l|kwh|kw|w|kva|kv|v|mah|a|khz|mhz|ghz|hz|gb|mb|inch|°c|bar|mpa|kpa|pa|rpm|vòng\/phút|hp|psi)(?!\p{L})/giu;
/** Not goods figures: markers, masks, quoted evidence. */
const NOT_A_FIGURE = new RegExp([MARKER.source, MASK.source, QUOTED.source].join('|'), 'giu');
/** "6,5 kg" and "6.5kg" read the same. */
const squeeze = (s: string): string => decimal(s.toLowerCase()).replace(/(\d)\s+(?=[\p{L}°])/gu, '$1');

/** The model wrote a code next to a mask, i.e. it filled in the user's code. */
const EXPANDED = /\[mã\s*\d+\]\s*(?:\(|:|=|là|tức là|chính là)?\s*\d{2}[\d.\s]{2,}|\d{4}[\d.]*\s*\(\s*\[mã\s*\d+\]/iu;

/** Classification support that stands on its own. SEN is authoritative in the data but only ASEAN tier (R2). */
const strong = (r: EvidenceRow): boolean => ['hs_note', 'gri', 'en'].includes(r.kind) && (r.authority === 'binding' || r.authority === 'authoritative');
const CLASSIFYING = ['hs_note', 'gri', 'en', 'sen'];
const namesHeading = (r: EvidenceRow, h: string): boolean => new RegExp(`(?<![\\d.])(?:${esc(h)}|${digits(h)})(?!\\d)`).test(textOf(r));
/**
 * A Chú giải or EN row that can carry an exclusion of heading h: it names h, is its chapter's, or is a Section note. GRI
 * alone excludes nothing, and a real note cited for an exclusion it does not make is the R10 failure (audit §1, 1(g)).
 */
// ponytail: any Section note counts (no chapter→section map); ranges like "33.03 đến 33.07" miss inner headings
const bearsOn = (r: EvidenceRow, h: string): boolean =>
  (r.kind === 'hs_note' || r.kind === 'en') &&
  strong(r) &&
  (namesHeading(r, h) || new RegExp(`Chương\\s+0?${Number(h.slice(0, 2))}(?!\\d)`, 'iu').test(textOf(r)) || /Phần\s+[IVXL]+/u.test(r.title));

/** Sections that reason from notes; facts, policy and risk do not. */
const REASONING: WalkthroughSectionKey[] = ['nature', 'candidates', 'exclusions', 'gir', 'levels', 'explanation', 'conclusion'];

/**
 * A source named in prose → the kind of row its paragraph must cite. Acronyms are case-sensitive: "hạt sen" is goods. Only
 * a numbered note counts: "theo nội dung nhóm và chú giải của phần hoặc chương" is GRI 1's own wording.
 */
const NAMED: Array<{ kind: string; label: string; words: RegExp; acronym?: RegExp }> = [
  { kind: 'en', label: 'Chú giải chi tiết (EN)', words: /chú giải chi tiết/iu, acronym: /(?<!\p{L})EN(?!\p{L})/u },
  { kind: 'sen', label: 'SEN (chú giải bổ sung)', words: /chú giải bổ sung/iu, acronym: /(?<!\p{L})SEN(?!\p{L})/u },
  { kind: 'hs_note', label: 'Chú giải', words: /chú giải\s+(?:\d|(?:của\s+)?(?:phần|chương|(?:phân\s+)?nhóm)\s+[\dIVXL]+(?!\p{L}))/iu },
];
const RULE_REF = /(?:quy tắc|gri|gir)\s*(\d)(?!\d)/giu;
/** "chưa sang GIR 3", "không phân định được mới tới GIR 3": where the rules stop, the lesson worth teaching; no rule applied. */
const NOT_NEEDED = /(?<!\p{L})(?:chưa|không|khỏi)(?:\s+\p{L}+){0,5}?\s+(?:quy tắc|gri|gir)\s*\d(?:\s*\([a-c]\))?/giu;
const RULE3_NAMED = /(?:quy tắc|gri|gir)\s*3\s*\(([abc])\)/giu;
const RULE3_ANY = /(?<![\d.])3\s*\(([abc])\)/giu;
const SEN_NAMED = /(?<!\p{L})(?:SEN|ASEAN)(?!\p{L})|chú giải bổ sung/iu;
const DUTY = /(?<!\p{L})(?:thuế|C\/O|MFN)(?!\p{L})/iu;
/** Rates compared in words, read off the tariff block; no verify() rule sees these. "khác với dòng không có C/O" passes. */
const RATE_COMPARE =
  /(?<!\p{L})(?:thuế|mức (?:thuế|của))(?!\p{L}).{0,80}?(?<!\p{L})(?:cao hơn|thấp hơn|chênh|khác nhau)(?!\p{L}).{0,30}?(?<!\p{L})(?:giữa|dòng|nhóm|mã|chương)(?!\p{L})/iu;

/** Phrases that are never the model's to write, in any section. */
const BANNED: Array<{ rule: string; re: RegExp; detail: string }> = [
  {
    rule: 'policy-claim',
    // "Danh mục hàng hóa xuất khẩu, nhập khẩu" is the nomenclature, not a list.
    re: /(?<!\p{L})(?:thuộc|nằm trong|có tên trong)\s+(?:danh mục|phụ lục)(?!\s+hàng hóa xuất)|không cần giấy phép|không phải kiểm tra|phải (?:xin )?(?:giấy phép|kiểm tra chuyên ngành)/iu,
    detail: 'whether the goods are on a list or need a licence or inspection is printed by code from policyStatus; leave it out',
  },
  {
    rule: 'risk-score',
    re: /rủi ro (?:rất )?(?:thấp|trung bình|cao)|chấm điểm|điểm rủi ro/iu,
    detail: 'no risk score or rating label (R3): name the open headings, the evidence tier or the missing facts instead',
  },
  {
    rule: 'persona',
    re: /(?<!\p{L})(?:là|với tư cách|xưng)\s+chuyên gia|chào bạn|đề xuất khai|khuyến nghị khai báo/iu,
    detail: 'no persona, greeting or declaration advice: reason over the evidence as a colleague',
  },
];

const NOTE_OR_GRI = /chú giải(?!\s+chi tiết)|quy tắc|\bG(?:IR|RI)\b/iu;
/**
 * A ruling or case showing no note or GRI among its căn cứ; fails closed, since gather's ruling rows carry no căn cứ and 17
 * of 29 rulings cite none. In the 36 extracted cases only L4 has one (check_cases.py).
 */
export const citesNoNoteOrGri = ({ kind, meta = {} }: EvidenceRow): boolean =>
  (kind === 'ruling' || meta.case_id != null) &&
  (meta.muc_lap_luan != null
    ? meta.muc_lap_luan !== 'L4'
    : !(Array.isArray(meta.can_cu) && meta.can_cu.some((c) => NOTE_OR_GRI.test(typeof c === 'string' ? c : JSON.stringify(c)))));
const REASONED = /lập luận|căn cứ (?:vào |theo )?(?:chú giải|quy tắc)|theo (?:cơ quan )?hải quan.*(?<!\p{L})vì(?!\p{L})/iu;

/** Characters of markdown (agreed 2026-09-14): 170 and 220 words asked, overshoot 30–75%, ~4.6 characters a word. */
// full carries nine titled sections with their verbatim quotes, not three merged ones: 2700 cut the report in half.
const CAP = { brief: 1500, full: 4200 } as const;
/** The runner prints the section titles itself (walkthrough.run.ts SECTION_TITLES), so a heading the model writes is a
 * second title over the same text. It used to name its own, capped at three, when it merged the sections. */
const MAX_FULL_HEADINGS = 0;
const MAX_ITEM_WORDS = 12;
const OFF_SUBSET = /^\s*\|.*\|\s*$|<\/?[a-z][^>]*>|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|^\s*(?:#|#{3,})\s/imu;

// --- Validator ----------------------------------------------------------------------------------

export function validateWalkthrough(raw: WalkthroughOutput, input: ClassifyInput): Violation[] {
  const out: Violation[] = [];
  const add = (rule: string, detail: string, sentence?: string, citation?: number): void => void out.push({ rule: `walkthrough-${rule}`, detail, sentence, citation });

  const found: Finding[] = [];
  shape(raw, SCHEMA, 'output', found);
  for (const f of found) add('shape', f.detail);
  const output = coerce(raw, SCHEMA) as WalkthroughOutput;
  const left: Finding[] = [];
  shape(output, SCHEMA, 'output', left);
  if (left.some((f) => f.fatal)) return out;

  const evidence = new Map<number, EvidenceRow>();
  for (const r of input.candidates.flatMap((c) => c.evidence)) evidence.set(r.id, r);
  const rowsOf = (list: Array<number | undefined>): EvidenceRow[] => list.flatMap((id) => (id != null && evidence.has(id) ? [evidence.get(id)!] : []));
  const own = new Map(input.candidates.map((c) => [c.heading, new Set(c.evidence.map((r) => r.id))]));
  const assessed = new Map(output.candidates.map((c) => [c.heading, c.assessment]));
  const inputText = nfc(`${input.goodsFacts}\n${input.question}`);
  const { headings, needs_advance_ruling, missing_facts } = output.conclusion;
  const concludedLines = new Set(input.candidates.filter((c) => headings.includes(c.heading)).flatMap((c) => c.lines.map((l) => digits(l.code))));

  // Every sentence the model wrote, with its paragraph and the rows its own [n] markers and its paragraph's markers point at.
  type Unit = { where: string; key?: WalkthroughSectionKey; s: string; p: string; rows: EvidenceRow[]; para: EvidenceRow[] };
  const items: Unit[] = [
    ...output.candidates.flatMap((c) => c.deciding_facts.map((s) => ({ where: `deciding_facts of ${c.heading}`, s: nfc(s), p: nfc(s), rows: [], para: [] }))),
    ...missing_facts.map((s) => ({ where: 'missing_facts', s: nfc(s), p: nfc(s), rows: [], para: [] })),
  ];
  const units: Unit[] = [
    ...output.sections.flatMap((sec) =>
      nfc(sec.markdown)
        .split(/\n\s*\n/)
        .flatMap((p) => {
          const para = rowsOf(markers(p).map((n) => sec.cites[n - 1]?.id));
          return splitSentences(p).map((s) => ({ where: `section "${sec.key}"`, key: sec.key, s, p, rows: rowsOf(markers(s).map((n) => sec.cites[n - 1]?.id)), para }));
        }),
    ),
    ...items,
  ];
  // A "## " line is a label, not a claim: it names no source and states no fact.
  const inSection = (...keys: WalkthroughSectionKey[]) => units.filter((u) => u.key && keys.includes(u.key) && !/^#/.test(u.s));

  // Structure.
  const seen = new Set<string>();
  for (const sec of output.sections) {
    if (seen.has(sec.key)) add('section-duplicate', `section "${sec.key}" appears twice; merge them`);
    seen.add(sec.key);
    const md = nfc(sec.markdown);
    // verify() reads neither form, so "[#30383]" would reach Zalo; a range is no reason to call its ids unmarked.
    const odd = /\[#\d+\]|\[\d+\s*[–-]\s*\d+\]/.test(md);
    if (odd) add('marker-range', `section "${sec.key}" writes a marker range or an unnumbered [#id]; cite each row with its own [#id]`);
    const used = new Set<number>();
    for (const s of splitSentences(md))
      for (const n of markers(s)) {
        if (n >= 1 && n <= sec.cites.length) used.add(n);
        else add('marker-range', `[${n}] in section "${sec.key}" has no cites entry (${sec.cites.length} given)`, s);
      }
    if (!odd)
      sec.cites.forEach(({ id }, i) => {
        if (!used.has(i + 1)) add('cite-unused', `section "${sec.key}" lists evidence ${id} as [${i + 1}] but never marks it; mark it or drop it`, undefined, id);
      });
  }

  // Candidates.
  for (const h of own.keys()) if (!assessed.has(h)) add('candidate-missing', `candidate ${h} has no entry; assess every given heading once`);
  const counted = new Set<string>();
  for (const c of output.candidates) {
    if (!own.has(c.heading) || counted.has(c.heading)) {
      add('candidate-extra', `${c.heading} is not a given candidate or is assessed twice`);
      continue;
    }
    counted.add(c.heading);
    const cited = rowsOf(c.cite_ids);
    if (c.assessment === 'phu_hop' && !cited.some(strong))
      add('candidate-support', `${c.heading} is 'phu_hop' without a cited Chú giải, GRI or Chú giải chi tiết row; a ruling, SEN or note may only accompany one`);
    if (c.assessment === 'loai' && !cited.some((r) => bearsOn(r, c.heading)))
      add('candidate-support', `${c.heading} is 'loai': cite the Chú giải or Chú giải chi tiết that excludes it (naming ${c.heading}, of its chapter, or a Section note); GRI alone excludes nothing`);
    // Notes and GRI cross headings by design (an exclusion note is the lesson), and so does an EN that names the heading.
    for (const r of cited)
      if (!own.get(c.heading)!.has(r.id) && r.kind !== 'hs_note' && r.kind !== 'gri' && !namesHeading(r, c.heading))
        add('candidate-cite-scope', `${c.heading} cites evidence ${r.id}, given for another candidate and not naming ${c.heading}`, undefined, r.id);
    if (!c.deciding_facts.length && !(c.assessment === 'loai' && cited.some((r) => r.kind === 'hs_note' && bearsOn(r, c.heading))))
      add('deciding-facts', `${c.heading}: name the goods fact that decides '${c.assessment}'`);
  }
  for (const u of items)
    if (u.s.split(/\s+/).filter(Boolean).length > MAX_ITEM_WORDS) add('item-length', `${u.where} runs past ${MAX_ITEM_WORDS} words: name the fact, not the reasoning`, u.s);

  // Conclusion.
  for (const h of headings)
    if (!own.has(h) || !assessed.has(h) || assessed.get(h) === 'loai')
      add('conclusion-heading', `${h} is concluded but is not a candidate still in play (assessed ${assessed.get(h) ?? 'nowhere'})`);
  const fits = headings.filter((h) => assessed.get(h) === 'phu_hop').length;
  if (fits >= 2 && !needs_advance_ruling) add('conclusion-open', 'two concluded headings both fit on the evidence: set needs_advance_ruling (R5)');
  else if (!(headings.length === 1 && fits === 1) && !needs_advance_ruling && !missing_facts.length)
    add('conclusion-open', `${headings.length ? 'the conclusion is not one fitting heading' : 'no heading stands'}: list the missing facts that would decide it, or set needs_advance_ruling (R5)`);

  // Rates: verify() cuts them from the prose, but never reads the facts lists, and no rule of it sees a comparison in words.
  for (const u of units)
    if ((!u.key && ratesInProse(u.s).length) || RATE_COMPARE.test(u.s))
      add('rate', `${u.where} states or compares a rate or amount; say which duty applies when and leave the figures to the tariff block`, u.s);
  const tariffCodes = new Set(input.tariffLines.map((t) => digits(t.code)));
  for (const code of output.tariff_ref)
    if (!tariffCodes.has(digits(code)) || !concludedLines.has(digits(code)))
      add('tariff-ref', `tariff_ref ${code} must be a tariff line given and a line of a concluded heading`);

  // Goods figures come from the user or the rows the paragraph cites, wherever the goods are restated; masks stay masks.
  const userHay = squeeze(inputText);
  for (const u of units) {
    const figures = (decimal(u.s.replace(NOT_A_FIGURE, ' ')).match(UNIT) ?? []).map((t) => t.toLowerCase().replace(/\s+/g, ''));
    if (!figures.length) continue;
    const hays = [userHay, squeeze(u.para.map(textOf).join('\n'))];
    const invented = figures.filter((t) => !hays.some((hay) => new RegExp(`(?<![\\d.,])${esc(t)}(?![\\p{L}\\d])`, 'u').test(hay)));
    if (invented.length) add('fact-number', `${u.where} states ${[...new Set(invented)].join(', ')}, which neither the user nor a cited row wrote; drop it or say "chưa rõ"`, u.s);
  }
  for (const u of units) if (EXPANDED.test(u.s)) add('mask-expanded', `${u.where} fills in a masked code; leave "[mã n]" as written`, u.s);

  // Sources named are sources cited, applied in order and at their tier.
  for (const u of inSection('exclusions')) {
    const unsupported = [...new Set(u.s.match(HEADING) ?? [])].filter((h) => !u.para.some((r) => bearsOn(r, h)));
    if (unsupported.length)
      add('exclusion-support', `names ${unsupported.join(', ')} without a cited Chú giải or Chú giải chi tiết bearing on it (naming it, of its chapter, or a Section note)`, u.s);
    else if (markers(u.s).length && !u.para.some(strong))
      add('exclusion-support', 'an exclusion must cite a Chú giải, GRI or Chú giải chi tiết row, not only a ruling, SEN or note', u.s);
  }
  for (const u of inSection(...REASONING)) {
    // Quoted evidence names sources in its own words ("Chú giải 1 Chương 30"); only what the model says names one.
    const said = u.s.replace(QUOTED, ' ');
    for (const n of NAMED)
      if ((n.words.test(said) || n.acronym?.test(said)) && !u.para.some((r) => r.kind === n.kind)) {
        // Calling the EN plain "Chú giải" is a naming slip; saying "cites no note" would send the repair after a note.
        const actual = NAMED.find((m) => u.para.some((r) => r.kind === m.kind));
        add('named-source', actual ? `names ${n.label} but the row cited is ${actual.label}: call it that, or cite a ${n.kind} row` : `names ${n.label} but its paragraph cites no ${n.kind} row`, u.s);
      }
    for (const rule of new Set([...said.replace(NOT_NEEDED, ' ').matchAll(RULE_REF)].map((m) => m[1])))
      if (!u.para.some((r) => r.kind === 'gri' && new RegExp(`quy tắc\\s*${rule}(?!\\d)`, 'iu').test(textOf(r))))
        add('gir-rule', `names Quy tắc ${rule} but its paragraph cites no GRI row of rule ${rule}`, u.s);
  }
  const answer = output.sections.map((s) => nfc(s.markdown).replace(NOT_NEEDED, ' ')).join('\n');
  const parts = new Set([...answer.matchAll(RULE3_ANY)].map((m) => m[1].toLowerCase()));
  for (const part of new Set([...answer.matchAll(RULE3_NAMED)].map((m) => m[1].toLowerCase()))) {
    const skipped = ['a', 'b'].filter((p) => p < part && !parts.has(p));
    if (skipped.length) add('gir-order', `applies Quy tắc 3(${part}) without 3(${skipped.join('), 3(')}): the rules apply in order, so say why the earlier part does not settle it`);
  }
  // SEN named once in a lead covers the bullets under it: repeating "SEN" on every line is the template the owner rejects.
  for (const u of units)
    if (u.rows.length && u.rows.every((r) => r.kind === 'sen') && !SEN_NAMED.test(u.p))
      add('sen-tier', 'rests on SEN alone without saying so: name it SEN (tầng ASEAN, không tự ràng buộc) so its conditions do not read as binding', u.s);
  for (const u of units)
    if (DUTY.test(u.s) && u.rows.some((r) => CLASSIFYING.includes(r.kind)))
      add('duty-cite', 'a duty or C/O sentence cites classification evidence, which says nothing about duty: split it and leave the duty sentence uncited', u.s);

  // Lists, scores, persona, ruling standing.
  for (const u of units) for (const b of BANNED) if (b.re.test(u.s)) add(b.rule, `${u.where}: ${b.detail}`, u.s);
  for (const u of units) {
    const rows = u.rows.length ? u.rows : u.para;
    if (rows.length && rows.every(citesNoNoteOrGri) && REASONED.test(u.s))
      add('ruling-reasoning', 'the cited ruling gives no note or GRI: say what it concluded for those facts, not how customs reasoned', u.s);
  }

  // Length, visible template and Zalo's markdown subset.
  const total = output.sections.reduce((n, s) => n + nfc(s.markdown).length, 0);
  if (total > CAP[input.depth]) add('length', `${total} characters of markdown; ${input.depth} allows ${CAP[input.depth]}: cut repetition, keep the deciding reasoning`);
  const headingLines = output.sections.reduce((n, s) => n + (nfc(s.markdown).match(/^\s*##\s/gm)?.length ?? 0), 0);
  if (input.depth === 'full' && headingLines > MAX_FULL_HEADINGS)
    add('template-headings', `${headingLines} "## " headings: the system prints each section's title, so write none — one section per sections[] element instead`);
  for (const sec of output.sections) {
    const md = nfc(sec.markdown);
    if (input.depth === 'brief' && /^\s*#/m.test(md)) add('brief-headings', `section "${sec.key}": a brief answer is plain paragraphs without headings`);
    if (OFF_SUBSET.test(md)) add('markdown-subset', `section "${sec.key}" uses markup Zalo does not render (table, HTML, emoji or a heading other than "## ")`);
  }

  return out;
}

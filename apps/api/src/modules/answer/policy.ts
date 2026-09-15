/**
 * Which official lists an HS code falls in, decided by code from loaded rows, never by the model (plan 08; R3, R10, R12).
 * The owner's sample answers invented "Không" cells for lists the corpus does not hold (2026-09-14): NOT_LISTED is a
 * legal claim, so it is printed only where a list is loaded, binding, verified and fine enough to decide the code.
 *
 * Pure. Retrieve passes every HS-keyed row (annex tables, list clauses, notebook lists) whose entries match the code by
 * prefix in either direction, from all lists, so a loaded list with no matching line does not contain the code. That holds
 * only if retrieve reads entries with hsEntries below; policyStatus says UNCERTAIN ('coverage') when the rows show it did
 * not. Only the registry (db/seed/data/legal/policy-lists.json) can tell "not listed" from "list not loaded".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { quoteInBody } from './guards';
import type { Authority, EvidenceRow } from './types';

/**
 * Facts a list applies under; the caller drops a list whose condition the question rules out. A closed union so a runner
 * switch fails to compile when a value is added (NĐ 292/2026 PL V is trade-scoped, not goods-state-scoped).
 */
export const APPLIES_WHEN = [
  'hang_da_qua_su_dung',
  'kinh_doanh_tam_nhap_tai_xuat_chuyen_khau',
  'xuat_khau_tam_nhap_tai_xuat_chuyen_khau_trung_chuyen_qua_canh',
] as const;
export type AppliesWhen = (typeof APPLIES_WHEN)[number];

export interface PolicyList {
  id: string;
  instrument: string;
  /**
   * null = every row of the document. Statute rows: matched against row.meta.anchor by anchorMatches. Notebook rows have no
   * anchor, so it is looked for inside the sheet name evidence-build puts in the title ("… (PL TT33.20.BCT-RR TB, cửa sổ 2/19)").
   */
  annex_anchor: string | null;
  ministry: string;
  subject: string;
  authority: Authority;
  effective_from: string;
  effective_to: string | null;
  /** False when force is unconfirmed (not in Công báo, base decree replaced, dates from an internal sheet). */
  validity_verified: boolean;
  /** null = the list exists in law but is not in the corpus. `document_number` is a notebook slug when it has no number. */
  loaded: { kind: 'annex_table' | 'provision' | 'local_doc' | 'internal'; document_number: string; source_hint: string } | null;
  /**
   * Digit lengths the list names entries at (4, 6, 8); a coarser question than the coarsest entry cannot be decided.
   * [] = the list does not name goods by HS code (the BYT food list points at TT 15/2024/TT-BYT): never decidable by code.
   */
  granularity: number[];
  /** Only a listed 8-digit code itself counts, never its parent line (TT 11/2024/TT-BTTTT: "Chỉ hàng hóa có mã HS 08 số được liệt kê"). */
  exact_only: boolean;
  /** Descriptions narrow entries, so a code under a parent entry, or a heading-level entry, is not a listing by itself. */
  qualifier_heavy: boolean;
  applies_when: AppliesWhen | null;
  /** Code prefixes the list covers in words only (NĐ 292/2026 PL V: chapters 28, 29 by reference): no line decides them. */
  uncertain_prefixes?: string[];
  /**
   * Codes whose listing starts after the list does (TT 36/2026 PL II 7.3 "Mã 9405.11.99 áp dụng từ ngày 01/01/2027"). A line
   * suspending one of its standards (PL II 3.3.2 "Đối với QCVN 26:2011/BTTTT: ngưng hiệu lực…") is not one: the goods stay
   * listed under the line's other standards, and the quote carries that line.
   */
  deferred?: Array<{ codes: string[]; from: string; basis: string }>;
  /**
   * Code cells no query matches as printed, kept raw and never corrected (R1): a malformed code (TT 33/2026 "404.29.90"), a
   * code the nomenclature lacks, codes inside words ("73.11 (hoặc 7311.00.99)"). A code under `prefix` no line names is
   * UNCERTAIN, not NOT_LISTED.
   */
  unreadable?: Array<{ raw: string; prefix: string; basis: string }>;
  /** Registry id of the official list an internal sheet copies: the circular to look up. */
  copy_of?: string;
  /** One Vietnamese sentence the printer may add. */
  note: string;
}

export type PolicyMatch = 'exact' | 'parent' | 'child';

/** Why a list cannot say LISTED or NOT_LISTED, so the printer words it ("bảng nội bộ", "hiệu lực chưa xác minh"…). */
export type UncertainReason =
  | 'internal'
  | 'not_hs_keyed'
  | 'not_binding'
  | 'validity_unverified'
  | 'not_yet_applicable'
  | 'unreadable'
  | 'granularity'
  | 'qualifier'
  | 'words_only'
  | 'coverage';

export interface PolicyResult {
  listId: string;
  status: 'LISTED' | 'NOT_LISTED' | 'NOT_LOADED' | 'UNCERTAIN';
  instrument: string;
  annex: string | null;
  /** The list entry naming the code, verbatim from the row body (quoteInBody holds). */
  quote: string | null;
  rowId: number | null;
  /** parent: the code falls under a listed subheading or heading ("thuộc phân nhóm/nhóm được liệt kê, đối chiếu mô tả"). */
  match?: PolicyMatch;
  reason?: UncertainReason;
  appliesWhen?: AppliesWhen;
  /** The entry is listed but applies only from this day, later than asOf. */
  appliesFrom?: string;
  /** The group block above the quoted line that scopes it (QĐ 1725 "[Nhóm tủ lạnh – … Chỉ áp dụng đến loại 1000L…]"), verbatim. */
  context?: string;
  copyOf?: string;
}

/** Read once at import; the API image carries db/ and runs from /app, as tariff.service.ts reads fta-members.json. */
export const POLICY_LISTS: PolicyList[] = JSON.parse(
  readFileSync(join(process.cwd(), 'db/seed/data/legal/policy-lists.json'), 'utf8'),
) as PolicyList[];

const norm = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const digitsOf = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

/**
 * The row's anchor starts with the wanted anchor on a word boundary, case and spacing aside: "Phụ lục I" takes
 * "Phụ lục I" and "Phụ lục I. Danh mục…" but never "Phụ lục II" (annex-tables.ndjson anchors are the bare labels).
 */
export function anchorMatches(anchor: unknown, wanted: string): boolean {
  if (typeof anchor !== 'string') return false;
  const [a, w] = [norm(anchor), norm(wanted)];
  return a.startsWith(w) && !/[\p{L}\d]/u.test(a.charAt(w.length));
}

/** The sheet an Excel notebook window comes from: evidence-build titles it "<slug> — <title> (<sheet>[, cửa sổ k/n])". */
export function sheetOf(title: string): string | null {
  const m = /\(([^()]+?)(?:, cửa sổ \d+\/\d+)?\)$/.exec(title);
  return m && !/^cửa sổ \d+\/\d+$/.test(m[1]!) ? m[1]! : null;
}

const NOTEBOOK_KINDS = new Set(['local_doc', 'internal']);

/**
 * The document a row belongs to. Only a notebook row may be named by the slug heading its title; a statute row without
 * meta.document_number ("Điều 2 Thông tư 11/2024/TT-BTTTT") is unattributed (null), never guessed (F1).
 */
const rowDocument = (row: EvidenceRow): string | null => {
  const n = row.meta.document_number;
  if (typeof n === 'string' && n) return norm(n);
  return NOTEBOOK_KINDS.has(row.kind) ? norm(row.title.split(' — ')[0]!) : null;
};

/** The rows of `list`: its document, and its annex (statute rows) or sheet (notebook rows). */
export function listRows(list: PolicyList, rows: EvidenceRow[]): EvidenceRow[] {
  if (!list.loaded) return [];
  const doc = norm(list.loaded.document_number);
  const anchor = list.annex_anchor;
  return rows.filter(
    (r) =>
      rowDocument(r) === doc &&
      (anchor === null ||
        (NOTEBOOK_KINDS.has(r.kind) ? norm(sheetOf(r.title) ?? '').includes(norm(anchor)) : anchorMatches(r.meta.anchor, anchor))),
  );
}

/** 8-digit, 6-digit (dddd.dd or 84.19.32 as QĐ 18/2019 prints it), heading dd.dd, bare 8 digits; never part of a date. */
const CODE = /(?<![\d.])(?:\d{4}\.\d{2}\.\d{2}|\d{4}\.\d{2}|\d{2}\.\d{2}(?:\.\d{2})?|\d{8})(?!\d|\.\d)/g;
const TWO = /^\d{2}$/;

/**
 * Codes a list line names as entries, as digit strings. Only cells without letters hold entries: "trừ loại thuộc phân nhóm
 * 2844.10" (TT 36/2026 PL I) and "trừ … nhóm 84.56" (TT 11/2024) are mentions. Codes split over cells ("2404 | 11 | 00", NĐ
 * 292/2026 PL V) are rebuilt; evidence-build prints repeated merged cells once, so "7001 | 00 | Thủy tinh…" is 7001.00.00,
 * while a 6-digit entry keeps its empty cell ("8507 | 10 |  | …"). "7223.00. 90" (TT 36/2026 PL II) is read as typed.
 */
export function lineCodes(line: string): string[] {
  const cells = line.split('|').map((c) => c.trim().replace(/(\d)\.\s+(?=\d)/g, '$1.'));
  const out: string[] = [];
  cells.forEach((cell, i) => {
    if (/\p{L}/u.test(cell)) return;
    for (const m of cell.match(CODE) ?? []) out.push(m.replace(/\./g, ''));
    if (!/^\d{4}$/.test(cell)) return;
    const [sub, leaf] = [cells[i + 1], cells[i + 2]];
    if (sub === undefined || !TWO.test(sub)) out.push(cell);
    else if (!leaf) out.push(cell + sub);
    else out.push(cell + sub + (TWO.test(leaf) ? leaf : sub));
  });
  return out;
}

/**
 * Every entry a row body names: THE normaliser for list rows. Retrieve must select policy rows by prefix over these (or
 * index meta.hs_codes with it); a second parser drops split cells, 6-digit parents and typos, and each drop is a false
 * NOT_LISTED (review 2026-09-14: 2404.11.00 on PL V, 8421.29.90 on TT 36 PL I).
 */
export const hsEntries = (body: string): string[] => [...new Set(body.split('\n').flatMap(lineCodes))];

/**
 * Rows showing retrieve did not select by hsEntries: a statute row with no document number, or meta.hs_codes lacking an
 * entry the body names. Rows it never passed cannot be seen, so this is a tripwire, not a proof.
 */
const retrievalDoubt = (rows: EvidenceRow[]): boolean =>
  rows.some((r) => {
    if (rowDocument(r) === null) return true;
    const hs = r.meta.hs_codes;
    if (!Array.isArray(hs)) return false;
    const have = new Set(hs.map(digitsOf));
    return hsEntries(r.body).some((e) => !have.has(e));
  });

const RANK: Record<PolicyMatch, number> = { exact: 0, parent: 1, child: 2 };

const matchOf = (entry: string, code: string): PolicyMatch | null =>
  entry === code ? 'exact' : code.startsWith(entry) ? 'parent' : entry.startsWith(code) ? 'child' : null;

/** A line opening the next clause of a statute ("b) Chỉ hàng hóa…", "3. Sửa đổi…"): a list entry never runs into it. */
const CLAUSE = /^\s*(?:[a-zđ]\)|\d+[a-z]?\.)\s/;

const trimQuote = (block: string[]): string => block.join('\n').replace(/^[\s|]+|[\s|]+$/g, '');

/**
 * The entry naming the code, verbatim. A table line is its own entry. A bare code line of a list clause (TT 11/2024/TT-BTTTT)
 * is followed by its TT 31 description and then the printing-field description that decides membership (điểm b khoản 2
 * Điều 2), so the entry runs until the next code line, the next "- …" nomenclature line after its own, a clause or a blank.
 */
function quoteAt(lines: string[], i: number): string {
  const block = [lines[i]!];
  if (!/\p{L}/u.test(lines[i]!) && !lines[i]!.includes('|')) {
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (!l.trim() || lineCodes(l).length || CLAUSE.test(l) || (j > i + 1 && /^\s*-/.test(l))) break;
      block.push(l);
    }
  } else if (lines[i]!.includes('|')) {
    // A table line of codes alone continues the item above it (merged STT and name cells print once, TT 36/2026 PL I 1.1
    // " | 2710.12.23 | "), and a short one (" | Ngô | 10.05 | ", TT 27/2026/TT-BNNMT PL I) is too short for quoteInBody to
    // verify: quote back until the quote names goods and verifies.
    const body = lines.join('\n');
    const done = () => /\p{L}/u.test(block.join('\n')) && quoteInBody(trimQuote(block), body);
    for (let j = i - 1; j >= 0 && lines[j]!.trim() && !done(); j--) block.unshift(lines[j]!);
  }
  return trimQuote(block);
}

/**
 * The "[Nhóm …]" block above a line within its blank-line-delimited group: QĐ 1725 prints a group's merged description,
 * standard and "Chỉ áp dụng…" scope once there. Not contiguous with the code line, so it is a separate verbatim field.
 */
function contextAt(lines: string[], i: number): string | null {
  for (let j = i - 1; j >= 0 && lines[j]!.trim(); j--) {
    if (!/^\s*\[Nhóm/.test(lines[j]!)) continue;
    let end = j;
    while (end < i && !/\]\s*$/.test(lines[end]!)) end++;
    return end < i ? lines.slice(j, end + 1).join('\n') : lines[j]!;
  }
  return null;
}

interface Hit {
  match: PolicyMatch;
  entry: string;
  quote: string;
  context: string | null;
  rowId: number;
  /** The entry's listing starts after asOf. */
  from: string | null;
  /** An entry length the registry does not expect: the registry, not the list, is in doubt. */
  offGrid: boolean;
}

const before = (a: number[], b: number[]): boolean => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k]! < b[k]!;
  return false;
};

/**
 * Best line of the list's rows: exact before parent before child; then a listing already applicable; then the most specific
 * entry, so "8507.10.10" quotes the "8507 | 10 | (đã qua sử dụng)" line, not the 8507 heading; then first in row and line order.
 */
function bestHit(list: PolicyList, rows: EvidenceRow[], code: string, day: string): Hit | null {
  const later = new Map(
    (list.deferred ?? []).filter((d) => d.from > day).flatMap((d) => d.codes.map((c): [string, string] => [digitsOf(c), d.from])),
  );
  let best: Hit | null = null;
  let bestKey: number[] = [];
  for (const row of rows) {
    const lines = row.body.split('\n');
    lines.forEach((line, i) => {
      for (const entry of lineCodes(line)) {
        const offGrid = !list.granularity.includes(entry.length);
        const match = matchOf(entry, code);
        // An exact-only list's parent and heading lines are nomenclature, not entries (TT 11/2024 "84.43", "8443.31").
        if (!match || (list.exact_only && (match === 'parent' || offGrid))) continue;
        const from = later.get(entry) ?? null;
        const key = [RANK[match], from ? 1 : 0, -entry.length];
        if (best && !before(key, bestKey)) continue;
        best = { match, entry, quote: quoteAt(lines, i), context: contextAt(lines, i), rowId: row.id, from, offGrid };
        bestKey = key;
      }
    });
  }
  return best;
}

/**
 * One result per registry list in force on `asOf`, in registry order. `code` is 4, 6 or 8 digits in any spelling
 * ("84.62", "8462.90.90", "84629090"); anything else, or an asOf that is not a date, decides nothing and returns [].
 */
export function policyStatus(registry: PolicyList[], rows: EvidenceRow[], code: string, asOf: string): PolicyResult[] {
  // Digits, dots and spaces only: "84.62, 84.63" would otherwise read as 8462.84.63 and yield a NOT_LISTED claim.
  if (!/^\s*\d[\d.\s]*$/.test(String(code ?? ''))) return [];
  const digits = digitsOf(code);
  if (![4, 6, 8].includes(digits.length)) return [];
  // Compared by day: a timestamp on a list's last day keeps it (effective_to is inclusive, as in tariff.service.ts).
  const day = String(asOf ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const blind = retrievalDoubt(rows);

  return registry.flatMap((list): PolicyResult[] => {
    if (list.effective_from > day || (list.effective_to !== null && list.effective_to < day)) return [];
    const base = {
      listId: list.id,
      instrument: list.instrument,
      annex: list.annex_anchor,
      quote: null,
      rowId: null,
      ...(list.applies_when ? { appliesWhen: list.applies_when } : {}),
      ...(list.copy_of ? { copyOf: list.copy_of } : {}),
    };
    if (!list.loaded) return [{ ...base, status: 'NOT_LOADED' }];

    const internal = list.loaded.kind === 'internal';
    const doubt: UncertainReason | null = internal
      ? 'internal'
      : !list.granularity.length
        ? 'not_hs_keyed'
        : list.authority !== 'binding'
          ? 'not_binding'
          : !list.validity_verified
            ? 'validity_unverified'
            : null;

    const hit = bestHit(list, listRows(list, rows), digits, day);
    if (hit) {
      // A heading or subheading entry in a list whose descriptions narrow lines covers only what its line says, like a parent
      // entry: NĐ 292/2026 PL V "8507" heads only the used lead-acid 8507.10/.20 lines, "8418" only R12 units (R3).
      const narrowed = hit.match === 'parent' || (hit.match === 'exact' && hit.entry.length < 8);
      const reason =
        doubt ??
        (hit.from
          ? 'not_yet_applicable'
          : hit.offGrid
            ? 'granularity'
            : narrowed && list.qualifier_heavy
              ? 'qualifier'
              : null);
      return [
        {
          ...base,
          quote: hit.quote,
          rowId: hit.rowId,
          match: hit.match,
          ...(hit.context ? { context: hit.context } : {}),
          ...(hit.from ? { appliesFrom: hit.from } : {}),
          ...(reason ? { status: 'UNCERTAIN', reason } : { status: 'LISTED' }),
        },
      ];
    }
    if (internal) return []; // an internal compilation is not law: its silence says nothing
    const reason =
      doubt ??
      (digits.length < Math.min(...list.granularity)
        ? 'granularity'
        : list.uncertain_prefixes?.some((p) => digits.startsWith(p))
          ? 'words_only'
          : list.unreadable?.some((u) => digits.startsWith(digitsOf(u.prefix)) || digitsOf(u.prefix).startsWith(digits))
            ? 'unreadable'
            : blind
            ? 'coverage'
            : null);
    return [{ ...base, ...(reason ? { status: 'UNCERTAIN', reason } : { status: 'NOT_LISTED' }) }];
  });
}

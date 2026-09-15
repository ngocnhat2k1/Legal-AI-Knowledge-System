/**
 * Evidence layer builders (plan 05, milestone 2): turn the committed extracts in db/seed/data/legal/
 * into `evidence_section` rows — one row per citable unit (bot-answer-parity-design.md §2.1–2.4).
 *
 * Pure: no database, no embedder, so evidence-build.spec.ts can lock counts and contents.
 * db/seed/evidence.ts adds the decree status rows (they need the tariff seed) and embeds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Characters of body that go into embed_text. BGE-M3 is capped at 2048 tokens (EMBED_MAX_TOKENS);
 * measured 2026-09-14 on 300 Explanatory-Note records: 3.46 chars/token → 2048 tokens ≈ 7,076 chars.
 * The title rides on top, so the body gets a little less. Anything past the cap is never seen by
 * the model anyway — it would only cost attention time (5.3 s/record at the cap on the server).
 */
export const EMBED_CHARS = 6800;

export type EvidenceKind =
  | 'hs_note' | 'gri' | 'en' | 'sen' | 'ruling' | 'guidance' | 'annex_table'
  | 'status' | 'local_doc' | 'draft' | 'internal' | 'note';
export type Authority = 'binding' | 'authoritative' | 'administrative' | 'reference' | 'undetermined';
type Effectiveness = 'con_hieu_luc' | 'het_hieu_luc' | 'het_hieu_luc_mot_phan' | 'chua_co_hieu_luc';

export interface EvidenceRow {
  kind: EvidenceKind;
  instrument: string;
  instrumentDate: string | null;
  authority: Authority;
  hsChapter: number | null;
  hsHeading: string | null;
  hsCodes: string[];
  documentNumber: string | null;
  title: string;
  body: string;
  /** null = no known start (a ruling with no date); retrieval treats it as always started. */
  effectiveFrom: string | null;
  effectiveTo: string | null;
  effectiveness: Effectiveness;
  verification: 'verified' | 'auto_unverified';
  verifiedBy: string | null;
  /**
   * Unique per (kind, instrument): file + line, anchor or H2 — enough to find the text again; `classification-cases.ndjson#<case_id>`
   * for a case; a window row appends `/p<k>` to its section's ref (meta.parent names the section).
   */
  sourceRef: string;
  meta: Record<string, unknown>;
}

export interface DocRow {
  number: string;
  title: string;
  signed_date: string | null;
  effective_from: string;
  effective_to: string | null;
  effectiveness: Effectiveness;
  consolidates: string | null;
}
export interface RelationRow { from: string; relation: string; to: string; from_date: string; evidence: string }
export interface DecreeLoad { number: string; title: string; effective_from: string; effective_to: string | null; rates: number }
export interface RepoNote { kind: 'note' | 'internal'; instrument: string; title: string; body: string; source_ref: string }

const TT31 = { instrument: '31/2022/TT-BTC', date: '2022-06-08', from: '2022-12-01' };
const EFFECTIVENESS: Record<Effectiveness, string> = {
  con_hieu_luc: 'còn hiệu lực',
  het_hieu_luc: 'hết hiệu lực',
  het_hieu_luc_mot_phan: 'hết hiệu lực một phần',
  chua_co_hieu_luc: 'CHƯA CÓ HIỆU LỰC',
};
const VERB: Record<string, string> = {
  thay_the: 'thay thế', bai_bo: 'bãi bỏ', sua_doi: 'sửa đổi, bổ sung', het_hieu_luc: 'làm hết hiệu lực',
};
/** Same labels the notebook prints (research/inbox-loader/render_notebook.py HS_STATUS). */
const HS_STATUS: Record<string, string> = {
  hien_hanh: 'mã còn trong Danh mục AHTN 2022',
  hien_hanh_cap_nhom: 'nhóm còn trong AHTN 2022 — văn bản không nêu mã 8 số',
  hien_hanh_cap_phan_nhom: 'phân nhóm còn trong AHTN 2022 — văn bản không nêu mã 8 số',
  doi_ma_8_so: '⚠️ mã 8 số KHÔNG còn trong AHTN 2022 (phân nhóm 6 số vẫn còn) — phải tra lại mã hiện hành',
  phan_nhom_da_tach_hoac_bo: '⚠️ phân nhóm KHÔNG còn trong AHTN 2022 (đã tách hoặc bỏ) — mã chỉ đúng theo danh mục cũ',
  nhom_khong_con: '⚠️ nhóm KHÔNG còn trong AHTN 2022',
  khong_co_ma: 'văn bản không kết luận mã',
  khong_hop_le: 'mã không hợp lệ',
};
/** Same shape as NUMBER_RE in legal.scope.ts, with the issuer suffix. */
const INSTRUMENT_RE = /\d{1,4}\/\d{4}\/[A-ZĐ][A-ZĐ-]+|\d{1,4}\/VBHN-[A-Z]+/;
/** "* * *" separators of the Explanatory-Notes layout — page furniture, not text. */
const STARS = /^\s*\*(?:\s*\*)*\s*$/gm;
const WINDOW = 4000;
const WINDOW_OVERLAP = 400;
const ANNEX_BLOCK = 15000;

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Free text: 8-digit dotted codes only — a heading in prose is a cross-reference and would flood prefix pins. */
export function extractHsCodes(body: string): string[] {
  return uniq(body.match(/\b\d{4}\.\d{2}\.\d{2}\b/g) ?? []);
}

/** Digits as the corpus dots them: 8 → 8421.29.90, 6 → 8421.29, 4 → 84.21 (the hs_heading spelling). */
export const dotted = (d: string): string =>
  d.length === 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : [d.slice(0, 4), d.slice(4, 6), d.slice(6)].filter(Boolean).join('.');

// ponytail: a copy of lineCodes/hsEntries in apps/api/src/modules/answer/policy.ts. The seed image ships db/ but not
// apps/api/src, and a db/ import from the API moves dist/apps/api/main.js, so neither can import the other at runtime;
// evidence-build.spec.ts fails when the copies disagree on any table row. One module once the image copies it.
const CODE = /(?<![\d.])(?:\d{4}\.\d{2}\.\d{2}|\d{4}\.\d{2}|\d{2}\.\d{2}(?:\.\d{2})?|\d{8})(?!\d|\.\d)/g;
const TWO = /^\d{2}$/;

function lineCodes(line: string): string[] {
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

/** List entries a table body names, as digits: code-only cells, split cells joined, 4/6-digit entries kept, prose mentions ignored. */
export const hsEntries = (body: string): string[] => uniq(body.split('\n').flatMap(lineCodes));

export function fmtDate(iso: string | null): string {
  return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
}

const oneLine = (s: string | null | undefined) => (s ?? '').split(/\s+/).filter(Boolean).join(' ');

/**
 * Windows of ≤ size chars cut at line boundaries, consecutive windows sharing ≤ overlap chars, each
 * prefixed with `header` — so window 2 of a risk-list sheet still says which circular and which
 * risk level it belongs to. A line longer than size is cut hard.
 */
export function windowText(text: string, header: string, size = WINDOW, overlap = WINDOW_OVERLAP): string[] {
  const lines = text
    .split('\n')
    .flatMap((l) => (l.length <= size ? [l] : (l.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [])));
  const windows: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (cur.length && len + line.length + 1 > size) {
      windows.push(cur.join('\n'));
      let keep: string[] = [];
      let kept = 0;
      for (let i = cur.length - 1; i >= 0 && kept + cur[i].length + 1 <= overlap; i--) {
        keep.unshift(cur[i]);
        kept += cur[i].length + 1;
      }
      if (kept + line.length + 1 > size) [keep, kept] = [[], 0]; // overlap alone would make a duplicate window
      cur = keep;
      len = kept;
    }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.length) windows.push(cur.join('\n'));
  return windows.filter((w) => w.trim()).map((w) => (header ? `${header}\n${w}` : w));
}

function row(
  r: Partial<EvidenceRow> & Pick<EvidenceRow, 'kind' | 'instrument' | 'authority' | 'title' | 'body' | 'sourceRef'>,
): EvidenceRow {
  return {
    instrumentDate: null, hsChapter: null, hsHeading: null, documentNumber: null,
    effectiveFrom: null, effectiveTo: null, effectiveness: 'con_hieu_luc',
    verification: 'auto_unverified', verifiedBy: null, meta: {},
    ...r,
    hsCodes: r.hsCodes ?? extractHsCodes(r.body),
  };
}

/**
 * Exact slices of `body` (body.slice(offset, offset + text.length)): ≤ size chars, each starting ≤ overlap before the
 * previous end, cut after a line break — else after a sentence end — when one is in reach, hard otherwise.
 */
export function sliceWindows(body: string, size = WINDOW, overlap = WINDOW_OVERLAP): { offset: number; text: string }[] {
  if (2 * overlap >= size) throw new Error('sliceWindows: overlap must be under half the size');
  const cut = (from: number, to: number, last: boolean): number => {
    const part = body.slice(from, to);
    for (const re of [/\n/g, /[.;:!?]\s/g]) {
      const at = [...part.matchAll(re)].map((m) => from + m.index + m[0].length);
      if (at.length) return last ? at.at(-1)! : at[0]!;
    }
    return -1;
  };
  const out: { offset: number; text: string }[] = [];
  for (let start = 0; ; ) {
    let end = Math.min(body.length, start + size);
    // Leave at least `overlap` for the last window, so it is never almost all repeat.
    const at = end < body.length ? cut(start + size / 2, Math.min(end, body.length - overlap), true) : -1;
    if (at > 0) end = at;
    out.push({ offset: start, text: body.slice(start, end) });
    if (end >= body.length) return out;
    const next = cut(end - overlap, end - 1, false); // strictly before `end`: windows always share some text
    start = next > start ? next : end - overlap;
  }
}

/**
 * Window rows (agreed with retrieval, Option A): a section longer than EMBED_CHARS stays whole, and exact slices of its
 * body are added as rows of their own, so every part of it is embedded. A slice lying wholly inside the first EMBED_CHARS
 * is left out: the parent's own embedding already covers it, and the prompt cut stops before that span ends.
 */
const WINDOWED = new Set<EvidenceKind>(['en', 'sen', 'ruling']);

function withWindows(rows: EvidenceRow[]): EvidenceRow[] {
  return rows.flatMap((p) => {
    if (!WINDOWED.has(p.kind) || p.body.length <= EMBED_CHARS) return [p];
    const ws = sliceWindows(p.body).filter((w) => w.offset + w.text.length > EMBED_CHARS);
    return [
      p,
      ...ws.map((w, k): EvidenceRow => ({
        ...p,
        title: `${p.title} (phần ${k + 1}/${ws.length})`,
        body: w.text,
        sourceRef: `${p.sourceRef}/p${k + 1}`,
        meta: { parent: p.sourceRef, part: k + 1, parts: ws.length, offset: w.offset, ...(p.meta.case_id ? { case_id: p.meta.case_id } : {}) },
      })),
    ];
  });
}

const readNdjson = <T>(dir: string, file: string): T[] =>
  readFileSync(join(dir, file), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);

const bilingual = (vi: string, en: string | null | undefined) =>
  en ? `${vi}\n\n#### Nguyên văn tiếng Anh (WCO)\n\n${en}` : vi;

// --- HS notes, GRI, Explanatory Notes, SEN ------------------------------------------------------

interface HsNote { scope: 'phan' | 'chuong'; phan: string; chuong: string | null; note_type: string; title_vi: string; text_vi: string; text_en?: string }
interface Gri { rule: string; kind: 'rule' | 'note'; text_vi: string; text_en?: string }
interface EnRecord { chapter: number | null; heading: string | null; title: string | null; page_from: number; page_to: number; text_vi: string }

function hsNotes(dir: string): EvidenceRow[] {
  return readNdjson<HsNote>(dir, 'hs-notes.ndjson').map((n, i) => {
    const where = n.scope === 'phan' ? `Phần ${n.phan}` : `Chương ${Number(n.chuong)}`;
    const label = n.note_type === 'chu_giai_phan_nhom' ? 'Chú giải phân nhóm' : 'Chú giải';
    return row({
      kind: 'hs_note', instrument: TT31.instrument, instrumentDate: TT31.date, effectiveFrom: TT31.from, authority: 'binding',
      hsChapter: n.scope === 'chuong' ? Number(n.chuong) : null,
      title: `${label} ${where} (TT 31/2022/TT-BTC) — ${oneLine(n.title_vi)}`,
      body: bilingual(n.text_vi, n.text_en),
      sourceRef: `hs-notes.ndjson#${i + 1}`,
      meta: { phan: n.phan },
    });
  });
}

function gri(dir: string): EvidenceRow[] {
  return readNdjson<Gri>(dir, 'hs-gri.ndjson').map((g, i) =>
    row({
      kind: 'gri', instrument: TT31.instrument, instrumentDate: TT31.date, effectiveFrom: TT31.from, authority: 'binding',
      title: `Quy tắc ${g.rule} GRI — ${g.kind === 'rule' ? 'nội dung quy tắc' : 'chú giải'}`,
      body: bilingual(g.text_vi, g.text_en),
      sourceRef: `hs-gri.ndjson#${i + 1}`,
    }),
  );
}

function explanatoryNotes(dir: string): EvidenceRow[] {
  return readNdjson<EnRecord>(dir, 'hs-explanatory-notes.ndjson').map((e, i) => {
    const head = e.heading ? `nhóm ${e.heading} — ${oneLine(e.title).slice(0, 160)}` : 'chú giải chương và phần mở đầu';
    return row({
      kind: 'en', instrument: 'CV 1810/TCHQ-TXNK', instrumentDate: '2024-04-26', effectiveFrom: '2024-04-26',
      authority: 'authoritative', hsChapter: e.chapter, hsHeading: e.heading,
      title: `Chú giải chi tiết HS 2022 · Chương ${e.chapter ?? '—'} · ${head}`,
      body: e.text_vi.replace(STARS, '').trim(),
      sourceRef: `hs-explanatory-notes.ndjson#${i + 1}`,
      meta: { page_from: e.page_from, page_to: e.page_to },
    });
  });
}

/** One row per note; `codes`/`headings`/`subheadings` are the code labels printed above it, `heading` the NN.NN of the first. */
interface SenRecord extends EnRecord { codes: string[]; heading: string | null; headings: string[]; subheadings: string[] }

function sen(dir: string): EvidenceRow[] {
  return readNdjson<SenRecord>(dir, 'hs-sen.ndjson').map((s, i) => {
    const body = s.text_vi.replace(STARS, '').trim();
    // The label names every heading the note covers (a range past three), not just the first; "CHƯƠNG n" alone is not repeated.
    const heads = uniq([...s.codes, ...s.subheadings, ...s.headings].map((c) => dotted(c.replace(/\D/g, '').slice(0, 4)))).sort();
    const where = heads.length > 3 ? `${heads[0]}–${heads.at(-1)}` : heads.join(', ') || (s.chapter ? `Chương ${s.chapter}` : null);
    const note = oneLine(s.title).slice(0, 160);
    return row({
      kind: 'sen', instrument: 'CV 3866/TCHQ-TXNK', instrumentDate: '2023-07-24', effectiveFrom: '2023-07-24',
      authority: 'authoritative', hsChapter: s.chapter, hsHeading: s.heading,
      // Labels at their own length (a note on 40.01 / 4001.21 names no 8-digit code); the text keeps free-text extraction.
      hsCodes: uniq([...s.codes, ...extractHsCodes(body), ...s.subheadings, ...s.headings]),
      title: ['SEN 2022', where, note.toUpperCase() === `CHƯƠNG ${s.chapter}` ? null : note].filter(Boolean).join(' · '),
      body,
      sourceRef: `hs-sen.ndjson#${i + 1}`,
      // A group label ("39.01–39.12", "87.02 87.03") pins under every heading it names, not only the first (retrieval reads
      // hs_heading OR meta.also_headings).
      meta: { page_from: s.page_from, page_to: s.page_to, ...(heads.length ? { also_headings: heads } : {}) },
    });
  });
}

// --- Classification rulings ----------------------------------------------------------------------

interface Ruling {
  so_hieu: string | null; ngay_ban_hanh: string | null; co_quan_ban_hanh: string; loai: string; trich_yeu: string;
  danh_muc_ap_dung: string; do_tin_cay: string; scanned: boolean; source_dir: string; noi_dung: string;
  mat_hang: { ten_hang: string; ma_hs: string | null; hs2022: string; ket_luan: string }[];
}

/** One conclusion of one ruling, taken apart into verbatim quotes (research/inbox-loader/check_cases.py checks them). */
interface Case {
  case_id: string; source_dir: string; so_hieu: string; ngay_ban_hanh: string;
  pham_vi: { rang_buoc: string; trich_doi_tuong: string | null; trich_gia_tri: string | null };
  hang_hoa: { trich_ten: string };
  su_kien: { loai: string; phan: string; trich: string }[];
  can_cu: { loai: string; trich: string; lien_ket: string | null; khop_nguyen_van_kho: boolean | null }[];
  loai_tru: { nhom: string; trich_nhom: string; trich_ly_do: string }[];
  ket_luan: {
    trich: string; trich_nhom: string | null; nhom: string | null; phan_nhom: string | null; ma: string | null;
    trich_dieu_kien: string | null; ap_dung_tu: string; ap_dung_den: string | null;
  };
  danh_muc: { trich: string | null };
  ahtn_2022: { trang_thai: string; ma_cung_phan_nhom: string[]; doi_chieu_ngay: string };
  muc_lap_luan: string;
}

const FACT: Record<string, string> = {
  ten_goi: 'tên gọi', thanh_phan: 'thành phần', cau_tao: 'cấu tạo', co_che: 'cơ chế hoạt động', cong_dung: 'công dụng',
  thong_so: 'thông số', dieu_kien: 'điều kiện', phu_dinh: 'đặc điểm phủ định', san_pham_cuoi: 'sản phẩm cuối cùng',
};
const FACT_PART: Record<string, string> = { ket_qua: 'kết quả xác định', ho_so_de_nghi: 'hồ sơ đề nghị', van_ban: 'văn bản' };
const BASIS: Record<string, string> = {
  gri: 'Quy tắc GRI', chu_giai_phan: 'Chú giải phần', chu_giai_chuong: 'Chú giải chương', chu_giai_phan_nhom: 'Chú giải phân nhóm',
  en: 'Chú giải chi tiết', sen: 'Chú giải bổ sung (SEN)', wco: 'Ý kiến phân loại của WCO', loi_nhom: 'Lời văn nhóm',
  ket_qua_phan_tich: 'Kết quả phân tích', giam_dinh: 'Giám định',
};
const BINDS: Record<string, string> = {
  chi_nguoi_de_nghi: 'chỉ ràng buộc tổ chức, cá nhân đã đề nghị', to_khai_cu_the: 'chỉ cho tờ khai cụ thể',
  huong_dan_noi_bo_hq: 'hướng dẫn nội bộ ngành hải quan',
};

/** Fixed labels and quotes only: nothing here paraphrases the ruling (R2), so a quote the model lifts verifies verbatim. */
function caseSection(c: Case): EvidenceRow {
  const k = c.ket_luan;
  const code = k.ma ?? k.phan_nhom ?? k.nhom;
  const facts = [...c.su_kien.filter((s) => s.phan === 'ket_qua'), ...c.su_kien.filter((s) => s.phan !== 'ket_qua')];
  const body = [
    `Hàng hóa: ${c.hang_hoa.trich_ten}`,
    ...(facts.length ? ['Sự kiện:', ...facts.map((s) => `- ${FACT[s.loai] ?? s.loai} (${FACT_PART[s.phan] ?? s.phan}): ${s.trich}`)] : []),
    ...(c.can_cu.length
      ? ['Căn cứ:', ...c.can_cu.map((b) => `- ${BASIS[b.loai] ?? b.loai}: ${b.trich}${b.khop_nguyen_van_kho === false ? ' (lời văn khác bản trong kho)' : ''}`)]
      : ['Căn cứ: Văn bản không nêu quy tắc hay chú giải']),
    ...(c.loai_tru.length ? ['Loại trừ:', ...c.loai_tru.map((x) => `- nhóm ${x.nhom}: ${x.trich_nhom} — lý do: ${x.trich_ly_do}`)] : []),
    ...(k.trich_nhom ? [`Kết luận — nhóm: ${k.trich_nhom}`] : []),
    `Kết luận: ${k.trich}`,
    ...(k.trich_dieu_kien ? [`Điều kiện: ${k.trich_dieu_kien}`] : []),
    `Mã kết luận: ${code ?? 'không có'} · áp dụng từ ${fmtDate(k.ap_dung_tu)}${k.ap_dung_den ? ` đến ${fmtDate(k.ap_dung_den)}` : ''}`,
    `Danh mục: ${c.danh_muc.trich ?? 'văn bản không nêu'}`,
    // Not the current sibling codes (meta.ahtn_2022.ma_cung_phan_nhom): the ruling never wrote them.
    `Đối chiếu AHTN 2022 ngày ${fmtDate(c.ahtn_2022.doi_chieu_ngay)}: ${HS_STATUS[c.ahtn_2022.trang_thai] ?? c.ahtn_2022.trang_thai}`,
    `Phạm vi: ${BINDS[c.pham_vi.rang_buoc] ?? c.pham_vi.rang_buoc}`,
    ...(c.pham_vi.trich_doi_tuong ? [`- đối tượng: ${c.pham_vi.trich_doi_tuong}`] : []),
    ...(c.pham_vi.trich_gia_tri ? [`- giá trị sử dụng: ${c.pham_vi.trich_gia_tri}`] : []),
  ].join('\n');
  return row({
    kind: 'ruling', instrument: c.so_hieu, instrumentDate: c.ngay_ban_hanh, authority: 'administrative',
    effectiveFrom: k.ap_dung_tu, effectiveTo: k.ap_dung_den,
    hsHeading: k.nhom, hsChapter: k.nhom ? Number(k.nhom.slice(0, 2)) : null,
    hsCodes: [k.ma, k.phan_nhom, k.nhom].filter((x): x is string => !!x),
    title: `Tình huống phân loại · ${c.so_hieu} ngày ${fmtDate(c.ngay_ban_hanh)} · ${code ?? 'không kết luận mã'} — ${HS_STATUS[c.ahtn_2022.trang_thai] ?? c.ahtn_2022.trang_thai}`,
    body,
    sourceRef: `classification-cases.ndjson#${c.case_id}`,
    meta: {
      case_id: c.case_id, source_dir: c.source_dir, muc_lap_luan: c.muc_lap_luan, rang_buoc: c.pham_vi.rang_buoc,
      ahtn_2022: c.ahtn_2022,
      lien_ket: uniq(c.can_cu.map((b) => b.lien_ket).filter((x): x is string => !!x)),
      can_cu_loai: uniq(c.can_cu.map((b) => b.loai)),
    },
  });
}

/** The full-text rulings, then one row per case; a ruling with cases carries their binding scope and highest reasoning level. */
function rulings(dir: string): EvidenceRow[] {
  const cases = readNdjson<Case>(dir, 'classification-cases.ndjson');
  const full = readNdjson<Ruling>(dir, 'classification-rulings.ndjson').map((r, i) => {
    const own = cases.filter((c) => c.source_dir === r.source_dir);
    const ident = r.so_hieu ?? r.source_dir;
    const prefix = r.loai === 'thong_bao_ket_qua_phan_loai' ? 'TB' : 'CV';
    const head = `${prefix} ${ident} ngày ${fmtDate(r.ngay_ban_hanh)}`;
    // In the title, which windows inherit: the status lines of the body sit in its first window only.
    const stale = uniq(r.mat_hang.filter((m) => m.ma_hs && !m.hs2022.startsWith('hien_hanh')).map((m) => m.ma_hs!));
    const body = [
      `${head} · ${r.co_quan_ban_hanh}`,
      `Danh mục áp dụng: ${oneLine(r.danh_muc_ap_dung)}`,
      `Độ tin cậy trích xuất: ${r.do_tin_cay}${r.scanned ? ' (bản scan: OCR, đọc lại ảnh gốc, thẩm tra độc lập)' : ''}`,
      'Kết luận phân loại:',
      ...r.mat_hang.flatMap((m) => [
        `- ${oneLine(m.ten_hang)} → ${m.ma_hs ?? 'không kết luận mã'} — ${HS_STATUS[m.hs2022] ?? m.hs2022}`,
        `  ${oneLine(m.ket_luan)}`,
      ]),
      '',
      'Toàn văn:',
      r.noi_dung.trim(),
    ].join('\n');
    return row({
      kind: 'ruling', instrument: ident, instrumentDate: r.ngay_ban_hanh, effectiveFrom: r.ngay_ban_hanh,
      authority: 'administrative',
      title: `${head} — ${oneLine(r.trich_yeu)}${stale.length ? ` — ⚠️ mã theo danh mục cũ, không còn trong AHTN 2022: ${stale.join(', ')}` : ''}`,
      body,
      sourceRef: `classification-rulings.ndjson#${i + 1}`,
      meta: {
        hs2022: Object.fromEntries(r.mat_hang.filter((m) => m.ma_hs).map((m) => [m.ma_hs, m.hs2022])),
        ...(own.length ? { rang_buoc: own[0]!.pham_vi.rang_buoc, muc_lap_luan: own.map((c) => c.muc_lap_luan).sort().at(-1) } : {}),
      },
    });
  });
  return [...full, ...cases.map(caseSection)];
}

// --- Annex tables --------------------------------------------------------------------------------

interface AnnexTable { document_number: string; index: number; anchor: string | null; header: string[] | null; rows: string[][] }

/** Merged cells arrive repeated once per spanned column; print each once. */
const cellLine = (cells: string[]) =>
  cells.map(oneLine).filter((c, i, a) => i === 0 || c !== a[i - 1]).join(' | ');

function annexTables(dir: string, docs: Map<string, DocRow>): EvidenceRow[] {
  const out: EvidenceRow[] = [];
  readNdjson<AnnexTable>(dir, 'annex-tables.ndjson').forEach((t, i) => {
    const all = [...(t.header?.length ? [t.header] : []), ...t.rows];
    if (!all.length) return;
    const flat = all.flat().join(' ').toUpperCase();
    if ((flat.includes('CỘNG HÒA') || flat.includes('CỘNG HOÀ')) && all.length <= 3) return; // letterhead
    if (flat.includes('NƠI NHẬN')) return; // signature block
    const doc = docs.get(t.document_number);
    const label = `${t.document_number} — Bảng ${t.index}${t.anchor ? ` (sau: ${oneLine(t.anchor).slice(0, 90)})` : ''}`;
    const prefix = [label, t.header?.length ? cellLine(t.header) : ''].filter(Boolean).join('\n');
    // Blocks of consecutive rows ≤ ANNEX_BLOCK chars, the header repeated on each (spec §2.2).
    const blocks: { from: number; to: number; lines: string[] }[] = [];
    t.rows.map(cellLine).forEach((line, r) => {
      const last = blocks.at(-1);
      const size = last ? prefix.length + last.lines.reduce((n, l) => n + l.length + 1, 0) : 0;
      if (!last || size + line.length + 1 > ANNEX_BLOCK) blocks.push({ from: r + 1, to: r + 1, lines: [line] });
      else [last.to, last.lines] = [r + 1, [...last.lines, line]];
    });
    if (!blocks.length) blocks.push({ from: 0, to: 0, lines: [] });
    blocks.forEach((b, k) => {
      const body = [prefix, ...b.lines].join('\n');
      out.push(
        row({
          kind: 'annex_table', instrument: t.document_number, documentNumber: t.document_number, authority: 'binding',
          instrumentDate: doc?.signed_date ?? null, effectiveFrom: doc?.effective_from ?? null,
          effectiveTo: doc?.effective_to ?? null, effectiveness: doc?.effectiveness ?? 'con_hieu_luc',
          // The list entries policy.ts reads (4/6-digit parents, split cells), so a pin by code finds the rows a list check needs.
          hsCodes: uniq([...extractHsCodes(body), ...hsEntries(body).map(dotted)]),
          title: blocks.length > 1 ? `${label} — khối ${k + 1}/${blocks.length}` : label,
          body,
          sourceRef: `annex-tables.ndjson#${i + 1}/${k + 1}`,
          meta: { anchor: t.anchor, row_from: b.from, row_to: b.to },
        }),
      );
    });
  });
  return out;
}

// --- Status (spec §2.3) --------------------------------------------------------------------------

/**
 * One row per distinct instrument: each document in the corpus, and each instrument a relation
 * points at. A status row describes events, so it does NOT inherit the window of the document it is
 * about — otherwise the hard validity filter would hide exactly the row saying "no longer in force".
 */
export function statusSections(documents: DocRow[], relations: RelationRow[]): EvidenceRow[] {
  const incoming = new Map<string, RelationRow[]>();
  for (const r of relations) {
    const target = r.to.match(INSTRUMENT_RE)?.[0]; // only the first number: "111/2021/NĐ-CP (sửa đổi NĐ 43/2017 …)"
    if (target) incoming.set(target, [...(incoming.get(target) ?? []), r]);
  }
  const earliest = (rs: RelationRow[]) => rs.map((r) => r.from_date).sort()[0];
  /**
   * A target that starts with the number is the whole instrument, a note in brackets or not ("41/2023/TT-BCT (Danh mục …)",
   * "13/2022/NĐ-CP (phần còn lại)"); a part is named before the number ("Điều 2 Nghị định 102/2021/NĐ-CP").
   */
  const partOf = (r: RelationRow, instrument: string) => (r.to.trim().startsWith(instrument) ? null : r.to.trim());
  /** When and by what the instrument stops applying (in whole or in the stated part) — the API compares these with the as-of date. */
  const ends = (rs: RelationRow[], instrument: string) =>
    rs
      .filter((r) => r.relation !== 'sua_doi')
      .map((r) => ({ from: r.from_date, by: r.from, relation: r.relation, scope: partOf(r, instrument) }));
  const incomingLine = (r: RelationRow, instrument: string) => {
    const part = partOf(r, instrument);
    const scope = part === null ? '' : ` — phần bị tác động: ${part} —`;
    const d = fmtDate(r.from_date);
    const basis = ` — căn cứ ${r.evidence}`;
    switch (r.relation) {
      case 'sua_doi': return `còn hiệu lực, được sửa đổi${scope} bởi ${r.from} từ ${d}${basis}`;
      case 'thay_the': return `hết hiệu lực${scope} từ ${d}, bị thay thế bởi ${r.from}${basis}`;
      case 'bai_bo': return `bị bãi bỏ${scope} từ ${d} bởi ${r.from}${basis}`;
      default: return `hết hiệu lực${scope} từ ${d} bởi ${r.from}${basis}`;
    }
  };

  const rows = documents.map((d) => {
    const inc = incoming.get(d.number) ?? [];
    // An end of the whole instrument wins over the ingest-time effectiveness word, which knows no as-of date (128/2020/NĐ-CP).
    const wholeEnd = ends(inc, d.number).filter((e) => e.scope === null).map((e) => e.from).sort()[0];
    const lines = [
      `${d.number} — ${oneLine(d.title)}`,
      wholeEnd
        ? `${d.number} · hiệu lực từ ${fmtDate(d.effective_from)} đến trước ${fmtDate(wholeEnd)}`
        : `${d.number} · ${EFFECTIVENESS[d.effectiveness]} · hiệu lực từ ${fmtDate(d.effective_from)}` +
          (d.effective_to ? ` đến ${fmtDate(d.effective_to)}` : ''),
      ...(d.consolidates ? [`văn bản hợp nhất của ${d.consolidates}`] : []),
      ...relations
        .filter((r) => r.from === d.number)
        .map((r) => `${VERB[r.relation] ?? r.relation} ${r.to} từ ${fmtDate(r.from_date)} — căn cứ ${r.evidence}`),
      ...inc.map((r) => `${d.number} ${incomingLine(r, d.number)}`),
    ];
    return row({
      kind: 'status', instrument: d.number, documentNumber: d.number, authority: 'binding',
      instrumentDate: d.signed_date, effectiveFrom: inc.length ? earliest(inc) : d.effective_from,
      title: `Tình trạng hiệu lực — ${d.number}${d.consolidates ? ` (hợp nhất ${d.consolidates})` : ''}`,
      body: lines.join('\n'),
      sourceRef: `documents.ndjson#${d.number}`,
      meta: { ends: ends(inc, d.number) },
    });
  });
  const inCorpus = new Set(documents.map((d) => d.number));
  for (const [instrument, rs] of incoming) {
    if (inCorpus.has(instrument)) continue;
    rows.push(
      row({
        kind: 'status', instrument, documentNumber: instrument, authority: 'binding', effectiveFrom: earliest(rs),
        title: `Tình trạng hiệu lực — ${instrument}`,
        body: [
          `${instrument} — toàn văn không có trong kho; tình trạng lấy từ điều khoản thi hành của văn bản khác trong kho`,
          ...rs.map((r) => `${instrument} ${incomingLine(r, instrument)}`),
        ].join('\n'),
        sourceRef: `relations.ndjson#${instrument}`,
        meta: { scope: rs.map((r) => r.to), ends: ends(rs, instrument) },
      }),
    );
  }
  return rows;
}

/** Tariff decrees (table `decree`): what is loaded and what only exists on paper (spec §2.2). */
export function decreeStatusSections(decrees: DecreeLoad[]): EvidenceRow[] {
  return decrees.map((d) =>
    row({
      kind: 'status', instrument: d.number, documentNumber: d.number, authority: 'binding', effectiveFrom: d.effective_from,
      title: `Tình trạng nạp biểu thuế — ${d.number}`,
      body: [
        `${d.number} — ${oneLine(d.title)}`,
        `${d.number} · hiệu lực từ ${fmtDate(d.effective_from)}${d.effective_to ? ` đến ${fmtDate(d.effective_to)}` : ''}`,
        d.rates > 0
          ? `${d.number} · đã nạp ${d.rates} dòng thuế vào kho biểu thuế`
          : `${d.number} · CHƯA nạp dòng thuế nào — kho chỉ ghi nhận văn bản này tồn tại; mức thuế trong văn bản chưa có trong kho`,
      ].join('\n'),
      sourceRef: `decree#${d.number}`,
    }),
  );
}

// --- Documents only the notebook had (classes A-local, A-ocr, B, C, D) --------------------------

interface NotebookOnly {
  class: 'A-local' | 'A-ocr' | 'B' | 'C' | 'D'; number: string | null; slug: string; date: string | null; title: string;
  status: string; text: string; source_file: string; method: string;
  mat_hang?: { ma_hs: string | null; hs2022: string }[];
}
const NB_KIND = {
  'A-local': ['local_doc', 'binding'],
  'A-ocr': ['local_doc', 'binding'],
  B: ['guidance', 'administrative'],
  C: ['draft', 'undetermined'],
  D: ['internal', 'reference'],
} as const;

const isDataRow = (line: string) => /^\s*(\d+|[IVX]+)\s*\|/.test(line);
const compactCells = (line: string) => line.split('|').map((c) => c.trim()).filter(Boolean).join(' | ');

/** Excel exports are one `### Sheet:` block per sheet; the lines above the first data row name the annex and risk level. */
function sheetSections(text: string, docHeader: string): { name: string | null; header: string; text: string }[] {
  return text
    .split(/^(?=### Sheet: )/m)
    .filter((p) => p.trim())
    .map((part) => {
      if (!part.startsWith('### Sheet: ')) return { name: null, header: docHeader, text: part };
      const lines = part.split('\n');
      const head = [lines[0]];
      for (const l of lines.slice(1, 7)) {
        if (isDataRow(l)) break;
        const c = compactCells(l);
        if (c) head.push(c.slice(0, 200));
      }
      return { name: lines[0].slice('### Sheet: '.length).trim(), header: `${docHeader}\n${head.join('\n')}`, text: lines.slice(1).join('\n') };
    });
}

function notebookOnly(dir: string): EvidenceRow[] {
  const out: EvidenceRow[] = [];
  readNdjson<NotebookOnly>(dir, 'notebook-only.ndjson').forEach((e, i) => {
    const [kind, authority] = NB_KIND[e.class];
    const ident = e.number ?? e.slug;
    const title = oneLine(e.title).slice(0, 160).trim();
    const base = {
      kind, authority, instrument: ident, documentNumber: e.number, instrumentDate: e.date, effectiveFrom: e.date,
      meta: {
        status: e.status, class: e.class, source_file: e.source_file, method: e.method,
        ...(e.mat_hang ? { hs2022: Object.fromEntries(e.mat_hang.filter((m) => m.ma_hs).map((m) => [m.ma_hs, m.hs2022])) } : {}),
      },
    };
    if (e.class === 'B') {
      out.push(row({ ...base, title: `CV ${ident} ngày ${fmtDate(e.date)} — ${title}`, body: e.text.trim(), sourceRef: `notebook-only.ndjson#${i + 1}` }));
      return;
    }
    for (const s of sheetSections(e.text, `${ident} — ${title}`)) {
      const windows = windowText(s.text, s.header);
      windows.forEach((w, k) => {
        const where = [s.name, windows.length > 1 ? `cửa sổ ${k + 1}/${windows.length}` : null].filter(Boolean).join(', ');
        out.push(
          row({
            ...base,
            title: `${ident} — ${title}${where ? ` (${where})` : ''}`,
            body: w,
            sourceRef: `notebook-only.ndjson#${i + 1}${s.name ? `/${s.name}` : ''}/w${k + 1}`,
          }),
        );
      });
    }
  });
  return out;
}

// --- Repo notes (.agent/ business notes + the tariff-scope guide) -------------------------------

const SKIP_H2 = /^(Chưa xác minh|Xung đột chưa giải quyết|Kiến thức liên quan)/;

/** One section per H2, frontmatter dropped, the unverified/conflict/related-links H2s skipped (spec §2.2). */
export function noteSections(markdown: string, path: string): RepoNote[] {
  let text = markdown;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) text = text.slice(end + 4);
  }
  let h1: string | null = null;
  let fence = false;
  let current = { h2: null as string | null, lines: [] as string[] };
  const sections = [current];
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && h1 === null && line.startsWith('# ')) {
      h1 = line.slice(2).trim();
      continue;
    }
    if (!fence && line.startsWith('## ')) {
      current = { h2: line.slice(3).trim(), lines: [] };
      sections.push(current);
      continue;
    }
    current.lines.push(line);
  }
  const doc = h1 ?? path;
  return sections
    .filter((s) => !(s.h2 && SKIP_H2.test(s.h2)))
    .map((s) => ({ ...s, body: s.lines.join('\n').trim() }))
    .filter((s) => s.body)
    .map((s) => ({
      kind: 'note' as const,
      instrument: path,
      title: s.h2 ? `${doc} — ${s.h2}` : doc,
      body: s.body,
      source_ref: s.h2 ? `${path}#${s.h2}` : path,
    }));
}

const TARIFF_GUIDE = 'research/inbox-loader/static/cach-doc-bieu-thue.md';

/**
 * Read the notes from the repo. The seed image has no `.agent/` and no `*.md` (.dockerignore), so
 * `yarn tsx db/seed/evidence.ts --export-notes` writes these to data/legal/repo-notes.ndjson and
 * evidence-build.spec.ts fails when that file drifts from the notes.
 */
export function readRepoNotes(root: string): RepoNote[] {
  const list = JSON.parse(readFileSync(join(root, 'db/seed/data/legal/nghiep-vu.json'), 'utf8')) as [string, string][];
  const notes = list.flatMap(([rel]) => noteSections(readFileSync(join(root, '.agent', rel), 'utf8'), `.agent/${rel}`));
  const guide = readFileSync(join(root, TARIFF_GUIDE), 'utf8');
  const from = guide.indexOf('\n## 4.');
  const to = guide.indexOf('\n## 6.');
  if (from < 0 || to < 0) throw new Error(`${TARIFF_GUIDE}: headings "## 4." and "## 6." not found`);
  notes.push({
    kind: 'internal', instrument: TARIFF_GUIDE,
    title: 'Phạm vi kho biểu thuế — những gì kho không có và độ cũ của dữ liệu',
    body: guide.slice(from, to).trim(), source_ref: `${TARIFF_GUIDE}#4-5`,
  });
  return notes;
}

// --- All rows from the committed extracts --------------------------------------------------------

export function buildEvidence(dir: string): EvidenceRow[] {
  const documents = readNdjson<DocRow>(dir, 'documents.ndjson');
  return withWindows([
    ...hsNotes(dir),
    ...gri(dir),
    ...explanatoryNotes(dir),
    ...sen(dir),
    ...rulings(dir),
    ...annexTables(dir, new Map(documents.map((d) => [d.number, d]))),
    ...statusSections(documents, readNdjson<RelationRow>(dir, 'relations.ndjson')),
    ...notebookOnly(dir),
    ...readNdjson<RepoNote>(dir, 'repo-notes.ndjson').map((n) =>
      row({ kind: n.kind, instrument: n.instrument, authority: 'reference', title: n.title, body: n.body, sourceRef: n.source_ref }),
    ),
  ]);
}

export const embedText = (r: EvidenceRow) => `${r.title}\n${r.body.slice(0, EMBED_CHARS)}`;

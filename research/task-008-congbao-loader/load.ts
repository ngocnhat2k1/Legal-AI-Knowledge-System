/**
 * TASK-008 loader — ND 26/2023 Công báo `.doc` -> tariff schema.
 *
 * Consumes the annex-tagged output of parse_nd26.py (rows.ndjson = Annex I export
 * + Annex II import MFN; annex_iv.json = out-of-quota TRQ rates). Seeds the decree,
 * its four annexes, and the schedules, then inserts every line with its annex
 * identity — the whole point of the annex trap. Nothing gets a defaulted annex;
 * a line the parser could not place in an annex fails the load.
 *
 * Annex III (used cars) is NOT loaded into tariff_rate: it is keyed by heading
 * (87.02/87.03) + engine-capacity band with formula-based compound USD duties,
 * not by 8-digit HS. It is captured verbatim in annex_iii.txt and skipped here
 * with a logged reason — never silently dropped.
 *
 *   DATABASE_URL=... node_modules/.bin/tsx research/task-008-congbao-loader/load.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });

const HERE = fileURLToPath(new URL('.', import.meta.url)); // decodes %20 in the path
const EFFECTIVE_FROM = '2023-07-15'; // ND 26/2023 hiệu lực
const GAZETTE = '743+744…769+770';

type Row = { annex: string; hs: string; hs_dotted: string; desc: string; rate: string | null };
type IvRow = { hs: string; rate: string | null };

const pct = (r: string | null): string | null => (r == null ? null : r.replace(',', '.'));

function readNdjson(f: string): Row[] {
  return readFileSync(join(HERE, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

/** Keep one row per HS code; prefer a row that carries a rate. Log rate conflicts. */
function dedupe(rows: Row[], label: string): Row[] {
  const by = new Map<string, Row>();
  let conflicts = 0;
  for (const r of rows) {
    const prev = by.get(r.hs);
    if (!prev) by.set(r.hs, r);
    else if (prev.rate == null && r.rate != null) by.set(r.hs, r);
    else if (prev.rate != null && r.rate != null && prev.rate !== r.rate) conflicts++;
  }
  if (conflicts) console.log(`  ${label}: ${conflicts} duplicate HS with CONFLICTING rates (kept first)`);
  return [...by.values()];
}

async function insertBatched(rows: Record<string, unknown>[], label: string): Promise<void> {
  const B = 1000;
  for (let i = 0; i < rows.length; i += B) {
    await sql`INSERT INTO tariff_rate ${sql(rows.slice(i, i + B))}`;
  }
  console.log(`  inserted ${rows.length} ${label}`);
}

async function main(): Promise<void> {
  console.log('TASK-008 load: ND 26/2023 -> tariff schema\n' + '='.repeat(60));
  await sql`TRUNCATE tariff_rate, anti_dumping_duty, annex, tariff_schedule, decree, hs_version RESTART IDENTITY CASCADE`;

  // --- Reference data -------------------------------------------------------
  const [hs] = await sql`INSERT INTO hs_version (code, effective_from, note)
    VALUES ('AHTN-2022', '2022-12-30', 'Danh mục AHTN 2022 (TT 31/2022/TT-BTC)') RETURNING id`;
  const hsV = hs.id as number;

  const [dec] = await sql`INSERT INTO decree (number, title, signed_date, gazette_date, effective_from, effective_to, gazette_issue, source_url)
    VALUES ('26/2023/NĐ-CP', 'Biểu thuế XK, Biểu thuế NK ưu đãi, Danh mục thuế tuyệt đối/hỗn hợp, thuế NK ngoài hạn ngạch',
            '2023-05-31', '2023-06-19', ${EFFECTIVE_FROM}, NULL, '743+744',
            'https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm') RETURNING id`;
  const decId = dec.id as number;

  const annex: Record<string, number> = {};
  for (const [code, name, dir] of [
    ['I', 'Biểu thuế xuất khẩu theo Danh mục mặt hàng chịu thuế', 'export'],
    ['II', 'Biểu thuế nhập khẩu ưu đãi theo Danh mục mặt hàng chịu thuế', 'import'],
    ['III', 'Thuế tuyệt đối/hỗn hợp — xe ô tô đã qua sử dụng', 'import'],
    ['IV', 'Thuế suất thuế NK ngoài hạn ngạch thuế quan', 'import'],
  ] as const) {
    const [a] = await sql`INSERT INTO annex (decree_id, code, name, trade_direction)
      VALUES (${decId}, ${code}, ${name}, ${dir}) RETURNING id`;
    annex[code] = a.id as number;
  }

  const sched: Record<string, number> = {};
  for (const [code, name, form, co] of [
    ['XK', 'Biểu thuế xuất khẩu', null, false],
    ['NK_uu_dai', 'Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)', null, false],
    ['NK_uu_dai_98', 'Biểu thuế NK ưu đãi riêng — Chương 98 (Mục II)', null, false],
    ['NK_ngoai_han_ngach', 'Thuế nhập khẩu ngoài hạn ngạch (TRQ)', null, false],
  ] as const) {
    const [s] = await sql`INSERT INTO tariff_schedule (code, name, fta_form, requires_co)
      VALUES (${code}, ${name}, ${form}, ${co}) RETURNING id`;
    sched[code] = s.id as number;
  }

  const rows = readNdjson('out/rows.ndjson');
  const iv: IvRow[] = JSON.parse(readFileSync(join(HERE, 'out/annex_iv.json'), 'utf8'));
  const trqCodes = new Set(iv.map((r) => r.hs));

  const base = (r: Row, annexId: number, schedId: number, extra: Record<string, unknown> = {}) => ({
    hs_code: r.hs,
    hs_version_id: hsV,
    annex_id: annexId,
    schedule_id: schedId,
    rate_type: r.rate === '*' ? 'excluded' : 'ad_valorem',
    rate_percent: r.rate === '*' ? null : pct(r.rate),
    effective_from: EFFECTIVE_FROM,
    source_decree_id: decId,
    gazette_issue: GAZETTE,
    source_cell_text: `${r.hs_dotted} | ${r.desc} | ${r.rate ?? ''}`.trim(),
    ...extra,
  });

  // --- Annex I (export) -----------------------------------------------------
  const annexI = dedupe(rows.filter((r) => r.annex === 'I'), 'Annex I');
  const iNoRate = annexI.filter((r) => r.rate == null);
  await insertBatched(annexI.filter((r) => r.rate != null).map((r) => base(r, annex.I, sched.XK)), 'Annex I export rates');
  if (iNoRate.length) console.log(`  Annex I: ${iNoRate.length} HS with no rate cell — skipped (logged), not defaulted`);

  // --- Annex II (import MFN); TRQ codes flagged and pointed at Annex IV ------
  const annexII = dedupe(rows.filter((r) => r.annex === 'II'), 'Annex II');
  const iiNoRate = annexII.filter((r) => r.rate == null);
  const iiWithRate = annexII.filter((r) => r.rate != null);
  const iiPlain = iiWithRate.filter((r) => !(trqCodes.has(r.hs) && r.rate !== '*'));
  const iiTrq = iiWithRate.filter((r) => trqCodes.has(r.hs) && r.rate !== '*');
  await insertBatched(iiPlain.map((r) => base(r, annex.II, sched.NK_uu_dai)), 'Annex II MFN rates');
  await insertBatched(
    iiTrq.map((r) => base(r, annex.II, sched.NK_uu_dai, { rate_type: 'trq', out_of_quota_annex_id: annex.IV })),
    'Annex II TRQ (in-quota) rates',
  );
  if (iiNoRate.length) console.log(`  Annex II: ${iiNoRate.length} HS with no rate cell — skipped (logged), not defaulted`);

  // --- Chapter 98 (Mục II) — special preferential codes, own schedule --------
  const ch98: (Row & { corresponding?: string | null })[] = readNdjson('out/chapter98.ndjson') as never;
  const ch98Rows = dedupe(ch98.filter((r) => r.rate != null), 'Chapter 98')
    .map((r) => ({
      hs_code: r.hs,
      hs_version_id: hsV,
      annex_id: annex.II,
      schedule_id: sched.NK_uu_dai_98,
      rate_type: 'ad_valorem',
      rate_percent: pct(r.rate),
      effective_from: EFFECTIVE_FROM,
      source_decree_id: decId,
      gazette_issue: GAZETTE,
      conditions: (r as { corresponding?: string | null }).corresponding
        ? sql.json({ ma_hang_tuong_ung: (r as { corresponding?: string | null }).corresponding })
        : null,
      source_cell_text: `Ch.98 | ${r.hs_dotted} | ${r.desc} | ${r.rate}`,
    }));
  await insertBatched(ch98Rows, 'Chapter 98 special rates');

  // --- Annex IV (out-of-quota TRQ) ------------------------------------------
  const ivRows = iv
    .filter((r) => r.rate != null)
    .map((r) => ({
      hs_code: r.hs,
      hs_version_id: hsV,
      annex_id: annex.IV,
      schedule_id: sched.NK_ngoai_han_ngach,
      rate_type: 'ad_valorem',
      rate_percent: pct(r.rate),
      effective_from: EFFECTIVE_FROM,
      source_decree_id: decId,
      gazette_issue: GAZETTE,
      source_cell_text: `Phụ lục IV | ${r.hs} | ${r.rate}`,
    }));
  await insertBatched(ivRows, 'Annex IV out-of-quota rates');

  // --- Annex III (used cars) — explicitly skipped, with a logged reason -----
  console.log('  Annex III (used cars): NOT loaded into tariff_rate — keyed by heading 87.02/87.03');
  console.log('    + engine-capacity band with formula-based compound USD duties, not by 8-digit HS.');
  console.log('    Captured verbatim in annex_iii.txt. Out of scope for HS8 lookup (documented).');

  // --- Verification ---------------------------------------------------------
  console.log('\n' + '='.repeat(60) + '\nVERIFY');
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM tariff_rate`;
  const [{ c: iiCount }] = await sql`SELECT count(DISTINCT hs_code)::int AS c FROM tariff_rate r
    JOIN tariff_schedule s ON s.id=r.schedule_id WHERE s.code='NK_uu_dai'`;
  const asOf = async (hs: string, schedCode: string, annexCode: string, date = '2024-01-01') => sql`
    SELECT r.rate_type, r.rate_percent FROM tariff_rate r
    JOIN annex a ON a.id=r.annex_id JOIN tariff_schedule s ON s.id=r.schedule_id
    WHERE r.hs_code=${hs} AND s.code=${schedCode} AND a.code=${annexCode} AND r.superseded_at IS NULL
      AND r.effective_from <= ${date} AND (r.effective_to IS NULL OR ${date} <= r.effective_to)`;

  const checks: [string, boolean][] = [];
  checks.push([`total rows loaded = ${total}`, total > 12000]);
  // The loader inserts only rated lines. The parser saw 11,874 unique HS in Annex II
  // (matches research 12); 714 are genuinely rate-less ("Theo hướng dẫn Chương 98"…) and
  // are explicitly not loaded. So the loaded distinct HS is the ~11,160 with-rate figure.
  checks.push([`Mục I MFN distinct HS with rate = ${iiCount} (expect ~11,160)`, iiCount >= 11100 && iiCount <= 11200]);
  const [impFry] = await asOf('03011110', 'NK_uu_dai', 'II');
  const [expFry] = await asOf('03011110', 'XK', 'I');
  checks.push([`0301.11.10 import (Annex II) = ${impFry?.rate_percent}`, Number(impFry?.rate_percent) === 15]);
  checks.push([`0301.11.10 export (Annex I) = ${expFry?.rate_percent}`, Number(expFry?.rate_percent) === 0]);
  // Chapter 98 must not pollute Mục I: 0306.15.00 MFN stays 10, its ch98 twin 9804.15.00 = 27.
  const [lob] = await asOf('03061500', 'NK_uu_dai', 'II');
  const [lob98] = await asOf('98041500', 'NK_uu_dai_98', 'II');
  checks.push([`0306.15.00 MFN (not the ch98 phantom 27) = ${lob?.rate_percent}`, Number(lob?.rate_percent) === 10]);
  checks.push([`9804.15.00 Chapter 98 special = ${lob98?.rate_percent}`, Number(lob98?.rate_percent) === 27]);
  for (const hs of ['27101221', '27101222', '27101224', '27101225']) {
    const [p] = await asOf(hs, 'NK_uu_dai', 'II');
    checks.push([`${hs} MFN = ${p?.rate_percent}`, Number(p?.rate_percent) === 10]);
  }
  const [egg] = await asOf('04072100', 'NK_ngoai_han_ngach', 'IV');
  checks.push([`0407.21.00 out-of-quota (Annex IV) = ${egg?.rate_percent}`, Number(egg?.rate_percent) === 80]);
  const [eggTrq] = await asOf('04072100', 'NK_uu_dai', 'II');
  checks.push([`0407.21.00 in-quota flagged trq = ${eggTrq?.rate_type}`, eggTrq?.rate_type === 'trq']);
  // No row may exist without an annex (schema guarantees NOT NULL, assert anyway).
  const [{ noannex }] = await sql`SELECT count(*)::int AS noannex FROM tariff_rate WHERE annex_id IS NULL`;
  checks.push([`rows with no annex = ${noannex}`, noannex === 0]);

  let pass = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? ' ok ' : 'FAIL'}  ${name}`);
    if (ok) pass++;
  }
  console.log('='.repeat(60));
  console.log(`${pass}/${checks.length} checks passed`);
  await sql.end({ timeout: 5 });
  if (pass !== checks.length) process.exit(1);
}

main().catch(async (e) => {
  console.error('load crashed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

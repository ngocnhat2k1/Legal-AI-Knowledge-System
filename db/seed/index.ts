/**
 * Production seed — loads the full Phase 1 tariff dataset from the committed
 * extracts under db/seed/data/ into a migrated database. One reviewable command
 * (`yarn db:seed`) that replaces the three research load scripts.
 *
 * The extracts are the parsed, verbatim output of the Công báo `.doc`/`.docx`
 * pipeline (see research/task-008-congbao-loader and research/fta-loader for how
 * they are produced and verified). This seed only inserts them — it does not
 * parse — so it is portable (no macOS textutil dependency) and safe to run in a
 * container.
 *
 * Idempotent by full reset: it TRUNCATEs the tariff tables first (TRUNCATE
 * bypasses the append-only row trigger, which blocks DELETE only), then loads a
 * clean, consistent snapshot. Re-running produces the same state.
 *
 * Order matters — annex identity, interval-splitting and the append-only trigger
 * are enforced by the schema (TASK-007), so the seed must respect them:
 *   reference data → ND 26/2023 (export/MFN/Ch.98/out-of-quota) → ND 72/2026
 *   petrol regression (interval split) → the four FTA schedules.
 *
 *   DATABASE_URL=... yarn db:seed
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const DATA = join(fileURLToPath(new URL('.', import.meta.url)), 'data');

const EFFECTIVE_FROM = '2023-07-15'; // ND 26/2023 hiệu lực
const GAZETTE = '743+744…769+770';
const PETROL = ['27101221', '27101222', '27101224', '27101225', '27101280'];
const FTA_YEARS = [2022, 2023, 2024, 2025, 2026, 2027];

interface Nd26Row { annex: string; chapter98: boolean; hs: string; hs_dotted: string; desc: string; rate: string | null; corresponding?: string | null }
interface FtaRow { hs: string; hs_dotted: string; desc: string; rates: string[] }

/** FTA schedules: single-rate (whole 2022–2027) unless `years` maps six columns. */
const FTA = [
  { key: 'acfta', schedule: 'ACFTA', name: 'ASEAN–Trung Quốc (ACFTA)', form: 'E', decree: '118/2022/NĐ-CP', years: null as number[] | null },
  { key: 'aanzfta', schedule: 'AANZFTA', name: 'ASEAN–Úc–New Zealand (AANZFTA)', form: 'AANZ', decree: '121/2022/NĐ-CP', years: null },
  { key: 'atiga', schedule: 'ATIGA', name: 'ASEAN (ATIGA)', form: 'D', decree: '126/2022/NĐ-CP', years: FTA_YEARS },
  { key: 'evfta', schedule: 'EVFTA', name: 'Việt Nam–EU (EVFTA)', form: 'EUR.1/REX', decree: '116/2022/NĐ-CP', years: FTA_YEARS },
];

const readNdjson = <T>(f: string): T[] =>
  readFileSync(join(DATA, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as T);
const pct = (r: string | null): string | null => (r == null ? null : r.replace(',', '.'));

async function insertRates(rows: Record<string, unknown>[], label: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000) {
    await sql`INSERT INTO tariff_rate ${sql(rows.slice(i, i + 1000))}`;
  }
  console.log(`  + ${rows.length} ${label}`);
}

/** Keep one row per HS, preferring a row that carries a rate. */
function dedupe(rows: Nd26Row[]): Nd26Row[] {
  const by = new Map<string, Nd26Row>();
  for (const r of rows) {
    const prev = by.get(r.hs);
    if (!prev || (prev.rate == null && r.rate != null)) by.set(r.hs, r);
  }
  return [...by.values()];
}

async function main(): Promise<void> {
  console.log('db:seed — Phase 1 tariff dataset\n' + '='.repeat(56));
  await sql`TRUNCATE tariff_rate, anti_dumping_duty, annex, tariff_schedule, decree, hs_version RESTART IDENTITY CASCADE`;

  // --- Reference: HS version, decrees, schedules -----------------------------
  const [hs] = await sql`INSERT INTO hs_version (code, effective_from, note)
    VALUES ('AHTN-2022', '2022-12-30', 'Danh mục AHTN 2022 (TT 31/2022/TT-BTC)') RETURNING id`;
  const hsV = hs.id as number;

  const decreeDefs: [string, string, string | null, string, string | null][] = [
    ['26/2023/NĐ-CP', 'Biểu thuế XK, NK ưu đãi, thuế tuyệt đối/hỗn hợp, NK ngoài hạn ngạch', '2023-05-31', EFFECTIVE_FROM, null],
    ['144/2024/NĐ-CP', 'Sửa Biểu NK ưu đãi (Phụ lục II) của ND 26/2023', '2024-11-01', '2024-12-16', null],
    ['108/2025/NĐ-CP', 'Sửa đổi, bổ sung ND 26/2023 (Biểu NK ưu đãi)', '2025-05-19', '2025-05-19', null],
    ['199/2025/NĐ-CP', 'Sửa đổi, bổ sung ND 26/2023 (Biểu XK + NK ưu đãi)', '2025-07-08', '2025-07-08', null],
    ['72/2026/NĐ-CP', 'Giảm thuế NK ưu đãi một số mặt hàng xăng, dầu về 0%', '2026-03-09', '2026-03-09', '2026-04-30'],
    ['201/2026/NĐ-CP', 'Sửa thuế XUẤT KHẨU tại Biểu XK của ND 26/2023', '2026-01-01', '2026-01-01', null],
    ...FTA.map((f) => [f.decree, `Biểu thuế NK ưu đãi đặc biệt ${f.schedule} 2022–2027`, '2022-12-30', '2022-12-30', '2027-12-31'] as [string, string, string, string, string]),
  ];
  const decId: Record<string, number> = {};
  for (const [number, title, signed, eff, to] of decreeDefs) {
    const [d] = await sql`INSERT INTO decree (number, title, signed_date, effective_from, effective_to)
      VALUES (${number}, ${title}, ${signed}, ${eff}, ${to}) RETURNING id`;
    decId[number] = d.id as number;
  }

  // Annexes of ND 26/2023.
  const dec26 = decId['26/2023/NĐ-CP']!;
  const annexId: Record<string, number> = {};
  for (const [code, name, dir] of [
    ['I', 'Biểu thuế xuất khẩu', 'export'], ['II', 'Biểu thuế nhập khẩu ưu đãi', 'import'],
    ['III', 'Xe ô tô đã qua sử dụng', 'import'], ['IV', 'Thuế NK ngoài hạn ngạch', 'import'],
  ] as const) {
    const [a] = await sql`INSERT INTO annex (decree_id, code, name, trade_direction)
      VALUES (${dec26}, ${code}, ${name}, ${dir}) RETURNING id`;
    annexId[code] = a.id as number;
  }

  const schedId: Record<string, number> = {};
  const scheduleDefs: [string, string, string | null, boolean][] = [
    ['XK', 'Biểu thuế xuất khẩu', null, false],
    ['NK_uu_dai', 'Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)', null, false],
    ['NK_uu_dai_98', 'Biểu thuế NK ưu đãi riêng — Chương 98', null, false],
    ['NK_ngoai_han_ngach', 'Thuế nhập khẩu ngoài hạn ngạch (TRQ)', null, false],
    ...FTA.map((f) => [f.schedule, f.name, f.form, true] as [string, string, string, boolean]),
  ];
  for (const [code, name, form, co] of scheduleDefs) {
    const [s] = await sql`INSERT INTO tariff_schedule (code, name, fta_form, requires_co)
      VALUES (${code}, ${name}, ${form}, ${co}) RETURNING id`;
    schedId[code] = s.id as number;
  }

  // --- ND 26/2023: Annex I export + Annex II MFN + Chapter 98 + out-of-quota --
  const nd26 = readNdjson<Nd26Row>('nd26-muc1.ndjson');
  const iv = JSON.parse(readFileSync(join(DATA, 'nd26-annex-iv.json'), 'utf8')) as { hs: string; rate: string | null }[];
  const trqCodes = new Set(iv.map((r) => r.hs));

  const mfnRow = (r: Nd26Row, annex: number, sched: number, extra: Record<string, unknown> = {}) => ({
    hs_code: r.hs, hs_version_id: hsV, annex_id: annex, schedule_id: sched,
    rate_type: r.rate === '*' ? 'excluded' : 'ad_valorem',
    rate_percent: r.rate === '*' ? null : pct(r.rate),
    effective_from: EFFECTIVE_FROM, source_decree_id: dec26, gazette_issue: GAZETTE,
    source_cell_text: `${r.hs_dotted} | ${r.desc} | ${r.rate ?? ''}`.trim(), ...extra,
  });

  const annexI = dedupe(nd26.filter((r) => r.annex === 'I')).filter((r) => r.rate != null);
  await insertRates(annexI.map((r) => mfnRow(r, annexId.I!, schedId.XK!)), 'Annex I export');

  const annexII = dedupe(nd26.filter((r) => r.annex === 'II')).filter((r) => r.rate != null);
  const iiPlain = annexII.filter((r) => !(trqCodes.has(r.hs) && r.rate !== '*'));
  const iiTrq = annexII.filter((r) => trqCodes.has(r.hs) && r.rate !== '*');
  await insertRates(iiPlain.map((r) => mfnRow(r, annexId.II!, schedId.NK_uu_dai!)), 'Annex II MFN');
  await insertRates(iiTrq.map((r) => mfnRow(r, annexId.II!, schedId.NK_uu_dai!, { rate_type: 'trq', out_of_quota_annex_id: annexId.IV })), 'Annex II TRQ (in-quota)');

  const ch98 = readNdjson<Nd26Row>('nd26-chapter98.ndjson').filter((r) => r.rate != null);
  await insertRates(dedupe(ch98).map((r) => mfnRow(r, annexId.II!, schedId.NK_uu_dai_98!, {
    conditions: r.corresponding ? sql.json({ ma_hang_tuong_ung: r.corresponding }) : null,
  })), 'Chapter 98 special');

  await insertRates(iv.filter((r) => r.rate != null).map((r) => ({
    hs_code: r.hs, hs_version_id: hsV, annex_id: annexId.IV!, schedule_id: schedId.NK_ngoai_han_ngach!,
    rate_type: 'ad_valorem', rate_percent: pct(r.rate), effective_from: EFFECTIVE_FROM,
    source_decree_id: dec26, gazette_issue: GAZETTE, source_cell_text: `Phụ lục IV | ${r.hs} | ${r.rate}`,
  })), 'Annex IV out-of-quota');

  // --- ND 72/2026 petrol regression — interval split (append-only) -----------
  const dec72 = decId['72/2026/NĐ-CP']!;
  let split = 0;
  for (const hsCode of PETROL) {
    const [orig] = await sql`SELECT r.id, r.rate_percent, r.effective_from::text AS ef
      FROM tariff_rate r JOIN tariff_schedule s ON s.id=r.schedule_id
      WHERE r.hs_code=${hsCode} AND s.code='NK_uu_dai' AND r.superseded_at IS NULL AND r.effective_to IS NULL`;
    if (!orig) continue;
    const common = { hs_code: hsCode, hs_version_id: hsV, annex_id: annexId.II!, schedule_id: schedId.NK_uu_dai!, rate_type: 'ad_valorem' };
    await sql`UPDATE tariff_rate SET superseded_at = now() WHERE id = ${orig.id}`;
    await sql`INSERT INTO tariff_rate ${sql({ ...common, rate_percent: orig.rate_percent, effective_from: orig.ef, effective_to: '2026-03-08', source_decree_id: dec26, source_cell_text: `${hsCode} | xăng | ${orig.rate_percent} (ND 26/2023)` })}`;
    await sql`INSERT INTO tariff_rate ${sql({ ...common, rate_percent: 0, effective_from: '2026-03-09', effective_to: '2026-04-30', source_decree_id: dec72, source_cell_text: `${hsCode} | xăng | 0 (ND 72/2026)`, conditions: sql.json({ extended_by: 'NQ 25/2026 đến 2026-06-30 — cần nạp riêng' }) })}`;
    await sql`INSERT INTO tariff_rate ${sql({ ...common, rate_percent: orig.rate_percent, effective_from: '2026-05-01', effective_to: null, source_decree_id: dec26, source_cell_text: `${hsCode} | xăng | ${orig.rate_percent} (hồi quy)` })}`;
    split++;
  }
  console.log(`  ~ ND 72/2026 petrol regression: ${split} codes interval-split`);

  // --- FTA schedules ---------------------------------------------------------
  for (const f of FTA) {
    const [{ id: fdec }] = await sql`SELECT id FROM decree WHERE number=${f.decree}`;
    const [ann] = await sql`INSERT INTO annex (decree_id, code, name, trade_direction)
      VALUES (${fdec}, ${f.schedule}, ${'Biểu thuế NK ưu đãi đặc biệt ' + f.schedule}, 'import') RETURNING id`;
    const rows = readNdjson<FtaRow>(`fta-${f.key}.ndjson`);
    const seen = new Set<string>();
    const inserts: Record<string, unknown>[] = [];
    for (const r of rows) {
      if (seen.has(r.hs) || r.rates.length === 0) continue;
      seen.add(r.hs);
      const intervals = f.years && r.rates.length === f.years.length
        ? r.rates.map((rate, idx) => ({ rate, from: `${f.years![idx]}-01-01`, to: `${f.years![idx]}-12-31` }))
        : [{ rate: r.rates[0]!, from: '2022-12-30', to: '2027-12-31' }];
      for (const ivl of intervals) {
        const excl = ivl.rate === '*';
        inserts.push({
          hs_code: r.hs, hs_version_id: hsV, annex_id: ann.id as number, schedule_id: schedId[f.schedule]!,
          rate_type: excl ? 'excluded' : 'ad_valorem', rate_percent: excl ? null : ivl.rate!.replace(',', '.'),
          effective_from: ivl.from, effective_to: ivl.to, source_decree_id: fdec as number,
          source_cell_text: `${f.schedule} | ${r.hs_dotted} | ${r.desc} | ${ivl.rate}`,
        });
      }
    }
    await insertRates(inserts, `${f.schedule} (${seen.size} HS)`);
  }

  const [{ total }] = await sql`SELECT count(*)::int AS total FROM tariff_rate WHERE superseded_at IS NULL`;
  console.log('='.repeat(56) + `\nSeed complete: ${total} live tariff rates.`);
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error('seed failed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

/**
 * FTA schedule loader — ADDS a preferential FTA biểu to the existing tariff data
 * (does NOT truncate; runs after the ND 26/2023 base + amendments).
 *
 * Parameterised by FTA key. ACFTA/ATIGA/AANZFTA carry one rate for the whole
 * 2022–2027 window (a single validity interval); EVFTA/RCEP carry a column per
 * year (six cells → six one-year intervals). The FTA rate is CONDITIONAL: the
 * schedule sets requires_co, and the API composes "X% with a valid C/O form, else
 * MFN" — never a bare 0%.
 *
 *   DATABASE_URL=... node_modules/.bin/tsx research/fta-loader/load_fta.ts acfta
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const HERE = fileURLToPath(new URL('.', import.meta.url));

interface FtaConfig {
  schedule: string;
  scheduleName: string;
  form: string; // C/O form
  decreeNumber: string;
  decreeTitle: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  annexName: string;
  rowsFile: string;
  /** Year for each rate column when a row carries multiple (EVFTA/RCEP). */
  years?: number[];
}

const YEARS = [2022, 2023, 2024, 2025, 2026, 2027];
const CONFIGS: Record<string, FtaConfig> = {
  acfta: {
    schedule: 'ACFTA', scheduleName: 'ASEAN–Trung Quốc (ACFTA)', form: 'E',
    decreeNumber: '118/2022/NĐ-CP', decreeTitle: 'Biểu thuế NK ưu đãi đặc biệt ACFTA 2022–2027',
    effectiveFrom: '2022-12-30', effectiveTo: '2027-12-31',
    annexName: 'Biểu thuế NK ưu đãi đặc biệt ACFTA', rowsFile: 'acfta/rows.ndjson',
  },
  atiga: {
    schedule: 'ATIGA', scheduleName: 'ASEAN (ATIGA)', form: 'D',
    decreeNumber: '126/2022/NĐ-CP', decreeTitle: 'Biểu thuế NK ưu đãi đặc biệt ATIGA 2022–2027',
    effectiveFrom: '2022-12-30', effectiveTo: '2027-12-31',
    annexName: 'Biểu thuế NK ưu đãi đặc biệt ATIGA', rowsFile: 'atiga/rows.ndjson', years: YEARS,
  },
  evfta: {
    schedule: 'EVFTA', scheduleName: 'Việt Nam–EU (EVFTA)', form: 'EUR.1/REX',
    decreeNumber: '116/2022/NĐ-CP', decreeTitle: 'Biểu thuế NK ưu đãi đặc biệt EVFTA 2022–2027',
    effectiveFrom: '2022-12-30', effectiveTo: '2027-12-31',
    annexName: 'Biểu thuế NK ưu đãi đặc biệt EVFTA', rowsFile: 'evfta/rows.ndjson', years: YEARS,
  },
  aanzfta: {
    schedule: 'AANZFTA', scheduleName: 'ASEAN–Úc–New Zealand (AANZFTA)', form: 'AANZ',
    decreeNumber: '121/2022/NĐ-CP', decreeTitle: 'Biểu thuế NK ưu đãi đặc biệt AANZFTA 2022–2027',
    effectiveFrom: '2022-12-30', effectiveTo: '2027-12-31',
    annexName: 'Biểu thuế NK ưu đãi đặc biệt AANZFTA', rowsFile: 'aanzfta/rows.ndjson',
  },
};

interface Row { hs: string; hs_dotted: string; desc: string; rates: string[] }

async function main(): Promise<void> {
  const key = process.argv[2];
  const cfg = CONFIGS[key];
  if (!cfg) throw new Error(`unknown FTA key '${key}'. Known: ${Object.keys(CONFIGS).join(', ')}`);
  console.log(`FTA load: ${cfg.schedule} (${cfg.decreeNumber})\n` + '='.repeat(56));

  const [{ n: existing }] = await sql`
    SELECT count(*)::int AS n FROM tariff_rate r JOIN tariff_schedule s ON s.id=r.schedule_id
    WHERE s.code=${cfg.schedule} AND r.superseded_at IS NULL`;
  if (existing > 0) {
    console.log(`  ${cfg.schedule} already has ${existing} live rows — skipping (append-only; reload base to reset).`);
    await sql.end({ timeout: 5 });
    return;
  }

  const [{ id: hsV }] = await sql`SELECT id FROM hs_version WHERE code='AHTN-2022'`;
  const [dec] = await sql`
    INSERT INTO decree (number, title, signed_date, effective_from, effective_to, source_url)
    VALUES (${cfg.decreeNumber}, ${cfg.decreeTitle}, ${cfg.effectiveFrom}, ${cfg.effectiveFrom}, ${cfg.effectiveTo}, NULL)
    ON CONFLICT (number) DO UPDATE SET title = EXCLUDED.title RETURNING id`;
  const decId = dec.id as number;
  const [ann] = await sql`
    INSERT INTO annex (decree_id, code, name, trade_direction)
    VALUES (${decId}, ${cfg.schedule}, ${cfg.annexName}, 'import')
    ON CONFLICT (decree_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const annexId = ann.id as number;
  const [sch] = await sql`
    INSERT INTO tariff_schedule (code, name, fta_form, requires_co)
    VALUES (${cfg.schedule}, ${cfg.scheduleName}, ${cfg.form}, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const schedId = sch.id as number;

  const rows: Row[] = readFileSync(join(HERE, cfg.rowsFile), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  // Dedupe by HS (keep first), and expand each into one interval per rate column.
  const seen = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  let excluded = 0, norate = 0;
  for (const r of rows) {
    if (seen.has(r.hs)) continue;
    seen.add(r.hs);
    if (r.rates.length === 0) { norate++; continue; }
    const intervals = cfg.years && r.rates.length === cfg.years.length
      ? r.rates.map((rate, idx) => ({ rate, from: `${cfg.years![idx]}-01-01`, to: `${cfg.years![idx]}-12-31` }))
      : [{ rate: r.rates[0]!, from: cfg.effectiveFrom, to: cfg.effectiveTo }];
    for (const iv of intervals) {
      const isExcluded = iv.rate === '*';
      if (isExcluded) excluded++;
      inserts.push({
        hs_code: r.hs,
        hs_version_id: hsV,
        annex_id: annexId,
        schedule_id: schedId,
        rate_type: isExcluded ? 'excluded' : 'ad_valorem',
        rate_percent: isExcluded ? null : iv.rate!.replace(',', '.'),
        effective_from: iv.from,
        effective_to: iv.to,
        source_decree_id: decId,
        source_cell_text: `${cfg.schedule} | ${r.hs_dotted} | ${r.desc} | ${iv.rate}`,
      });
    }
  }
  for (let i = 0; i < inserts.length; i += 1000) {
    await sql`INSERT INTO tariff_rate ${sql(inserts.slice(i, i + 1000))}`;
  }
  console.log(`  inserted ${inserts.length} ${cfg.schedule} rows (${seen.size} unique HS; ${excluded} excluded; ${norate} no-rate skipped)`);

  // Verify: star-case + a couple of golden-set ACFTA codes.
  const at = async (hs: string, date = '2026-06-01') => {
    const [r] = await sql`
      SELECT r.rate_percent, r.rate_type, s.requires_co, s.fta_form FROM tariff_rate r
      JOIN tariff_schedule s ON s.id=r.schedule_id
      WHERE r.hs_code=${hs} AND s.code=${cfg.schedule} AND r.superseded_at IS NULL
        AND r.effective_from <= ${date} AND (r.effective_to IS NULL OR ${date} <= r.effective_to)`;
    return r;
  };
  console.log('\nVERIFY');
  // 8481.80.99 (the star case) is 0% under all four of the company's FTAs by 2026.
  const star = await at('84818099');
  const ok = star && Number(star.rate_percent) === 0 && star.requires_co === true;
  console.log(`  ${ok ? ' ok ' : 'FAIL'}  8481.80.99 ${cfg.schedule} = ${star?.rate_percent}% (requires C/O form ${star?.fta_form}) — expect 0%`);
  const fry = await at('01012100');
  console.log(`  info  0101.21.00 ${cfg.schedule} = ${fry?.rate_percent}% (per-line rates vary by schedule)`);
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error('FTA load crashed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

/**
 * TASK-012 — acceptance: does Phase 1 agree with reality?
 *
 * Runs the golden set (real cleared declarations, TASK-001) and a random sample
 * against the loaded tariff data, and reports honestly. Two hard truths shape the
 * reading:
 *
 *   1. Every golden-set case is confidence=uncertain (owner decision): "green"
 *      means "reproduces past practice", not "certified correct". Correctness is
 *      verified at point-of-use via the Zalo loop.
 *   2. The declarations are 2025–2026; the loaded data is ND 26/2023 base + the
 *      ND 72/2026 petrol regression. Rates changed by 144/2024 / 108/2025 /
 *      199/2025 (not yet applied line-by-line) and FTA schedules (not yet loaded)
 *      are EXPECTED to differ. Those are categorised, not counted as failures.
 *
 * So this is a partial, honest acceptance: it proves the base pipeline reproduces
 * real MFN declarations for unchanged goods, and it inventories exactly what data
 * is still needed for full green.
 *
 *   DATABASE_URL=... node_modules/.bin/tsx research/task-012-acceptance/validate.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');

interface Case {
  id: string;
  hs: string;
  origin: string | null;
  date: string | null;
  applied: number | null; // parsed percent, or null if non-numeric
  appliedRaw: string;
  schedule: string;
}

/** Minimal parser for our own regular golden-set YAML (list of `- id:` records). */
function parseGolden(path: string): Case[] {
  const text = readFileSync(path, 'utf8');
  const blocks = text.split(/^- id:/m).slice(1);
  const out: Case[] = [];
  for (const b of blocks) {
    const body = '- id:' + b;
    const get = (k: string): string => {
      const m = body.match(new RegExp(`^\\s+${k}:\\s*(.*)$`, 'm'));
      return m ? m[1]!.trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const idM = body.match(/^- id:\s*(.*)$/m);
    const rawRate = get('applied_rate');
    const pct = /^-?\d+(\.\d+)?%?$/.test(rawRate) ? Number(rawRate.replace('%', '')) : null;
    out.push({
      id: idM ? idM[1]!.trim() : '?',
      hs: get('hs_code').replace(/\./g, ''),
      origin: get('origin') || null,
      date: get('declaration_date') || null,
      applied: pct,
      appliedRaw: rawRate,
      schedule: get('schedule') || 'MFN',
    });
  }
  return out;
}

/** Map a golden-set schedule label to a loaded tariff_schedule.code. */
const SCHEDULE_CODE: Record<string, string> = {
  MFN: 'NK_uu_dai', ACFTA: 'ACFTA', AANZFTA: 'AANZFTA', ATIGA: 'ATIGA', EVFTA: 'EVFTA', RCEP: 'RCEP',
};

async function rateAt(hs: string, date: string, scheduleCode: string): Promise<{ rate: number | null; type: string } | null> {
  const rows = (await sql`
    SELECT r.rate_type, r.rate_percent FROM tariff_rate r
    JOIN tariff_schedule s ON s.id = r.schedule_id
    WHERE r.hs_code = ${hs} AND s.code = ${scheduleCode} AND r.superseded_at IS NULL
      AND r.effective_from <= ${date} AND (r.effective_to IS NULL OR ${date} <= r.effective_to)
    LIMIT 1`) as unknown as Array<{ rate_type: string; rate_percent: string | null }>;
  if (!rows.length) return null;
  return { rate: rows[0]!.rate_percent == null ? null : Number(rows[0]!.rate_percent), type: rows[0]!.rate_type };
}

async function validateSet(name: string, cases: Case[]): Promise<void> {
  const tally: Record<string, { match: number; mismatch: number; notLoaded: number }> = {};
  let skipped = 0, ftaPending = 0;
  const mismatches: string[] = [];
  for (const c of cases) {
    if (!c.hs.match(/^\d{8}$/) || !c.date || c.applied == null) { skipped++; continue; }
    const code = SCHEDULE_CODE[c.schedule];
    if (!code) { skipped++; continue; }
    const got = await rateAt(c.hs, c.date, code);
    if (!got) {
      // Schedule not loaded, or HS absent from it.
      if (c.schedule !== 'MFN') ftaPending++;
      else (tally.MFN ??= { match: 0, mismatch: 0, notLoaded: 0 }).notLoaded++;
      continue;
    }
    const t = (tally[c.schedule] ??= { match: 0, mismatch: 0, notLoaded: 0 });
    const declared = got.type === 'excluded' ? null : c.applied;
    if (got.rate != null && declared != null && Math.abs(got.rate - declared) < 0.001) {
      t.match++;
    } else {
      t.mismatch++;
      if (mismatches.length < 14) {
        mismatches.push(`    ${c.id} [${c.schedule}] HS ${c.hs} @${c.date}: declared ${c.appliedRaw}, loaded ${got.rate ?? got.type}`);
      }
    }
  }
  console.log(`\n${name} (${cases.length} rows)`);
  let totMatch = 0, totCmp = 0;
  for (const s of ['MFN', 'ACFTA', 'AANZFTA', 'ATIGA', 'EVFTA', 'RCEP']) {
    const t = tally[s];
    if (!t) continue;
    const cmp = t.match + t.mismatch;
    totMatch += t.match; totCmp += cmp;
    console.log(`  ${s.padEnd(8)} ✓${t.match} match  ✗${t.mismatch} differ  ${t.notLoaded ? `(${t.notLoaded} rate-less)` : ''}${cmp ? `  → ${((100 * t.match) / cmp).toFixed(1)}%` : ''}`);
  }
  console.log(`  OVERALL comparable: ${totMatch}/${totCmp}${totCmp ? `  (${((100 * totMatch) / totCmp).toFixed(1)}%)` : ''}  | FTA pending (schedule not loaded): ${ftaPending} | skipped: ${skipped}`);
  if (mismatches.length) {
    console.log('  sample differences:');
    mismatches.forEach((m) => console.log(m));
  }
}

async function randomSample(n: number): Promise<void> {
  // Random sample over the loaded MFN set, checked against the verbatim source cell
  // stored at load time (source_cell_text carries the Công báo `.doc` row). A rate
  // that doesn't appear in its own source text would mean the parser corrupted it.
  const rows = (await sql`
    SELECT r.hs_code, r.rate_percent, r.source_cell_text FROM tariff_rate r
    JOIN tariff_schedule s ON s.id = r.schedule_id
    WHERE s.code = 'NK_uu_dai' AND r.superseded_at IS NULL AND r.rate_percent IS NOT NULL
    ORDER BY md5(r.hs_code || r.id::text) LIMIT ${n}`) as unknown as Array<{
    hs_code: string; rate_percent: string; source_cell_text: string;
  }>;
  console.log(`\nRandom sample of ${rows.length} loaded MFN lines vs their verbatim source cell:`);
  let ok = 0;
  for (const r of rows) {
    const rateStr = String(Number(r.rate_percent)); // "15.0000" -> "15"
    const inSource = r.source_cell_text.split('|').pop()!.trim() === rateStr;
    if (inSource) ok++;
    console.log(`  ${inSource ? 'ok ' : 'CHK'} ${r.hs_code} = ${rateStr}%   « ${r.source_cell_text.slice(0, 62)}`);
  }
  console.log(`  ${ok}/${rows.length} loaded rates match their source cell exactly`);
}

async function main(): Promise<void> {
  console.log('TASK-012 acceptance — Phase 1 vs reality\n' + '='.repeat(64));
  const cases = parseGolden(join(ROOT, 'fixtures/golden-set/cases.yaml'));
  const corpus = parseGolden(join(ROOT, 'fixtures/golden-set/import-corpus.yaml'));
  await validateSet('Curated golden set (cases.yaml)', cases);
  await validateSet('Full import corpus (import-corpus.yaml)', corpus);
  await randomSample(20);
  console.log('\n' + '='.repeat(64));
  console.log('Read: MFN match % = the base pipeline reproduces real declarations for');
  console.log('unchanged goods. FTA-pending + MFN-differ = the exact data still to load');
  console.log('(FTA schedules; 144/2024·108/2025·199/2025 amendment rates) for full green.');
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error('validate crashed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

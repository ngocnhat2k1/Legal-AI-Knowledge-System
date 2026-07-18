/**
 * Phase 1 acceptance as a CI regression gate (TASK-012).
 *
 * Runs the golden set — real cleared declarations — against a seeded database and
 * fails if the tariff data stops reproducing them. Integration test: it needs a
 * migrated + seeded DB, so it is skipped unless DATABASE_URL is set. In CI:
 * start Postgres → `yarn db:migrate` → `yarn db:seed` → `yarn test`.
 *
 * Every golden case is confidence=uncertain (owner decision): "pass" means the
 * data reproduces past practice, not that it is certified legally correct.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';

const url = process.env.DATABASE_URL;
const CORPUS = join(__dirname, '..', '..', 'fixtures', 'golden-set', 'import-corpus.yaml');
const SCHEDULE_CODE: Record<string, string> = {
  MFN: 'NK_uu_dai', ACFTA: 'ACFTA', AANZFTA: 'AANZFTA', ATIGA: 'ATIGA', EVFTA: 'EVFTA', RCEP: 'RCEP',
};

interface Case { id: string; hs: string; date: string | null; applied: number | null; schedule: string }

/** Minimal parser for our own regular golden-set YAML (list of `- id:` records). */
function parseGolden(path: string): Case[] {
  const blocks = readFileSync(path, 'utf8').split(/^- id:/m).slice(1);
  return blocks.map((b) => {
    const body = '- id:' + b;
    const get = (k: string): string => {
      const m = body.match(new RegExp(`^\\s+${k}:\\s*(.*)$`, 'm'));
      return m ? m[1]!.trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const raw = get('applied_rate');
    return {
      id: (body.match(/^- id:\s*(.*)$/m)?.[1] ?? '?').trim(),
      hs: get('hs_code').replace(/\./g, ''),
      date: get('declaration_date') || null,
      applied: /^-?\d+(\.\d+)?%?$/.test(raw) ? Number(raw.replace('%', '')) : null,
      schedule: get('schedule') || 'MFN',
    };
  });
}

const maybe = url ? describe : describe.skip;

maybe('Phase 1 golden set vs seeded tariff data', () => {
  let sql: Sql;
  beforeAll(() => {
    sql = postgres(url!, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  const rateAt = async (hs: string, date: string, schedule: string) => {
    const rows = (await sql`
      SELECT r.rate_type, r.rate_percent FROM tariff_rate r
      JOIN tariff_schedule s ON s.id = r.schedule_id
      WHERE r.hs_code = ${hs} AND s.code = ${schedule} AND r.superseded_at IS NULL
        AND r.effective_from <= ${date} AND (r.effective_to IS NULL OR ${date} <= r.effective_to)
      LIMIT 1`) as unknown as Array<{ rate_type: string; rate_percent: string | null }>;
    return rows[0] ?? null;
  };

  test('reproduces every comparable declaration line in the corpus', async () => {
    const cases = parseGolden(CORPUS);
    const mismatches: string[] = [];
    let comparable = 0;
    for (const c of cases) {
      if (!/^\d{8}$/.test(c.hs) || !c.date || c.applied == null) continue;
      const code = SCHEDULE_CODE[c.schedule];
      if (!code) continue;
      const got = await rateAt(c.hs, c.date, code);
      if (!got || got.rate_type === 'excluded') continue; // schedule/HS not loaded, or exclusion
      comparable++;
      const loaded = got.rate_percent == null ? null : Number(got.rate_percent);
      if (loaded == null || Math.abs(loaded - c.applied) >= 0.001) {
        mismatches.push(`${c.id} [${c.schedule}] HS ${c.hs} @${c.date}: declared ${c.applied}%, loaded ${loaded}%`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(comparable).toBeGreaterThanOrEqual(240); // ~249 comparable lines
  }, 60_000);

  test('ND 72/2026 petrol regression reads by interval, not latest-wins', async () => {
    for (const [date, want] of [['2024-06-01', 10], ['2026-04-01', 0], ['2026-07-15', 10]] as const) {
      const r = await rateAt('27101221', date, 'NK_uu_dai');
      expect(r).not.toBeNull();
      expect(Number(r!.rate_percent)).toBe(want);
    }
  });

  test('star case 8481.80.99: MFN 10% and 0% under every company FTA (conditional on C/O)', async () => {
    const mfn = await rateAt('84818099', '2026-06-01', 'NK_uu_dai');
    expect(Number(mfn!.rate_percent)).toBe(10);
    for (const s of ['ACFTA', 'AANZFTA', 'ATIGA', 'EVFTA']) {
      const r = await rateAt('84818099', '2026-06-01', s);
      expect(r).not.toBeNull();
      expect(Number(r!.rate_percent)).toBe(0);
    }
  });
});

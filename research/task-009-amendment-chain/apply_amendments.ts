/**
 * TASK-009 — the MFN-2026 amendment chain, and the ND 72/2026 regression.
 *
 * Run AFTER the base ND 26/2023 load. Does two things:
 *
 * 1. Registers the amendment decrees as first-class decree entities with their
 *    verified dates, so the chain is recorded in data, not just prose. The chain
 *    was established from official sources (neither research 10 nor 12 had it
 *    complete; together they do):
 *      26/2023 (base) ← 144/2024 (16/12/2024, NK) ← 108/2025 (19/05/2025, NK)
 *                     ← 199/2025 (08/07/2025, NK+XK) ← 72/2026 (petrol) ; 201/2026 amends EXPORT.
 *
 * 2. Applies ND 72/2026 to the five petrol codes by INTERVAL-SPLITTING — the case
 *    that breaks a "latest value" model. ND 72/2026 cut 2710.12.21/.22/.24/.25/.80
 *    from 10% to 0% for 2026-03-09..2026-04-30, after which the rate silently
 *    regresses to ND 26/2023's 10%. We model it append-only:
 *      - supersede the open [2023-07-15, ∞) @ 10% row (stamp superseded_at; the
 *        trigger permits exactly this),
 *      - insert three DISJOINT intervals: [.., 2026-03-08] @ 10% (26/2023),
 *        [2026-03-09, 2026-04-30] @ 0% (72/2026), [2026-05-01, ∞) @ 10% (26/2023, regressed).
 *    The EXCLUDE constraint accepts the split precisely because the intervals are
 *    disjoint; a point-in-time read then returns exactly one row per date.
 *
 * NOTE (honest gap): NQ 25/2026 extended ND 72/2026 to 2026-06-30. We model the
 * decree's own stated window (…04-30) and flag the extension — a complete system
 * layers the resolution on as its own instrument.
 *
 *   DATABASE_URL=... node_modules/.bin/tsx research/task-009-amendment-chain/apply_amendments.ts
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });

const PETROL = ['27101221', '27101222', '27101224', '27101225', '27101280'];

async function main(): Promise<void> {
  console.log('TASK-009 amendment chain + ND 72/2026 regression\n' + '='.repeat(60));

  // 1. Register the amendment decrees (idempotent on the unique `number`).
  const decrees = [
    ['144/2024/NĐ-CP', 'Sửa đổi Biểu thuế NK ưu đãi (Phụ lục II) của ND 26/2023', '2024-11-01', '2024-12-16', null],
    ['108/2025/NĐ-CP', 'Sửa đổi, bổ sung ND 26/2023 (Biểu thuế NK ưu đãi)', '2025-05-19', '2025-05-19', null],
    ['199/2025/NĐ-CP', 'Sửa đổi, bổ sung ND 26/2023 (Biểu thuế XK + NK ưu đãi)', '2025-07-08', '2025-07-08', null],
    ['72/2026/NĐ-CP', 'Giảm thuế NK ưu đãi một số mặt hàng xăng, dầu về 0%', '2026-03-09', '2026-03-09', '2026-04-30'],
    ['201/2026/NĐ-CP', 'Sửa đổi thuế suất thuế XUẤT KHẨU tại Biểu thuế XK của ND 26/2023', '2026-01-01', '2026-01-01', null],
  ] as const;
  for (const [number, title, signed, eff, to] of decrees) {
    await sql`INSERT INTO decree (number, title, signed_date, effective_from, effective_to)
      VALUES (${number}, ${title}, ${signed}, ${eff}, ${to})
      ON CONFLICT (number) DO NOTHING`;
  }
  const [{ id: dec72 }] = await sql`SELECT id FROM decree WHERE number='72/2026/NĐ-CP'`;
  const [{ id: dec26 }] = await sql`SELECT id FROM decree WHERE number='26/2023/NĐ-CP'`;
  console.log(`  registered ${decrees.length} amendment decrees`);

  // 2. Apply ND 72/2026 to the petrol codes by interval-splitting.
  let applied = 0;
  for (const hs of PETROL) {
    const [orig] = await sql`
      SELECT r.id, r.hs_version_id, r.annex_id, r.schedule_id, r.rate_percent, r.effective_from::text AS ef
      FROM tariff_rate r JOIN tariff_schedule s ON s.id=r.schedule_id
      WHERE r.hs_code=${hs} AND s.code='NK_uu_dai' AND r.superseded_at IS NULL AND r.effective_to IS NULL`;
    if (!orig) {
      console.log(`  ${hs}: no open MFN row (already amended or absent) — skipped`);
      continue;
    }
    const common = {
      hs_code: hs,
      hs_version_id: orig.hs_version_id,
      annex_id: orig.annex_id,
      schedule_id: orig.schedule_id,
      rate_type: 'ad_valorem',
    };
    // Supersede the open [ef, ∞) @ 10% row (append-only: only superseded_at may change).
    await sql`UPDATE tariff_rate SET superseded_at = now() WHERE id = ${orig.id}`;
    // Three disjoint intervals.
    await sql`INSERT INTO tariff_rate ${sql({ ...common, rate_percent: orig.rate_percent, effective_from: orig.ef, effective_to: '2026-03-08', source_decree_id: dec26, source_cell_text: `${hs} | xăng | ${orig.rate_percent} (ND 26/2023, trước 72/2026)` })}`;
    await sql`INSERT INTO tariff_rate ${sql({ ...common, rate_percent: 0, effective_from: '2026-03-09', effective_to: '2026-04-30', source_decree_id: dec72, source_cell_text: `${hs} | xăng | 0 (ND 72/2026)`, conditions: sql.json({ extended_by: 'NQ 25/2026 đến 2026-06-30 — cần nạp riêng' }) })}`;
    await sql`INSERT INTO tariff_rate ${sql({ ...common, rate_percent: orig.rate_percent, effective_from: '2026-05-01', effective_to: null, source_decree_id: dec26, source_cell_text: `${hs} | xăng | ${orig.rate_percent} (ND 26/2023, hồi quy sau 72/2026)` })}`;
    applied++;
  }
  console.log(`  interval-split applied to ${applied} petrol codes`);

  // 3. Verify: the regression reads correctly at three instants.
  console.log('\n' + '='.repeat(60) + '\nVERIFY (interval predicate on 2710.12.21)');
  const at = async (date: string) => {
    const [r] = await sql`
      SELECT r.rate_percent, d.number AS decree FROM tariff_rate r
      JOIN tariff_schedule s ON s.id=r.schedule_id JOIN decree d ON d.id=r.source_decree_id
      WHERE r.hs_code='27101221' AND s.code='NK_uu_dai' AND r.superseded_at IS NULL
        AND r.effective_from <= ${date} AND (r.effective_to IS NULL OR ${date} <= r.effective_to)`;
    return r;
  };
  const checks: [string, boolean][] = [];
  for (const [date, wantRate, wantDecree] of [
    ['2024-06-01', 10, '26/2023/NĐ-CP'],
    ['2026-03-15', 0, '72/2026/NĐ-CP'],
    ['2026-04-30', 0, '72/2026/NĐ-CP'],
    ['2026-05-15', 10, '26/2023/NĐ-CP'],
    ['2026-07-15', 10, '26/2023/NĐ-CP'],
  ] as const) {
    const r = await at(date);
    const ok = r && Number(r.rate_percent) === wantRate && r.decree === wantDecree;
    checks.push([`${date}: ${r?.rate_percent}% (${r?.decree}) — expect ${wantRate}% (${wantDecree})`, !!ok]);
  }
  // Exactly one row per date (no overlap survived the split).
  const [{ c: overlaps }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT r.effective_from FROM tariff_rate r JOIN tariff_schedule s ON s.id=r.schedule_id
      WHERE r.hs_code='27101221' AND s.code='NK_uu_dai' AND r.superseded_at IS NULL
        AND r.effective_from <= '2026-04-30' AND (r.effective_to IS NULL OR '2026-04-30' <= r.effective_to)
    ) t`;
  checks.push([`rows matching 2026-04-30 = ${overlaps} (expect exactly 1)`, overlaps === 1]);

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
  console.error('amendment load crashed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

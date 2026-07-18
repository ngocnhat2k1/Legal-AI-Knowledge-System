/**
 * TASK-007 representability proof.
 *
 * Runs against a live Postgres with all migrations applied. Proves the schema can
 * REPRESENT the six cases research 12 said `(hs, origin) -> rate` cannot, WITHOUT
 * special-casing, and that the database REFUSES the shapes that would silently
 * produce a wrong rate. Positive checks (a case is representable) and negative
 * checks (a bad shape is rejected by the DB) both count.
 *
 *   node --import tsx research/task-007-schema/prove_schema.ts
 *   (DATABASE_URL must point at a migrated DB)
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
const ok = (name: string, detail?: string) => results.push({ name, pass: true, detail });
const bad = (name: string, detail: string) => results.push({ name, pass: false, detail });

/** Assert a block throws (the DB rejected it). Passes on error, fails on success. */
async function expectReject(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    bad(name, 'expected the database to REJECT this, but it was accepted');
  } catch (e) {
    ok(name, `rejected: ${String((e as Error).message).split('\n')[0].slice(0, 90)}`);
  }
}

async function main(): Promise<void> {
  // Reset — TRUNCATE bypasses the append-only row trigger (which blocks DELETE only).
  await sql`TRUNCATE tariff_rate, anti_dumping_duty, annex, tariff_schedule, decree, hs_version RESTART IDENTITY CASCADE`;

  // --- Reference data -------------------------------------------------------
  const [hs] = await sql`
    INSERT INTO hs_version (code, effective_from) VALUES ('AHTN-2022', '2022-12-30') RETURNING id`;
  const hsV = hs.id as number;

  const [d26] = await sql`
    INSERT INTO decree (number, title, signed_date, gazette_date, effective_from, effective_to)
    VALUES ('26/2023/NĐ-CP', 'Biểu thuế XNK ưu đãi', '2023-05-31', '2023-06-19', '2023-07-15', NULL) RETURNING id`;
  const [d72] = await sql`
    INSERT INTO decree (number, title, signed_date, gazette_date, effective_from, effective_to)
    VALUES ('72/2026/NĐ-CP', 'Giảm thuế xăng dầu', '2026-03-09', '2026-03-24', '2026-03-09', '2026-04-30') RETURNING id`;
  const dec26 = d26.id as number;
  const dec72 = d72.id as number;

  const [annexI] = await sql`
    INSERT INTO annex (decree_id, code, name, trade_direction)
    VALUES (${dec26}, 'I', 'Biểu thuế xuất khẩu', 'export') RETURNING id`;
  const [annexII] = await sql`
    INSERT INTO annex (decree_id, code, name, trade_direction)
    VALUES (${dec26}, 'II', 'Biểu thuế nhập khẩu ưu đãi', 'import') RETURNING id`;
  const [annexIII] = await sql`
    INSERT INTO annex (decree_id, code, name, trade_direction)
    VALUES (${dec26}, 'III', 'Xe đã qua sử dụng', 'import') RETURNING id`;
  const aI = annexI.id as number;
  const aII = annexII.id as number;
  const aIII = annexIII.id as number;

  const [schMFN] = await sql`
    INSERT INTO tariff_schedule (code, name, requires_co) VALUES ('NK_uu_dai', 'MFN ưu đãi', false) RETURNING id`;
  const [schACFTA] = await sql`
    INSERT INTO tariff_schedule (code, name, fta_form, requires_co)
    VALUES ('ACFTA', 'ASEAN–Trung Quốc', 'E', true) RETURNING id`;
  const [schXK] = await sql`
    INSERT INTO tariff_schedule (code, name, requires_co) VALUES ('XK', 'Xuất khẩu', false) RETURNING id`;
  const mfn = schMFN.id as number;
  const acfta = schACFTA.id as number;
  const xk = schXK.id as number;

  const base = {
    hs_version_id: hsV,
    source_decree_id: dec26,
    effective_from: '2023-07-15',
    effective_to: null as string | null,
  };

  // === Case 1: same HS, different rate in Annex I (export) vs Annex II (import) ===
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '03011110', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 15, source_cell_text: '- - - Cá bột | 15' })}`;
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '03011110', annex_id: aI, schedule_id: xk, rate_type: 'ad_valorem', rate_percent: 0, source_cell_text: 'Phụ lục I xuất khẩu | 0' })}`;
  const twoAnnex = await sql`
    SELECT annex_id, rate_percent FROM tariff_rate WHERE hs_code='03011110' AND superseded_at IS NULL ORDER BY annex_id`;
  if (twoAnnex.length === 2 && Number(twoAnnex.find((r) => r.annex_id === aII)!.rate_percent) === 15
      && Number(twoAnnex.find((r) => r.annex_id === aI)!.rate_percent) === 0) {
    ok('case1_two_annex', '0301.11.10 = 15 (Annex II import) AND 0 (Annex I export), two rows');
  } else {
    bad('case1_two_annex', JSON.stringify(twoAnnex));
  }

  // === Case 2: `*` = EXCLUDED, not 0% ===
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '87032391', annex_id: aII, schedule_id: mfn, rate_type: 'excluded', source_cell_text: '... | *' })}`;
  const [excl] = await sql`SELECT rate_type, rate_percent, amount FROM tariff_rate WHERE hs_code='87032391'`;
  if (excl.rate_type === 'excluded' && excl.rate_percent === null && excl.amount === null) {
    ok('case2_excluded', "`*` stored as rate_type='excluded' with no number (not 0%)");
  } else {
    bad('case2_excluded', JSON.stringify(excl));
  }
  await expectReject('case2_excluded_rejects_number', () =>
    sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '87032392', annex_id: aII, schedule_id: mfn, rate_type: 'excluded', rate_percent: 0 })}`);

  // === Case 3: absolute USD duty (used cars, Annex III) ===
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '87032490', annex_id: aIII, schedule_id: mfn, rate_type: 'specific', amount: 10000, amount_currency: 'USD', amount_unit: 'chiếc', source_cell_text: 'Xe đã qua sử dụng | 10.000 USD/chiếc' })}`;
  const [spec] = await sql`SELECT rate_type, amount, amount_currency, amount_unit, rate_percent FROM tariff_rate WHERE hs_code='87032490'`;
  if (spec.rate_type === 'specific' && Number(spec.amount) === 10000 && spec.amount_currency === 'USD' && spec.rate_percent === null) {
    ok('case3_specific_usd', 'absolute 10000 USD/chiếc, no percent');
  } else {
    bad('case3_specific_usd', JSON.stringify(spec));
  }
  await expectReject('case3_ad_valorem_rejects_amount', () =>
    sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '87032491', annex_id: aIII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 5, amount: 100, amount_currency: 'USD' })}`);

  // === Case 4: FTA rate conditional on a valid C/O ===
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '84818099', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 10, source_cell_text: 'van | 10' })}`;
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '84818099', annex_id: aII, schedule_id: acfta, rate_type: 'ad_valorem', rate_percent: 0, conditions: sql.json({ requires_co: true, fallback: 'MFN' }), source_cell_text: 'van | 0 (form E)' })}`;
  const conditional = await sql`
    SELECT s.code, s.requires_co, r.rate_percent
    FROM tariff_rate r JOIN tariff_schedule s ON s.id = r.schedule_id
    WHERE r.hs_code='84818099' AND r.superseded_at IS NULL ORDER BY s.requires_co`;
  const acftaRow = conditional.find((r) => r.code === 'ACFTA');
  const mfnRow = conditional.find((r) => r.code === 'NK_uu_dai');
  if (acftaRow?.requires_co === true && Number(acftaRow.rate_percent) === 0 && Number(mfnRow?.rate_percent) === 10) {
    ok('case4_co_conditional', 'ACFTA 0% (requires_co=true) + MFN 10% — API composes "0% if C/O else 10%"');
  } else {
    bad('case4_co_conditional', JSON.stringify(conditional));
  }

  // === Case 5: TRQ — in-quota rate here, over-quota rate in a separate annex ===
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '17019910', annex_id: aII, schedule_id: mfn, rate_type: 'trq', rate_percent: 25, out_of_quota_annex_id: aIII, source_cell_text: 'đường | 25 (trong hạn ngạch)' })}`;
  const [trq] = await sql`SELECT rate_type, rate_percent, out_of_quota_annex_id FROM tariff_rate WHERE hs_code='17019910'`;
  if (trq.rate_type === 'trq' && Number(trq.rate_percent) === 25 && trq.out_of_quota_annex_id === aIII) {
    ok('case5_trq', 'in-quota 25%, over-quota annex pointer set');
  } else {
    bad('case5_trq', JSON.stringify(trq));
  }
  await expectReject('case5_trq_rejects_missing_out_of_quota', () =>
    sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '17019920', annex_id: aII, schedule_id: mfn, rate_type: 'trq', rate_percent: 25 })}`);

  // === Case 6: decree expires and the rate silently regresses ===
  // ND 72/2026 cut petrol (2710.12.21) from 10% -> 0% for 2026-03-09..2026-04-30, then it reverts to ND 26/2023's 10%.
  // The loader splits the base interval around the carve-out so the intervals are disjoint.
  await sql`INSERT INTO tariff_rate ${sql({ hs_version_id: hsV, source_decree_id: dec26, hs_code: '27101221', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 10, effective_from: '2023-07-15', effective_to: '2026-03-08', source_cell_text: 'xăng | 10' })}`;
  await sql`INSERT INTO tariff_rate ${sql({ hs_version_id: hsV, source_decree_id: dec72, hs_code: '27101221', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 0, effective_from: '2026-03-09', effective_to: '2026-04-30', source_cell_text: 'xăng | 0 (ND 72/2026)' })}`;
  await sql`INSERT INTO tariff_rate ${sql({ hs_version_id: hsV, source_decree_id: dec26, hs_code: '27101221', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 10, effective_from: '2026-05-01', effective_to: null, source_cell_text: 'xăng | 10 (hồi quy)' })}`;

  const asOf = async (date: string) => sql`
    SELECT rate_percent, source_decree_id FROM tariff_rate
    WHERE hs_code='27101221' AND schedule_id=${mfn} AND annex_id=${aII}
      AND superseded_at IS NULL
      AND effective_from <= ${date} AND (effective_to IS NULL OR ${date} <= effective_to)`;
  const during = await asOf('2026-03-15'); // inside the 72/2026 window
  const after = await asOf('2026-05-15'); // after it lapsed -> regressed to 26/2023
  if (during.length === 1 && Number(during[0].rate_percent) === 0 && during[0].source_decree_id === dec72
      && after.length === 1 && Number(after[0].rate_percent) === 10 && after[0].source_decree_id === dec26) {
    ok('case6_regression', 'interval predicate: 2026-03-15 -> 0% (ND 72/2026); 2026-05-15 -> 10% (ND 26/2023). Exactly one each.');
  } else {
    bad('case6_regression', `during=${JSON.stringify(during)} after=${JSON.stringify(after)}`);
  }

  // === Guarantee: no two live rows may overlap in validity for the same key ===
  await expectReject('exclude_overlap_rejected', () =>
    sql`INSERT INTO tariff_rate ${sql({ hs_version_id: hsV, source_decree_id: dec26, hs_code: '27101221', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 7, effective_from: '2026-04-01', effective_to: '2026-04-10' })}`);

  // === Guarantee: cannot insert a rate without an annex (NOT NULL) ===
  await expectReject('annex_required', () =>
    sql`INSERT INTO tariff_rate (hs_code, hs_version_id, schedule_id, rate_type, rate_percent, effective_from, source_decree_id)
        VALUES ('84818099', ${hsV}, ${mfn}, 'ad_valorem', 5, '2023-07-15', ${dec26})`);

  // === Guarantee: append-only (DELETE forbidden; only superseded_at may be UPDATEd) ===
  const [live] = await sql`SELECT id FROM tariff_rate WHERE hs_code='84818099' AND schedule_id=${acfta}`;
  const liveId = live.id as number;
  await expectReject('append_only_delete_forbidden', () => sql`DELETE FROM tariff_rate WHERE id=${liveId}`);
  await expectReject('append_only_update_rate_forbidden', () => sql`UPDATE tariff_rate SET rate_percent=99 WHERE id=${liveId}`);
  // Permitted: stamp superseded_at (a correction supersedes the old row) ...
  await sql`UPDATE tariff_rate SET superseded_at=now() WHERE id=${liveId}`;
  const [supd] = await sql`SELECT superseded_at FROM tariff_rate WHERE id=${liveId}`;
  // ... and a superseded row is then immutable.
  await expectReject('append_only_superseded_immutable', () => sql`UPDATE tariff_rate SET superseded_at=now() WHERE id=${liveId}`);
  if (supd.superseded_at !== null) {
    ok('append_only_supersede_allowed', 'stamping superseded_at is permitted exactly once; row then immutable');
  } else {
    bad('append_only_supersede_allowed', 'superseded_at was not set');
  }

  // === CBPG (anti-dumping) is a separate, stacking charge ===
  await sql`INSERT INTO anti_dumping_duty ${sql({ hs_code: '72104900', origin_country: 'CN', product_scope: 'Thép mạ', duty_kind: 'percent', rate_percent: 35.58, decision_number: 'QĐ 1900/QĐ-BCT', effective_from: '2025-01-01', effective_to: null })}`;
  await sql`INSERT INTO tariff_rate ${sql({ ...base, hs_code: '72104900', annex_id: aII, schedule_id: mfn, rate_type: 'ad_valorem', rate_percent: 15, source_cell_text: 'thép | 15' })}`;
  const [stacked] = await sql`
    SELECT r.rate_percent AS import_duty, c.rate_percent AS cbpg
    FROM tariff_rate r
    LEFT JOIN anti_dumping_duty c ON c.hs_code = r.hs_code AND c.origin_country = 'CN' AND c.superseded_at IS NULL
    WHERE r.hs_code='72104900' AND r.schedule_id=${mfn} AND r.superseded_at IS NULL`;
  if (Number(stacked.import_duty) === 15 && Number(stacked.cbpg) === 35.58) {
    ok('cbpg_separate_and_stacks', 'import 15% + CBPG 35.58% queried as two distinct charges');
  } else {
    bad('cbpg_separate_and_stacks', JSON.stringify(stacked));
  }
  await expectReject('cbpg_shape_rejects_percent_with_amount', () =>
    sql`INSERT INTO anti_dumping_duty ${sql({ hs_code: '72104901', origin_country: 'CN', duty_kind: 'percent', rate_percent: 10, amount: 5, decision_number: 'X', effective_from: '2025-01-01' })}`);

  // --- Report ---------------------------------------------------------------
  const pass = results.filter((r) => r.pass).length;
  console.log('\nTASK-007 schema representability proof\n' + '='.repeat(60));
  for (const r of results) console.log(`${r.pass ? '  ok  ' : ' FAIL '} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  console.log('='.repeat(60));
  console.log(`${pass}/${results.length} checks passed`);
  await sql.end({ timeout: 5 });
  if (pass !== results.length) process.exit(1);
}

main().catch(async (e) => {
  console.error('proof crashed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

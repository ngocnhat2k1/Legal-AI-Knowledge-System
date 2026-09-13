import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { ftaMembership, originEligible, stalenessView, TariffService, type DecreeRow } from './tariff.service';

/**
 * ND 118/2022/NĐ-CP (ACFTA) excludes named origins per tariff line, and FTA decrees detail some
 * 8-digit codes into 10-digit national sub-lines with their own rates. Serving the ACFTA 0% to an
 * excluded origin, or one sub-line's rate as the whole 8-digit line's, is the characteristic
 * wrong-but-valid answer, so these pin the statement a user reads. No database: queries are routed
 * to fixtures by their SQL text.
 */
const dialect = new PgDialect();
function fakeDb(rateRows: unknown[], { decrees = [] as DecreeRow[], extended = [] as unknown[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    execute: async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql;
      calls.push(text);
      if (text.includes('FROM decree d')) return decrees;
      if (text.includes('extended_by')) return extended;
      if (text.includes('JOIN annex a')) return rateRows;
      return []; // goods, anti-dumping
    },
  };
}

const common = { annex: 'ACFTA', trade_direction: 'import', amount: null, amount_currency: null, amount_unit: null, out_of_quota_annex_id: null };
const MFN = { ...common, annex: 'II', schedule: 'NK_uu_dai', schedule_name: 'MFN', fta_form: null, requires_co: false, rate_type: 'ad_valorem', rate_percent: '15.0000', effective_from: '2023-07-15', effective_to: null, conditions: null, decree: '26/2023/NĐ-CP' };
const acfta = (conditions: Record<string, unknown> | null, rate: Record<string, unknown> = {}) => ({
  ...common, schedule: 'ACFTA', schedule_name: 'ASEAN–Trung Quốc (ACFTA)', fta_form: 'E', requires_co: true,
  rate_type: 'ad_valorem', rate_percent: '0.0000', effective_from: '2022-12-30', effective_to: '2027-12-31', conditions, decree: '118/2022/NĐ-CP',
  ...rate,
});

async function lookup(conditions: Record<string, unknown> | null, origin?: string, rate: Record<string, unknown> = {}) {
  const svc = new TariffService(fakeDb([MFN, acfta(conditions, rate)]) as never);
  const res = await svc.lookup('0901.11.20', origin, '2026-06-01');
  return { res, pref: res.import.preferential[0]! };
}

const CONDITIONAL = '0% nếu có C/O form E hợp lệ, ngược lại 15% (MFN)';
const LINE = { excluded_origins: ['CN', 'MM', 'TH'] };
const sub = (code: string, desc: string, rate: string | null, excluded: string[] = []) => ({
  code: code.replace(/\./g, ''), code_dotted: code, desc,
  rate_type: rate == null ? 'excluded' : 'ad_valorem', rate_percent: rate, excluded_origins: excluded,
});
/** ND 118/2022, 1211.60.00: every sub-line 0 (uniform), .10 excludes MM, TH. */
const UNIFORM = {
  sublines: [
    sub('1211.60.00.10', '- - Dạng ướp lạnh hoặc đông lạnh', '0', ['MM', 'TH']),
    sub('1211.60.00.90', '- - Loại khác', '0'),
  ],
};
/** ND 118/2022, 1601.00.10: .10 = 0 excluding KH, .90 = 5 — no single rate for the 8-digit line. */
const BY_SUBLINE = {
  sublines: [sub('1601.00.10.10', '- - Từ côn trùng', '0', ['KH']), sub('1601.00.10.90', '- - Loại khác', '5')],
};
const BY_SUBLINE_RATE = { rate_type: 'by_subline', rate_percent: null };

describe('TariffService — ACFTA per-line excluded origins', () => {
  it('refuses the preference for an excluded origin and states the MFN rate, never 0%', async () => {
    const { pref } = await lookup(LINE, 'cn');
    expect(pref.originExcluded).toBe(true);
    expect(pref.excludedOrigins).toEqual(['CN', 'MM', 'TH']);
    expect(pref.statement).toBe(
      'Không áp dụng cho hàng xuất xứ Cộng hòa Nhân dân Trung Hoa (CN): NĐ 118/2022/NĐ-CP loại trừ nước này ở dòng thuế này — áp mức MFN 15%',
    );
    expect(pref.statement).not.toMatch(/(^|[^\d])0%/);
  });

  it('keeps the conditional statement for an origin the line does not exclude', async () => {
    const { pref } = await lookup(LINE, 'SG');
    expect(pref.originExcluded).toBe(false);
    expect(pref.statement).toBe(CONDITIONAL);
  });

  it('names the excluded origins when no origin is given', async () => {
    const { pref } = await lookup(LINE);
    expect(pref.originExcluded).toBeNull();
    expect(pref.statement).toBe(
      `${CONDITIONAL}; không áp dụng cho hàng xuất xứ Cộng hòa Nhân dân Trung Hoa (CN), Cộng hòa Liên bang Mi-an-ma (MM), Vương quốc Thái Lan (TH) (NĐ 118/2022/NĐ-CP loại trừ theo dòng)`,
    );
  });

  it('leaves a line without exclusion or sub-line data unchanged', async () => {
    const { pref, res } = await lookup(null, 'CN');
    expect(pref.excludedOrigins).toEqual([]);
    expect(pref.originExcluded).toBeNull();
    expect(pref.sublines).toEqual([]);
    expect(pref.statement).toBe(CONDITIONAL);
    expect(res.notes.some((n) => n.includes('10 số'))).toBe(false);
  });

  it('reads the shorthand TQ as CN, so China-origin goods are still refused', async () => {
    const { pref, res } = await lookup(LINE, 'TQ');
    expect(res.origin).toBe('CN'); // the same value filters the anti-dumping query
    expect(pref.originExcluded).toBe(true);
    expect(pref.statement).not.toMatch(/(^|[^\d])0%/);
  });

  it('rejects an origin that is not a 2-letter code instead of answering as if it were not excluded', async () => {
    await expect(lookup(LINE, 'Trung Quốc')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats a code ND 118 does not list like no origin: names the exclusions, never "not excluded"', async () => {
    const { pref } = await lookup(LINE, 'JP');
    expect(pref.originExcluded).toBeNull();
    expect(pref.statement).toContain('; không áp dụng cho hàng xuất xứ Cộng hòa Nhân dân Trung Hoa (CN)');
  });
});

describe('TariffService — 10-digit national sub-lines (conditions.sublines)', () => {
  it('by_subline: lists every sub-line rate, never one number for the 8-digit line, keeps C/O and MFN fallback', async () => {
    const { pref, res } = await lookup(BY_SUBLINE, undefined, BY_SUBLINE_RATE);
    expect(pref.type).toBe('by_subline');
    expect(pref.percent).toBeNull();
    expect(pref.statement).toBe(
      'Theo dòng 10 số: 1601.00.10.10 - - Từ côn trùng: 0% (không áp dụng cho hàng xuất xứ Vương quốc Cam-pu-chia (KH)); ' +
        '1601.00.10.90 - - Loại khác: 5% — nếu có C/O form E hợp lệ, ngược lại 15% (MFN)',
    );
    expect(pref.sublines).toEqual([
      { code: '1601001010', codeDotted: '1601.00.10.10', desc: '- - Từ côn trùng', type: 'ad_valorem', percent: 0, excludedOrigins: ['KH'], originExcluded: null },
      { code: '1601001090', codeDotted: '1601.00.10.90', desc: '- - Loại khác', type: 'ad_valorem', percent: 5, excludedOrigins: [], originExcluded: null },
    ]);
    expect(res.notes.some((n) => n.includes('10 số'))).toBe(false); // the statement and sublines carry it now
  });

  it('by_subline with an origin a sub-line excludes: that sub-line says it does not apply, the others keep their rate', async () => {
    const { pref } = await lookup(BY_SUBLINE, 'KH', BY_SUBLINE_RATE);
    expect(pref.originExcluded).toBeNull(); // no whole-line exclusion
    expect(pref.sublines.map((s) => s.originExcluded)).toEqual([true, null]);
    expect(pref.statement).toBe(
      'Theo dòng 10 số: 1601.00.10.10 - - Từ côn trùng: không áp dụng cho Vương quốc Cam-pu-chia (KH); ' +
        '1601.00.10.90 - - Loại khác: 5% — nếu có C/O form E hợp lệ, ngược lại 15% (MFN)',
    );
  });

  it('by_subline with an origin no sub-line excludes: plain rates', async () => {
    const { pref } = await lookup(BY_SUBLINE, 'CN', BY_SUBLINE_RATE);
    expect(pref.sublines.map((s) => s.originExcluded)).toEqual([false, null]);
    expect(pref.statement).toBe(
      'Theo dòng 10 số: 1601.00.10.10 - - Từ côn trùng: 0%; 1601.00.10.90 - - Loại khác: 5% — nếu có C/O form E hợp lệ, ngược lại 15% (MFN)',
    );
  });

  it('by_subline: a "*" sub-line is "không hưởng (*)", not 0%', async () => {
    const conditions = { sublines: [sub('1508.90.00.10', '- - Dầu lạc chưa tinh chế', null), sub('1508.90.00.90', '- - Loại khác', '9')] };
    const { pref } = await lookup(conditions, undefined, BY_SUBLINE_RATE);
    expect(pref.sublines[0]).toMatchObject({ type: 'excluded', percent: null });
    expect(pref.statement).toBe(
      'Theo dòng 10 số: 1508.90.00.10 - - Dầu lạc chưa tinh chế: không hưởng (*); 1508.90.00.90 - - Loại khác: 9% — nếu có C/O form E hợp lệ, ngược lại 15% (MFN)',
    );
  });

  it('by_subline: an ad_valorem sub-line without a percent is stated as unknown, never 0%', async () => {
    // conditions.sublines is jsonb: the DB CHECK does not validate each element's rate pairing.
    const conditions = { sublines: [{ ...sub('1601.00.10.10', '- - Từ côn trùng', '0'), rate_percent: null }, sub('1601.00.10.90', '- - Loại khác', '5')] };
    const { pref } = await lookup(conditions, undefined, BY_SUBLINE_RATE);
    expect(pref.statement).toBe(
      'Theo dòng 10 số: 1601.00.10.10 - - Từ côn trùng: không rõ mức — đối chiếu nghị định; ' +
        '1601.00.10.90 - - Loại khác: 5% — nếu có C/O form E hợp lệ, ngược lại 15% (MFN)',
    );
  });

  it('uniform sub-lines keep the common rate and surface a sub-line exclusion without applying it to the whole line', async () => {
    const none = await lookup(UNIFORM);
    expect(none.pref.type).toBe('ad_valorem');
    expect(none.pref.percent).toBe('0.0000');
    expect(none.pref.originExcluded).toBeNull();
    expect(none.pref.statement).toBe(
      `${CONDITIONAL}; riêng dòng 10 số 1211.60.00.10 - - Dạng ướp lạnh hoặc đông lạnh: không áp dụng cho hàng xuất xứ Cộng hòa Liên bang Mi-an-ma (MM), Vương quốc Thái Lan (TH)`,
    );
    const th = await lookup(UNIFORM, 'TH');
    expect(th.pref.originExcluded).toBeNull();
    expect(th.pref.sublines.map((s) => s.originExcluded)).toEqual([true, null]);
    expect(th.pref.statement).toBe(
      `${CONDITIONAL}; riêng dòng 10 số 1211.60.00.10 - - Dạng ướp lạnh hoặc đông lạnh: không áp dụng cho Vương quốc Thái Lan (TH)`,
    );
    expect((await lookup(UNIFORM, 'CN')).pref.statement).toBe(CONDITIONAL);
  });

  it('uniform sub-lines without exclusions read exactly like a plain line', async () => {
    const conditions = { sublines: [sub('0307.22.00.10', '- - - Điệp', '0'), sub('0307.22.00.90', '- - - Loại khác', '0')] };
    const { pref } = await lookup(conditions, 'AU');
    expect(pref.statement).toBe(CONDITIONAL);
    expect(pref.sublines).toHaveLength(2);
  });

  it('does not repeat as a sub-line exclusion one that already covers the whole line', async () => {
    const WHOLE = {
      excluded_origins: ['ID'],
      sublines: [
        sub('4011.80.31.10', '- - - - Có hoa lốp hình chữ chi', '0', ['ID', 'MY']),
        sub('4011.80.31.90', '- - - - Loại khác', '0', ['ID']),
      ],
    };
    const id = await lookup(WHOLE, 'ID');
    expect(id.pref.originExcluded).toBe(true);
    expect(id.pref.statement).not.toContain('4011.80.31.');
    const all = (await lookup(WHOLE)).pref.statement;
    expect(all).toContain('riêng dòng 10 số 4011.80.31.10 - - - - Có hoa lốp hình chữ chi: không áp dụng cho hàng xuất xứ Ma-lay-xi-a (MY)');
    expect(all).not.toContain('Ma-lay-xi-a (MY), ');
    expect(all).not.toContain('4011.80.31.90');
  });
});

// --- FTA membership: the verifiedBy gate (R18, §5b.4) --------------------------

const SCHEDULES = [
  { schedule: 'ACFTA', members: [{ iso2: 'CN', name: 'Trung Quốc' }, { iso2: 'TH', name: 'Thái Lan' }] },
  { schedule: 'AANZFTA', members: [{ iso2: 'AU', name: 'Úc' }] },
  { schedule: 'ATIGA', members: [] as Array<{ iso2: string; name: string }> },
];
/** A table as the owner would sign it: the hash is taken over exactly these schedules. */
function signed(over: Record<string, unknown> = {}, schedules: unknown = SCHEDULES) {
  const copy = structuredClone(schedules);
  return {
    version: 1,
    verifiedBy: 'Người Xác Minh',
    verifiedAt: '2026-09-20',
    schedules: copy,
    verifiedHash: createHash('sha256').update(JSON.stringify(copy)).digest('hex'),
    ...over,
  };
}

describe('ftaMembership — only a named, unedited signature counts', () => {
  it('is null until a person signs', () => {
    expect(ftaMembership(signed({ verifiedBy: null }))).toBeNull();
    expect(ftaMembership(signed({ verifiedBy: '' }))).toBeNull();
    expect(ftaMembership(null)).toBeNull();
  });

  it('is null on a bad date, a bad ISO code or a missing hash', () => {
    expect(ftaMembership(signed({ verifiedAt: '20/09/2026' }))).toBeNull();
    expect(ftaMembership(signed({}, [{ schedule: 'ACFTA', members: [{ iso2: 'China' }] }]))).toBeNull();
    expect(ftaMembership(signed({ verifiedHash: undefined }))).toBeNull();
  });

  it('is null when a member is changed after signing', () => {
    const j = signed();
    (j.schedules as typeof SCHEDULES)[0]!.members.push({ iso2: 'JP', name: 'Nhật Bản' });
    expect(ftaMembership(j)).toBeNull();
  });

  it('reads a signed table; an empty member list is absent, never "no members"', () => {
    const m = ftaMembership(signed())!;
    expect(m.verifiedBy).toBe('Người Xác Minh');
    expect([...m.members.get('ACFTA')!]).toEqual(['CN', 'TH']);
    expect(m.members.has('ATIGA')).toBe(false);
  });
});

describe('originEligible — membership is necessary, not sufficient', () => {
  const m = ftaMembership(signed());

  it('member → true, non-member → false', () => {
    expect(originEligible(m, 'ACFTA', 'CN', null, false)).toBe(true);
    expect(originEligible(m, 'AANZFTA', 'CN', null, false)).toBe(false);
  });

  it('excluded on the line → false; excluded on a 10-digit sub-line only → null', () => {
    expect(originEligible(m, 'ACFTA', 'CN', true, false)).toBe(false);
    expect(originEligible(m, 'ACFTA', 'CN', false, true)).toBeNull();
  });

  it('null whenever the table cannot say', () => {
    const cases: Array<[typeof m, string, string | null]> = [
      [m, 'ACFTA', 'EU'], [m, 'ACFTA', 'VN'], [m, 'ACFTA', null], [null, 'ACFTA', 'CN'], [m, 'NK_uu_dai_98', 'CN'], [m, 'ATIGA', 'TH'],
    ];
    for (const [mm, schedule, origin] of cases) expect(originEligible(mm, schedule, origin, null, false)).toBeNull();
  });
});

describe('TariffService — membership and rate in the response', () => {
  async function withTable(table: unknown, conditions: Record<string, unknown> | null, origin: string) {
    const svc = new TariffService(fakeDb([MFN, acfta(conditions)]) as never);
    svc.membership = ftaMembership(table);
    return svc.lookup('0901.11.20', origin, '2026-06-01');
  }

  it('unverified table: ftaMembership null and every FTA row null', async () => {
    const res = await withTable(signed({ verifiedBy: null }), null, 'CN');
    expect(res.ftaMembership).toBeNull();
    expect(res.import.preferential[0]!.originEligible).toBeNull();
  });

  it('verified table, member origin: eligible, rate without the condition, statement unchanged', async () => {
    const res = await withTable(signed(), null, 'CN');
    const pref = res.import.preferential[0]!;
    expect(res.ftaMembership).toEqual({ verifiedBy: 'Người Xác Minh', verifiedAt: '2026-09-20' });
    expect(pref.originEligible).toBe(true);
    expect(pref.rate).toBe('0%');
    expect(pref.statement).toBe(CONDITIONAL);
  });

  it('verified table, member origin excluded on one 10-digit sub-line: null, never eligible', async () => {
    const conditions = { sublines: [sub('0901.11.20.10', '- - Loại một', '0', ['CN']), sub('0901.11.20.90', '- - Loại khác', '0')] };
    expect((await withTable(signed(), conditions, 'CN')).import.preferential[0]!.originEligible).toBeNull();
  });

  it('every FTA statement not refused by origin still carries the C/O condition (evidence invariant for Mảng 2)', async () => {
    const cases: Array<[Record<string, unknown> | null, string | undefined, Record<string, unknown>]> = [
      [null, 'CN', {}], [LINE, 'SG', {}], [BY_SUBLINE, undefined, BY_SUBLINE_RATE], [UNIFORM, 'TH', {}],
    ];
    for (const [conditions, origin, rate] of cases) {
      expect((await lookup(conditions, origin, rate)).pref.statement).toContain('nếu có C/O form');
    }
  });
});

// --- Scope line from the decree table (R7, R8, §5b.4) ---------------------------

/** The decree rows db/seed/index.ts writes, with whether any tariff line cites them. */
const DECREES: DecreeRow[] = [
  { number: '26/2023/NĐ-CP', effective_from: '2023-07-15', effective_to: null, signed_date: '2023-05-31', loaded: true },
  { number: '144/2024/NĐ-CP', effective_from: '2024-12-16', effective_to: null, signed_date: '2024-11-01', loaded: false },
  { number: '108/2025/NĐ-CP', effective_from: '2025-05-19', effective_to: null, signed_date: '2025-05-19', loaded: false },
  { number: '199/2025/NĐ-CP', effective_from: '2025-07-08', effective_to: null, signed_date: '2025-07-08', loaded: false },
  { number: '72/2026/NĐ-CP', effective_from: '2026-03-09', effective_to: '2026-04-30', signed_date: '2026-03-09', loaded: true },
  { number: '201/2026/NĐ-CP', effective_from: '2026-01-01', effective_to: null, signed_date: '2026-01-01', loaded: false },
  ...['118/2022/NĐ-CP', '121/2022/NĐ-CP', '126/2022/NĐ-CP', '116/2022/NĐ-CP'].map((number) => ({
    number, effective_from: '2022-12-30', effective_to: '2027-12-31', signed_date: '2022-12-30', loaded: true,
  })),
];

describe('stalenessView — names the loaded decree in force on the query date', () => {
  it('2026-09-13: 26/2023, not the expired 72/2026; four recorded decrees have no lines', () => {
    const v = stalenessView(DECREES, '2026-09-13', []);
    expect(v.latestInstrument).toEqual({ number: '26/2023/NĐ-CP', effectiveFrom: '2023-07-15', effectiveTo: null });
    expect(v.unloadedInstruments).toEqual(['144/2024/NĐ-CP', '108/2025/NĐ-CP', '199/2025/NĐ-CP', '201/2026/NĐ-CP']);
    expect(v.warning).toBe(
      'Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); chưa nạp dòng thuế của 4 nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.',
    );
    expect(v.pendingExtension).toBeNull();
  });

  it('2026-04-01: 72/2026 is in force and its window is printed', () => {
    const v = stalenessView(DECREES, '2026-04-01', []);
    expect(v.latestInstrument?.number).toBe('72/2026/NĐ-CP');
    expect(v.warning).toContain('NĐ 72/2026/NĐ-CP (hiệu lực 09/03/2026–30/04/2026)');
  });

  it('2023-08-01: nothing recorded is missing yet', () => {
    const v = stalenessView(DECREES, '2023-08-01', []);
    expect(v.latestInstrument?.number).toBe('26/2023/NĐ-CP');
    expect(v.unloadedInstruments).toEqual([]);
    expect(v.warning).toBe('Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); văn bản ban hành sau mốc này có thể chưa có.');
  });

  it('no decree rows: says it cannot tell', () => {
    expect(stalenessView([], '2026-09-13', []).warning).toBe(
      'Không xác định được văn bản biểu thuế đã nạp cho ngày 13/09/2026 — đối chiếu nguồn trước khi dùng.',
    );
  });

  it('a recorded extension is surfaced only up to its own end date', () => {
    const ext = ['NQ 25/2026 đến 2026-06-30 — cần nạp riêng'];
    const v = stalenessView(DECREES, '2026-05-15', ext).pendingExtension!;
    expect(v).toContain('NQ 25/2026');
    expect(v).toContain('30/06/2026');
    expect(stalenessView(DECREES, '2026-07-01', ext).pendingExtension).toBeNull();
  });

  it('the service reads the decree table once and passes this code\'s extensions through', async () => {
    const db = fakeDb([MFN, acfta(null)], { decrees: DECREES, extended: [{ extended_by: 'NQ 25/2026 đến 2026-06-30 — cần nạp riêng' }] });
    const svc = new TariffService(db as never);
    await svc.lookup('0901.11.20', undefined, '2026-05-15');
    const res = await svc.lookup('0901.11.20', undefined, '2026-05-15');
    expect(db.calls.filter((t) => t.includes('FROM decree d'))).toHaveLength(1);
    expect(res.staleness.latestInstrument?.number).toBe('26/2023/NĐ-CP');
    expect(res.staleness.pendingExtension).toContain('NQ 25/2026');
  });

  it('a failed decree read is a handled error that the next lookup retries, never an unhandled rejection', async () => {
    const db = fakeDb([MFN, acfta(null)], { decrees: DECREES });
    const real = db.execute;
    let fail = true;
    db.execute = async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql;
      if (fail && text.includes('FROM decree d')) {
        fail = false;
        db.calls.push(text);
        throw new Error('decree read failed');
      }
      if (text.includes('extended_by')) await new Promise((r) => setTimeout(r, 5)); // a slower second query
      return real(q);
    };
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled); // Node 22 exits the API process on one
    const svc = new TariffService(db as never);
    try {
      await expect(svc.lookup('0901.11.20', undefined, '2026-05-15')).rejects.toThrow('decree read failed');
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toHaveLength(0);
    const res = await svc.lookup('0901.11.20', undefined, '2026-05-15');
    expect(res.staleness.latestInstrument?.number).toBe('26/2023/NĐ-CP');
    expect(db.calls.filter((t) => t.includes('FROM decree d'))).toHaveLength(2);
  });
});

import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { TariffService } from './tariff.service';

/**
 * ND 118/2022/NĐ-CP (ACFTA) excludes named origins per tariff line, and FTA decrees detail some
 * 8-digit codes into 10-digit national sub-lines with their own rates. Serving the ACFTA 0% to an
 * excluded origin, or one sub-line's rate as the whole 8-digit line's, is the characteristic
 * wrong-but-valid answer, so these pin the statement a user reads. No database: the rate query is faked.
 */
const common = { annex: 'ACFTA', trade_direction: 'import', amount: null, amount_currency: null, amount_unit: null, out_of_quota_annex_id: null };
const MFN = { ...common, annex: 'II', schedule: 'NK_uu_dai', schedule_name: 'MFN', fta_form: null, requires_co: false, rate_type: 'ad_valorem', rate_percent: '15.0000', effective_from: '2023-07-15', effective_to: null, conditions: null, decree: '26/2023/NĐ-CP' };
const acfta = (conditions: Record<string, unknown> | null, rate: Record<string, unknown> = {}) => ({
  ...common, schedule: 'ACFTA', schedule_name: 'ASEAN–Trung Quốc (ACFTA)', fta_form: 'E', requires_co: true,
  rate_type: 'ad_valorem', rate_percent: '0.0000', effective_from: '2022-12-30', effective_to: '2027-12-31', conditions, decree: '118/2022/NĐ-CP',
  ...rate,
});

async function lookup(conditions: Record<string, unknown> | null, origin?: string, rate: Record<string, unknown> = {}) {
  const results: unknown[][] = [[MFN, acfta(conditions, rate)]]; // rate query first; goods / anti-dumping get []
  const db = { execute: async () => results.shift() ?? [] };
  const config = { get: (k: string) => ({ DATA_SNAPSHOT_DATE: '2026-09-13', GAZETTE_LAG_DAYS: '48' })[k] };
  const res = await new TariffService(db as never, config as unknown as ConfigService).lookup('0901.11.20', origin, '2026-06-01');
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

import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { TariffService } from './tariff.service';

/**
 * ND 118/2022/NĐ-CP (ACFTA) excludes named origins per tariff line. Serving the
 * ACFTA 0% to an excluded origin is the characteristic wrong-but-valid answer, so
 * these pin the statement a user reads. No database: the rate query is faked.
 */
const common = { annex: 'ACFTA', trade_direction: 'import', amount: null, amount_currency: null, amount_unit: null, out_of_quota_annex_id: null };
const MFN = { ...common, annex: 'II', schedule: 'NK_uu_dai', schedule_name: 'MFN', fta_form: null, requires_co: false, rate_type: 'ad_valorem', rate_percent: '15.0000', effective_from: '2023-07-15', effective_to: null, conditions: null, decree: '26/2023/NĐ-CP' };
const acfta = (conditions: Record<string, unknown> | null) => ({
  ...common, schedule: 'ACFTA', schedule_name: 'ASEAN–Trung Quốc (ACFTA)', fta_form: 'E', requires_co: true,
  rate_type: 'ad_valorem', rate_percent: '0.0000', effective_from: '2022-12-30', effective_to: '2027-12-31', conditions, decree: '118/2022/NĐ-CP',
});

async function lookup(conditions: Record<string, unknown> | null, origin?: string) {
  const results: unknown[][] = [[MFN, acfta(conditions)]]; // rate query first; goods / anti-dumping get []
  const db = { execute: async () => results.shift() ?? [] };
  const config = { get: (k: string) => ({ DATA_SNAPSHOT_DATE: '2026-09-13', GAZETTE_LAG_DAYS: '48' })[k] };
  const res = await new TariffService(db as never, config as unknown as ConfigService).lookup('0901.11.20', origin, '2026-06-01');
  return { res, pref: res.import.preferential[0]! };
}

const CONDITIONAL = '0% nếu có C/O form E hợp lệ, ngược lại 15% (MFN)';
const LINE = { excluded_origins: ['CN', 'MM', 'TH'] };
const SUBLINE = {
  excluded_sublines: [{ hs10: '1211600010', hs_dotted: '1211.60.00.10', desc: '- - Dạng ướp lạnh hoặc đông lạnh', rates: ['0'], excluded: ['MM', 'TH'] }],
};

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

  it('leaves a line without exclusion data unchanged', async () => {
    const { pref, res } = await lookup(null, 'CN');
    expect(pref.excludedOrigins).toEqual([]);
    expect(pref.originExcluded).toBeNull();
    expect(pref.statement).toBe(CONDITIONAL);
    expect(res.notes.some((n) => n.includes('10 số'))).toBe(false);
  });

  it('notes a 10-digit sub-line exclusion without applying it to the whole HS8 line', async () => {
    const { pref, res } = await lookup(SUBLINE, 'TH');
    expect(pref.statement).toBe(CONDITIONAL);
    expect(pref.originExcluded).toBeNull();
    const note = res.notes.find((n) => n.includes('1211.60.00.10'));
    expect(note).toContain('Vương quốc Thái Lan (TH)');
    expect(note).toContain('118/2022/NĐ-CP');
  });

  it('shows sub-line exclusions only when relevant to the given origin', async () => {
    expect((await lookup(SUBLINE, 'CN')).res.notes.some((n) => n.includes('1211.60.00.10'))).toBe(false);
    expect((await lookup(SUBLINE)).res.notes.some((n) => n.includes('1211.60.00.10'))).toBe(true);
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

  it('does not repeat as a sub-line note an exclusion that already covers the whole line', async () => {
    const WHOLE = {
      excluded_origins: ['ID'],
      excluded_sublines: [
        { hs10: '4011803110', hs_dotted: '4011.80.31.10', desc: '- - - - Có hoa lốp hình chữ chi', rates: ['0'], excluded: ['ID', 'MY'] },
        { hs10: '4011803190', hs_dotted: '4011.80.31.90', desc: '- - - - Loại khác', rates: ['0'], excluded: ['ID'] },
      ],
    };
    const id = await lookup(WHOLE, 'ID');
    expect(id.pref.originExcluded).toBe(true);
    expect(id.res.notes.some((n) => n.includes('4011.80.31.'))).toBe(false);
    const note = (await lookup(WHOLE)).res.notes.find((n) => n.includes('4011.80.31.10'))!;
    expect(note).toContain('Ma-lay-xi-a (MY)');
    expect(note).not.toContain('(ID)');
    expect(note).not.toContain('4011.80.31.90');
  });
});

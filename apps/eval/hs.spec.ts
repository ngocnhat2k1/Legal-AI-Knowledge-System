import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readGoldenCases } from './hs';

/**
 * The golden-set reader is the one piece of the eval that can fail SILENTLY: a
 * mis-read file yields zero cases, and zero cases divide into a clean 0% that looks
 * like a measurement. So it is tested against the real fixture, not a fake one.
 */
describe('readGoldenCases', () => {
  it('reads id, goods description and HS from a case block', () => {
    const cases = readGoldenCases(
      [
        'cases:',
        '- id: gs-001',
        '  source: declaration',
        '  goods_description: Thép không hợp kim cán phẳng (sơn sau khi mạ kẽm), dày 0.55mm',
        '    x rộng 1360mm, carbon <0.6%',
        '  hs_code: 7210.70.12',
        '  origin: CN',
        '- id: gs-002',
        '  goods_description: Van bi bằng thép',
        '  hs_code: 8481.80.99',
      ].join('\n'),
    );

    expect(cases).toEqual([
      {
        id: 'gs-001',
        goods: 'Thép không hợp kim cán phẳng (sơn sau khi mạ kẽm), dày 0.55mm x rộng 1360mm, carbon <0.6%',
        hs: '72107012',
      },
      { id: 'gs-002', goods: 'Van bi bằng thép', hs: '84818099' },
    ]);
  });

  it('skips a case that is missing the fields the metric needs', () => {
    const cases = readGoldenCases(['- id: gs-003', '  origin: CN'].join('\n'));
    expect(cases).toEqual([]);
  });

  it('reads the real golden set — every case carries an 8-digit HS', () => {
    const cases = readGoldenCases(
      readFileSync(join(process.cwd(), 'fixtures', 'golden-set', 'cases.yaml'), 'utf8'),
    );
    // 55 curated cases as of TASK-001; the floor guards against a silent zero-read.
    expect(cases.length).toBeGreaterThanOrEqual(50);
    for (const c of cases) {
      expect(c.hs).toMatch(/^\d{8}$/);
      expect(c.goods.length).toBeGreaterThan(3);
    }
  });
});

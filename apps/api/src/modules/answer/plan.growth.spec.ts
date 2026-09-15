import { LARGE, SMALL, superLinear } from './growth.probe';
import { maskCodes, userCodes } from './plan';

// The same growth probe guards.growth.spec.ts uses: growth.probe.ts holds the method, the calibration and the limit.
// Split out of plan.spec.ts and run alone by `yarn test:growth`: a ratio read beside parallel jest workers is noise.
describe('maskCodes and userCodes run on every plan call: linear in the length of the text (Việc 5)', () => {
  it('grows linearly with the length of each shape', () => {
    const units = [' ', 'mã hs ', ', 3824', ', 2026 - 2005-06-15', ' hay là', " '", '12-', '8481 80 ', '1234567890 ', 'hs 1234567890 ', 'e khai mã 3005.10.10 được không '];
    // Distinct codes, each looked up in the book grown so far: a listed heading, or a dotted one with a bare heading none opens.
    const listed = (n: number) => Array.from({ length: n / 6 }, (_, i) => `, ${1001 + i}`).join('');
    const distinct = (n: number) => Array.from({ length: n / 15 }, (_, i) => `, ${3001 + (i % 900)}.${10 + (i % 89)}, 2826`).join('');
    for (const shape of [...units.map((unit) => (n: number) => unit.repeat(Math.ceil(n / unit.length))), listed, distinct]) {
      const [small, large] = [SMALL, LARGE].map((n) => `nhóm 3005${shape(n)}848180`);
      for (const fn of [maskCodes, userCodes]) expect(superLinear(fn, small!, large!, fn.name)).toEqual([]);
    }
  }, 300_000);
});

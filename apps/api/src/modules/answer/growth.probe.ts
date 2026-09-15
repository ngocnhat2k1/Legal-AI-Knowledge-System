/**
 * The growth probe both hot-text specs time their functions with (plan 08): guards.growth.spec.ts over adversarial prose
 * and plan.growth.spec.ts over code masking. These run on every answer inside the API event loop, so a ReDoS regression
 * there is an outage — main once carried a cubic lookbehind that took 410 ms on 800 spaces.
 *
 * Why a ratio and not a millisecond budget: the fastest of these functions takes tens of microseconds, so one lost
 * timeslice reads as a 50x slowdown and an absolute budget fails on a healthy tree. A ratio between two lengths of the
 * same input survives that — but only if both readings meet the same noise, which is what the three rules below buy.
 *
 * Interleaved and paired: a round times one small call and, right after it, one large call, and the reading is the round
 * whose large call was fastest together with the small call timed microseconds before it. Two independent minima can
 * pair a small call from before a core migration with a large call from after it, and that reading — the small side on a
 * fast core, the large side on a slow one — is how a provably linear function used to fail.
 *
 * Floored: no ratio is read off less than FLOOR_MS of large-side work. Rounds keep running until the large side has
 * spent that much, so the fastest shapes (0.09 ms a call, one timeslice away from reading 50x) settle over about a
 * hundred rounds, while a 15 ms call already drowns a stall and needs only ROUNDS. A pair too short to prove anything is
 * measured longer, never waved through by widening the gate.
 *
 * Confirmed: a first reading over the limit is re-measured over a window CONFIRM times as long, and only the second one
 * is reported. Inside jest a major GC lands in the large calls — which allocate 16x more — of a whole window and reads
 * as 5x on the heavy shapes; a real super-linear function reads the same both times. The retry costs nothing on a
 * healthy tree, since only a reading that already failed pays for it.
 *
 * Calibration on the merged tree (2026-09-15, 10 cores, node 25.7) over the 467 function × input-shape pairs the two
 * specs cover, as `yarn test:growth` runs them: 12 passes idle and 12 beside six CPU busy loops, 11,208 readings. Half
 * read 14.7, 99% under 17.4, 99.9% under 32.8, and the worst honest reading of all of them was 36.8 — verify's quote
 * check, which is O(quotes × body) by design, not a regression. No reading needed the confirming retry. The six planted
 * super-linear variants the review rounds used — the anchored quote trim in normQuote, an unbounded settling lookbehind,
 * an unbounded G6 clause head, codes.indexOf in mark, the codes scan behind BARE_HEADING, and the "…$" prefix test for
 * an hs word — are reported at x117, x148, x162, x240, x277 and x333. LIMIT sits between the two bands, 1.9x above the
 * honest worst and 1.7x under the weakest regression, and they no longer touch: before the pairing and the floor an
 * honest reading inside the parallel suite reached x124, over the weakest regression.
 */

/** Both specs build their input shapes at these two lengths. */
export const SMALL = 2_500;
export const LARGE = 40_000;
/** At this 16x length gap a linear function reads about 16 and a quadratic one about 256. */
const LIMIT = 70;
/** Large-side work a reading must be built on before it is believed. */
const FLOOR_MS = 10;
/** Rounds every reading runs even once the floor is met, so a slow call is still the fastest of several. */
const ROUNDS = 5;
/** A failing reading is confirmed over a window this many times longer before it is reported. */
const CONFIRM = 4;
/** One call on 40,000 characters over this is broken whatever its growth, so it is reported without a ratio. */
const HANG_MS = 2_000;

/** Milliseconds for one small call and for the large call timed right after it, from the round the large call won. */
const fastestPair = (fn: (text: string) => unknown, small: string, large: string, scale: number): [number, number] => {
  let [s, l, spent] = [Infinity, Infinity, 0];
  for (let round = 0; round < ROUNDS * scale || spent < FLOOR_MS * scale; round++) {
    const t0 = performance.now();
    fn(small);
    const t1 = performance.now();
    fn(large);
    const t2 = performance.now();
    if (t2 - t1 < l) [s, l] = [t1 - t0, t2 - t1];
    spent += t2 - t1;
    // A call that already reads as a hang is the report whatever the ratio, and no further round can lower it.
    if (l >= HANG_MS) break;
  }
  return [s, l];
};

/**
 * `[]` while `fn` grows linearly from `small` to `large`, else one line naming the input and the reading — the specs
 * assert `toEqual([])`, so a failure prints which shape grew and by how much.
 */
export function superLinear(fn: (text: string) => unknown, small: string, large: string, label = ''): string[] {
  fn(small);
  fn(large);
  let [s, l] = fastestPair(fn, small, large, 1);
  if (l < HANG_MS && l / s >= LIMIT) [s, l] = fastestPair(fn, small, large, CONFIRM);
  const ratio = l / s;
  if (l < HANG_MS && ratio < LIMIT) return [];
  return [`${label} ${JSON.stringify(small.slice(0, 24))}: ${s.toFixed(3)} → ${l.toFixed(2)} ms per call, x${ratio.toFixed(0)} (linear is about ${LARGE / SMALL}, limit ${LIMIT}, floor ${FLOOR_MS} ms, hang ${HANG_MS} ms)`];
}

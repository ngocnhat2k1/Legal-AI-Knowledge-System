/**
 * The growth probe both hot-text specs time their functions with (plan 08): guards.spec.ts over adversarial prose and
 * plan.spec.ts over code masking. These run on every answer inside the API event loop, so a ReDoS regression there is an
 * outage — main once carried a cubic lookbehind that took 410 ms on 800 spaces.
 *
 * Why not a millisecond budget: jest shares the cores, so a thread loses its core for whole milliseconds at a time, and
 * the fastest guards take tens of microseconds, where one stall reads as a 50x slowdown. An absolute budget then fails on
 * a healthy tree and blocks the deploy. A ratio between two lengths of the same input survives it: load slows both ends.
 *
 * Method: time one call at SMALL and at LARGE characters, each as the mean of a batch repeated until the batch reaches
 * BATCH_MS (a stall is diluted over the batch, never multiplied by it), and keep the fastest of up to five pairs — noise
 * only ever adds. At this 16x length gap a linear function reads about 16 and a quadratic one about 256.
 *
 * LIMIT is calibrated on the 467 function × input-shape pairs the two specs cover (2026-09-15, 10 cores, node 25.7),
 * 15 pairs each, idle and again beside six CPU busy loops: half read 15.3, 99% under 24.2, and the worst 37.4 both times
 * — verify's quote check, which is O(quotes × body) by design, not a regression. Read through this probe inside jest the
 * same pairs peak at 33.5 idle and 44.1 beside the busy loops. Six planted super-linear variants — the anchored quote
 * trim, an unbounded settling lookbehind, an unbounded G6 clause head, codes.indexOf, the codes scan behind a bare
 * heading, and the "…$" prefix test for an hs word — fail at 119 to 346. LIMIT sits between, about 1.6x from either side.
 * process.threadCpuUsage() deltas were measured beside the wall clock and moved the readings under 7%, so the wall clock
 * stays: the fastest of five pairs already drops the stalls a busy core adds.
 */

/** Both specs build their input shapes at these two lengths. */
export const SMALL = 2_500;
export const LARGE = 40_000;
const LIMIT = 70;
const BATCH_MS = 4;
const PAIRS = 5;
/** One call on 40,000 characters over this is broken whatever its growth, so it is reported without a ratio. */
const HANG_MS = 2_000;

/** Milliseconds per call, averaged over a batch long enough to read on a shared core. */
const perCall = (fn: () => unknown): number => {
  for (let reps = 1; ; ) {
    const t0 = performance.now();
    for (let i = 0; i < reps; i++) fn();
    const ms = performance.now() - t0;
    if (ms >= BATCH_MS || reps >= 1_000_000) return ms / reps;
    reps = Math.max(reps * 2, Math.ceil((reps * BATCH_MS) / Math.max(ms, 0.001)));
  }
};

/**
 * `[]` while `fn` grows linearly from `small` to `large`, else one line naming the input and the reading — the specs
 * assert `toEqual([])`, so a failure prints which shape grew and by how much.
 */
export function superLinear(fn: (text: string) => unknown, small: string, large: string, label = ''): string[] {
  fn(small);
  fn(large);
  let [s, l] = [Infinity, Infinity];
  for (let k = 0; k < PAIRS; k++) {
    s = Math.min(s, perCall(() => fn(small)));
    l = Math.min(l, perCall(() => fn(large)));
    // A pair settles it when it reads well under the limit — four more of every shape would cost the suite minutes — or
    // when one call already reads as a hang, which is the report whatever the ratio.
    if (l / s < LIMIT / 2 || l >= HANG_MS) break;
  }
  const ratio = l / s;
  if (l < HANG_MS && ratio < LIMIT) return [];
  return [`${label} ${JSON.stringify(small.slice(0, 24))}: ${s.toFixed(3)} → ${l.toFixed(2)} ms per call, x${ratio.toFixed(0)} (linear is about ${LARGE / SMALL}, limit ${LIMIT}, hang ${HANG_MS} ms)`];
}

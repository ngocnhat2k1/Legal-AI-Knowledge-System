import { spawnSync } from 'node:child_process';

import { runClaude } from '../answer/claude';

/**
 * Whether the model layer can actually run.
 *
 * `up` requires BOTH the subscription token and the `claude` binary. Neither is fatal
 * — no model sits on the tariff path at all — but a deploy that silently lost the model
 * layer looks identical from the outside to a working one: the intent router quietly
 * falls back, /legal returns verbatim provisions with no synthesis, and image vision is
 * simply off. That is the silent-failure shape this project exists to prevent, so the
 * state is reported rather than inferred.
 *
 * Observed 2026-08-14: neither the API image nor docker-compose carried the CLI or the
 * token, so a clean deploy ran entirely without a model and nothing said so.
 */
export type LlmStatus = 'up' | 'no_token' | 'no_cli';

/**
 * What the deep probe adds. A token and a binary prove nothing about the subscription behind
 * them: on 2026-09-14 both were in place, every answer fell back on the org's monthly spend
 * limit, and /health still said `up` — the same silent failure one layer further in.
 *
 * - `error`   the CLI ran and the model refused or failed (`is_error`), or the CLI died without printing an
 *             envelope at all — crashed, OOM-killed, or answered in plain text. Both mean "read the container logs".
 * - `quota`   the refusal looks like a spend/usage limit (best effort, see QUOTA).
 * - `timeout` no answer within the probe's whole budget: the model is slow or stuck, or both process slots are busy.
 */
export type LlmDeepStatus = LlmStatus | 'error' | 'quota' | 'timeout';

let status: LlmStatus | undefined;

/** The token and the binary do not change while the process runs, so this probes once. */
export function probeLlm(): LlmStatus {
  status ??= !process.env.CLAUDE_CODE_OAUTH_TOKEN
    ? 'no_token'
    : spawnSync('claude', ['--version'], { timeout: 5_000 }).status === 0
      ? 'up'
      : 'no_cli';
  return status;
}

/** Fixed, tiny, and never built from a request: no user text may reach the model from a health call (R14). */
const DEEP_PROMPT = 'Reply with the single word: ok';

/**
 * runClaude counts this from the call, queue wait included, so a health call cannot hang behind two answers in flight —
 * it reports `timeout` instead. The budget has to clear the command's real round trip, or a healthy model is reported
 * as broken: six back-to-back runs of this exact command line on an idle laptop took 3.6, 3.8, 4.6, 6.7, 9.0 and 10.9 s
 * wall (1.7–3.6 s of that model-side, the rest CLI startup), and the target is a shared, RAM-pressured box. 30 s sits
 * well clear of that spread and is still far under nginx's proxy_read_timeout (300 s) and the answer path's own 90–120 s.
 */
const DEEP_TIMEOUT_MS = 30_000;

/** A curl loop, a dashboard or a restart storm must not each cost a spawn; still short enough to catch a limit within a deploy window. */
const DEEP_TTL_MS = 5 * 60_000;

/**
 * How long a verdict that is NOT `up` is held. Much shorter, because a failure is cheap to re-ask — a refusal never
 * reached the model, and a busy-slot `timeout` spawned nothing at all — and because the runbook tells the operator to
 * retry a `timeout` and to wait out a `quota`. Pinning those for five minutes would turn both retries into re-reads of
 * the same stale answer and hide the recovery. At 30 s a curl loop still costs at most two spawns a minute.
 */
const DEEP_FAIL_TTL_MS = 30_000;

/**
 * Best effort, and deliberately loose. The CLI has no machine-readable quota field; the limit arrives as
 * prose in the `result` string of the `--output-format json` envelope — runClaude's `text`. The wording
 * recorded on 2026-09-14 was "org's monthly spend limit" (.agent/planning/02-progress.md); on 2026-09-17 a subscription's
 * "You've hit your weekly limit · resets Sep 20, 9pm (UTC)". Matched with or
 * without `is_error`, because which of the two carries the refusal is not guaranteed; a wrong guess only
 * costs a `quota` where `error` was meant, and both mean "the model did not answer".
 */
const QUOTA = /spend limit|usage limit|weekly limit|hit your .*limit|quota|credit balance|out of credit/i;

interface DeepCache {
  /** An expiry, not a start: the verdict decides how long it is worth, and only once it arrives. */
  until: number;
  status: Promise<LlmDeepStatus>;
}

let deep: DeepCache | undefined;

/**
 * Actually asks the model, behind a TTL cache. Only for /health?llm=deep — it spawns a process and
 * spends subscription budget, and it shares the answer path's process cap through runClaude.
 */
export function probeLlmDeep(): Promise<LlmDeepStatus> {
  if (deep && Date.now() < deep.until) return deep.status;
  // Cache the promise, not the result: concurrent health calls then share one spawn instead of piling up. The full TTL
  // holds while the call is still in flight; it shrinks below once the verdict turns out to be something other than `up`.
  const entry: DeepCache = { until: Date.now() + DEEP_TTL_MS, status: askTheModel() };
  deep = entry;
  void entry.status.then(
    (verdict) => {
      if (verdict !== 'up') entry.until = Date.now() + DEEP_FAIL_TTL_MS;
    },
    () => (entry.until = 0), // a probe that threw must not pin a rejected promise for five minutes
  );
  return entry.status;
}

async function askTheModel(): Promise<LlmDeepStatus> {
  const cheap = probeLlm();
  if (cheap !== 'up') return cheap; // no token, no binary: nothing worth spawning
  // runClaude returns null for three different things — the budget ran out, the CLI died without printing an envelope,
  // and the spawn never started — and the runbook sends the operator two different ways. The clock separates them: a
  // crashed or OOM-killed CLI comes back in milliseconds (measured ~20 ms), a real hang only when the budget is spent.
  // Anything sudden is an `error`, which points at the container logs — the only place a CLI that failed on stderr
  // (a spend limit printed there included) can be read at all.
  const startedAt = Date.now();
  const res = await runClaude(DEEP_PROMPT, { timeoutMs: DEEP_TIMEOUT_MS }).catch(() => null);
  // An empty `result` counts as a failure: `up` must mean words came back, not just an envelope.
  const verdict: LlmDeepStatus = !res
    ? Date.now() - startedAt >= DEEP_TIMEOUT_MS - 1_000
      ? 'timeout'
      : 'error'
    : QUOTA.test(res.text)
      ? 'quota'
      : res.isError || !res.text.trim()
        ? 'error'
        : 'up';
  // The verdict word only. The prompt is a constant, but the model's reply is not ours to print.
  if (verdict !== 'up') console.warn(`[health] deep llm probe: ${verdict}`);
  return verdict;
}

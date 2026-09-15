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
 * - `error`   the CLI ran and the model refused or failed (`is_error`).
 * - `quota`   the refusal looks like a spend/usage limit (best effort, see QUOTA).
 * - `timeout` no answer within the probe's few seconds, or the CLI died without an envelope.
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
 * runClaude counts this from the call, queue wait included, so a health call cannot hang behind two
 * answers in flight — it reports `timeout` instead. Measured 2026-09-15 on a dev laptop: 5.5 s wall for
 * this prompt, of which 1.6 s was the model and the rest CLI startup. 10 s leaves the shared, slower
 * server some room; below that a busy box would report `timeout` at a model that is merely slow.
 */
const DEEP_TIMEOUT_MS = 10_000;

/** A curl loop, a dashboard or a restart storm must not each cost a spawn; still short enough to catch a limit within a deploy window. */
const DEEP_TTL_MS = 5 * 60_000;

/**
 * Best effort, and deliberately loose. The CLI has no machine-readable quota field; the limit arrives as
 * prose in the `result` string of the `--output-format json` envelope — runClaude's `text`. The wording
 * recorded on 2026-09-14 was "org's monthly spend limit" (.agent/planning/02-progress.md). Matched with or
 * without `is_error`, because which of the two carries the refusal is not guaranteed; a wrong guess only
 * costs a `quota` where `error` was meant, and both mean "the model did not answer".
 */
const QUOTA = /spend limit|usage limit|quota|credit balance|out of credit/i;

let deep: { at: number; status: Promise<LlmDeepStatus> } | undefined;

/**
 * Actually asks the model, behind a TTL cache. Only for /health?llm=deep — it spawns a process and
 * spends subscription budget, and it shares the answer path's process cap through runClaude.
 */
export function probeLlmDeep(): Promise<LlmDeepStatus> {
  if (deep && Date.now() - deep.at < DEEP_TTL_MS) return deep.status;
  // Cache the promise, not the result: concurrent health calls then share one spawn instead of piling up.
  deep = { at: Date.now(), status: askTheModel() };
  return deep.status;
}

async function askTheModel(): Promise<LlmDeepStatus> {
  const cheap = probeLlm();
  if (cheap !== 'up') return cheap; // no token, no binary: nothing worth spawning
  // null on timeout, on a dead CLI, and on a spawn that never started (no temp dir).
  const res = await runClaude(DEEP_PROMPT, { timeoutMs: DEEP_TIMEOUT_MS }).catch(() => null);
  // An empty `result` counts as a failure: `up` must mean words came back, not just an envelope.
  const verdict: LlmDeepStatus = !res
    ? 'timeout'
    : QUOTA.test(res.text)
      ? 'quota'
      : res.isError || !res.text.trim()
        ? 'error'
        : 'up';
  // The verdict word only. The prompt is a constant, but the model's reply is not ours to print.
  if (verdict !== 'up') console.warn(`[health] deep llm probe: ${verdict}`);
  return verdict;
}

import { spawnSync } from 'node:child_process';

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

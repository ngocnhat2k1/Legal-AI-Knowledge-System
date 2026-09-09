import { spawn } from 'node:child_process';

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

type RunCli = () => Promise<boolean>;

interface ProbeDeps {
  env?: Record<string, string | undefined>;
  run?: RunCli;
  now?: () => number;
}

/** Spawning a process on every /health hit would make a liveness probe expensive. */
const CACHE_MS = 60_000;
let cached: { at: number; status: LlmStatus } | null = null;

/** `claude --version` exits 0 when the CLI is installed and on PATH. */
const defaultRun: RunCli = () =>
  new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { timeout: 5_000 });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });

export async function probeLlm(deps: ProbeDeps = {}): Promise<LlmStatus> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  if (cached && now() - cached.at < CACHE_MS) return cached.status;

  const status: LlmStatus = !env.CLAUDE_CODE_OAUTH_TOKEN
    ? 'no_token'
    : (await (deps.run ?? defaultRun)())
      ? 'up'
      : 'no_cli';
  cached = { at: now(), status };
  return status;
}

/** Test seam: forget the cached probe. */
export function resetLlmProbe(): void {
  cached = null;
}

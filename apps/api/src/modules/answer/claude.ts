/**
 * The one way the API runs a model: `claude -p` on the subscription inside the api container. The prompt goes on STDIN,
 * not argv — a prompt carrying several verbatim sections exceeds the per-argument limit (MAX_ARG_STRLEN, 128 KB) and
 * spawn fails with E2BIG. Shared by /legal and the answer runner so timeouts and flags live in one place.
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeOpts {
  timeoutMs: number;
  /** Reasoning effort; omitted = the CLI default. The answer path composes at 'high' (owner decision 2026-09-14). */
  effort?: Effort;
  model?: string;
}

export const claudeArgs = (opts: Pick<ClaudeOpts, 'effort' | 'model'>): string[] => [
  '-p',
  ...(opts.effort ? ['--effort', opts.effort] : []),
  ...(opts.model ? ['--model', opts.model] : []),
];

export function runClaude(prompt: string, opts: ClaudeOpts): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', claudeArgs(opts), { env: { ...process.env, HOME: tmpdir() }, timeout: opts.timeoutMs });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `claude exited ${code}`))));
    child.stdin.on('error', () => {}); // ignore EPIPE if claude exits early
    child.stdin.end(prompt);
  });
}

/** The outermost `{…}` in model output, parsed; null when there is none or it does not parse. */
export function firstJson<T>(stdout: string): T | null {
  const m = String(stdout ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

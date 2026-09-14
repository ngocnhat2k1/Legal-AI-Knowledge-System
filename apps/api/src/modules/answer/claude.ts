/**
 * The one way the API runs a model: `claude -p` on the subscription inside the api container. The prompt goes on STDIN,
 * not argv — a prompt carrying several verbatim sections exceeds the per-argument limit (MAX_ARG_STRLEN, 128 KB) and
 * spawn fails with E2BIG. Shared by /legal and the answer runner so timeouts, flags and the process cap live in one place.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeOpts {
  /** Counted from the call, so time spent waiting for a process slot comes out of it. */
  timeoutMs: number;
  /** A constant of the calling step, small enough for argv. */
  systemPrompt?: string;
  /** Reasoning effort; omitted = the CLI default. The answer path composes at 'high' (owner decision 2026-09-14). */
  effort?: Effort;
  model?: string;
}

/** The `--output-format json` envelope: `result`, `is_error`, `duration_ms`. */
export interface ClaudeResult {
  text: string;
  isError: boolean;
  durationMs: number;
}

/** `--tools ""` is how `claude --help` switches off every built-in tool: the model only writes text back. */
export const claudeArgs = (opts: Pick<ClaudeOpts, 'systemPrompt' | 'effort' | 'model'>): string[] => [
  '-p',
  '--output-format',
  'json',
  '--tools',
  '',
  ...(opts.systemPrompt ? ['--system-prompt', opts.systemPrompt] : []),
  ...(opts.effort ? ['--effort', opts.effort] : []),
  ...(opts.model ? ['--model', opts.model] : []),
];

// ponytail: global cap 2, per-thread queue if rate limits bite
const MAX_PROCESSES = 2; // the dev server is shared
let running = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  if (running < MAX_PROCESSES) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

/** Hands the slot straight to the next waiter; `running` only drops when nobody waits. */
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/** null when the call times out (waiting included), the CLI is missing or dies, or stdout holds no envelope. */
export async function runClaude(prompt: string, opts: ClaudeOpts): Promise<ClaudeResult | null> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const slot = acquire();
  const timedOut = new Promise<boolean>((resolve) => signal.addEventListener('abort', () => resolve(true), { once: true }));
  if (await Promise.race([slot.then(() => false), timedOut])) {
    void slot.then(release); // the slot still arrives later; pass it on
    console.warn(`[claude] timed out after ${opts.timeoutMs} ms waiting for a process slot`);
    return null;
  }
  let cwd = '';
  try {
    // A fresh empty dir: no project files or CLAUDE.md for the CLI to pick up.
    cwd = mkdtempSync(join(tmpdir(), 'claude-'));
    return await new Promise<ClaudeResult | null>((resolve) => {
      const env = { ...process.env, HOME: tmpdir() };
      // On timeout the signal SIGKILLs the child and 'error' fires at once, even if something still holds stdout open.
      const child = spawn('claude', claudeArgs(opts), { cwd, env, signal, killSignal: 'SIGKILL' });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        console.warn(`[claude] ${signal.aborted ? `timed out after ${opts.timeoutMs} ms` : e.message}`);
        resolve(null);
      });
      child.on('close', (code, killedBy) => {
        const res = firstJson<{ result?: unknown; is_error?: unknown; duration_ms?: unknown }>(out);
        if (!res) {
          if (!signal.aborted) console.warn(`[claude] exited ${code ?? killedBy} without a result: ${err.slice(0, 200)}`);
          return resolve(null);
        }
        resolve({ text: String(res.result ?? ''), isError: Boolean(res.is_error) || code !== 0, durationMs: Number(res.duration_ms) || 0 });
      });
      child.stdin.on('error', () => {}); // ignore EPIPE if claude exits early
      child.stdin.end(prompt);
    });
  } finally {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    release();
  }
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

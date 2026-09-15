/**
 * Both probes run with a fake `claude`: `spawnSync` for the cheap one, the module mock the legal
 * generation spec already uses for the deep one. Nothing here spawns a real CLI or spends a token.
 */
const mockSpawnSync = jest.fn();
const mockRunClaude = jest.fn();
jest.mock('node:child_process', () => ({ spawnSync: (...args: unknown[]) => mockSpawnSync(...args) }));
jest.mock('../answer/claude', () => ({ runClaude: (prompt: string, opts: unknown) => mockRunClaude(prompt, opts) }));

/** A fresh copy of the module, because both probes cache in module variables. */
const load = (): typeof import('./health.llm') => require('./health.llm');

const token0 = process.env.CLAUDE_CODE_OAUTH_TOKEN;

beforeEach(() => {
  jest.resetModules();
  mockSpawnSync.mockReset();
  mockRunClaude.mockReset();
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-test-secret';
  mockSpawnSync.mockReturnValue({ status: 0 });
});

afterEach(() => {
  if (token0 === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  else process.env.CLAUDE_CODE_OAUTH_TOKEN = token0;
});

describe('probeLlm (the cheap default answer)', () => {
  it('reports no_token without ever looking for the binary', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    expect(load().probeLlm()).toBe('no_token');
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('reports up on `claude --version`, no_cli when that fails, and probes only once', () => {
    const llm = load();
    expect(llm.probeLlm()).toBe('up');
    expect(llm.probeLlm()).toBe('up');
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith('claude', ['--version'], expect.anything());

    mockSpawnSync.mockReturnValue({ status: 127 });
    jest.resetModules();
    expect(load().probeLlm()).toBe('no_cli');
  });

  it('never spawns the model itself', async () => {
    load().probeLlm();
    expect(mockRunClaude).not.toHaveBeenCalled();
  });
});

describe('probeLlmDeep (only when /health?llm=deep asks)', () => {
  const envelope = (text: string, isError = false) => ({ text, isError, durationMs: 120 });

  it('asks the model a fixed prompt with no user text and a timeout of a few seconds', async () => {
    mockRunClaude.mockResolvedValue(envelope('ok'));
    await expect(load().probeLlmDeep()).resolves.toBe('up');
    const [prompt, opts] = mockRunClaude.mock.calls[0] as [string, { timeoutMs: number }];
    expect(prompt.length).toBeLessThan(80);
    // Six back-to-back runs of this exact command line took 3.6–10.9 s on an idle laptop, and the dev box is slower:
    // a budget near the top of that spread reports `timeout` at a healthy model. Still far under nginx's 300 s.
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(30_000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(60_000);
    expect(prompt).not.toMatch(/thuế|\?/); // a constant, never a question someone asked
  });

  it('reports error when the CLI ran but the model failed, or answered nothing at all', async () => {
    mockRunClaude.mockResolvedValue(envelope('I cannot help with that', true));
    await expect(load().probeLlmDeep()).resolves.toBe('error');

    jest.resetModules();
    mockRunClaude.mockResolvedValue(envelope(''));
    await expect(load().probeLlmDeep()).resolves.toBe('error');
  });

  it('reports quota on the spend-limit wording, is_error set or not', async () => {
    mockRunClaude.mockResolvedValue(envelope("Claude Code is unavailable: you have reached your org's monthly spend limit", true));
    await expect(load().probeLlmDeep()).resolves.toBe('quota');

    jest.resetModules();
    mockRunClaude.mockResolvedValue(envelope('Claude AI usage limit reached, resets at 09:00'));
    await expect(load().probeLlmDeep()).resolves.toBe('quota');
  });

  /**
   * runClaude returns null for three different things, and the runbook sends the operator two different ways:
   * `timeout` says "slow or busy, retry", `error` says "read the container logs". A CLI that was OOM-killed or
   * crashed returns null in milliseconds and belongs in the second group — the logs are the only place its stderr
   * (a spend limit printed there included) can be read.
   */
  it('reports error, not timeout, when the runner comes back empty straight away', async () => {
    mockRunClaude.mockResolvedValue(null);
    await expect(load().probeLlmDeep()).resolves.toBe('error');

    jest.resetModules();
    mockRunClaude.mockRejectedValue(new Error('no temp dir'));
    await expect(load().probeLlmDeep()).resolves.toBe('error');
  });

  it('reports timeout only when the runner actually spent its whole budget', async () => {
    jest.useFakeTimers();
    try {
      mockRunClaude.mockImplementation(async (_prompt: string, opts: { timeoutMs: number }) => {
        jest.advanceTimersByTime(opts.timeoutMs);
        return null;
      });
      await expect(load().probeLlmDeep()).resolves.toBe('timeout');
    } finally {
      jest.useRealTimers();
    }
  });

  it('answers no_cli and no_token from the cheap probe without spawning the model', async () => {
    mockSpawnSync.mockReturnValue({ status: 127 });
    await expect(load().probeLlmDeep()).resolves.toBe('no_cli');

    jest.resetModules();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    await expect(load().probeLlmDeep()).resolves.toBe('no_token');
    expect(mockRunClaude).not.toHaveBeenCalled();
  });

  it('caches for its TTL and shares one spawn between concurrent calls: a health loop cannot burn the subscription', async () => {
    jest.useFakeTimers();
    try {
      mockRunClaude.mockResolvedValue(envelope('ok'));
      const llm = load();
      await expect(Promise.all([llm.probeLlmDeep(), llm.probeLlmDeep()])).resolves.toEqual(['up', 'up']);
      await expect(llm.probeLlmDeep()).resolves.toBe('up');
      expect(mockRunClaude).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5 * 60_000 + 1);
      await expect(llm.probeLlmDeep()).resolves.toBe('up');
      expect(mockRunClaude).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * The runbook tells the operator to retry a `timeout` and to wait out a `quota`. Both are lies if every retry inside
   * five minutes re-reads the same cached verdict — and a busy-slot `timeout` costs nothing to re-ask, because it never
   * spawned anything. So only `up` earns the full TTL.
   */
  it('holds up for the full TTL but re-checks a failure within the minute', async () => {
    jest.useFakeTimers();
    try {
      mockRunClaude.mockResolvedValue(envelope("reached your org's monthly spend limit", true));
      const llm = load();
      await expect(llm.probeLlmDeep()).resolves.toBe('quota');

      jest.advanceTimersByTime(5_000);
      await expect(llm.probeLlmDeep()).resolves.toBe('quota');
      expect(mockRunClaude).toHaveBeenCalledTimes(1); // a curl loop still cannot spawn per call

      jest.advanceTimersByTime(60_000);
      mockRunClaude.mockResolvedValue(envelope('ok'));
      await expect(llm.probeLlmDeep()).resolves.toBe('up'); // recovery is visible without restarting the container
      expect(mockRunClaude).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs the verdict only: never the model text, never the token', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockRunClaude.mockResolvedValue(envelope("reached your org's monthly spend limit, secret sk-test-secret", true));
      await expect(load().probeLlmDeep()).resolves.toBe('quota');
      const logged = warn.mock.calls.flat().join('\n');
      expect(logged).toContain('quota');
      expect(logged).not.toContain('sk-test-secret');
      expect(logged).not.toContain('monthly spend limit');
    } finally {
      warn.mockRestore();
    }
  });
});

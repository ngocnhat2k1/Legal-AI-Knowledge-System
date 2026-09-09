import { probeLlm, resetLlmProbe } from './health.llm';

describe('probeLlm', () => {
  const withToken = { CLAUDE_CODE_OAUTH_TOKEN: 'x' };

  beforeEach(resetLlmProbe);

  it('reports no_token when the token is absent', async () => {
    expect(await probeLlm({ env: {}, run: async () => true })).toBe('no_token');
  });

  it('reports no_cli when the token is set but the binary is missing', async () => {
    expect(await probeLlm({ env: withToken, run: async () => false })).toBe('no_cli');
  });

  it('reports up when both are present', async () => {
    expect(await probeLlm({ env: withToken, run: async () => true })).toBe('up');
  });

  it('caches the probe so /health does not spawn a process per request', async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return true;
    };
    let clock = 1_000;
    const deps = { env: withToken, run, now: () => clock };

    await probeLlm(deps);
    await probeLlm(deps);
    expect(calls).toBe(1);

    clock += 61_000;
    await probeLlm(deps);
    expect(calls).toBe(2);
  });
});

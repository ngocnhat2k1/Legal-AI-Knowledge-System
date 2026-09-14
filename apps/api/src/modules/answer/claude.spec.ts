import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeArgs, firstJson, runClaude } from './claude';

describe('claude runner helpers', () => {
  it('always asks for the JSON envelope with tools off; system prompt, effort and model only when asked', () => {
    const base = ['-p', '--output-format', 'json', '--tools', ''];
    expect(claudeArgs({})).toEqual(base);
    expect(claudeArgs({ effort: 'high' })).toEqual([...base, '--effort', 'high']);
    expect(claudeArgs({ systemPrompt: 'S', effort: 'medium', model: 'opus' })).toEqual([
      ...base, '--system-prompt', 'S', '--effort', 'medium', '--model', 'opus',
    ]);
  });

  it('reads the JSON object out of chatter and returns null when there is none or it is broken', () => {
    expect(firstJson<{ a: number }>('Đây là kết quả:\n{"a": 1}\n')).toEqual({ a: 1 });
    expect(firstJson('không có JSON')).toBeNull();
    expect(firstJson('{"a": ')).toBeNull();
  });
});

describe('runClaude against a fake claude first on PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  const path0 = process.env.PATH;

  beforeAll(() => {
    mkdirSync(join(dir, 'live'));
    // The fake sits in live/ while it "thinks", so each count it logs is how many copies were alive at that moment.
    writeFileSync(
      join(dir, 'claude'),
      `#!${process.execPath}
const fs = require('fs');
const dir = ${JSON.stringify(dir)};
let prompt = '';
process.stdin.on('data', (d) => (prompt += d)).on('end', () => {
  if (prompt === 'sleep') return setTimeout(() => {}, 5000);
  fs.writeFileSync(dir + '/call.json', JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), files: fs.readdirSync('.'), prompt }));
  const me = dir + '/live/' + process.pid;
  fs.writeFileSync(me, '');
  fs.appendFileSync(dir + '/counts', fs.readdirSync(dir + '/live').length + '\\n');
  setTimeout(() => {
    fs.unlinkSync(me);
    process.stdout.write(JSON.stringify({ type: 'result', result: 'đáp: ' + prompt, is_error: prompt === 'fail', duration_ms: 1234 }));
  }, 300);
});
`,
    );
    chmodSync(join(dir, 'claude'), 0o755);
    process.env.PATH = `${dir}:${path0}`;
  });

  afterAll(() => {
    process.env.PATH = path0;
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps the envelope to text, isError and durationMs', async () => {
    await expect(runClaude('câu hỏi', { timeoutMs: 10_000 })).resolves.toEqual({ text: 'đáp: câu hỏi', isError: false, durationMs: 1234 });
    await expect(runClaude('fail', { timeoutMs: 10_000 })).resolves.toMatchObject({ isError: true });
  });

  it('passes the flags on argv and the prompt on stdin, from a fresh empty temp dir it removes afterwards', async () => {
    await runClaude('câu hỏi', { timeoutMs: 10_000, systemPrompt: 'Bạn là trợ lý.', effort: 'low', model: 'sonnet' });
    const call = JSON.parse(readFileSync(join(dir, 'call.json'), 'utf8'));
    expect(call.argv).toEqual(['-p', '--output-format', 'json', '--tools', '', '--system-prompt', 'Bạn là trợ lý.', '--effort', 'low', '--model', 'sonnet']);
    expect(call.prompt).toBe('câu hỏi');
    expect(call.files).toEqual([]);
    expect(call.cwd.startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(existsSync(call.cwd)).toBe(false);
  });

  it('resolves null within timeout + 1 s, time spent queued included', async () => {
    const t0 = Date.now();
    const res = await Promise.all([
      runClaude('sleep', { timeoutMs: 500 }),
      runClaude('sleep', { timeoutMs: 500 }),
      runClaude('queued', { timeoutMs: 300 }), // waits behind the two sleepers and gives up before a slot frees
    ]);
    expect(res).toEqual([null, null, null]);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('never runs more than 2 claude processes at once; the third waits its turn', async () => {
    writeFileSync(join(dir, 'counts'), '');
    const res = await Promise.all(['a', 'b', 'c'].map((p) => runClaude(p, { timeoutMs: 10_000 })));
    expect(res.map((r) => r?.text)).toEqual(['đáp: a', 'đáp: b', 'đáp: c']);
    const counts = readFileSync(join(dir, 'counts'), 'utf8').trim().split('\n').map(Number);
    expect(counts).toHaveLength(3);
    expect(Math.max(...counts)).toBe(2);
  });
});

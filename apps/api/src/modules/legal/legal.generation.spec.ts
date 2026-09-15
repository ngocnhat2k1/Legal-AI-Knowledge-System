import { runClaude } from '../answer/claude';
import { buildPrompt, generate } from './legal.generation';

jest.mock('../answer/claude', () => ({ runClaude: jest.fn() }));

describe('buildPrompt', () => {
  it('asks for every figure as the source writes it: numberMarkers empties "20 triệu đồng" against "20.000.000 đồng" (R10)', () => {
    expect(buildPrompt('mức phạt', '2026-09-15', [])).toContain('không quy đổi đơn vị');
  });
});

describe('generate', () => {
  const token0 = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  beforeAll(() => (process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test'));
  afterAll(() => {
    if (token0 === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = token0;
  });

  it('logs only the size of an is_error result, never its text (it can restate the question)', async () => {
    const text = 'Bạn hỏi thuế nhập khẩu của máy kiểm tra điện trở';
    (runClaude as jest.Mock).mockResolvedValueOnce({ text, isError: true, durationMs: 1 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(generate('thuế máy kiểm tra điện trở', '2026-09-14', [])).resolves.toBeNull();
      const logged = warn.mock.calls.flat().join('\n');
      expect(logged).toContain(`is_error (${text.length} chars)`);
      expect(logged).not.toContain('điện trở');
    } finally {
      warn.mockRestore();
    }
  });
});

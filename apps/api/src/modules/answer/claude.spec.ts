import { claudeArgs, firstJson } from './claude';

describe('claude runner helpers', () => {
  it('adds effort and model flags only when asked', () => {
    expect(claudeArgs({})).toEqual(['-p']);
    expect(claudeArgs({ effort: 'high' })).toEqual(['-p', '--effort', 'high']);
    expect(claudeArgs({ effort: 'medium', model: 'opus' })).toEqual(['-p', '--effort', 'medium', '--model', 'opus']);
  });

  it('reads the JSON object out of chatter and returns null when there is none or it is broken', () => {
    expect(firstJson<{ a: number }>('Đây là kết quả:\n{"a": 1}\n')).toEqual({ a: 1 });
    expect(firstJson('không có JSON')).toBeNull();
    expect(firstJson('{"a": ')).toBeNull();
  });
});

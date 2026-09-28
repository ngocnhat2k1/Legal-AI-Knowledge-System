import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONTEXT_TTL_MS, contextFrom } from './conversation.mjs';

const HOUR = 60 * 60 * 1000;
/** As Postgres hands them back: `created_at::text` from a `timestamp with time zone` column. */
const at = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '+00');
const turn = (role, body, ms) => ({ role, body, intent: null, at: at(ms) });

test('hội thoại còn ấm: giữ nguyên chủ đề, trạng thái và cả bản ghi lượt', () => {
  const now = Date.now();
  const ctx = contextFrom({
    topic: 'tariff',
    state: { tariff: { hs: '84818099', dotted: '8481.80.99', at: new Date(now - 10 * 60 * 1000).toISOString() } },
    turns: [turn('user', 'van công nghiệp', now - 12 * 60 * 1000), turn('bot', 'Thuế MFN…', now - 11 * 60 * 1000)],
    idleSeconds: 11 * 60,
    staffName: 'Chi',
  });
  assert.equal(ctx.topic, 'tariff');
  assert.equal(ctx.turns.length, 2);
  assert.equal(ctx.tariffFresh, true, 'kết quả tra 10 phút trước vẫn nhận phán quyết');
});

test('im lặng quá ngưỡng: tin sau là hội thoại mới, không còn gì để trỏ tới', () => {
  const dayAgo = Date.now() - 20 * HOUR;
  const ctx = contextFrom({
    topic: 'legal',
    state: { legal: { query: 'Điều 18 Luật Hải quan' }, tariff: { hs: '84818099', at: new Date().toISOString() } },
    turns: [turn('user', 'điều 18 nói gì', dayAgo), turn('bot', 'Điều 18 quy định…', dayAgo)],
    idleSeconds: 20 * 3600,
    staffName: 'Chi',
  });
  assert.deepEqual(ctx, { topic: null, state: {}, turns: [], tariffFresh: false, candidatesFresh: false, tariff: null, legal: null });
});

test('khe nghỉ giữa các lượt: bản ghi cắt tại chỗ nghỉ, đuôi hôm qua không vào prompt', () => {
  const now = Date.now();
  const yesterday = now - 20 * HOUR;
  const ctx = contextFrom({
    topic: 'tariff',
    state: {},
    // Hôm qua hỏi pháp luật, sáng nay hỏi chuyện khác: lượt đầu của sáng nay đã lưu, nên idle chỉ còn 2 phút.
    turns: [
      turn('user', 'điều 18 nói gì', yesterday),
      turn('bot', 'Điều 18 quy định…', yesterday + 60 * 1000),
      turn('user', 'thuế mã 8481.80.99', now - 3 * 60 * 1000),
      turn('bot', 'Thuế MFN…', now - 2 * 60 * 1000),
    ],
    idleSeconds: 120,
    staffName: 'Chi',
  });
  assert.deepEqual(
    ctx.turns.map((t) => t.body),
    ['thuế mã 8481.80.99', 'Thuế MFN…'],
  );
});

test('idleSeconds không đọc được thì coi như nguội: quên còn hơn trả lời theo nhầm luồng', () => {
  const view = { topic: 'tariff', state: { tariff: { hs: '84818099' } }, turns: [turn('user', 'van', Date.now())] };
  for (const idleSeconds of [undefined, null, Number.POSITIVE_INFINITY, 'gần đây']) {
    assert.equal(contextFrom({ ...view, idleSeconds }).topic, null, `idleSeconds=${String(idleSeconds)}`);
  }
  // Đúng ngưỡng vẫn là cùng một hội thoại; hơn một giây thì không.
  assert.equal(contextFrom({ ...view, idleSeconds: CONTEXT_TTL_MS / 1000 }).topic, 'tariff');
  assert.equal(contextFrom({ ...view, idleSeconds: CONTEXT_TTL_MS / 1000 + 1 }).topic, null);
});

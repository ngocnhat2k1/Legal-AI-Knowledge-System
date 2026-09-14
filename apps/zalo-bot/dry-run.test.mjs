import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemory, recordingFetch, templateHits } from './dry-run.mjs';

test('templateHits đếm các câu khuôn mẫu cố định của câu trả lời ghép khuôn', () => {
  const reply = 'Với mô tả van, mình tra được…\nCăn cứ phân loại\n[1] Chú giải … (trích đoạn đầu)\nMã đúng thì trả lời "đúng", chưa đúng thì trả lời "sai".';
  assert.equal(templateHits(reply), 4);
  assert.equal(templateHits('Chỉ từ mô tả này thì mình chưa chốt được nhóm [1].'), 0);
});

test('chạy khô không ghi gì: phán quyết bị ghi lại, không gửi; bộ nhớ hội thoại giữ giữa các lượt', async () => {
  const memory = createMemory();
  const sent = [];
  const fetch = recordingFetch(async (url) => {
    sent.push(String(url));
    return { ok: true, status: 200, json: async () => ({}) };
  }, memory);

  await fetch('http://api:3000/tariff/confirm', { method: 'POST', body: JSON.stringify({ hs: '84818099', verdict: 'correct' }) });
  assert.deepEqual(memory.writes, [{ path: '/tariff/confirm', body: { hs: '84818099', verdict: 'correct' } }]);

  await fetch('http://api:3000/conversation/turn', {
    method: 'POST',
    body: JSON.stringify({ threadId: 't1', topic: 'tariff', state: { tariff: { hs: '84818099' } }, turns: [{ role: 'user', body: 'van' }] }),
  });
  const view = await (await fetch('http://api:3000/conversation?threadId=t1&userId=u&limit=8')).json();
  assert.equal(view.topic, 'tariff');
  assert.equal(view.state.tariff.hs, '84818099');
  assert.equal(view.turns.length, 1);

  await fetch('http://api:3000/tariff?hs=84818099&date=2026-09-14');
  assert.deepEqual(sent, ['http://api:3000/tariff?hs=84818099&date=2026-09-14'], 'chỉ lệnh đọc đi tới API thật');
});

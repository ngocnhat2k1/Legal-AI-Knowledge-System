/**
 * Tests for the branch decision — the bug that motivated conversation memory.
 *
 *   node --test apps/zalo-bot/
 *
 * These run without Zalo, without the API and without an LLM, because every function
 * under test is pure. That is the point of extracting them: the failure in production
 * was a boolean predicate, and a boolean predicate is testable.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fallbackIntent, fastPath, guardIntent } from './dispatch.mjs';
import { sanitizeLead, withLead } from './format.mjs';
import { corpusHas, parseDocRef } from './parse.mjs';

// The bot's own legal answer, as it appears in a quote. Note it carries NO HS code.
const LEGAL_ANSWER_QUOTE =
  '📚 Mình chưa tổng hợp được câu trả lời chắc chắn, nhưng đây là điều khoản liên quan nhất: 📖 Khoản 1 Điều 25 Nghị định 08/2015/NĐ-CP';
const TARIFF_ANSWER_QUOTE = '📋 8481.80.99 · CN · 2026-08-13 MFN: 12% (26/2023/NĐ-CP)';

test('THE REGRESSION: disagreeing with a LEGAL answer is not an HS correction', () => {
  // Exactly the message from the 2026-08-13 screenshot: a reply (so the old
  // `inContext = ... || !!quote` was true) containing "không phải" (so the old
  // correction cue matched) on a conversation that was about a Thông tư.
  const decision = fastPath({
    text: 'không phải câu trả lời tôi muốn. bạn tìm đúng thông tư mà tôi yêu cầu',
    quoteText: LEGAL_ANSWER_QUOTE,
    topic: 'legal',
    tariffFresh: false,
  });
  assert.equal(decision, null, 'phải để router xử lý, không được vào luồng đính chính mã HS');
});

test('THE REGRESSION: even if the router says "correction", a legal thread stays legal', () => {
  assert.equal(guardIntent('correction', { topic: 'legal', tariffFresh: false, quoteText: LEGAL_ANSWER_QUOTE }), 'legal');
});

test('disagreeing with a TARIFF answer is still a correction', () => {
  const decision = fastPath({
    text: 'sai rồi, HS đúng là 7326.90.99 theo công văn 1234/TCHQ',
    quoteText: TARIFF_ANSWER_QUOTE,
    topic: 'tariff',
    tariffFresh: true,
  });
  assert.deepEqual(decision, { action: 'correction' });
});

test('a correction works from the quoted message alone when memory has expired', () => {
  const decision = fastPath({
    text: 'mã đúng là 7326.90.99',
    quoteText: TARIFF_ANSWER_QUOTE, // contains an HS code
    topic: 'tariff',
    tariffFresh: false,
  });
  assert.deepEqual(decision, { action: 'correction' });
});

test('a reply WITHOUT an HS code and without fresh memory is not correctable', () => {
  const decision = fastPath({
    text: 'không phải, tôi hỏi cái khác',
    quoteText: 'chào bạn, mình là bot hải quan',
    topic: 'tariff',
    tariffFresh: false,
  });
  assert.equal(decision, null);
});

test('"đúng" confirms only when a tariff result is on the table', () => {
  assert.deepEqual(
    fastPath({ text: 'đúng', topic: 'tariff', tariffFresh: true }),
    { action: 'confirm', verdict: 'correct' },
  );
  // Same word, legal conversation: ordinary agreement. Must NOT write to the audit trail.
  assert.equal(fastPath({ text: 'đúng', topic: 'legal', tariffFresh: false }), null);
  // Right topic, but the result is too old to point at.
  assert.equal(fastPath({ text: 'đúng', topic: 'tariff', tariffFresh: false }), null);
});

test('"sai" as a whole message is a verdict, not a correction', () => {
  assert.deepEqual(
    fastPath({ text: 'Sai.', topic: 'tariff', tariffFresh: true }),
    { action: 'confirm', verdict: 'wrong' },
  );
});

test('a one-word verdict wins over the image branch (reply "đúng" to a photo)', () => {
  assert.deepEqual(
    fastPath({ text: 'đúng', hasImage: true, topic: 'tariff', tariffFresh: true }),
    { action: 'confirm', verdict: 'correct' },
  );
  // …but a photo with an ordinary caption goes to vision, never to correction.
  assert.equal(
    fastPath({ text: 'cái này sai mã rồi', hasImage: true, topic: 'tariff', tariffFresh: true }),
    null,
  );
});

test('a brand-new conversation never reaches a write-to-trail branch', () => {
  assert.equal(fastPath({ text: 'không phải cái đó', topic: null, tariffFresh: false }), null);
  assert.equal(guardIntent('correction', { topic: null }), 'tariff');
  assert.equal(guardIntent('confirm', { topic: null }), 'general');
});

test('"refine" belongs to whatever topic is open', () => {
  assert.equal(guardIntent('refine', { topic: 'legal' }), 'legal');
  assert.equal(guardIntent('refine', { topic: 'tariff' }), 'tariff');
  assert.equal(guardIntent('refine', { topic: null }), 'general');
});

test('an unknown intent falls back to tariff, the historical default', () => {
  assert.equal(guardIntent('nonsense', { topic: null }), 'tariff');
});

test('without an LLM the bot stays on the current topic instead of keyword-searching', () => {
  assert.equal(fallbackIntent({ topic: 'legal', text: 'không phải cái đó' }), 'legal');
  assert.equal(fallbackIntent({ topic: 'tariff', text: 'van bi từ TQ' }), 'tariff');
});

// --- The lead/facts split ---------------------------------------------------

test('a lead stating a rate is dropped — an LLM may never produce a tariff number', () => {
  assert.equal(sanitizeLead('Mặt hàng này chịu thuế 15% bạn nhé.', '📋 8481.80.99 MFN: 12%'), '');
  assert.equal(sanitizeLead('Thuế suất khoảng 7,5 % thôi.', 'MFN: 12%'), '');
});

test('a lead citing a provision is kept only if the block really cites it', () => {
  const block = '📖 Khoản 1 Điều 25 Nghị định 08/2015/NĐ-CP\n“…”';
  assert.equal(sanitizeLead('Cái bạn cần nằm ở Điều 25 nhé.', block), 'Cái bạn cần nằm ở Điều 25 nhé.');
  assert.equal(sanitizeLead('Cái bạn cần nằm ở Điều 18 nhé.', block), '');
});

test('a lead citing an HS code is kept only if the block returned it', () => {
  const block = '📋 8481.80.99 · CN';
  assert.equal(sanitizeLead('Mình tra mã 8481.80.99 nhé.', block), 'Mình tra mã 8481.80.99 nhé.');
  assert.equal(sanitizeLead('Mình tra mã 8523.52.00 nhé.', block), '');
});

test('withLead falls back to the deterministic block alone', () => {
  assert.equal(withLead('Thuế là 15%.', 'BLOCK'), 'BLOCK');
  assert.equal(withLead('Đây bạn nhé.', 'BLOCK'), 'Đây bạn nhé.\n\nBLOCK');
  assert.equal(withLead(null, 'BLOCK'), 'BLOCK');
});

// --- Document references ----------------------------------------------------

test('a named Thông tư is read as a document reference', () => {
  const ref = parseDocRef('cho mình hỏi Thông tư 38/2015/TT-BTC quy định gì');
  assert.equal(ref.core, '38/2015');
  assert.equal(ref.docType, 'thong_tu');
  assert.equal(ref.confident, true);
  assert.equal(ref.label, '38/2015/TT-BTC');
});

test('a bare number in a sentence is NOT a document reference', () => {
  // Otherwise an ordinary question mentioning a form or lot number would be answered
  // with "we do not hold that document".
  assert.equal(parseDocRef('lô hàng 09/2018 đã về chưa').confident, false);
  assert.equal(parseDocRef('không có số nào ở đây'), null);
});

test('asking for a base decree finds the VBHN that consolidates it', () => {
  const manifest = [
    { number: '46/VBHN-BTC', consolidates: '08/2015/NĐ-CP' },
    { number: '31/2018/NĐ-CP', consolidates: null },
  ];
  assert.equal(corpusHas(manifest, parseDocRef('Nghị định 08/2015/NĐ-CP')), true);
  assert.equal(corpusHas(manifest, parseDocRef('NĐ 31/2018')), true);
  assert.equal(corpusHas(manifest, parseDocRef('Thông tư 38/2015/TT-BTC')), false);
});

test('a leading zero does not hide a document', () => {
  const manifest = [{ number: '08/2015/NĐ-CP', consolidates: null }];
  assert.equal(corpusHas(manifest, parseDocRef('nghị định 8/2015')), true);
});

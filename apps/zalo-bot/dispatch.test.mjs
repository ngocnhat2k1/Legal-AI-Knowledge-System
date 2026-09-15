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

import { asksCodeFit, codebook, fallbackIntent, fastPath, guardIntent, isBareLookup, legalAboutCode, parseVerifyDocCommand, tariffReply, unmaskCodes } from './dispatch.mjs';
import { answerByHs, answerCodeCheck, answerLegal, captionForVision, handleConfirm, handleCorrection, tariffByClues } from './answer.mjs';
import {
  CAPABILITIES,
  formatAnswer,
  formatGeneral,
  formatLegal,
  formatMissingDoc,
  formatProvisions,
  sanitizeLead,
  withLead,
} from './format.mjs';
import { L, render, toText } from './render.mjs';
import { cleanGazetteTitle, docNumberStatedIn, missingKind, parseDocRef, parseQuery, parseQuotedTariff, sameDocNumber, statedDocNumber, todayVN } from './parse.mjs';
import { loadContext, nextState } from './conversation.mjs';
import { respond } from './index.mjs';

// The bot's own legal answer, as it appears in a quote. Note it carries NO HS code.
const LEGAL_ANSWER_QUOTE =
  '📚 Mình chưa tổng hợp được câu trả lời chắc chắn, nhưng đây là điều khoản liên quan nhất: 📖 Khoản 1 Điều 25 Nghị định 08/2015/NĐ-CP';
const TARIFF_ANSWER_QUOTE = 'Hàng hóa có mã HS 8481.80.99 (Vòi, van và các thiết bị tương tự) có thuế nhập khẩu ưu đãi thông thường (MFN) 10% [1].';
/** Tariff memory right after its lookup reply: a one-word verdict may answer it (conversation.mjs nextState). */
const OPEN = { hs: '84818099', open: true };

test('mã HS trong câu hỏi về danh mục văn bản là câu hỏi pháp luật; có dấu hiệu thuế thì vẫn tra thuế', () => {
  assert.equal(legalAboutCode('Mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro nào theo Thông tư 36/2026?'), true);
  assert.equal(legalAboutCode('Bóng đèn 8539.31.10 có phải kiểm tra hiệu suất năng lượng không'), true);
  assert.equal(legalAboutCode('Thuế nhập khẩu mã 8481.80.99 xuất xứ Trung Quốc là bao nhiêu phần trăm?'), false);
  assert.equal(legalAboutCode('8481.80.99 TQ'), false);
  assert.equal(legalAboutCode('Thuế 8481.80.99 theo Nghị định 26/2023'), false);
  assert.equal(legalAboutCode('Thông tư 36/2026 quy định gì về mũ bảo hiểm'), false, 'không có mã HS thì router quyết');
});

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
    table: OPEN,
  });
  assert.deepEqual(decision, { action: 'correction' });
});

test('a correction works from the quoted message alone when memory has expired, only for the code memory still holds', () => {
  const expired = { text: 'mã đúng là 7326.90.99', quoteText: TARIFF_ANSWER_QUOTE, topic: 'tariff', tariffFresh: false };
  assert.deepEqual(fastPath({ ...expired, table: { hs: '84818099' } }), { action: 'correction' });
  assert.equal(fastPath(expired), null, 'no lookup in memory (a 404, or candidates): the quote alone rules nothing');
  assert.equal(fastPath({ ...expired, table: { hs: '84818091' } }), null, 'an older lookup than the one in memory');
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
    fastPath({ text: 'đúng', topic: 'tariff', tariffFresh: true, table: OPEN }),
    { action: 'confirm', verdict: 'correct' },
  );
  // Same word, legal conversation: ordinary agreement. Must NOT write to the audit trail.
  assert.equal(fastPath({ text: 'đúng', topic: 'legal', tariffFresh: false }), null);
  // Right topic, but the result is too old to point at.
  assert.equal(fastPath({ text: 'đúng', topic: 'tariff', tariffFresh: false }), null);
});

test('"sai" as a whole message is a verdict, not a correction', () => {
  assert.deepEqual(
    fastPath({ text: 'Sai.', topic: 'tariff', tariffFresh: true, table: OPEN }),
    { action: 'confirm', verdict: 'wrong' },
  );
});

test('a one-word verdict wins over the image branch (reply "đúng" to a photo)', () => {
  assert.deepEqual(
    fastPath({ text: 'đúng', hasImage: true, topic: 'tariff', tariffFresh: true, table: OPEN }),
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
  assert.equal(guardIntent('check_code', { topic: null }), 'tariff', 'kế hoạch 08 không còn intent check_code');
});

test('without an LLM the bot stays on the current topic instead of keyword-searching', () => {
  assert.equal(fallbackIntent({ topic: 'legal', text: 'không phải cái đó' }), 'legal');
  assert.equal(fallbackIntent({ topic: 'tariff', text: 'van bi từ TQ' }), 'tariff');
  assert.equal(fallbackIntent({ topic: null, text: 'Nghị định 69/2018/NĐ-CP còn áp dụng không' }), 'legal', 'số hiệu văn bản rõ ràng không đi tra mã HS');
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
  const block = [L(['BLOCK'])];
  assert.equal(withLead('Thuế là 15%.', block), block);
  assert.equal(toText(withLead('Đây bạn nhé.', block)), 'Đây bạn nhé.\n\nBLOCK');
  assert.equal(withLead(null, block), block);
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

// --- The router may recognise an identifier, never mint one ------------------

test('a document number the user never wrote is rejected', () => {
  // Observed 2026-08-14: asked "đọc lại thông tư 36 của bộ Khoa học công nghệ" — no
  // year at all — the router returned "36/2016/TT-BKHCN", carrying the year over from
  // an earlier turn. `doc=` is trusted absolutely downstream, so that one invented
  // number redirected the whole answer onto a document nobody had named.
  assert.equal(docNumberStatedIn('đọc lại thông tư 36 của bộ Khoa học công nghệ', '36/2016/TT-BKHCN'), false);
  assert.equal(docNumberStatedIn('cho mình xem thông tư 36/2016/TT-BKHCN', '36/2016/TT-BKHCN'), true);
  // A quoted earlier message counts — the caller passes text + quote together.
  assert.equal(docNumberStatedIn('cái đó nói gì 36/2025/TT-BKHCN', '36/2025/TT-BKHCN'), true);
  // A leading zero is the same number.
  assert.equal(docNumberStatedIn('nghị định 8/2015', '08/2015/NĐ-CP'), true);
  // A digit inside a longer number must not count as a match.
  assert.equal(docNumberStatedIn('lô hàng 3620161234', '36/2016/TT-BKHCN'), false);
});

test('the router keeps an issuer only when the user wrote it (39/2018)', () => {
  // The user wrote no issuer; a guessed TT-BTC would make a document we hold look missing.
  assert.equal(statedDocNumber('Thông tư 39/2018 còn áp dụng không', '39/2018/TT-BTC'), '39/2018');
  assert.equal(statedDocNumber('39/2018/TT-BTC hết hiệu lực chưa', '39/2018/TT-BTC'), '39/2018/TT-BTC');
  assert.equal(statedDocNumber('nghị định 69/2018/nđ-cp còn áp dụng không', '69/2018/NĐ-CP'), '69/2018/NĐ-CP');
  assert.equal(statedDocNumber('văn bản 46/VBHN-BTC', '46/VBHN-BTC'), '46/VBHN-BTC');
});

test('gazette titles read as titles, not as the number three times', () => {
  // Deep listing pages prefix the number to a title that already contains it.
  assert.equal(
    cleanGazetteTitle('36/2016/NĐ-CP', '36/2016/NĐ-CP Nghị định số 36/2016/NĐ-CP về quản lý trang thiết bị y tế.'),
    'về quản lý trang thiết bị y tế.',
  );
  assert.equal(
    cleanGazetteTitle('33/2023/TT-BTC', 'Thông tư số 33/2023/TT-BTC quy định về xác định xuất xứ hàng hóa'),
    'quy định về xác định xuất xứ hàng hóa',
  );
});

test('titles are cut on a word boundary, never mid-word', () => {
  // Mid-word truncation ("trang thiết bị y t") is most of what makes a listing read as
  // machine output, so assert the cut lands exactly where a space was.
  const full = 'quy định về quản lý trang thiết bị y tế và các nội dung liên quan khác';
  const out = cleanGazetteTitle('1/2020/TT-X', full, 40);
  assert.ok(out.endsWith('…'), out);
  const body = out.slice(0, -1);
  assert.ok(full.startsWith(body), `không phải tiền tố của bản gốc: ${body}`);
  assert.equal(full[body.length], ' ', `cắt giữa từ: …${body.slice(-12)}|${full[body.length]}`);
  assert.ok(out.length <= 45, out);
});

test('a person can vouch for an auto-ingested document from chat', () => {
  // The unverified warning tells the reader to send exactly this, so it must parse.
  assert.equal(parseVerifyDocCommand('xác nhận văn bản 36/2025/TT-BKHCN'), '36/2025/TT-BKHCN');
  assert.equal(parseVerifyDocCommand('xac nhan 33/2023/TT-BTC nhé'), '33/2023/TT-BTC');
  assert.equal(parseVerifyDocCommand('duyệt văn bản 08/2015/NĐ-CP.'), '08/2015/NĐ-CP');
  // Not a vouch: no document number, or an unrelated confirmation.
  assert.equal(parseVerifyDocCommand('xác nhận đúng rồi'), null);
  assert.equal(parseVerifyDocCommand('đúng'), null);
});

// --- Tariff reply, notebook layout (spec §5b.3) ------------------------------

const GREEN = 'c_15a85f';
const ORANGE = 'c_f27806';
const RED = 'c_db342e';
const HEADING =
  'Vòi, van và các thiết bị tương tự dùng cho đường ống, thân nồi hơi, bể chứa hoặc các loại tương tự, kể cả van giảm áp và van điều chỉnh bằng nhiệt';
const WARNING =
  'Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); chưa nạp dòng thuế của 4 nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.';
const fta = (schedule, scheduleName, form, decree, over = {}) => ({
  schedule, scheduleName, type: 'ad_valorem', percent: '0', decree, form, requiresCo: true, rate: '0%',
  statement: `0% nếu có C/O form ${form} hợp lệ, ngược lại 10% (MFN)`,
  excludedOrigins: [], originExcluded: null, sublines: [], originEligible: null, ...over,
});
/** /tariff for 8481.80.99 on 13/09/2026 as seeded (spec §5b.3 example). `eligible`: originEligible per schedule. */
function tariff8481({ origin = null, verified = false, eligible = {}, acfta = {} } = {}) {
  const el = (s) => (s in eligible ? eligible[s] : null);
  return {
    hs: '84818099', origin, date: '2026-09-13',
    goods: { heading: HEADING, path: 'Vòi, van …' },
    import: {
      mfn: { schedule: 'NK_uu_dai', scheduleName: 'Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)', type: 'ad_valorem', percent: '10', decree: '26/2023/NĐ-CP', statement: '10%' },
      preferential: [
        fta('ACFTA', 'ASEAN–Trung Quốc (ACFTA)', 'E', '118/2022/NĐ-CP', { excludedOrigins: ['KH', 'PH'], originExcluded: origin ? false : null, originEligible: el('ACFTA'), ...acfta }),
        fta('AANZFTA', 'ASEAN–Úc–New Zealand (AANZFTA)', 'AANZ', '121/2022/NĐ-CP', { originEligible: el('AANZFTA') }),
        fta('ATIGA', 'ASEAN (ATIGA)', 'D', '126/2022/NĐ-CP', { originEligible: el('ATIGA') }),
        fta('EVFTA', 'Việt Nam–EU (EVFTA)', 'EUR.1/REX', '116/2022/NĐ-CP', { originEligible: el('EVFTA') }),
      ],
      outOfQuota: null,
      chapter98: [],
    },
    export: null,
    antiDumping: [],
    staleness: {
      latestInstrument: { number: '26/2023/NĐ-CP', effectiveFrom: '2023-07-15', effectiveTo: null },
      unloadedInstruments: ['144/2024/NĐ-CP', '108/2025/NĐ-CP', '199/2025/NĐ-CP', '201/2026/NĐ-CP'],
      pendingExtension: null,
      warning: WARNING,
    },
    notes: [],
    ftaMembership: verified ? { verifiedBy: 'Người Xác Minh', verifiedAt: '2026-09-20' } : null,
  };
}
const CN = { dotted: '8481.80.99', origin: 'CN', date: '2026-09-13' };
const NO_ORIGIN = { ...CN, origin: null };
const NOT_MEMBER = { AANZFTA: false, ATIGA: false, EVFTA: false };
/** A tariff reply must fit one Zalo message; returns it. */
const one = (lines) => {
  const parts = render(lines);
  assert.equal(parts.length, 1, 'câu trả lời thuế phải vừa một tin');
  return parts[0];
};
const styled = (p, st) => p.styles.filter((s) => s.st === st).map((s) => p.msg.slice(s.start, s.start + s.len));
const lineWith = (p, needle) => p.msg.split('\n').find((l) => l.includes(needle));

test('thuế CN, bảng thành viên đã xác nhận: đúng một chỗ xanh, ẩn ba biểu Trung Quốc không phải thành viên', () => {
  const p = one(formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: { ACFTA: true, ...NOT_MEMBER } }), null));
  const lead = p.msg.split('\n')[0];
  assert.ok(lead.includes('có xuất xứ') && !lead.includes('nhập khẩu từ'), 'bộ lọc dùng nước xuất xứ, không phải nước gửi hàng');
  assert.deepEqual(styled(p, GREEN), ['0%'], 'chỉ mức ACFTA được tô xanh');
  assert.ok(lineWith(p, 'Có C/O form E hợp lệ (ACFTA)').endsWith('0% [1]'));
  assert.ok(lineWith(p, 'Không có C/O ưu đãi hợp lệ').endsWith('(MFN) 10% [2]'));
  const sources = lineWith(p, 'Tra theo ngày 13/09/2026');
  assert.ok(sources.includes('[1] NĐ 118/2022/NĐ-CP') && sources.includes('[2] NĐ 26/2023/NĐ-CP'));
  assert.ok(lineWith(p, 'Đã ẩn AANZFTA, ATIGA, EVFTA'), 'phải nói rõ đã ẩn biểu nào');
  assert.ok(p.msg.split('\n').at(-1).startsWith('Mã đúng với lô hàng'), 'dòng "Đã ẩn" đã mời nhắn tên nước, dòng kết không hỏi lại');
  assert.ok(one(formatAnswer({ ...CN, origin: 'EU' }, tariff8481({ origin: 'EU', verified: true }), null)).msg.split('\n').at(-1).startsWith('Muốn xem xuất xứ khác'));
  assert.ok(styled(p, 'f_13').some((t) => t.startsWith('Đã ẩn')), 'dòng "Đã ẩn" là dòng note');
  for (const s of ['AANZFTA', 'ATIGA', 'EVFTA']) {
    assert.equal(p.msg.split('\n').filter((l) => l.includes(s)).length, 1, `${s} chỉ được nêu ở dòng "Đã ẩn"`);
  }
  // A non-member schedule stays hidden when its line is by_subline: no sub-line rate for an origin with no right to it.
  const r = tariff8481({ origin: 'CN', verified: true, eligible: { ACFTA: true, ...NOT_MEMBER } });
  const sub = (codeDotted, percent) => ({ code: codeDotted.replace(/\./g, ''), codeDotted, desc: '- - x', type: 'ad_valorem', percent, excludedOrigins: [], originExcluded: null });
  r.import.preferential[3] = { ...r.import.preferential[3], type: 'by_subline', percent: null, rate: 'Theo dòng 10 số (không có một mức chung cho mã 8 số)', sublines: [sub('8481.80.99.10', 0), sub('8481.80.99.90', 5)] };
  const bySub = one(formatAnswer(CN, r, null));
  assert.equal(bySub.msg.split('\n').filter((l) => l.includes('EVFTA')).length, 1, 'EVFTA by_subline của nước không phải thành viên chỉ nằm ở dòng "Đã ẩn"');
  assert.ok(lineWith(bySub, 'Đã ẩn').includes('EVFTA'));
  assert.ok(!bySub.msg.includes('8481.80.99.10') && !bySub.msg.includes('8481.80.99.90'), 'không in dòng 10 số của biểu đã ẩn');
  // Quoted back after memory expired: the lead names the origin that was looked up.
  assert.equal(parseQuotedTariff(toText(formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: { ACFTA: true, ...NOT_MEMBER } }), null))).origin, 'CN');
});

test('thuế CN, bảng chưa xác nhận: đủ bốn biểu, không xanh, không gợi ý đổi xuất xứ', () => {
  const p = one(formatAnswer(CN, tariff8481({ origin: 'CN' }), null));
  assert.equal(styled(p, GREEN).length, 0, 'chưa có người ký bảng thành viên thì không được tô xanh (R18)');
  assert.ok(p.msg.split('\n')[0].includes('Mình chưa lọc được các biểu FTA theo xuất xứ'));
  for (const s of ['ACFTA (form E)', 'AANZFTA (form AANZ)', 'ATIGA (form D)', 'EVFTA (form EUR.1/REX)']) assert.ok(lineWith(p, s), `thiếu dòng ${s}`);
  assert.ok(!p.msg.split('\n').at(-1).includes('nhắn tên nước'), 'chưa ký bảng thì đổi xuất xứ không đổi gì, không gợi ý');
});

test('thuế không có xuất xứ: dòng gọn, không xanh, ACFTA nêu các nước bị loại trừ ở dòng', () => {
  const p = one(formatAnswer(NO_ORIGIN, tariff8481(), null));
  assert.equal(styled(p, GREEN).length, 0);
  assert.ok(lineWith(p, 'ACFTA (form E)').includes('trừ hàng xuất xứ KH, PH'));
  // Quoted back: "ASEAN–Trung Quốc (ACFTA)" in the rows and sources is not an origin; the date is the looked-up one.
  const quoted = parseQuotedTariff(toText(formatAnswer(NO_ORIGIN, { ...tariff8481(), date: '2026-01-05' }, null)));
  assert.deepEqual([quoted.hs, quoted.origin, quoted.date], ['84818099', null, '2026-01-05']);
  // A country inside the heading in brackets is not the origin.
  assert.equal(parseQuotedTariff('Hàng hóa có mã HS 0902.10.10 (Chè (trà) xanh kiểu Nhật Bản…) có thuế nhập khẩu').origin, null);
});

test('xuất xứ bị NĐ 118 loại trừ ở dòng: "không được hưởng" màu đỏ, không con số ưu đãi, vẫn có MFN', () => {
  const r = tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { excludedOrigins: ['CN'], originExcluded: true, originEligible: false } });
  const p = one(formatAnswer(CN, r, null));
  assert.deepEqual(styled(p, RED), ['không được hưởng']);
  assert.ok(!lineWith(p, 'ACFTA (form E)').includes('%'), 'không bao giờ in mức ưu đãi cho xuất xứ bị loại trừ');
  assert.ok(p.msg.split('\n')[0].includes('(MFN) 10% [1]'));
  assert.equal(styled(p, GREEN).length, 0);
});

test('dòng loại khỏi biểu và dòng hạn ngạch không bao giờ xanh; câu dẫn dạng B', () => {
  const excluded = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { type: 'excluded', rate: 'Loại trừ khỏi biểu (không phải 0%)', originEligible: true } }), null),
  );
  assert.deepEqual(styled(excluded, RED), ['không được hưởng']);
  assert.ok(!lineWith(excluded, 'ACFTA (form E)').includes('%'));
  assert.ok(!excluded.msg.includes('phụ thuộc vào việc có C/O'));
  assert.ok(excluded.msg.split('\n')[0].includes(' áp thuế'), 'mọi biểu đã bị từ chối thì MFN là mức áp');
  const trq = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { type: 'trq', rate: 'Trong hạn ngạch 0%; ngoài hạn ngạch xem biểu ngoài hạn ngạch', originEligible: true } }), null),
  );
  assert.equal(styled(trq, GREEN).length, 0);
  assert.ok(!trq.msg.includes('phụ thuộc vào việc có C/O'));
  // A row below can still grant a preference: the lead must not read as "MFN applies".
  const open = (p) => {
    const lead = p.msg.split('\n')[0];
    assert.ok(!lead.includes(' áp thuế') && lead.includes('Mỗi mức dưới đây chỉ áp dụng khi'), lead);
  };
  open(trq);
  open(one(formatAnswer({ ...CN, origin: 'EU' }, tariff8481({ origin: 'EU', verified: true }), null)));
});

test('dòng 10 số: loại trừ ở một dòng con thì mức tô cam; by_subline in từng dòng; không xanh', () => {
  const sub = (codeDotted, desc, percent, originExcluded = null) => ({
    code: codeDotted.replace(/\./g, ''), codeDotted, desc, type: 'ad_valorem', percent, excludedOrigins: originExcluded ? ['CN'] : [], originExcluded,
  });
  const partial = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { originEligible: null, sublines: [sub('8481.80.99.10', '- - Loại một', 0, true), sub('8481.80.99.90', '- - Loại khác', 0, false)] } }), null),
  );
  assert.equal(styled(partial, GREEN).length, 0);
  assert.deepEqual(styled(partial, ORANGE).filter((t) => t !== WARNING), ['0%']);
  assert.ok(lineWith(partial, 'ACFTA (form E)').includes('riêng dòng 10 số 8481.80.99.10'));
  const bySub = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { type: 'by_subline', percent: null, rate: 'Theo dòng 10 số (không có một mức chung cho mã 8 số)', originEligible: true, sublines: [sub('8481.80.99.10', '- - Loại một', 0, false), sub('8481.80.99.90', '- - Loại khác', 5), sub('8481.80.99.91', '- - Loại lỗi dữ liệu', null)] } }), null),
  );
  assert.ok(lineWith(bySub, '8481.80.99.91').includes('không rõ mức') && !bySub.msg.includes('null%'), 'dòng 10 số thiếu mức không bao giờ in thành null% hay 0%');
  assert.equal(styled(bySub, GREEN).length, 0, 'chưa ai chốt hàng thuộc dòng 10 số nào');
  assert.ok(bySub.msg.includes('8481.80.99.10') && bySub.msg.includes('8481.80.99.90'));
  assert.ok(!lineWith(bySub, 'ACFTA (form E)').includes('%'), 'không có một con số chung cho mã 8 số');
  assert.ok(!bySub.msg.includes('phụ thuộc vào việc có C/O'));
});

test('chống bán phá giá và gia hạn chưa nạp: dòng đỏ, chữ nguyên văn từ API', () => {
  const statement = 'Chống bán phá giá 4.28% (cộng thêm thuế NK), xuất xứ CN';
  const ext = 'Mức thuế nhập khẩu ưu đãi của mã này có thể đã được NQ 25/2026 gia hạn tới 30/06/2026 nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.';
  const base = tariff8481({ origin: 'CN' });
  const r = {
    ...base,
    export: { schedule: 'XK', scheduleName: 'Biểu thuế xuất khẩu', type: 'ad_valorem', percent: '0', decree: '26/2023/NĐ-CP', statement: '0%' },
    antiDumping: [{ statement, decisionNumber: 'QĐ-TEST-01' }],
    staleness: { ...base.staleness, pendingExtension: ext },
  };
  const p = one(formatAnswer(CN, r, null));
  const red = styled(p, RED);
  assert.ok(red.some((t) => t.includes(statement) && t.includes('QĐ-TEST-01')));
  assert.ok(red.includes(ext));
  // Export and MFN share a decree, so one [n]; its label must name both schedules (R10).
  assert.ok(lineWith(p, 'Thuế xuất khẩu').endsWith('[1]'));
  assert.ok(lineWith(p, 'Tra theo ngày').includes('[1] NĐ 26/2023/NĐ-CP — Biểu thuế nhập khẩu ưu đãi (MFN, Mục I); Biểu thuế xuất khẩu'));
});

test('dòng phạm vi kho là dòng cam nguyên văn; gộp với cảnh báo nhiều nhóm thành đúng một dòng', () => {
  const lines = formatAnswer(CN, tariff8481({ origin: 'CN' }), null);
  assert.deepEqual(styled(one(lines), ORANGE), [WARNING]);
  const merged = styled(one([L(['Mặt hàng có thể thuộc nhiều nhóm — cần bạn hoặc chuyên viên chốt mã'], 'warn'), ...lines]), ORANGE);
  assert.equal(merged.length, 1, 'tối đa một dòng cảnh báo mỗi câu trả lời');
  assert.ok(merged[0].includes('nhiều nhóm') && merged[0].includes('Biểu thuế trong kho'));
});

test('dòng kết: lịch sử xác nhận thay lời mời; không lịch sử thì theo showFooter', () => {
  const r = tariff8481({ origin: 'CN' });
  const afterSources = (p) => {
    const ls = p.msg.split('\n');
    return ls.slice(ls.findIndex((l) => l.startsWith('Tra theo ngày')) + 1);
  };
  const wrong = { correct: 0, wrong: 1, unsure: 0, recent: [{ verdict: 'wrong', staffName: 'Lan', note: 'là 8481.80.91' }] };
  const hist = one(formatAnswer(CN, r, wrong));
  assert.equal(afterSources(hist).length, 1);
  assert.ok(afterSources(hist)[0].startsWith('Từng bị báo sai 1 lần'), 'lịch sử xác nhận phải còn hiện (R18)');
  assert.ok(styled(hist, ORANGE).some((t) => t.startsWith('Từng bị báo sai')));
  assert.ok(styled(hist, 'f_13').some((t) => t.startsWith('Từng bị báo sai')), 'lịch sử xác nhận là dòng note');
  assert.ok(!afterSources(hist)[0].includes('nhắn tên nước'), 'có lịch sử thì không gợi ý');
  assert.equal(afterSources(one(formatAnswer(CN, r, null))).length, 1);
  assert.equal(afterSources(one(formatAnswer(CN, r, null, { showFooter: false }))).length, 0);
});

test('chế độ ứng viên: câu dẫn có điều kiện, không xanh, không ẩn biểu (R2)', () => {
  const p = one(formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: { ACFTA: true, ...NOT_MEMBER } }), null, { candidate: true, showFooter: false }));
  assert.ok(p.msg.startsWith('Nếu hàng thuộc mã 8481.80.99'));
  assert.equal(styled(p, 'b')[0], '8481.80.99');
  assert.equal(styled(p, GREEN).length, 0, 'mức ưu đãi phụ thuộc một phân loại chưa ai chốt');
  assert.ok(!p.msg.includes('Đã ẩn'));
  for (const s of ['AANZFTA (form AANZ)', 'ATIGA (form D)', 'EVFTA (form EUR.1/REX)']) assert.ok(lineWith(p, s), `thiếu dòng ${s}`);
});

test('lời dẫn LLM có mã HS vẫn không thay được dòng ứng viên cố định', () => {
  const lines = [
    L(['Với mô tả ', ['van điều áp', 'i'], ', mình tra được các mã ứng viên dưới đây — đây là ứng viên để bạn chốt, chưa phải mã đã xác định.']),
    ...formatAnswer(CN, tariff8481({ origin: 'CN' }), null, { candidate: true, showFooter: false }),
  ];
  const text = toText(withLead('Sản phẩm này thuộc mã 8481.80.99', lines));
  assert.ok(text.startsWith('Sản phẩm này thuộc mã 8481.80.99'), 'lời dẫn khớp khối thì được giữ');
  assert.ok(text.includes('đây là ứng viên để bạn chốt, chưa phải mã đã xác định'));
});

test('cổng văn xuôi LLM: phần trăm, số hiệu, mã HS mọi dạng chỉ qua khi khối tất định có', () => {
  assert.equal(sanitizeLead('khoảng mười phần trăm', 'MFN 10%'), '');
  assert.equal(sanitizeLead('thuộc nhóm 8481 nhé', ''), '');
  assert.equal(sanitizeLead('thuộc nhóm 8481 nhé', 'Mã 8481.80.99'), 'thuộc nhóm 8481 nhé');
  assert.equal(sanitizeLead('theo Nghị định 26/2023/NĐ-CP', ''), '');
  assert.equal(sanitizeLead('theo Nghị định 26/2023/NĐ-CP', '[1] NĐ 26/2023/NĐ-CP — MFN'), 'theo Nghị định 26/2023/NĐ-CP');
  assert.equal(sanitizeLead('thuế suất tuỳ loại hàng', ''), '');
  assert.equal(sanitizeLead('Hộp kim loại chắn sóng vô tuyến', ''), 'Hộp kim loại chắn sóng vô tuyến');
});

test('cổng văn xuôi LLM: số lệch một chữ số không được coi là có trong khối', () => {
  const legal = 'Khoản 1 Điều 25 Nghị định 08/2015/NĐ-CP';
  assert.equal(sanitizeLead('theo Nghị định 6/2023/NĐ-CP', '[1] NĐ 26/2023/NĐ-CP — MFN'), '');
  assert.equal(sanitizeLead('thuộc nhóm 8180', 'Mã 8481.80.99'), '');
  assert.equal(sanitizeLead('thuộc nhóm 9910', 'Mã 8481.80.99 10 ngày'), '');
  assert.equal(sanitizeLead('thuộc nhóm 2023', 'NĐ 26/2023/NĐ-CP · Tra theo ngày 13/09/2026'), '');
  assert.equal(sanitizeLead('nằm ở Điều 2', legal), '');
  assert.equal(sanitizeLead('theo Nghị định 8/2015/NĐ-CP, Điều 25.', legal), 'theo Nghị định 8/2015/NĐ-CP, Điều 25.');
  assert.equal(sanitizeLead('thuộc mã 848180 nhé', 'Mã 8481.80.99'), 'thuộc mã 848180 nhé');
});

// --- tariffByClues against a fake API ------------------------------------------

const cand = (hs, heading, mfn) => ({ hs, hsDotted: `${hs.slice(0, 4)}.${hs.slice(4, 6)}.${hs.slice(6)}`, heading, path: `Chương ${hs.slice(0, 2)} › ${heading}`, mfn });
// /tariff/search prices MFN at CURRENT_DATE, as the real endpoint does.
const CANDS = {
  8481: [cand('84818099', 'Van loại khác', '10'), cand('84818091', 'Van bằng đồng', '5')],
  7307: [cand('73079990', 'Phụ kiện ghép nối', '15')],
  3926: [cand('39269099', 'Sản phẩm plastic khác', '15')],
  4016: [cand('40169999', 'Sản phẩm cao su khác', '10')],
};
async function byClues(clues, confirm = null, text = 'van') {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const body =
      u.pathname === '/tariff/search' ? CANDS[u.searchParams.get('prefix')] ?? []
      : u.pathname === '/tariff/confirmations/match' ? []
      : u.pathname === '/tariff/confirmations' ? confirm
      : u.pathname === '/tariff' ? tariff8481({ origin: 'CN' })
      : null;
    return { ok: body !== null, status: body !== null ? 200 : 404, json: async () => body };
  };
  try {
    return toText((await tariffByClues({ keywords: ['van'], origin: 'CN', ...clues }, text)).text);
  } finally {
    globalThis.fetch = real;
  }
}

test('ứng viên HS: MFN từ /tariff/search (giá hôm nay) không in dưới một ngày tra khác (R8)', async () => {
  const past = await byClues({ hsHints: ['8481'], date: '2024-01-01' });
  assert.match(past, /8481\.80\.91 · MFN — ·/, 'menu ngày khác không mang MFN hôm nay');
  const border = await byClues({ hsHints: ['8481', '7307'], date: '2024-01-01' });
  assert.match(border, /7307\.99\.90 · .* · MFN —/);
  assert.doesNotMatch(past + border, /· MFN \d/);
  const now = await byClues({ hsHints: ['8481'], date: new Date().toISOString().slice(0, 10) });
  assert.match(now, /8481\.80\.91 · MFN 5% ·/, 'ngày tra là hôm nay thì in MFN ứng viên');
});

test('ứng viên HS: lời dẫn LLM nêu mã HS bị bỏ, dòng đầu vẫn là dòng ứng viên cố định (R2)', async () => {
  const named = await byClues({ hsHints: ['8481', '7307'], date: '2026-09-13', lead: 'Sản phẩm này thuộc mã 7307.99.90 là hợp lý nhất.' });
  assert.ok(named.startsWith('Với mô tả van'), named.slice(0, 80));
  assert.equal(parseQuotedTariff(named).hs, '84818099', 'tin quote lại phải chỉ về mã đầu, không về mã lời dẫn nêu');
  const plain = await byClues({ hsHints: ['8481'], date: '2026-09-13', lead: 'Mình tra theo mô tả bạn gửi.' });
  assert.ok(plain.startsWith('Mình tra theo mô tả bạn gửi.'), plain.slice(0, 80));
});

test('pháp luật: API không trả lời thì không nói văn bản "không có trên Công báo"', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
  try {
    const text = toText((await answerLegal('Nghị định 69/2018/NĐ-CP còn áp dụng không')).text);
    assert.ok(!text.includes('không tìm thấy') && text.includes('Không gọi được'), text);
  } finally {
    globalThis.fetch = real;
  }
});

test('answerByHs: lỗi tra cứu viết tiếng Việt, ngày dd/mm/yyyy, không lộ thông điệp API', async () => {
  const real = globalThis.fetch;
  const q = { hs: '27101221', dotted: '2710.12.21', origin: null, date: '2026-05-15' };
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const nf = await answerByHs(q);
    assert.ok(nf.text.includes('ngày 15/05/2026') && !nf.text.includes('2026-05-15'), nf.text);
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ message: 'hs must be 8 digits' }) });
    const bad = await answerByHs(q);
    assert.ok(!bad.text.includes('hs must') && !bad.text.includes('400'), bad.text);
  } finally {
    globalThis.fetch = real;
  }
});

test('ứng viên HS nằm ranh giới vẫn in lịch sử xác nhận của mã đầu (R18)', async () => {
  const text = await byClues(
    { hsHints: ['8481', '7307'], date: '2026-09-13' },
    { correct: 0, wrong: 1, unsure: 0, recent: [{ verdict: 'wrong', staffName: 'Chuyên viên A', note: 'là 7307' }] },
  );
  assert.ok(text.includes('Từng bị báo sai 1 lần (Chuyên viên A: là 7307) — kiểm tra kỹ'), 'thiếu lịch sử báo sai');
  assert.ok(text.indexOf('Từng bị báo sai') < text.indexOf('Nhắn mã bạn chốt'), 'lịch sử đứng trước ghi chú chốt mã');
});

test('chỉ mã + xuất xứ + từ tra thuế mới tra thẳng; mã nằm trong câu hỏi về hàng thì để router đọc (2026-09-14)', () => {
  for (const t of ['8481.80.99 TQ', 'Thuế nhập khẩu mã 8481.80.99 xuất xứ Trung Quốc là bao nhiêu phần trăm?', 'Thuế nhập khẩu 2710.12.21 ngày 2026-05-15', '30051010', 'thuế nk 8481.80.99 tq form D ngày 15/05/2026', '8479.89.10 thuế của hscode này', 'thue nk 84818099 tq']) {
    assert.equal(isBareLookup(t), true, t);
  }
  for (const t of ['e có mặt hàng miếng dán bàn chân thành phần từ ngải cứu, e đang tham khảo mã này không biết được không ạ 30051010', 'giải thích mã 3005.10.10', '30051010 được không']) {
    assert.equal(isBareLookup(t), false, t);
  }
});

test('router không thấy chữ số của mã nào (R4); mỗi mã một nhãn, trả về đúng mã; số hiệu văn bản và ngày không bị che', () => {
  const book = codebook();
  assert.equal(book.mask('tham khảo nhóm 3005, mã 30051010 và 3005.90.10; lại mã 3005.10.10'), 'tham khảo nhóm [mã 1], mã [mã 2] và [mã 3]; lại mã [mã 2]');
  assert.equal(book.mask('mã HS vừa tra: 3005.10.10'), 'mã HS vừa tra: [mã 2]', 'cùng mã ở dòng trạng thái cùng nhãn');
  assert.equal(unmaskCodes('phân biệt [mã 2] và [mã 3]', book.codes), 'phân biệt 3005.10.10 và 3005.90.10');
  assert.equal(book.mask('Nghị định 26/2023/NĐ-CP ngày 31/05/2023, năm 2026'), 'Nghị định 26/2023/NĐ-CP ngày 31/05/2023, năm 2026');
  for (const [text, masked] of [
    ['khai 3005.10 được không', 'khai [mã 1] được không'],
    ['e nghĩ là 30.05 được không', 'e nghĩ là [mã 1] được không'],
    ['HS: 3005', 'HS: [mã 1]'],
    ['mã số 30.05.10.10', 'mã số [mã 1]'],
    ['nhóm hàng 3005 hay 3824', 'nhóm hàng [mã 1] hay [mã 2]'],
    ['nhóm 3005 hoặc 3824, và 3926', 'nhóm [mã 1] hoặc [mã 2], và [mã 3]'],
    ['đổi mã 3005 sang 3824.', 'đổi mã [mã 1] sang [mã 2].'],
    ['thuộc chương 30', 'thuộc chương [mã 1]'],
    ['nhóm 3005'.normalize('NFD'), 'nhóm [mã 1]'],
    ['ngày 30.05 nộp 12.50% lúc 08.30 sáng, phạt 12.50 triệu', 'ngày 30.05 nộp 12.50% lúc 08.30 sáng, phạt 12.50 triệu'],
  ]) {
    assert.equal(codebook().mask(text), masked, text);
  }
  assert.equal(asksCodeFit('vì sao miếng dán ngải cứu vào mã 30051010'), true);
  assert.equal(asksCodeFit('mã 3005.10.10 gồm những hàng gì, khác 3005.90 chỗ nào'), false);
  for (const t of [
    'vi sao mieng dan ngai cuu vao ma 30051010',
    'mã 30051010 dùng cho miếng dán ngải cứu được ko',
    'miếng dán ngải cứu mã 30051010 đc k',
    'e có mặt hàng miếng dán, e đang tham khảo mã này không biết được không ạ 30051010',
    'mã 30.05.10.10 dùng được không',
  ]) {
    assert.equal(asksCodeFit(t), true, t);
  }
  assert.equal(asksCodeFit('Xe 8703.23.51 đã qua sử dụng nhập khẩu được không'), false);
  assert.equal(asksCodeFit('Mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro nào theo Thông tư 36/2026?'), false);
});

test('lời chào trả danh sách năng lực ngay, không qua router; chú thích ảnh không mang mã vào vision (R4)', () => {
  for (const t of ['hi', 'Chào bot!', 'xin chào', 'Hello']) assert.equal(fastPath({ text: t })?.action, 'greeting', t);
  assert.equal(fastPath({ text: 'hi, mã 8481.80.99 thuế bao nhiêu' }), null);
  assert.equal(fastPath({ text: 'hi', hasImage: true }), null);
  assert.equal(captionForVision('e tham khảo mã 30051010 được không, nhóm 3005 hay 3824'), 'e tham khảo mã được không, nhóm hay');
});

test('một câu HỎI mã có sai/đúng không không bao giờ ghi sổ (R13); "đúng là <mã cũ>" vẫn xác nhận', async () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['8481.80.99 có sai không ạ', 'mã này sai không?', 'mã 8481.80.99 đúng chưa', 'sai à']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  assert.equal(fastPath({ text: 'sai rồi, HS đúng là 8481.80.91', ...fresh })?.action, 'correction');

  const tariff = { hs: '84818099', dotted: '8481.80.99', origin: null, date: '2026-09-14', desc: 'van bi bằng đồng' };
  const posted = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/tariff/confirm')) posted.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    const doubt = await handleCorrection(tariff, 'sai không, mã 8481.80.99 này', 'A', null);
    assert.equal(posted.length, 0, 'câu nhắc lại chính mã cũ mà không có từ xác nhận thì không ghi gì');
    assert.match(toText(doubt.text), /Bạn muốn xác nhận mã 8481\.80\.99 là đúng, hay đang hỏi/);
    await handleCorrection(tariff, 'đúng là 8481.80.99', 'A', null);
    assert.deepEqual(posted.map((p) => [p.hs, p.verdict]), [['84818099', 'correct']]);
  } finally {
    globalThis.fetch = real;
  }
});

test('câu hỏi viết tắt, không dấu, "hay <mã> ạ" không bao giờ ghi sổ, trên luồng tra thuế lẫn luồng ứng viên (R13)', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  const onCandidates = { topic: 'tariff', candidatesFresh: true };
  for (const text of ['mã này sai k', 'ma nay sai khong', 'mã này sai hay sao', 'hs dung la 8481.80.91 phai khong', 'mã đúng là 8481.80.91 hay 8481.80.10 ạ', 'hs đúng là 8481.80.91 đúng k']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['hs dung la 8422.90.90 phai khong', 'mã đúng là 8422.90.90 hay 3005.90.00 ạ', 'hs đúng là 8422.90.90 đúng k']) {
    assert.equal(fastPath({ text, ...onCandidates }), null, text);
  }
  for (const text of ['sai rồi ạ', 'sai rồi, HS đúng là 8481.80.91 theo CV 12/K']) assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
});

test('"tôi muốn hỏi", "ý tôi là", "không phải, <mã> cơ" không phán quyết mã vừa tra: không đi đường tắt (R13, §2.2 hàng 3 và 10)', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['tôi muốn hỏi thủ tục nhập khẩu van này', 'ý tôi là thuế VAT của mã này', 'không phải, tôi hỏi thuế xuất khẩu cơ', 'tôi muốn hỏi thuế 8481.80.91 TQ', 'không phải, 6307.90.90 cơ', 'à nhầm, ý mình là van bi']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['sai rồi, không phải loại này', 'nhầm mã rồi', 'mã này không đúng']) assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
});

test('câu đối chiếu mã được quote kèm "sai rồi" không ghi mã người dùng là sai (R13); câu tra thuế thì vẫn đính chính', () => {
  const quoteText = 'Mã 3005.10.10 bạn tham khảo thuộc nhóm 30.05, trùng một nhóm ứng viên mình tra từ mô tả hàng.';
  const text = 'sai rồi, không phải nhóm này';
  assert.equal(fastPath({ text, quoteText, topic: 'tariff', tariffFresh: false }), null);
  assert.notEqual(guardIntent('correction', { topic: 'tariff', tariffFresh: false, quoteText }), 'correction');
  assert.equal(fastPath({ text, quoteText: TARIFF_ANSWER_QUOTE, topic: 'tariff', tariffFresh: false, table: { hs: '84818099' } })?.action, 'correction');
});

async function codeCheck(q, clues) {
  const real = globalThis.fetch;
  let legalQ = null;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname === '/legal') legalQ = u.searchParams.get('q');
    const body =
      u.pathname === '/tariff/search' ? CANDS[u.searchParams.get('prefix')] ?? []
      : u.pathname === '/tariff' ? { ...tariff8481({}), goods: { heading: 'Van', path: 'Vòi, van › Van loại khác' } }
      : u.pathname === '/legal'
        ? { asOf: '2026-09-14', answer: 'Van điều chỉnh dòng chảy vào **84.81** [1].', citations: [{ documentNumber: 'CV 1810/TCHQ-TXNK', provisionLabel: 'Chú giải chi tiết HS 2022 · nhóm 84.81', verbatimText: '84.81 - Vòi, van', kind: 'en', effectiveness: 'con_hieu_luc' }] }
        : null;
    return { ok: body !== null, status: body !== null ? 200 : 404, json: async () => body };
  };
  try {
    const r = await answerCodeCheck(q, { keywords: ['van'], date: '2026-09-14', ...clues }, `van này dùng mã ${q.dotted} được không`);
    return { r, text: toText(r.text), legalQ };
  } finally {
    globalThis.fetch = real;
  }
}
const hasOrange = (lines) => lines.some((l) => l.segs.some((s) => Array.isArray(s) && s.includes('orange')));

test('đối chiếu mã người dùng nêu: mã không vào câu hỏi gửi LLM (R4), nhóm lệch ứng viên thì báo cam, căn cứ đọc từ /legal', async () => {
  const off = await codeCheck(
    { hs: '73079990', dotted: '7307.99.90', origin: null, date: '2026-09-14' },
    { hsHints: ['8481'], searchQuery: 'Căn cứ phân loại van điều chỉnh, mã [mã 1]', lead: 'Mã bạn tham khảo phù hợp với van.' },
  );
  assert.ok(!off.text.includes('phù hợp với van'), 'lời dẫn router viết trước khi có căn cứ không được in');
  assert.equal(off.r.tariff, null, 'mã người dùng không vào trí nhớ để thành tiền đề lượt sau');
  assert.match(off.legalQ, /phân biệt: 84\.81, 73\.07\. Nêu tiêu chí phân biệt/, 'nhóm người dùng chỉ là một nhóm nữa để so, sau các ứng viên');
  assert.match(off.legalQ, /chưa đủ dữ kiện thì không chốt nhóm\.$/, 'hỏi tiêu chí, không đòi phán quyết');
  assert.doesNotMatch(off.legalQ, /7307\.99\.90|73079990|\[mã|bạn|người dùng/, 'mã người dùng không được thành tiền đề');
  assert.match(off.text, /Mã 7307\.99\.90 thuộc nhóm 73\.07, chưa nằm trong các nhóm mình tra từ mô tả hàng/);
  assert.match(off.text, /Căn cứ phân loại\n[\s\S]*84\.81 \[1\][\s\S]*Chú giải chi tiết HS 2022/);
  assert.ok(!hasOrange(off.r.text), 'ứng viên do mô hình xếp, dao động giữa các lần: vắng mặt không phải cảnh báo');
  assert.equal(off.r.topic, 'legal', 'một "sai" sau đó bàn về lập luận, không ghi mã người dùng là sai vào sổ');

  const same = await codeCheck({ hs: '84818099', dotted: '8481.80.99', origin: null, date: '2026-09-14' }, { hsHints: ['8481', '7307'] });
  assert.doesNotMatch(same.legalQ, /8481\.80\.99|84818099/);
  assert.match(same.text, /thuộc nhóm 84\.81, trùng một nhóm ứng viên/);
  assert.match(same.text, /84\.81 · .*\(nhóm của mã bạn tham khảo\)/);
  assert.ok(!hasOrange(same.r.text));

  const fourth = await codeCheck({ hs: '84818099', dotted: '8481.80.99', origin: null, date: '2026-09-14' }, { hsHints: ['7307', '3926', '4016', '8481'] });
  assert.match(fourth.text, /thuộc nhóm 84\.81, trùng một nhóm ứng viên/, 'thứ hạng router dao động: nhóm thứ tư vẫn là ứng viên');
  assert.match(fourth.text, /84\.81 · .*\(nhóm của mã bạn tham khảo\)/);
  assert.ok(!hasOrange(fourth.r.text));

  const bare = await codeCheck({ hs: '84818099', dotted: '8481.80.99', origin: null, date: '2026-09-14' }, { keywords: [], hsHints: [] });
  assert.match(bare.text, /chưa tìm được nhóm ứng viên nào từ mô tả/);
  assert.equal(bare.legalQ, null, 'không mô tả hàng thì không tra từ khoá rác, không gọi /legal');
});

test('ứng viên HS không còn mô tả nào sau cổng thì không in "Với mô tả" rỗng', async () => {
  const text = await byClues({ keywords: [], hsHints: ['8481'], note: 'thuế suất 20%', date: '2026-09-13' }, null, '');
  assert.ok(text.startsWith('Mình tra được các mã ứng viên dưới đây'), text.slice(0, 80));
});

// --- Legal reply (spec §5b.6) ----------------------------------------------------

test('pháp luật: in đủ năm nguồn, một dòng cam cho văn bản tự nạp, dòng đỏ gộp theo văn bản và hiệu lực, trích đoạn giữ vế ngoại lệ', () => {
  const clause =
    'Hàng hóa nhập khẩu để gia công cho thương nhân nước ngoài theo hợp đồng gia công đã ký kết và đã đăng ký với cơ quan hải quan nơi làm thủ tục được miễn thuế nhập khẩu, trừ trường hợp hàng hóa đó được bán hoặc tiêu thụ nội địa. ' +
    'Phần còn lại của khoản quy định hồ sơ, thủ tục và thời hạn thông báo cho cơ quan hải quan. '.repeat(5);
  assert.ok(clause.indexOf('trừ trường hợp') > 140, 'fixture: vế ngoại lệ phải nằm sau ký tự 140');
  const cite = (n, doc, over = {}) => ({
    documentNumber: doc, documentTitle: 't', articleLabel: `Điều ${n} ${doc}`, provisionLabel: `Khoản 1 Điều ${n} ${doc}`,
    verbatimText: `Nội dung khoản ${n}.`, path: '', effectiveness: 'con_hieu_luc', effectiveFrom: '2020-01-01', effectiveTo: null,
    gazetteUrl: `https://congbao.chinhphu.vn/van-ban/${n}`, verification: 'verified', ...over,
  });
  const r = {
    asOf: '2026-09-13',
    answer: 'Hàng gia công được **miễn thuế** [1], trừ khi bán nội địa [2] [4].',
    citations: [
      cite(1, 'VB-A', { verbatimText: clause }),
      cite(2, 'VB-B', { effectiveness: 'het_hieu_luc_mot_phan' }),
      cite(3, 'VB-C', { verification: 'auto_unverified' }),
      cite(4, 'VB-B', { effectiveness: 'het_hieu_luc_mot_phan' }),
      cite(5, 'VB-D', { verification: 'auto_unverified' }),
    ],
  };
  const lines = formatLegal(r);
  const text = toText(lines);
  for (const n of [1, 2, 3, 4, 5]) assert.ok(text.includes(`[${n}] Khoản 1 Điều ${n}`), `thiếu nguồn [${n}] — dấu trong câu trả lời sẽ mồ côi`);
  const parts = render(lines);
  const all = (st) => parts.flatMap((p) => styled(p, st));
  assert.equal(all(ORANGE).length, 1, 'một dòng cảnh báo');
  assert.ok(all(ORANGE)[0].includes('VB-C') && all(ORANGE)[0].includes('VB-D'));
  assert.deepEqual(all(RED), ['[2] [4] VB-B hết hiệu lực một phần — kiểm tra điều khoản còn áp dụng.']);
  const src1 = text.split('\n').find((l) => l.startsWith('[1] '));
  assert.ok(src1.includes('trừ trường hợp') && src1.endsWith('(trích đoạn đầu)'), src1);
  assert.deepEqual(all('b'), ['miễn thuế']);
});

test('formatLegal: mục bằng chứng mang nhãn trên dòng nguồn, không bị báo "bot tự nạp", không sinh dòng hiệu lực đỏ', () => {
  const ev = (over) => ({
    documentNumber: '69/2018/NĐ-CP', documentTitle: 't', articleLabel: 'Tình trạng hiệu lực — 69/2018/NĐ-CP',
    provisionLabel: 'Tình trạng hiệu lực — 69/2018/NĐ-CP', verbatimText: '69/2018/NĐ-CP hết hiệu lực từ 05/09/2026.', path: '',
    effectiveness: 'con_hieu_luc', effectiveFrom: '2026-09-05', effectiveTo: null, gazetteUrl: null, verification: 'auto_unverified',
    kind: 'status', instrument: '69/2018/NĐ-CP', note: null, ...over,
  });
  const r = {
    asOf: '2026-09-14',
    answer: 'Nghị định này đã hết hiệu lực [1]; ghi chú dự án giải thích thêm [2].',
    citations: [
      ev({}),
      ev({ kind: 'note', documentNumber: '.agent/business-rules.md', provisionLabel: 'Quy tắc nghiệp vụ — R5', effectiveFrom: null,
        note: 'ghi chú nghiệp vụ hoặc tài liệu nội bộ, không phải căn cứ pháp lý', effectiveness: 'het_hieu_luc' }),
    ],
  };
  const lines = formatLegal(r);
  const parts = render(lines);
  const all = (st) => parts.flatMap((p) => styled(p, st));
  assert.equal(all(ORANGE).length, 0, 'mục bằng chứng không phải văn bản bot tự nạp');
  assert.equal(all(RED).length, 0, 'nhãn của mục bằng chứng nằm trên dòng nguồn');
  const text = toText(lines);
  assert.ok(text.includes('[2] Quy tắc nghiệp vụ — R5 (ghi chú nghiệp vụ hoặc tài liệu nội bộ, không phải căn cứ pháp lý)'), text);
});

test('formatLegal: mục tình trạng đã hết hiệu lực in một dòng đỏ từ dữ liệu, dù văn xuôi nói gì', () => {
  const r = {
    asOf: '2026-09-14',
    answer: 'Nghị định 43/2017/NĐ-CP vẫn còn hiệu lực [1].', // the model's slip seen on 14/09/2026
    citations: [{
      documentNumber: '43/2017/NĐ-CP', documentTitle: 't', articleLabel: 'Tình trạng hiệu lực — 43/2017/NĐ-CP',
      provisionLabel: 'Tình trạng hiệu lực — 43/2017/NĐ-CP', verbatimText: '43/2017/NĐ-CP hết hiệu lực từ 23/01/2026.', path: '',
      effectiveness: 'con_hieu_luc', effectiveFrom: '2026-01-23', effectiveTo: null, gazetteUrl: null, verification: 'auto_unverified',
      kind: 'status', instrument: '43/2017/NĐ-CP', note: null,
      expired: '43/2017/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 23/01/2026 theo 37/2026/NĐ-CP',
    }],
  };
  const reds = render(formatLegal(r)).flatMap((p) => styled(p, RED));
  assert.deepEqual(reds, ['[1] 43/2017/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 23/01/2026 theo 37/2026/NĐ-CP.']);
});

// --- 69/2018 (spec §5b.8) ------------------------------------------------------------

test('HỒI QUY 69/2018: số hiệu đầy đủ đi nguyên vẹn; văn bản đúng số không bị liệt kê như của cơ quan khác', () => {
  assert.equal(parseDocRef('Nghị định 69/2018/NĐ-CP còn áp dụng không').full, '69/2018/NĐ-CP');
  assert.equal(parseDocRef('69/2018').full, null);
  assert.equal(sameDocNumber('69/2018/ND-CP', '69/2018/NĐ-CP'), true);
  assert.equal(sameDocNumber('8/2015/ND-CP', '08/2015/NĐ-CP'), true);
  assert.equal(sameDocNumber('69/2018/TT-BTC', '69/2018/NĐ-CP'), false);
  const nd = { number: '69/2018/NĐ-CP', title: 'Nghị định 69/2018/NĐ-CP tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/nd' };
  const tt = { number: '69/2018/TT-BTC', title: 'Thông tư 69/2018/TT-BTC tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/tt' };
  assert.deepEqual(missingKind('69/2018/NĐ-CP', [nd, tt], 'similar'), { kind: 'exact', matches: [nd] });
  const text = toText(formatMissingDoc('69/2018/NĐ-CP', [nd, tt], 'similar'));
  assert.ok(!text.includes('cơ quan khác'), 'chính văn bản được hỏi bị trình bày như văn bản của cơ quan khác');
  assert.ok(text.includes('Trả lời "nạp"'), 'văn bản đúng số thì được đề nghị nạp');
});

test('cùng số, khác cơ quan ban hành: vẫn là văn bản khác và không được đề nghị nạp', () => {
  const tt = { number: '69/2018/TT-BTC', title: 'Thông tư 69/2018/TT-BTC tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/tt' };
  assert.equal(missingKind('69/2018/NĐ-CP', [tt], 'similar').kind, 'similar');
  const text = toText(formatMissingDoc('69/2018/NĐ-CP', [tt], 'similar'));
  assert.ok(text.includes('cùng số của cơ quan khác'));
  assert.ok(!text.includes('Trả lời "nạp"'), 'không bao giờ nạp một văn bản khác thay cho văn bản được hỏi');
});

// --- Task 5 fix round ------------------------------------------------------------

test('HỒI QUY QH13: đoạn cơ quan ban hành có chữ số vẫn thuộc số hiệu', () => {
  assert.equal(parseDocRef('Luật 107/2016/QH13').full, '107/2016/QH13');
  assert.equal(parseDocRef('Nghị quyết 1234/2021/NQ-UBTVQH14, còn hiệu lực không').full, '1234/2021/NQ-UBTVQH14');
});

test('nguyên văn theo trích dẫn: văn bản tự nạp có đúng một dòng cam (R18); hết hiệu lực toàn bộ không kèm "kiểm tra điều khoản"', () => {
  const row = (over) => ({
    documentNumber: 'VB-X', documentTitle: 't', citationLabel: 'Điều 18 VB-X', path: '', heading: null, body: 'Thân điều.',
    effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified', ...over,
  });
  const parts = render(formatProvisions([row({ effectiveness: 'het_hieu_luc', verification: 'auto_unverified' })]));
  const all = (st) => parts.flatMap((p) => styled(p, st));
  assert.equal(all(ORANGE).length, 1, 'một dòng cảnh báo');
  assert.ok(all(ORANGE)[0].startsWith('VB-X do bot tự nạp'), all(ORANGE)[0]);
  assert.deepEqual(all(RED), ['VB-X hết hiệu lực.']);
  assert.equal(render(formatProvisions([row({})])).flatMap((p) => styled(p, ORANGE)).length, 0, 'văn bản đã đối chiếu không có dòng cam');
});

// --- General reply (spec §5b.7) -------------------------------------------------------

test('formatGeneral: trả lời chung có dữ kiện bị thay bằng danh sách năng lực; danh sách giữ dạng', () => {
  for (const reply of ['Thuế khoảng 15% bạn nhé.', 'Khoảng mười phần trăm.', 'Theo Nghị định 26/2023/NĐ-CP thì được.', 'Hàng này thuộc mã 8481.80 đó.', 'Là mã HS 84818099 nhé.']) {
    assert.equal(formatGeneral(reply), CAPABILITIES, `phải bác: ${reply}`);
  }
  assert.deepEqual(formatGeneral('- a\n- b').map((l) => l.marks), [['ul'], ['ul']]);
});

test('parseQuotedTariff: tin xác nhận quote lại sau khi hết trí nhớ giữ ngày đã tra (dd/mm/yyyy), không lấy hôm nay', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  try {
    for (const origin of ['CN', null]) {
      const { text } = await handleConfirm({ hs: '84818099', dotted: '8481.80.99', origin, date: '2026-01-05' }, 'correct', 'An');
      const q = parseQuotedTariff(toText(text));
      assert.deepEqual([q.hs, q.date], ['84818099', '2026-01-05'], toText(text));
    }
  } finally {
    globalThis.fetch = real;
  }
  // Other bracketed dates (effective-from and the like) are not the looked-up date.
  assert.notEqual(parseQuotedTariff('Mã 8481.80.99 (hiệu lực từ ngày 01/07/2026).').date, '2026-07-01');
});

test('an origin code typed in capitals after the HS code is read (TQ, CN); a country name still works', () => {
  assert.equal(parseQuery('8481.80.99 TQ')?.origin, 'CN', '"8481.80.99 TQ" phải hiểu là xuất xứ Trung Quốc');
  assert.equal(parseQuery('Thuế 8481.80.99 CN bao nhiêu')?.origin, 'CN', 'mã CN viết hoa phải được đọc');
  assert.equal(parseQuery('8481.80.99 xuất xứ Trung Quốc')?.origin, 'CN', 'tên nước vẫn phải được đọc');
  assert.equal(parseQuery('8481.80.99')?.origin, null, 'không nêu xuất xứ thì để trống, không đoán');
});

// --- Plan 08 Việc 12: respond() over POST /answer, against a fake API -------------------------------------------------

const PHOTO_Q = 'miếng dán ngải cứu mã 3005.10.10 có hợp không';
/** A plan as the API returns it after normalizePlan (§2.4): made-up goods, the user's code masked. */
const plan08 = (over = {}) => ({
  intent: 'hs', understanding: 'Bạn muốn biết miếng dán ngải cứu có khai được vào mã bạn tham khảo không',
  question: 'miếng dán ngải cứu [mã 1] có hợp không', queries: [], goods: { facts: ['miếng dán ngải cứu'], missing: ['có tẩm dược chất không'] },
  refines: false, scope: { doc: null, article: null, clause: null }, keywords: ['miếng dán ngải cứu'], hsHints: [],
  origin: null, date: null, reuseLastHs: false, verdict: null, reply: null, ...over,
});
/** A planOnly response. */
const plannedOf = (plan, over = {}) => ({
  plan, codeRole: 'premise', userCodes: [], ack: 'Bạn đang muốn biết miếng dán ngải cứu có khai được vào mã bạn tham khảo không.',
  missingDoc: null, gazetteMatchKind: 'none', gazetteMatches: [], ...over,
});
const cited = (n, over) => ({
  n, key: `e:${n}`, kind: 'en', label: '', instrument: 'CV 1810/TCHQ-TXNK', hsHeading: null, quotes: [], authority: 'authoritative', note: null,
  verification: 'verified', window: 'current', expired: null, effectiveness: 'con_hieu_luc', documentNumber: 'CV 1810/TCHQ-TXNK', url: null, ...over,
});
const composedHs = {
  plan: plan08(), codeRole: 'premise', mode: 'hs', userCodes: [{ code: '3005.10.10', level: 8, heading: '30.05', exists: true, inCandidates: true }],
  answerMd: 'Chỉ từ mô tả này thì mình chưa chốt được nhóm: chỗ quyết định là miếng dán có tẩm dược chất hay không [1].',
  citations: [cited(1, { label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05', hsHeading: '30.05', quotes: ['Nhóm này bao gồm bông, gạc, băng và các sản phẩm tương tự như cao dán'] })],
  candidates: [{ hs: '30.05', level: 4, title: 'Bông, gạc, băng và các sản phẩm tương tự', evidence: [1] }, { hs: '38.24', level: 4, title: 'Các sản phẩm và chế phẩm hóa học', evidence: [1] }],
  ruling: null, missingFacts: ['có tẩm dược chất không'], coverage: 'partial', warnings: [], cut: 0, repaired: false,
  missingDoc: null, gazetteMatchKind: 'none', gazetteMatches: [], calls: 2,
};
const composedLegal = {
  ...composedHs, plan: null, codeRole: 'none', mode: 'legal', userCodes: [], candidates: [], missingFacts: [], coverage: 'full',
  answerMd: 'Hàng nhập khẩu để gia công được miễn thuế nhập khẩu [1].',
  citations: [cited(1, { kind: null, label: 'Khoản 1 Điều 9 VB-A', instrument: 'VB-A', documentNumber: 'VB-A', authority: 'binding', quotes: ['Hàng hóa nhập khẩu để gia công được miễn thuế nhập khẩu.'] })],
};

/** The API: /answer from `planned` (planOnly) and `composed`; /tariff from the 8481.80.99 fixture, 404 for `noRate`; writes succeed unless `confirmFails` (true, or the one verdict that fails). */
const fakeApi = ({ planned = null, composed = null, provision = null, noRate = [], confirmFails = false } = {}) => (path, body, u) =>
  path === '/answer' ? (body.planOnly ? planned : composed)
  : path === '/tariff' ? (noRate.includes(u.searchParams.get('hs')) ? null : tariff8481({ origin: u.searchParams.get('origin') }))
  : path === '/tariff/search' ? [cand(u.searchParams.get('prefix'), 'Sản phẩm dệt đã hoàn thiện khác', '12')]
  : path === '/tariff/confirm' ? (confirmFails === true || confirmFails === body.verdict ? null : {})
  : path === '/legal/provision' ? provision
  : null;

/** One conversation: each `say` runs respond() against `api`, then saves memory as index.mjs does. */
function conversation() {
  const memo = { topic: null, state: {}, turns: [] };
  const say = async (text, api, quote = null) => {
    const calls = [];
    const notices = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      const body = init.body ? JSON.parse(init.body) : undefined;
      if (u.pathname !== '/conversation') calls.push({ path: u.pathname, body });
      const out = u.pathname === '/conversation' ? memo : await api(u.pathname, body, u);
      return { ok: out != null, status: out != null ? 200 : 404, json: async () => out };
    };
    try {
      const ctx = await loadContext('t1', 'u1');
      const r = await respond({ text, image: null, quote: quote && { msg: quote }, ctx, senderName: 'Chuyên Viên A', threadId: 't1', userId: 'u1', notify: async (m) => notices.push(m) });
      memo.topic = r.topic ?? memo.topic;
      memo.state = nextState(memo.state, r);
      const bodies = (path) => calls.filter((x) => x.path === path).map((x) => x.body);
      return { r, text: toText(r.text), calls, notices, answers: bodies('/answer'), confirms: bodies('/tariff/confirm') };
    } finally {
      globalThis.fetch = real;
    }
  };
  return { memo, say };
}

/** A thread whose last reply is the composed hs answer: candidates 30.05 and 38.24 for "miếng dán ngải cứu". */
async function afterHs() {
  const c = conversation();
  const first = await c.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: composedHs }));
  return { ...c, reply: first.text };
}

test('Việc 12 (1): tra thuế trần không qua bước kế hoạch; văn xuôi soạn song song trên kế hoạch không mã; /answer null vẫn in khối thuế', async () => {
  for (const t of ['thuế nk 8481.80.99 tq', 'thue nk 84818099 tq']) {
    const { answers, text, notices } = await conversation().say(t, fakeApi());
    assert.equal(answers.length, 1, t);
    assert.deepEqual(
      [answers[0].planOnly, answers[0].forceIntent, answers[0].plan],
      [undefined, 'tariff', { intent: 'tariff', origin: 'CN', date: todayVN() }],
      'kế hoạch do bot dựng không có question, không mã (R4)',
    );
    assert.ok(text.startsWith('Hàng hóa có mã HS 8481.80.99') && text.includes('MFN'), text.slice(0, 80));
    assert.equal(notices.length, 0, 'tra trần không ack');
    assert.ok(Date.parse(answers[0].deadlineAt) <= Date.now() + 45_000, 'Q1: văn xuôi quá khoảng 40 s thì khối thuế đi một mình');
  }
  const prose = 'Mức ưu đãi theo FTA chỉ áp khi hàng có C/O đúng form của hiệp định.';
  const run = await conversation().say('8481.80.99 TQ', fakeApi({ composed: { mode: 'tariff', answerMd: prose, citations: [], cut: 0 } }));
  const [sent] = render(run.r.text);
  assert.ok(sent.msg.startsWith(`${prose}\n\nHàng hóa có mã HS 8481.80.99`), sent.msg.slice(0, 120));
  assert.equal(run.r.tariff.hs, '84818099', 'kết quả tra vẫn được đóng dấu để "đúng"/"sai" dùng được');
});

test('Việc 12 (2): câu hỏi mã có hợp với hàng: planOnly rồi soạn trên đúng kế hoạch đó; ack đúng một lần, không chữ số; state không giữ mã người dùng', async () => {
  const c = conversation();
  const planned = plannedOf(plan08());
  const { answers, notices, text, confirms } = await c.say(PHOTO_Q, fakeApi({ planned, composed: composedHs }));
  assert.equal(answers.length, 2);
  assert.equal(answers[0].planOnly, true);
  assert.deepEqual(answers[1].plan, planned.plan, 'kế hoạch đi nguyên vẹn, không gọi kế hoạch lần hai');
  assert.deepEqual([answers[1].planOnly, answers[1].forceIntent], [undefined, undefined]);
  assert.ok(Date.parse(answers[1].deadlineAt) > Date.now());
  assert.equal(notices.length, 1);
  assert.doesNotMatch(notices[0], /\d/);
  assert.ok(notices[0].endsWith(' — mình đọc chú giải các nhóm liên quan rồi trả lời, khoảng một phút nhé.'), notices[0]);
  assert.ok(text.includes('Ứng viên để chuyên viên chốt:') && !text.includes('trả lời "đúng"'));
  assert.equal(confirms.length, 0);
  assert.equal(c.memo.topic, 'tariff');
  const { tariff, answer } = c.memo.state;
  assert.deepEqual([tariff.hs, tariff.candidates, tariff.desc], [null, ['30.05', '38.24'], 'miếng dán ngải cứu']);
  assert.deepEqual([answer.mode, answer.question, answer.goods], ['hs', 'miếng dán ngải cứu có hợp không', { facts: ['miếng dán ngải cứu'] }]);
  assert.doesNotMatch(JSON.stringify(c.memo.state), /3005\.?10\.?10|\[mã/, 'không mã người dùng nào trong state (R4)');
});

test('Việc 12 (3): guardIntent cho hs/status/mixed đi thẳng; sau ứng viên refine là hs; đường tắt chỉ nhận đính chính có cue', () => {
  assert.equal(guardIntent('status', { topic: 'tariff', tariffFresh: true }), 'status');
  assert.equal(guardIntent('hs', { topic: 'legal' }), 'hs');
  assert.equal(guardIntent('mixed', { topic: null }), 'mixed');
  assert.equal(guardIntent('refine', { topic: 'tariff', candidatesFresh: true }), 'hs');
  assert.equal(guardIntent('correction', { topic: 'tariff', candidatesFresh: true }), 'correction', 'còn chỗ trỏ, nhưng chỉ ra lời mời');
  const onCandidates = { topic: 'tariff', candidatesFresh: true };
  assert.equal(fastPath({ text: 'HS đúng là 8422.90.90', ...onCandidates })?.action, 'correction');
  assert.equal(fastPath({ text: 'sai rồi, không phải nhóm này', quoteText: TARIFF_ANSWER_QUOTE, ...onCandidates }), null, 'luồng ứng viên không đọc mã cũ từ quote');
  assert.equal(fastPath({ text: 'không phải, 6307.90.90 cơ', ...onCandidates }), null, 'mã không có cue xác nhận thì không đi đường tắt');
});

test('Việc 12 (4): guard bác kế hoạch thì request soạn mang plan + forceIntent; planOnly đúng một lần', async () => {
  const c = conversation();
  c.memo.topic = 'legal';
  const planned = plannedOf(plan08({ intent: 'correction', question: 'quy định miễn thuế hàng gia công', goods: { facts: [], missing: [] }, keywords: [] }), { codeRole: 'none', ack: null });
  const run = await c.say('không phải văn bản đó, mình cần quy định miễn thuế hàng gia công', fakeApi({ planned, composed: composedLegal }));
  assert.equal(run.answers.filter((a) => a.planOnly).length, 1);
  assert.equal(run.answers.length, 2);
  assert.deepEqual([run.answers[1].plan, run.answers[1].forceIntent], [planned.plan, 'legal']);
  assert.deepEqual(run.notices, ['Mình tra văn bản rồi trả lời nhé.'], 'không có ack thì chỉ vế theo chế độ');
  assert.equal(run.confirms.length, 0);
  assert.equal(c.memo.topic, 'legal');
  // provisionLabel: a bridge until the API's plan step reads `label` (§6.1, row 19).
  assert.deepEqual(c.memo.state.legal.citations, [{ label: 'Khoản 1 Điều 9 VB-A', provisionLabel: 'Khoản 1 Điều 9 VB-A', kind: null, instrument: 'VB-A', documentNumber: 'VB-A' }]);
  assert.equal(c.memo.state.legal.question, 'quy định miễn thuế hàng gia công');
});

test('Việc 12 (5): sau câu hs, "HS đúng là 8422.90.90" ghi đúng một dòng correct kèm mô tả, không dòng wrong — quote câu hs hay không đều như nhau', async () => {
  const runs = [];
  for (const quoteIt of [false, true]) {
    const c = await afterHs();
    runs.push(await c.say('HS đúng là 8422.90.90', fakeApi(), quoteIt ? c.reply : null));
  }
  for (const run of runs) {
    assert.equal(run.answers.length, 0, 'đính chính tường minh đi đường tắt');
    assert.equal(run.confirms.length, 1);
    assert.deepEqual([run.confirms[0].verdict, run.confirms[0].hs], ['correct', '84229090']);
    assert.ok(run.confirms[0].note.includes('miếng dán ngải cứu'), run.confirms[0].note);
  }
  assert.deepEqual(runs[1].confirms, runs[0].confirms);
  assert.equal(runs[1].text, runs[0].text);
  assert.ok(runs[0].text.startsWith('Đã ghi nhận mã 8422.90.90 cho miếng dán ngải cứu'), runs[0].text.slice(0, 80));
});

test('Việc 12 (6): sau câu hs, "đúng" không ghi gì; "sai rồi, không phải nhóm này" quote câu hs không ghi gì và soạn lại', async () => {
  const a = await afterHs();
  const agree = await a.say('đúng', fakeApi({ planned: plannedOf(plan08({ intent: 'confirm', verdict: 'correct', goods: { facts: [], missing: [] } }), { codeRole: 'none' }) }));
  assert.equal(agree.confirms.length, 0);
  assert.equal(agree.answers.length, 1);
  const b = await afterHs();
  const refine = await b.say('sai rồi, không phải nhóm này', fakeApi({ planned: plannedOf(plan08({ intent: 'refine', refines: true }), { codeRole: 'none', mode: 'hs' }), composed: composedHs }), b.reply);
  assert.equal(refine.confirms.length, 0);
  assert.equal(refine.answers.length, 2);
  assert.deepEqual([refine.answers[1].plan.intent, refine.answers[1].forceIntent], ['refine', undefined], 'API tự đổi refine sang chế độ cũ và giữ câu hỏi trước');
});

test('Việc 12 (7): "63079090 mới đũng" sau câu hs (kế hoạch correction): lời mời, không ghi sổ, giữ bộ nhớ ứng viên', async () => {
  const c = await afterHs();
  const { confirms, answers, text } = await c.say('63079090 mới đũng', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', question: '[mã 1] mới đúng', goods: { facts: [], missing: [] } })) }));
  assert.equal(confirms.length, 0);
  assert.equal(answers.length, 1);
  assert.equal(
    text,
    'Mã 6307.90.90 (Sản phẩm dệt đã hoàn thiện khác) khác các nhóm mình vừa nêu. Muốn mình ghi nhận mã này cho miếng dán ngải cứu, nhắn "HS đúng là 6307.90.90". Cần thuế thì nhắn thêm xuất xứ.',
  );
  assert.deepEqual(c.memo.state.tariff.candidates, ['30.05', '38.24'], '"HS đúng là" ở lượt sau vẫn ghi được cho mô tả này');
});

test('Việc 12 (8): "8481.80.99 có sai không ạ" trên tra thuế còn mới không ghi gì; chưa có mô tả hàng thì hỏi mô tả, không soạn', async () => {
  const c = conversation();
  await c.say('8481.80.99 TQ', fakeApi());
  assert.equal(c.memo.state.tariff.hs, '84818099');
  const doubt = await c.say('8481.80.99 có sai không ạ', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', question: '[mã 1] có sai không', goods: { facts: [], missing: [] } })) }));
  assert.equal(doubt.confirms.length, 0);
  assert.equal(doubt.answers.length, 1);
  assert.equal(doubt.notices.length, 0);
  assert.match(doubt.text, /mô tả giúp mình/);
});

test('Việc 12 (9): /answer không trả lời thì một câu thật, không tra mã thay', async () => {
  const { text, calls, notices } = await conversation().say('cho mình hỏi thuế 8481.80.99 bao nhiêu vậy', fakeApi());
  assert.equal(text, 'Mình chưa đọc được câu hỏi lúc này, bạn thử lại sau ít phút nhé.');
  assert.ok(!calls.some((x) => x.path.startsWith('/tariff')), 'không gọi answerByHs');
  assert.equal(notices.length, 0);
});

test('Việc 12: văn bản kho không có (ở bước kế hoạch hay bước soạn) → lời mời nạp giữ cho lượt sau; xin nguyên văn Điều → tra theo trích dẫn, không soạn', async () => {
  const hit = { number: '36/2025/TT-BKHCN', title: 'Thông tư 36/2025/TT-BKHCN tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/x' };
  const noGoods = { goods: { facts: [], missing: [] }, keywords: [] };
  const c = conversation();
  const missing = await c.say(
    'thông tư 36/2025/TT-BKHCN quy định gì',
    fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'thông tư 36/2025/TT-BKHCN quy định gì', ...noGoods }), { codeRole: 'none', missingDoc: '36/2025/TT-BKHCN', gazetteMatchKind: 'exact', gazetteMatches: [hit] }) }),
  );
  assert.ok(missing.text.includes('Trả lời "nạp"'), missing.text);
  assert.equal(c.memo.state.legal.pendingIngest.number, '36/2025/TT-BKHCN');
  const row = { documentNumber: 'VB-X', documentTitle: 't', citationLabel: 'Điều 18 VB-X', path: '', heading: null, body: 'Thân điều.', effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified' };
  const verbatim = await conversation().say(
    'cho mình nguyên văn Điều 18 VB-X',
    fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'nguyên văn Điều 18 VB-X', scope: { doc: 'VB-X', article: '18', clause: null }, ...noGoods }), { codeRole: 'none' }), provision: [row] }),
  );
  assert.ok(verbatim.text.startsWith('Nguyên văn Điều 18 VB-X:'), verbatim.text);
  for (const run of [missing, verbatim]) {
    assert.equal(run.answers.length, 1);
    assert.equal(run.notices.length, 0);
  }
  const late = conversation();
  const atCompose = await late.say(
    'thông tư 36/2025/TT-BKHCN quy định gì',
    fakeApi({
      planned: plannedOf(plan08({ intent: 'legal', question: 'thông tư 36/2025/TT-BKHCN quy định gì', ...noGoods }), { codeRole: 'none', ack: null }),
      composed: { ...composedLegal, answerMd: '', citations: [], missingDoc: '36/2025/TT-BKHCN', gazetteMatchKind: 'exact', gazetteMatches: [hit] },
    }),
  );
  assert.equal(atCompose.answers.length, 2);
  assert.ok(atCompose.text.includes('Trả lời "nạp"'), atCompose.text);
  assert.equal(late.memo.state.legal.pendingIngest.number, '36/2025/TT-BKHCN');
});

// --- Plan 08 Việc 12 review: the verdict ledger (R13) -------------------------------------------------------------------

test('R13: quote câu soạn kèm "sai rồi"/"đúng" sau một lượt tra thuế không ghi gì cho mã vừa tra; phần sau không mã của một câu dài không ghi gì', async () => {
  for (const text of ['sai rồi, không phải nhóm này, hàng có tẩm thuốc', 'đúng', 'không phải, ý tôi là loại không tẩm thuốc']) {
    const c = await afterHs();
    await c.say('3005.10.10 TQ', fakeApi());
    assert.equal(c.memo.state.tariff.hs, '30051010');
    const run = await c.say(text, fakeApi(), c.reply);
    assert.equal(run.confirms.length, 0, text);
  }
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  assert.deepEqual(fastPath({ text: 'đúng', quoteText: TARIFF_ANSWER_QUOTE, ...fresh }), { action: 'confirm', verdict: 'correct' });
  const tail = 'Tra theo ngày 13/09/2026 · [1] NĐ 26/2023/NĐ-CP — Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)\nMã đúng với lô hàng thì trả lời "đúng".';
  // Re-review round 2 (S19): a later message with no code may be part of any reply, a composed one included; resend unquoted.
  for (const text of ['sai', 'sai rồi', 'đúng']) assert.equal(fastPath({ text, quoteText: tail, ...fresh }), null, text);
});

test('R4 + R13: câu hs không ứng viên (chỉ in mã người dùng, văn xuôi có "Cảm ơn") quote lại kèm "sai rồi" không ghi mã người dùng; không lưu bộ nhớ ứng viên rỗng', async () => {
  const c = conversation();
  const noCands = {
    ...composedHs, answerMd: 'Cảm ơn bạn đã mô tả thêm; mô tả này chưa đủ để chọn nhóm [1].', candidates: [],
    userCodes: [{ code: '3005.10.10', level: 8, heading: '30.05', exists: false, inCandidates: false }],
  };
  const first = await c.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: noCands }));
  assert.equal(c.memo.state.tariff, null);
  const run = await c.say('sai rồi, không phải nhóm này', fakeApi(), first.text);
  assert.equal(run.confirms.length, 0);
});

test('R13: đính chính tra không được mã mới, hoặc ghi sổ lỗi, không bao giờ nói "Đã ghi nhận"; không ghi gì và giữ bộ nhớ để gửi lại', async () => {
  const c = await afterHs();
  const nf = await c.say('HS đúng là 8422.90.90', fakeApi({ noRate: ['84229090'] }));
  assert.equal(nf.confirms.length, 0);
  assert.doesNotMatch(nf.text, /Đã ghi nhận/);
  assert.match(nf.text, /chưa ghi nhận gì/);
  assert.deepEqual(c.memo.state.tariff.candidates, ['30.05', '38.24'], '"HS đúng là <mã>" gửi lại vẫn ghi được cho mô tả này');

  const t = conversation();
  await t.say('8481.80.99 TQ', fakeApi());
  const typo = await t.say('sai rồi, HS đúng là 9999.99.99', fakeApi({ noRate: ['99999999'] }));
  assert.equal(typo.confirms.length, 0);
  assert.doesNotMatch(typo.text, /Đã ghi nhận|sửa thành/);
  assert.equal(t.memo.state.tariff.hs, '84818099');

  for (const text of ['sai rồi, HS đúng là 8481.80.91', 'sai rồi', 'đúng là 8481.80.99']) {
    const d = conversation();
    await d.say('8481.80.99 TQ', fakeApi());
    const down = await d.say(text, fakeApi({ confirmFails: true }));
    assert.equal(down.confirms.length, 1, text);
    assert.doesNotMatch(down.text, /Đã (ghi|xác) nhận/, text);
    assert.equal(d.memo.state.tariff.hs, '84818099', text);
  }
  const down = await (await afterHs()).say('HS đúng là 8422.90.90', fakeApi({ confirmFails: true }));
  assert.doesNotMatch(down.text, /Đã ghi nhận/);
});

test('lời mời nạp văn bản chỉ nhận "có" khi luồng còn ở văn bản đó: sau một câu hs, "có" không xếp hàng nạp', async () => {
  const hit = { number: '36/2025/TT-BKHCN', title: 'Thông tư 36/2025/TT-BKHCN tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/x' };
  const c = conversation();
  await c.say(
    'thông tư 36/2025/TT-BKHCN quy định gì',
    fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'thông tư 36/2025/TT-BKHCN quy định gì', goods: { facts: [], missing: [] }, keywords: [] }), { codeRole: 'none', missingDoc: '36/2025/TT-BKHCN', gazetteMatchKind: 'exact', gazetteMatches: [hit] }) }),
  );
  await c.say('miếng dán ngải cứu mã gì', fakeApi({ planned: plannedOf(plan08({ question: 'miếng dán ngải cứu mã gì' }), { codeRole: 'none' }), composed: composedHs }));
  const yes = await c.say('có', fakeApi());
  assert.ok(!yes.calls.some((x) => x.path === '/ingest/request'), yes.text);
});

// --- Plan 08 Việc 12 review: routing and memory -------------------------------------------------------------------------

const noGoods = { goods: { facts: [], missing: [] }, keywords: [] };
const pathsOf = (run) => run.calls.map((x) => x.path);

test('refine chạy lại chế độ API đọc từ câu soạn trước, không forceIntent; sau câu hs không ứng viên không tra từ khoá (hàng 12, 22)', async () => {
  const c = conversation();
  await c.say('hs code hộp cách ly nhiễu RF', fakeApi({ planned: plannedOf(plan08({ question: 'hs code hộp cách ly nhiễu RF' }), { codeRole: 'none', mode: 'hs' }), composed: { ...composedHs, candidates: [], userCodes: [] } }));
  const run = await c.say('chỉ là hộp vải có chức năng cách ly nhiễu RF', fakeApi({ planned: plannedOf(plan08({ intent: 'refine', refines: true }), { codeRole: 'none', mode: 'hs' }), composed: composedHs }));
  assert.ok(!pathsOf(run).some((p) => p.startsWith('/tariff')), pathsOf(run).join(','));
  assert.deepEqual([run.answers.length, run.answers[1].forceIntent], [2, undefined]);
  assert.match(run.notices[0], /đọc chú giải các nhóm/);

  const s = conversation();
  const status = { ...composedLegal, mode: 'status' };
  await s.say('Nghị định 69/2018/NĐ-CP còn áp dụng không', fakeApi({ planned: plannedOf(plan08({ intent: 'status', question: 'Nghị định 69/2018/NĐ-CP còn áp dụng không', ...noGoods }), { codeRole: 'none', mode: 'status', ack: null }), composed: status }));
  const again = await s.say('không phải văn bản đó', fakeApi({ planned: plannedOf(plan08({ intent: 'refine', ...noGoods }), { codeRole: 'none', mode: 'status', ack: null }), composed: status }));
  assert.deepEqual([again.answers[1].plan.intent, again.answers[1].forceIntent], ['refine', undefined]);
});

test('kế hoạch tariff: mã bị nghi không tra thuế; không mã thì hỏi mã hoặc soạn hs, không tra từ khoá trên tin (R4); "còn từ Nhật" chỉ tra khối; văn bản thiếu không chặn tra thuế', async () => {
  const doubt = await conversation().say('thuế mã 84818099 dùng cho van nước được không', fakeApi({ planned: plannedOf(plan08({ intent: 'tariff', ...noGoods })) }));
  assert.ok(!pathsOf(doubt).includes('/tariff'), pathsOf(doubt).join(','));
  assert.match(doubt.text, /mô tả giúp mình/);
  assert.equal(doubt.r.tariff, undefined, 'không đóng dấu mã người dùng đang nghi');

  const heading = conversation();
  const noCode = await heading.say('thuế nhóm 3005.10 bao nhiêu', fakeApi({ planned: plannedOf(plan08({ intent: 'tariff', question: 'thuế nhóm [mã 1] bao nhiêu', ...noGoods }), { codeRole: 'key' }) }));
  assert.deepEqual(pathsOf(noCode), ['/answer']);
  assert.match(noCode.text, /mã HS 8 số/);
  assert.doesNotMatch(JSON.stringify(heading.memo.state), /3005/);

  const goods = await conversation().say('thuế nhập khẩu van bi inox bao nhiêu', fakeApi({ planned: plannedOf(plan08({ intent: 'tariff', question: 'thuế nhập khẩu van bi inox', goods: { facts: ['van bi inox'], missing: [] }, keywords: ['van bi inox'] }), { codeRole: 'none' }), composed: composedHs }));
  assert.ok(!pathsOf(goods).some((p) => p.startsWith('/tariff')), pathsOf(goods).join(','));
  assert.deepEqual([goods.answers.length, goods.answers[1].forceIntent], [2, 'hs']);

  const cands = await (await afterHs()).say('còn từ Nhật thì sao', fakeApi({ planned: plannedOf(plan08({ intent: 'tariff', reuseLastHs: true, origin: 'JP', ...noGoods }), { codeRole: 'none' }) }));
  assert.deepEqual(pathsOf(cands), ['/answer']);
  assert.match(cands.text, /mã HS 8 số/);

  const t = conversation();
  await t.say('8481.80.99 TQ', fakeApi());
  const japan = await t.say('còn từ Nhật thì sao', fakeApi({ planned: plannedOf(plan08({ intent: 'tariff', reuseLastHs: true, origin: 'JP', ...noGoods }), { codeRole: 'none' }) }));
  assert.equal(japan.answers.length, 1, 'API không đọc mã từ state: lượt /answer thứ hai không bao giờ có văn xuôi');
  assert.ok(japan.text.startsWith('Hàng hóa có mã HS 8481.80.99'), japan.text.slice(0, 60));

  const decree = await conversation().say('cho mình hỏi thuế 8481.80.99 theo Nghị định 26/2023/NĐ-CP bao nhiêu', fakeApi({ planned: plannedOf(plan08({ intent: 'tariff', ...noGoods }), { codeRole: 'key', missingDoc: '26/2023/NĐ-CP' }) }));
  assert.ok(pathsOf(decree).includes('/tariff') && !decree.text.includes('chưa có toàn văn'), decree.text.slice(0, 80));
});

test('sau ứng viên, "sai rồi, không phải nhóm này" (kế hoạch correction) soạn lại hs; câu hỏi trên luồng pháp luật giữ legal; nghi mã theo chế độ API thì hỏi mô tả; "đúng" sau câu pháp luật không soạn lại; câu tất định xoá state.answer', async () => {
  const c = await afterHs();
  const redo = await c.say('sai rồi, không phải nhóm này', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', verdict: 'wrong' }), { codeRole: 'none' }), composed: composedHs }));
  assert.deepEqual([redo.confirms.length, redo.answers.length, redo.answers[1]?.forceIntent], [0, 2, 'hs']);

  const l = conversation();
  await l.say('thời hạn nộp thuế hàng nhập khẩu là bao lâu', fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'thời hạn nộp thuế hàng nhập khẩu', ...noGoods }), { codeRole: 'none', mode: 'legal', ack: null }), composed: composedLegal }));
  const asks = await l.say('vậy là điều 9 đó mình hiểu sai à?', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', ...noGoods }), { codeRole: 'none', ack: null }), composed: composedLegal }));
  assert.equal(asks.answers[1]?.forceIntent, 'legal');
  assert.match(asks.notices[0], /tra văn bản/);
  const agree = await l.say('đúng', fakeApi());
  assert.deepEqual([agree.answers.length, agree.notices.length], [0, 0]);

  const premise = await conversation().say('mã 8481.80.99 dùng được không theo thông tư', fakeApi({ planned: plannedOf(plan08({ intent: 'legal', ...noGoods }), { mode: 'hs' }), composed: composedLegal }));
  assert.deepEqual([premise.answers.length, premise.notices.length], [1, 0]);
  assert.match(premise.text, /mô tả giúp mình/);

  const m = await afterHs();
  assert.equal(m.memo.state.answer.mode, 'hs');
  await m.say('thông tư 36/2025/TT-BKHCN quy định gì', fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'thông tư 36/2025/TT-BKHCN quy định gì', ...noGoods }), { codeRole: 'none', missingDoc: '36/2025/TT-BKHCN' }) }));
  assert.equal(m.memo.state.answer, null, 'lượt sau không trỏ về câu hs cũ');
});

test('ngõ cụt nói thật: tin quá 2.000 ký tự không gửi /answer; soạn không có nguồn không bảo "thử lại"; mixed dùng khối API đã tra; sau ứng viên lượt tra thật đầu tiên có lời mời', async () => {
  const long = await conversation().say(`hàng gồm ${'thân nhựa, lõi thép, dây đồng; '.repeat(80)}mã gì`, fakeApi());
  assert.equal(long.answers.length, 0);
  assert.match(long.text, /2\.000 ký tự/);

  const none = await conversation().say('thời hạn nộp thuế hàng tạm nhập là bao lâu', fakeApi({ planned: plannedOf(plan08({ intent: 'legal', ...noGoods }), { codeRole: 'none', mode: 'legal', ack: null }), composed: { ...composedLegal, answerMd: '', citations: [], coverage: 'none', calls: 0 } }));
  assert.doesNotMatch(none.text, /thử lại/);
  assert.match(none.text, /chưa tìm thấy căn cứ/);

  const mixed = await conversation().say('thuế 8481.80.99 TQ, có phải kiểm tra chuyên ngành không', fakeApi({ planned: plannedOf(plan08({ intent: 'mixed', ...noGoods }), { codeRole: 'subject', mode: 'mixed', ack: null }), composed: { ...composedLegal, mode: 'mixed', tariff: { ...tariff8481({ origin: 'CN' }), date: todayVN() } } }));
  assert.ok(!pathsOf(mixed).includes('/tariff') && mixed.text.includes('Thuế của mã trong câu hỏi:'), pathsOf(mixed).join(','));

  const first = await (await afterHs()).say('3005.10.10', fakeApi());
  assert.match(first.text, /trả lời "đúng"/);
});

test('refine không còn câu soạn trước (state.answer đã xoá): chủ đề quyết, không theo chế độ mặc định hs của API', async () => {
  const hit = { number: '36/2025/TT-BKHCN', title: 'Thông tư 36/2025/TT-BKHCN tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/x' };
  const c = conversation();
  await c.say('thông tư 36/2025/TT-BKHCN quy định gì', fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'thông tư 36/2025/TT-BKHCN quy định gì', ...noGoods }), { codeRole: 'none', missingDoc: '36/2025/TT-BKHCN', gazetteMatchKind: 'exact', gazetteMatches: [hit] }) }));
  const run = await c.say('không phải, ý mình là quy định miễn thuế hàng gia công', fakeApi({ planned: plannedOf(plan08({ intent: 'refine', ...noGoods }), { codeRole: 'none', mode: 'hs', ack: null }), composed: composedLegal }));
  assert.equal(run.answers[1]?.forceIntent, 'legal');
  assert.deepEqual(run.notices, ['Mình tra văn bản rồi trả lời nhé.']);
});

test('codeOffer: mã dưới một ứng viên sâu hơn (3005.10) là "nằm trong"; trên luồng tra thuế nói rõ mã vừa tra sẽ ghi chưa đúng; cùng mã thì chỉ cách xác nhận', async () => {
  const c = conversation();
  const deep = { ...composedHs, candidates: [{ ...composedHs.candidates[0], hs: '3005.10', level: 6 }, composedHs.candidates[1]] };
  await c.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: deep }));
  const inside = await c.say('30051010 mới đúng', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', question: '[mã 1] mới đúng', ...noGoods })) }));
  assert.match(inside.text, /^Mã 3005\.10\.10 .*nằm trong các nhóm mình vừa nêu\./);

  const t = conversation();
  await t.say('8481.80.99 TQ', fakeApi());
  const other = await t.say('63079090 mới đúng', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', question: '[mã 1] mới đúng', ...noGoods })) }));
  assert.equal(other.confirms.length, 0);
  assert.match(other.text, /^Mã 6307\.90\.90 \(Sản phẩm dệt đã hoàn thiện khác\) khác mã 8481\.80\.99 vừa tra\. Muốn ghi nhận 8481\.80\.99 chưa đúng và 6307\.90\.90 là mã đúng, nhắn "HS đúng là 6307\.90\.90"\./);
  const same = await t.say('8481.80.99 sai rồi', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', question: '[mã 1] sai rồi', ...noGoods })) }));
  assert.equal(same.confirms.length, 0);
  assert.match(same.text, /^Mã 8481\.80\.99 .*là mã vừa tra/);
});

// --- Plan 08 Việc 12 re-review 2026-09-15: a quote is the result on the table only by its code (R13) ---------------------

const pairs = (run) => run.confirms.map((x) => [x.hs, x.verdict]);
const staleTariff = (c) => (c.memo.state.tariff.at = new Date(Date.now() - 3 * 3600e3).toISOString());

test('R13: câu pháp luật mở dòng bằng "Hàng hóa có mã HS …" quote kèm "sai rồi" không ghi gì — khác mã hay cùng mã vừa tra, tra còn mới, đã cũ hay 404', async () => {
  const planned = plannedOf(plan08({ intent: 'legal', question: 'mũ bảo hiểm [mã 1] thuộc danh mục kiểm tra nào', ...noGoods }), { codeRole: 'subject', mode: 'legal', ack: null });
  for (const [code, lookup] of [['6506.10.10', 'fresh'], ['6506.10.10', 'stale'], ['6506.10.10', '404'], ['8481.80.99', 'fresh'], ['8481.80.99', 'stale']]) {
    const c = conversation();
    const composed = { ...composedLegal, codeRole: 'subject', answerMd: `Hàng hóa có mã HS ${code} thuộc danh mục phải kiểm tra chất lượng trước thông quan [1].` };
    const legal = await c.say(`mũ bảo hiểm ${code} thuộc danh mục kiểm tra nào`, fakeApi({ planned, composed }));
    await c.say('8481.80.99 TQ', fakeApi({ noRate: lookup === '404' ? ['84818099'] : [] }));
    if (lookup === 'stale') staleTariff(c);
    for (const text of ['sai rồi', 'sai rồi, không phải danh mục đó']) {
      const run = await c.say(text, fakeApi(), render(legal.r.text)[0].msg);
      assert.equal(run.confirms.length, 0, `${code} ${lookup}: ${text}`);
    }
  }
});

test('R13: quote kết quả tra cũ hơn mã đang nhớ không ghi gì; quote đúng kết quả trên bàn vẫn ghi, kể cả khi bộ nhớ đã cũ', async () => {
  for (const text of ['sai rồi', 'đúng', 'sai rồi, HS đúng là 8481.80.10']) {
    const c = conversation();
    const older = await c.say('8481.80.99 TQ', fakeApi());
    await c.say('8481.80.91 TQ', fakeApi());
    assert.equal((await c.say(text, fakeApi(), render(older.r.text)[0].msg)).confirms.length, 0, text);
  }
  const c = conversation();
  await c.say('8481.80.99 TQ', fakeApi());
  const latest = render((await c.say('8481.80.91 TQ', fakeApi())).r.text)[0].msg;
  assert.deepEqual(pairs(await c.say('đúng', fakeApi(), latest)), [['84818091', 'correct']]);
  staleTariff(c);
  // A one-word verdict needs fresh memory; a ruling in words reads the old code from the quote when it is the code in memory.
  assert.equal((await c.say('sai rồi', fakeApi(), latest)).confirms.length, 0);
  assert.deepEqual(pairs(await c.say('mã này sai', fakeApi(), latest)), [['84818091', 'wrong']], 'bộ nhớ đã cũ: quote đúng mã đang nhớ vẫn đính chính được');
});

test('R13: phán sai không kèm mã chỉ nhận khi là cả tin hoặc vế đầu; người dùng kể lỗi của chính mình không ghi gì', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['em gõ sai', 'em nhập sai mã rồi', 'hỏi sai câu rồi', 'mình ghi nhầm', 'em gõ sai, ý em là van bi']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['sai rồi ạ', 'mã này sai', 'mã này không đúng', 'không đúng ạ', 'nhầm mã rồi', 'sai rồi, không phải loại này']) {
    assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
  }
});

test('R4: mã dính liền 6 tới 10 số hoặc nối gạch API che sót không vào state (câu hỏi, dữ kiện hàng, từ khoá); năm, ngày và số hiệu văn bản giữ nguyên', async () => {
  const c = conversation();
  const leaky = plan08({
    question: 'mã hs 848180 dùng cho van theo thông tư 36/2025/TT-BTC năm 2026 được không',
    goods: { facts: ['van 848180', 'van 84818099 bằng đồng', 'van 8481-80-99', 'van 848180991 gõ thừa', 'nhập ngày 2026-09-15'], missing: [] },
    keywords: ['van 848180'],
  });
  await c.say('mã hs 848180 dùng cho van được không', fakeApi({ planned: plannedOf(leaky, { codeRole: 'none', mode: 'hs' }), composed: { ...composedHs, userCodes: [] } }));
  assert.doesNotMatch(JSON.stringify(c.memo.state), /848180|8481-80/);
  assert.equal(c.memo.state.answer.question, 'mã hs dùng cho van theo thông tư 36/2025/TT-BTC năm 2026 được không');
  assert.deepEqual(c.memo.state.answer.goods.facts, ['van', 'van bằng đồng', 'van', 'van gõ thừa', 'nhập ngày 2026-09-15']);
});

test('ngõ cụt không đổ danh sách năng lực: "đúng" khi kết quả tra đã cũ, refine trên luồng chào chỉ nhận một câu ngắn; lời chào vẫn có danh sách', async () => {
  const t = conversation();
  await t.say('8481.80.99 TQ', fakeApi());
  staleTariff(t);
  const agree = await t.say('đúng', fakeApi({ planned: plannedOf(plan08({ intent: 'confirm', verdict: 'correct', ...noGoods }), { codeRole: 'none', ack: null }) }));
  const g = conversation();
  assert.equal((await g.say('hi', fakeApi())).text, toText(CAPABILITIES));
  const refine = await g.say('không phải ý đó', fakeApi({ planned: plannedOf(plan08({ intent: 'refine', ...noGoods }), { codeRole: 'none', mode: 'hs', ack: null }), composed: composedHs }));
  for (const run of [agree, refine]) {
    assert.equal(run.confirms.length + run.answers.filter((a) => !a.planOnly).length, 0);
    assert.ok(!run.text.includes('Mình giúp được ba việc') && !run.text.includes('\n'), run.text);
  }
});

test('soạn hs không văn xuôi, không nguồn, không lượt gọi nào: câu nói thật và gợi ý vẫn in dưới dòng mã không có trong Danh mục', async () => {
  const none = { ...composedHs, answerMd: '', citations: [], candidates: [], coverage: 'none', calls: 0, userCodes: [{ code: '3005.10.10', level: 8, heading: '30.05', exists: false, inCandidates: false }] };
  const run = await conversation().say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: none }));
  assert.match(run.text, /Mã 3005\.10\.10 không có trong Danh mục hàng hóa đã nạp\.[\s\S]*chưa tìm thấy căn cứ[\s\S]*mô tả thêm chất liệu/);
  assert.doesNotMatch(run.text, /thử lại/);
});

test('R13: đính chính ghi correct cho mã mới trước; correct ghi được mà wrong lỗi thì nói đúng như vậy và bỏ bộ nhớ, gửi lại không ghi trùng', async () => {
  const c = conversation();
  await c.say('8481.80.99 TQ', fakeApi());
  const half = await c.say('sai rồi, HS đúng là 8481.80.91', fakeApi({ confirmFails: 'wrong' }));
  assert.deepEqual(pairs(half), [['84818091', 'correct'], ['84818099', 'wrong']]);
  assert.match(half.text, /Đã ghi nhận mã 8481\.80\.91 là đúng/);
  assert.match(half.text, /chưa ghi được mã 8481\.80\.99 là chưa đúng/);
  assert.equal(c.memo.state.tariff, null);
  assert.equal((await c.say('sai rồi, HS đúng là 8481.80.91', fakeApi())).confirms.length, 0);
});

// --- Plan 08 Việc 12 re-review round 2 (2026-09-15): a verdict answers only the lookup the last reply showed (R13) --------

const msg0 = (run) => render(run.r.text)[0].msg;
const planOf = (intent, over = {}) => fakeApi({ planned: plannedOf(plan08({ intent, ...noGoods }), { codeRole: 'none', ack: null, ...over }) });
async function afterLookup() {
  const c = conversation();
  await c.say('8481.80.99 TQ', fakeApi());
  return c;
}

test('R13 (S01, S03–S09): "ok" không phải phán quyết; một từ phán quyết chỉ ghi ngay sau câu tra thuế, không sau câu ghi nhận, lời mời, câu hỏi lại hay câu báo lỗi', async () => {
  const replies = {
    S01: (c) => c.say('sai', fakeApi()),
    S03: (c) => c.say('63079090 mới đúng', planOf('correction')),
    S04: (c) => c.say('8481.80.99 có sai không ạ', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', ...noGoods })) })),
    S05: (c) => c.say('thuế cái này bao nhiêu', planOf('tariff')),
    S06: (c) => c.say('cho mình hỏi thêm cái', fakeApi()),
    S07: (c) => c.say('sai rồi, HS đúng là 8481.80.91', fakeApi({ confirmFails: true })),
    S08: (c) => c.say('sai', fakeApi({ confirmFails: true })),
    S09: (c) => c.say('sai rồi, HS đúng là 9999.99.99', fakeApi({ noRate: ['99999999'] })),
  };
  for (const [id, reply] of Object.entries(replies)) {
    for (const text of ['ok', 'oke', 'đúng', 'đúng rồi']) {
      const c = await afterLookup();
      await reply(c);
      assert.equal((await c.say(text, fakeApi())).confirms.length, 0, `${id}: ${text}`);
    }
  }
  const c = await afterLookup();
  const ok = await c.say('ok', fakeApi());
  assert.deepEqual([ok.confirms.length, ok.answers.length, ok.text], [0, 0, 'Dạ, bạn cần gì thêm cứ nhắn mình nhé.'], '"ok" là "đã xem", không qua bước kế hoạch');
  assert.equal((await c.say('đúng', fakeApi())).confirms.length, 0, 'sau "ok" không còn kết quả nào chờ phán quyết');

  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['ok', 'oke', 'okay', 'okie']) assert.equal(fastPath({ text, ...fresh }), null, text);
  for (const text of ['đúng rồi ạ', 'dung r']) assert.deepEqual(fastPath({ text, ...fresh }), { action: 'confirm', verdict: 'correct' }, text);
  assert.equal(fastPath({ text: 'đúng', ...fresh, table: { hs: '84818099' } }), null, 'bộ nhớ không mở (hoặc ghi trước khi có cờ) thì không ghi');
  assert.deepEqual(pairs(await (await afterLookup()).say('đúng rồi ạ', fakeApi())), [['84818099', 'correct']]);
});

test('R13: câu báo lỗi ghi sổ chỉ để ngỏ đúng phán quyết vừa lỗi; lời mời nêu mã vừa tra và hỏi "đúng"/"sai" thì để ngỏ lại', async () => {
  const opposite = await afterLookup();
  await opposite.say('sai', fakeApi({ confirmFails: true }));
  assert.equal((await opposite.say('đúng', fakeApi())).confirms.length, 0);
  const retry = await afterLookup();
  await retry.say('sai', fakeApi({ confirmFails: true }));
  assert.deepEqual(pairs(await retry.say('sai', fakeApi())), [['84818099', 'wrong']], 'gửi lại đúng phán quyết vừa lỗi thì ghi được');

  const same = await afterLookup();
  const offer = await same.say('8481.80.99 sai rồi', planOf('correction'));
  assert.match(offer.text, /là mã vừa tra: đúng với lô hàng thì nhắn "đúng", chưa đúng thì nhắn "sai"/);
  assert.deepEqual(pairs(await same.say('sai', fakeApi())), [['84818099', 'wrong']]);

  const bare = await afterLookup();
  await bare.say('cho mình hỏi thêm cái', fakeApi());
  const ask = await bare.say('chuẩn mã rồi đó', planOf('confirm'));
  assert.match(ask.text, /^Mình chưa ghi nhận gì\. .*mã 8481\.80\.99 vừa tra: đúng với lô hàng thì nhắn "đúng", chưa đúng thì nhắn "sai"\.$/);
  assert.deepEqual(pairs(await bare.say('đúng', fakeApi())), [['84818099', 'correct']]);
});

test('R13 (S02, S10, S11): quote câu ghi nhận hay câu đính chính của bot không bao giờ là kết quả trên bàn, kể cả khi vừa tra lại mã đó; quote câu tra khác xuất xứ cũng vậy', async () => {
  for (const [ruling, text] of [['sai', 'đúng'], ['sai rồi', 'chuẩn'], ['sai rồi, HS đúng là 8481.80.91', 'đúng'], ['sai rồi, HS đúng là 8481.80.91', 'sai rồi']]) {
    const group = await afterLookup();
    const ack = await group.say(ruling, fakeApi());
    assert.ok(ack.confirms.length > 0, ruling);
    assert.equal((await group.say(text, fakeApi(), msg0(ack))).confirms.length, 0, `S02 ${ruling} → ${text}`);
    const again = await afterLookup();
    const reply = await again.say(ruling, fakeApi());
    await again.say('8481.80.99 TQ', fakeApi());
    assert.equal((await again.say(text, fakeApi(), msg0(reply))).confirms.length, 0, `S10/S11 ${ruling} → ${text}`);
  }
  const c = conversation();
  const cn = await c.say('8481.80.99 TQ', fakeApi());
  const jp = await c.say('8481.80.99 JP', fakeApi());
  assert.equal((await c.say('đúng', fakeApi(), msg0(cn))).confirms.length, 0, 'xuất xứ khác kết quả đang nhớ');
  assert.deepEqual((await c.say('đúng', fakeApi(), msg0(jp))).confirms.map((x) => [x.hs, x.verdict, x.origin]), [['84818099', 'correct', 'JP']]);
  // The verdict history of a lookup opens "Đã xác nhận đúng 2 lần": it is part of the lookup, not a verdict reply.
  const history = `${TARIFF_ANSWER_QUOTE}\nĐã xác nhận đúng 2 lần (gần nhất: Chuyên Viên A) — trả lời "đúng"/"sai" để cập nhật.`;
  assert.deepEqual(fastPath({ text: 'sai', quoteText: history, topic: 'tariff', tariffFresh: true, table: { hs: '84818099' } }), { action: 'confirm', verdict: 'wrong' });
});

test('R13 (S12–S16): "HS đúng là X" chỉ là phán quyết khi mở đầu tin, hoặc sau đúng một vế "sai rồi,"/"không phải,"; câu điều kiện, phủ định, phỏng đoán, câu hỏi không ghi', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  const onCandidates = { topic: 'tariff', candidatesFresh: true };
  for (const text of [
    'nếu HS đúng là 8481.80.91 thì thuế bao nhiêu', 'không phải HS đúng là 8481.80.91 đâu, vẫn là 8481.80.99', 'hình như mã đúng là 8481.80.91',
    'em nghĩ HS đúng là 8481.80.91', 'có phải mã đúng là 8481.80.91', 'hs dung la 8481.80.91 phai hk', 'giả sử mã đúng là 8481.80.91',
    'chắc HS đúng là 8481.80.91', 'liệu HS đúng là 8481.80.91', 'mã đúng là 8481.80.91 chăng', 'không đúng là 8481.80.91', 'theo em HS đúng là 8481.80.91',
  ]) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['nếu HS đúng là 3005.90.00 thì thuế bao nhiêu', 'hình như HS đúng là 3005.90.00']) assert.equal(fastPath({ text, ...onCandidates }), null, text);
  for (const text of [
    'HS đúng là 8481.80.91', 'sai rồi, HS đúng là 8481.80.91', 'Sai. Mã đúng là 8481.80.91', 'không phải, HS đúng là 8481.80.91',
    'sai rồi, mã đúng phải là 8481.80.91', 'mã chuẩn là 8481.80.91', 'mã HS đúng: 8481.80.91', 'sai rồi 😅 HS đúng là 8481.80.91',
  ]) {
    assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
  }
  assert.equal(fastPath({ text: 'không phải, HS đúng là 3005.90.00', ...onCandidates })?.action, 'correction');
});

test('R13 (S17, S18): "sai rồi, …" bàn về văn xuôi hay một mức thuế không phải phán mã sai; vế sau chỉ vào hàng hay mã thì vẫn là phán quyết', async () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['sai rồi, thuế MFN phải 5% chứ', 'sai rồi, form E không bắt buộc đâu', 'sai rồi, điều 5 không nói vậy', 'sai rồi, bạn xem lại đi', 'sai rồi, mã này không được hưởng ưu đãi']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['sai rồi, không phải loại này', 'sai rồi, hàng này là van bi', 'mã này sai, không phải mã đó', 'sai r', 'chưa đúng', 'mã HS này sai', 'sai rồi 😅']) {
    assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
  }
  const prose = { mode: 'tariff', answerMd: 'Mức ACFTA chỉ áp khi hàng có C/O form E hợp lệ; không có C/O thì áp MFN.', citations: [], cut: 0, calls: 1 };
  const c = conversation();
  const rate = await c.say('8481.80.99 TQ', fakeApi({ composed: prose }));
  assert.equal((await c.say('sai rồi, form E không bắt buộc đâu', fakeApi(), msg0(rate))).confirms.length, 0);
  assert.deepEqual(pairs(await c.say('sai rồi, không phải loại này', fakeApi(), msg0(rate))), [['84818099', 'wrong']], 'quote đúng câu tra trên bàn và phán mã sai thì vẫn ghi');
});

test('R13 (S29, S30): "HS đúng là X" quote câu soạn không ghi gì; quote lời mời nêu đúng mã đang nhớ thì ghi, lời mời về mã khác thì không', async () => {
  const hs = await afterHs();
  await hs.say('3005.10.10 TQ', fakeApi());
  assert.equal((await hs.say('HS đúng là 3005.90.00', fakeApi(), hs.reply)).confirms.length, 0, 'S29');

  const l = await afterLookup();
  const planned = plannedOf(plan08({ intent: 'legal', ...noGoods }), { codeRole: 'subject', mode: 'legal', ack: null });
  const legal = await l.say('van 8481.80.99 có phải kiểm tra chuyên ngành không', fakeApi({ planned, composed: { ...composedLegal, codeRole: 'subject', answerMd: 'Van này thuộc danh mục kiểm tra [1].' } }));
  await l.say('8481.80.99 TQ', fakeApi());
  assert.equal((await l.say('sai rồi, HS đúng là 8481.80.10', fakeApi(), msg0(legal))).confirms.length, 0, 'S30');

  const o = await afterLookup();
  const offer = await o.say('63079090 mới đúng', planOf('correction'));
  assert.deepEqual(pairs(await o.say('HS đúng là 6307.90.90', fakeApi(), msg0(offer))), [['63079090', 'correct'], ['84818099', 'wrong']]);
  const moved = await afterLookup();
  const old = await moved.say('63079090 mới đúng', planOf('correction'));
  await moved.say('8481.80.91 TQ', fakeApi());
  assert.equal((await moved.say('HS đúng là 6307.90.90', fakeApi(), msg0(old))).confirms.length, 0, 'lời mời nói về 8481.80.99, bộ nhớ đã sang 8481.80.91');
});

test('R13 (S21): lời báo đã hiểu câu hỏi là chữ mô hình, không bao giờ đọc như câu tra thuế', async () => {
  const ack = 'Hàng hóa có mã HS 8481.80.99 có phải kiểm tra chuyên ngành không';
  const planned = plannedOf(plan08({ intent: 'legal', ...noGoods }), { codeRole: 'subject', mode: 'legal', ack });
  const run = await conversation().say('van 8481.80.99 có phải kiểm tra chuyên ngành không', fakeApi({ planned, composed: composedLegal }));
  assert.equal(run.notices.length, 1);
  assert.equal(tariffReply(run.notices[0]), false, run.notices[0]);
});

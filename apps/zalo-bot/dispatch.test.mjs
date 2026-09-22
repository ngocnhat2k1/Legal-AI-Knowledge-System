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

import { asksSources, COUNTRY, onlyAsksSources, fastPath, guardIntent, isBareLookup, parseVerifyDocCommand, ruling, tariffReply } from './dispatch.mjs';
import { answerByHs, captionForVision, handleConfirm, handleCorrection, tariffByClues } from './answer.mjs';
import { CAPABILITIES, formatAnswer, formatGeneral, formatMissingDoc, formatProvisions, sanitizeLead } from './format.mjs';
import { L, render, toText } from './render.mjs';
import { cleanGazetteTitle, detectOrigin, docNumberStatedIn, missingKind, parseQuery, parseQuotedTariff, sameDocNumber, statedDocNumber, todayVN } from './parse.mjs';
import { ThreadType } from 'zca-js';

import { loadContext, nextState } from './conversation.mjs';
import { messageHandler, respond } from './index.mjs';

// The bot's own legal answer, as it appears in a quote. Note it carries NO HS code.
const LEGAL_ANSWER_QUOTE =
  '📚 Mình chưa tổng hợp được câu trả lời chắc chắn, nhưng đây là điều khoản liên quan nhất: 📖 Khoản 1 Điều 25 Nghị định 08/2015/NĐ-CP';
/** A one-message lookup as quoted: its lead line and, below the rates, the date it was looked up for (today). */
const TARIFF_ANSWER_QUOTE =
  'Hàng hóa có mã HS 8481.80.99 (Vòi, van và các thiết bị tương tự) có thuế nhập khẩu ưu đãi thông thường (MFN) 10% [1].\n' +
  `Tra theo ngày ${todayVN().split('-').reverse().join('/')} · [1] NĐ 26/2023/NĐ-CP — Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)`;
/** Tariff memory right after today's lookup reply, no origin: a one-word verdict may answer it (conversation.mjs nextState). */
const OPEN = { hs: '84818099', origin: null, date: todayVN(), open: true };

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
  assert.deepEqual(fastPath({ ...expired, table: { hs: '84818099', date: todayVN() } }), { action: 'correction' });
  assert.equal(fastPath(expired), null, 'no lookup in memory (a 404, or candidates): the quote alone rules nothing');
  assert.equal(fastPath({ ...expired, table: { hs: '84818091', date: todayVN() } }), null, 'an older lookup than the one in memory');
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

test('a verdict on a photo (a reply to one, or its caption) gets an offer: no photo shows which result it answers, and vision does not run again', () => {
  for (const text of ['đúng', 'sai rồi', 'chuẩn', 'HS đúng là 8481.80.91']) {
    assert.deepEqual(fastPath({ text, hasImage: true, topic: 'tariff', tariffFresh: true, table: OPEN }), { action: 'offer' }, text);
  }
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

test('ứng viên HS: không lời dẫn LLM nào đứng trên danh sách ứng viên, dòng đầu vẫn là dòng cố định (R2)', async () => {
  // Việc 13 bỏ hẳn `lead`: mô hình không còn viết câu nào của câu trả lời này, kể cả khi vision trả về `lead`.
  const named = await byClues({ hsHints: ['8481', '7307'], date: '2026-09-13', lead: 'Sản phẩm này thuộc mã 7307.99.90 là hợp lý nhất.' });
  assert.ok(named.startsWith('Với mô tả van'), named.slice(0, 80));
  assert.ok(!named.includes('7307.99.90 là hợp lý nhất'), named.slice(0, 120));
  assert.equal(parseQuotedTariff(named).hs, '84818099', 'tin quote lại phải chỉ về mã đầu, không về mã lời dẫn nêu');
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

test('lời chào trả danh sách năng lực ngay, không qua router; chú thích ảnh không mang mã vào vision (R4)', () => {
  for (const t of ['hi', 'Chào bot!', 'xin chào', 'Hello']) assert.equal(fastPath({ text: t })?.action, 'greeting', t);
  assert.equal(fastPath({ text: 'hi, mã 8481.80.99 thuế bao nhiêu' }), null);
  assert.equal(fastPath({ text: 'hi', hasImage: true }), null);
  assert.equal(captionForVision('e tham khảo mã 30051010 được không, nhóm 3005 hay 3824'), 'e tham khảo mã được không, nhóm hay');
});

/**
 * Bảng này là bảng của `codebook().mask` trước Việc 13. Xoá lớp khuôn mẫu xong, `captionForVision` là chỗ CHE MÃ DUY NHẤT
 * còn lại ở bot (tin chữ do `plan.ts` của API che), nên nó phải giữ nguyên cả bảng: bỏ trống một nhánh regex mà 137 test
 * vẫn xanh nghĩa là nhánh đó không có ai canh.
 */
test('chú thích ảnh: mọi cách viết mã đều bị che trước khi tới vision; ngày, tỷ lệ, giờ, tiền và số hiệu văn bản giữ nguyên (R4)', () => {
  for (const [caption, masked] of [
    ['e tham khảo mã 30051010 được không', 'e tham khảo mã được không'],
    ['mã 3005 10 10', 'mã'],
    ['khai 3005.10 được không', 'khai được không'],
    ['e nghĩ là 30.05 được không', 'e nghĩ là được không'],
    ['HS: 3005', 'HS:'],
    ['hs code 3005', 'hs code'],
    ['mã số 30.05.10.10', 'mã số'],
    ['nhóm hàng 3005 hay 3824', 'nhóm hàng hay'],
    ['nhóm 3005 hoặc 3824, và 3926', 'nhóm hoặc , và'],
    ['đổi mã 3005 sang 3824.', 'đổi mã sang .'],
    ['thuộc chương 30', 'thuộc chương'],
    // Unikey gõ "Unicode tổ hợp": chuỗi NFD phải được NFC trước, không thì lookbehind từ khoá trượt.
    ['nhóm 3005'.normalize('NFD'), 'nhóm'],
    // Không phải mã — vision cần chúng để đọc đúng chú thích: ngày, tỷ lệ, giờ, số tiền, số hiệu văn bản.
    ['ngày 30.05 nộp 12.50% lúc 08.30 sáng, phạt 12.50 triệu', 'ngày 30.05 nộp 12.50% lúc 08.30 sáng, phạt 12.50 triệu'],
    ['Nghị định 26/2023/NĐ-CP ngày 31/05/2023, năm 2026', 'Nghị định 26/2023/NĐ-CP ngày 31/05/2023, năm 2026'],
    ['Thông tư 38/2015/TT-BTC quy định gì', 'Thông tư 38/2015/TT-BTC quy định gì'],
  ]) {
    assert.equal(captionForVision(caption), masked, caption);
  }
});

/**
 * Cùng đai an toàn `noCodes` mà `index.mjs` đã dùng cho state lưu lại: chuỗi 6–10 chữ số dính liền và mã 4-2-2(-2) nối
 * bằng gạch — hai cách viết `HS_TOKEN` đọc thiếu ("848180" còn nguyên, "8481809900" còn lại "00"). Che thừa một chú thích
 * ảnh là vô hại (vision chỉ cần mô tả hàng), nên chỗ này thà chặt tay.
 */
test('chú thích ảnh: mã dính liền và mã nối gạch cũng không tới vision; ngày ISO và năm vẫn nguyên (R4)', () => {
  for (const [caption, masked] of [
    ['mã hs 848180', 'mã hs'],
    ['mã hs 8481809900', 'mã hs'],
    ['van bi 8481-80-99 bằng đồng', 'van bi bằng đồng'],
    ['ngày 2026-09-15', 'ngày 2026-09-15'],
    ['biểu thuế năm 2026', 'biểu thuế năm 2026'],
    // ponytail: đai này nuốt luôn một cụm 6–10 chữ số không phải mã (số điện thoại, số tiền) — xem `noCodes` ở answer.mjs.
    ['0912 345678', '0912'],
  ]) {
    assert.equal(captionForVision(caption), masked, caption);
  }
});

test('một câu HỎI mã có sai/đúng không không bao giờ ghi sổ (R13); "mã đúng là <mã cũ>" vẫn xác nhận', async () => {
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
    await handleCorrection(tariff, 'mã đúng là 8481.80.99', 'A', null);
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
  assert.deepEqual(fastPath({ text: 'sai rồi ạ', ...fresh }), { action: 'confirm', verdict: 'wrong' });
  assert.equal(fastPath({ text: 'sai rồi, HS đúng là 8481.80.91 theo CV 12/K', ...fresh })?.action, 'correction');
});

test('"tôi muốn hỏi", "ý tôi là", "không phải, <mã> cơ" không phán quyết mã vừa tra: không đi đường tắt (R13, §2.2 hàng 3 và 10)', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['tôi muốn hỏi thủ tục nhập khẩu van này', 'ý tôi là thuế VAT của mã này', 'không phải, tôi hỏi thuế xuất khẩu cơ', 'tôi muốn hỏi thuế 8481.80.91 TQ', 'không phải, 6307.90.90 cơ', 'à nhầm, ý mình là van bi', 'sai rồi, không phải loại này']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  assert.equal(fastPath({ text: 'mã này không đúng', ...fresh })?.action, 'correction');
});

test('câu đối chiếu mã được quote kèm "sai rồi" không ghi mã người dùng là sai (R13); câu tra thuế thì vẫn đính chính', () => {
  const quoteText = 'Mã 3005.10.10 bạn tham khảo thuộc nhóm 30.05, trùng một nhóm ứng viên mình tra từ mô tả hàng.';
  const text = 'sai rồi, không phải nhóm này';
  assert.equal(fastPath({ text, quoteText, topic: 'tariff', tariffFresh: false }), null);
  assert.notEqual(guardIntent('correction', { topic: 'tariff', tariffFresh: false, quoteText }), 'correction');
  assert.equal(fastPath({ text: 'mã này sai', quoteText: TARIFF_ANSWER_QUOTE, topic: 'tariff', tariffFresh: true, table: OPEN })?.action, 'correction');
});

test('ứng viên HS không còn mô tả nào sau cổng thì không in "Với mô tả" rỗng', async () => {
  const text = await byClues({ keywords: [], hsHints: ['8481'], note: 'thuế suất 20%', date: '2026-09-13' }, null, '');
  assert.ok(text.startsWith('Mình tra được các mã ứng viên dưới đây'), text.slice(0, 80));
});

// --- 69/2018 (spec §5b.8) ------------------------------------------------------------

test('HỒI QUY 69/2018: số hiệu đầy đủ đi nguyên vẹn; văn bản đúng số không bị liệt kê như của cơ quan khác', () => {
  // Đọc số hiệu ra `{core, full, docType}` nay là việc của API (`legal.scope.ts parseDocRef`, có spec riêng): bản sao ở bot
  // không còn ai gọi từ Việc 12. Phần bot còn giữ là so số hiệu và trình bày văn bản chưa nạp.
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
  const say = async (text, api, quote = null, image = null) => {
    const calls = [];
    const notices = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      const body = init.body ? JSON.parse(init.body) : undefined;
      if (u.pathname !== '/conversation') calls.push({ path: u.pathname, body, hs: u.searchParams.get('hs') });
      const out = u.pathname === '/conversation' ? memo : await api(u.pathname, body, u);
      return { ok: out != null, status: out != null ? 200 : 404, json: async () => out };
    };
    try {
      const ctx = await loadContext('t1', 'u1');
      const r = await respond({ text, image, quote: quote && { msg: quote }, ctx, senderName: 'Chuyên Viên A', threadId: 't1', userId: 'u1', notify: async (m) => notices.push(m) });
      memo.topic = r.topic ?? memo.topic;
      memo.state = nextState(memo.state, r);
      memo.turns = [...memo.turns, { role: 'user', body: text }, { role: 'bot', body: render(r.text).map((p) => p.msg).join('\n\n') }];
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

test('Việc 12 (D3a): báo cáo phân loại full tra /tariff cho từng mã tariff_ref và in khối do code dựng; brief thì không', async () => {
  const full = { ...composedHs, depth: 'full', asOf: '2026-09-15', tariffRef: ['3005.10.10', '3824.99.99'] };
  const run = await conversation().say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: full }));
  const looked = run.calls.filter((x) => x.path === '/tariff');
  assert.deepEqual(looked.map((x) => x.hs), ['30051010', '38249999'], 'một lượt tra cho mỗi mã walkthrough trỏ tới');
  assert.ok(run.text.includes('MFN'), 'khối thuế do code dựng nằm dưới báo cáo (R1)');

  const brief = await conversation().say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: { ...full, depth: 'brief' } }));
  assert.equal(brief.calls.filter((x) => x.path === '/tariff').length, 0, 'brief không tra thuế');
  assert.ok(!brief.text.includes('MFN'));
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
  const onCandidates = { topic: 'tariff', candidatesFresh: true, table: { hs: null, candidates: ['30.05', '38.24'], open: true } };
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

test('Việc 12 (5): ngay sau câu hs, "HS đúng là 8422.90.90" ghi đúng một dòng correct kèm mô tả, không dòng wrong; quote câu hs thì không ghi (R13)', async () => {
  const c = await afterHs();
  const run = await c.say('HS đúng là 8422.90.90', fakeApi());
  assert.equal(run.answers.length, 0, 'đính chính tường minh đi đường tắt');
  assert.equal(run.confirms.length, 1);
  assert.deepEqual([run.confirms[0].verdict, run.confirms[0].hs], ['correct', '84229090']);
  assert.ok(run.confirms[0].note.includes('miếng dán ngải cứu'), run.confirms[0].note);
  assert.ok(run.text.startsWith('Đã ghi nhận mã 8422.90.90 cho miếng dán ngải cứu'), run.text.slice(0, 80));
  // Round 4: similar goods share headings, so a quoted candidates reply may be another goods' (D08).
  const quoted = await afterHs();
  assert.equal((await quoted.say('HS đúng là 8422.90.90', fakeApi(), quoted.reply)).confirms.length, 0);
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
    'Mã 6307.90.90 (Sản phẩm dệt đã hoàn thiện khác) khác các nhóm 30.05, 38.24 mình vừa nêu. Muốn mình ghi nhận mã này cho miếng dán ngải cứu, nhắn "HS đúng là 6307.90.90". Cần thuế thì nhắn thêm xuất xứ.',
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

test('2026-09-17: Claude hết lượt ở bước kế hoạch → bot nói đúng lỗi, không đoán theo defaultPlan (không đòi mã HS khi hàng đã được mô tả)', async () => {
  const limit = "You've hit your weekly limit · resets Sep 20, 9pm (UTC)";
  const fallback = plan08({ intent: 'tariff', understanding: null, goods: { facts: [], missing: [] }, keywords: [] });
  const q = 'HS mặt hàng SMART VOICE CONTROL PANEL, bảng điều khiển trung tâm nhà thông minh, kết nối Zigbee, Bluetooth hoặc Wi-Fi';
  for (const [llmError, want] of [
    [{ kind: 'refused', message: limit }, limit],
    [{ kind: 'timeout', message: null }, 'không phản hồi kịp'],
    [{ kind: 'failed', message: null }, 'gặp lỗi'],
  ]) {
    const { text, calls, notices, answers } = await conversation().say(q, fakeApi({ planned: plannedOf(fallback, { codeRole: 'none', ack: null, fallback: true, llmError }) }));
    assert.ok(text.includes('Claude') && text.includes(want), text);
    assert.ok(!text.includes('mã HS 8 số của hàng (kèm xuất xứ) để mình tra thuế'), 'không phải câu xin mã');
    assert.equal(answers.length, 1, 'không soạn trên kế hoạch đoán');
    assert.ok(!calls.some((x) => x.path.startsWith('/tariff')));
    assert.equal(notices.length, 0);
  }
});

test('2026-09-17: vision gặp CLI thoát lỗi (hết lượt) → trả lỗi của CLI, không phải "chưa nhận ra mặt hàng"', async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { claudeVision } = await import('./router.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  const env0 = { PATH: process.env.PATH, token: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  try {
    writeFileSync(join(dir, 'claude'), `#!/bin/sh\ncat >/dev/null\necho "You've hit your weekly limit · resets Sep 20, 9pm (UTC)"\nexit 1\n`);
    chmodSync(join(dir, 'claude'), 0o755);
    process.env.PATH = `${dir}:${env0.PATH}`;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test';
    assert.deepEqual(await claudeVision(join(dir, 'a.jpg'), '', dir), { kind: 'failed', message: "You've hit your weekly limit · resets Sep 20, 9pm (UTC)" });
  } finally {
    process.env.PATH = env0.PATH;
    if (env0.token === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = env0.token;
    rmSync(dir, { recursive: true, force: true });
  }
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

  for (const text of ['sai rồi, HS đúng là 8481.80.91', 'sai rồi', 'HS đúng là 8481.80.99']) {
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

test('kế hoạch tariff: mã bị nghi không tra thuế; không mã thì hỏi mã hoặc soạn hs, không tra từ khoá trên tin (R4); "còn từ Nhật" có văn xuôi + khối như tra trần; văn bản thiếu không chặn tra thuế', async () => {
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
  const reuse = plannedOf(plan08({ intent: 'tariff', reuseLastHs: true, origin: 'JP', ...noGoods }), { codeRole: 'none' });
  const japan = await t.say('còn từ Nhật thì sao', fakeApi({ planned: reuse }));
  assert.equal(japan.answers.length, 2);
  const [, asked] = japan.answers;
  assert.deepEqual(
    [asked.planOnly, asked.forceIntent, asked.plan],
    [undefined, 'tariff', { intent: 'tariff', reuseLastHs: true, origin: 'JP', date: todayVN() }],
    'Q1: cùng đường văn xuôi + khối như tra trần; kế hoạch bot dựng không mã (R4)',
  );
  assert.equal(asked.context.state.tariff.dotted, '8481.80.99', 'API lấy mã vừa tra trong state làm khoá');
  assert.ok(japan.text.startsWith('Hàng hóa có mã HS 8481.80.99') && japan.text.includes('Nhật Bản'), '/answer không trả lời: khối thuế một mình');
  const withProse = conversation();
  await withProse.say('8481.80.99 TQ', fakeApi());
  const prose = 'Hàng từ Nhật Bản chỉ hưởng mức ưu đãi đặc biệt khi có C/O đúng mẫu của hiệp định.';
  const jp = await withProse.say('còn từ Nhật thì sao', fakeApi({ planned: reuse, composed: { mode: 'tariff', answerMd: prose, citations: [], cut: 0, calls: 1 } }));
  const [sentJp] = render(jp.r.text);
  assert.ok(sentJp.msg.startsWith(`${prose}\n\nHàng hóa có mã HS 8481.80.99`), sentJp.msg.slice(0, 160));
  assert.deepEqual([withProse.memo.state.tariff.origin, withProse.memo.state.tariff.open], ['JP', true]);

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
  assert.match(inside.text, /^Mã 3005\.10\.10 .*nằm trong các nhóm 3005\.10, 38\.24 mình vừa nêu\./);

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
  assert.equal((await c.say('HS đúng là 8481.80.10', fakeApi(), latest)).confirms.length, 0, 'round 4: bàn đã ghi phán quyết không nhận phán quyết thứ hai');
  const s = conversation();
  const shown = render((await s.say('8481.80.91 TQ', fakeApi())).r.text)[0].msg;
  staleTariff(s);
  // A ruling with no code needs fresh memory, one word or three; "HS đúng là <mã>" reads the old code from the quote when it is
  // the code in memory.
  assert.equal((await s.say('sai rồi', fakeApi(), shown)).confirms.length, 0);
  assert.equal((await s.say('mã này sai', fakeApi(), shown)).confirms.length, 0, 'G05: cùng luật cũ/mới với một từ phán quyết');
  assert.deepEqual(pairs(await s.say('HS đúng là 8481.80.10', fakeApi(), shown)), [['84818010', 'correct'], ['84818091', 'wrong']], 'bộ nhớ đã cũ: quote đúng mã đang nhớ vẫn đính chính được');
});

test('R13: phán sai không kèm mã chỉ nhận khi là cả tin; người dùng kể lỗi của chính mình không ghi gì', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['em gõ sai', 'em nhập sai mã rồi', 'hỏi sai câu rồi', 'mình ghi nhầm', 'em gõ sai, ý em là van bi', 'sai rồi, không phải loại này', 'nhầm mã rồi', 'vừa tra nhầm mã rồi']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['mã này sai', 'mã này không đúng']) {
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
  assert.deepEqual(fastPath({ text: 'sai', quoteText: history, topic: 'tariff', tariffFresh: true, table: { hs: '84818099', date: todayVN() } }), { action: 'confirm', verdict: 'wrong' });
});

test('R13 (S12–S16): "HS đúng là X" chỉ là phán quyết khi là cả tin, có thể sau "sai (rồi),"; câu điều kiện, phủ định, phỏng đoán, câu hỏi không ghi', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  const onCandidates = { topic: 'tariff', candidatesFresh: true, table: { hs: null, candidates: ['30.05', '38.24'], open: true } };
  for (const text of [
    'nếu HS đúng là 8481.80.91 thì thuế bao nhiêu', 'không phải HS đúng là 8481.80.91 đâu, vẫn là 8481.80.99', 'hình như mã đúng là 8481.80.91',
    'em nghĩ HS đúng là 8481.80.91', 'có phải mã đúng là 8481.80.91', 'hs dung la 8481.80.91 phai hk', 'giả sử mã đúng là 8481.80.91',
    'chắc HS đúng là 8481.80.91', 'liệu HS đúng là 8481.80.91', 'mã đúng là 8481.80.91 chăng', 'không đúng là 8481.80.91', 'theo em HS đúng là 8481.80.91',
    'không phải, HS đúng là 8481.80.91', 'sai rồi 😅 HS đúng là 8481.80.91',
  ]) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['nếu HS đúng là 3005.90.00 thì thuế bao nhiêu', 'hình như HS đúng là 3005.90.00', 'không phải, HS đúng là 3005.90.00']) {
    assert.equal(fastPath({ text, ...onCandidates }), null, text);
  }
  for (const text of ['HS đúng là 8481.80.91', 'sai rồi, HS đúng là 8481.80.91', 'Sai. Mã đúng là 8481.80.91', 'sai rồi, mã đúng phải là 8481.80.91', 'mã chuẩn là 8481.80.91', 'mã HS đúng: 8481.80.91']) {
    assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
  }
  assert.equal(fastPath({ text: 'sai rồi, HS đúng là 3005.90.00', ...onCandidates })?.action, 'correction');
});

test('R13 (S17, S18): "sai rồi, …" bàn về văn xuôi hay một mức thuế không phải phán mã sai; vế sau chỉ vào hàng hay mã thì vẫn là phán quyết', async () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of [
    'sai rồi, thuế MFN phải 5% chứ', 'sai rồi, form E không bắt buộc đâu', 'sai rồi, điều 5 không nói vậy', 'sai rồi, bạn xem lại đi', 'sai rồi, mã này không được hưởng ưu đãi',
    'sai rồi, không phải loại này', 'sai rồi, hàng này là van bi', 'mã này sai, không phải mã đó', 'sai rồi 😅',
  ]) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['chưa đúng', 'mã HS này sai']) assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
  assert.deepEqual(fastPath({ text: 'sai r', ...fresh }), { action: 'confirm', verdict: 'wrong' });
  const prose = { mode: 'tariff', answerMd: 'Mức ACFTA chỉ áp khi hàng có C/O form E hợp lệ; không có C/O thì áp MFN.', citations: [], cut: 0, calls: 1 };
  const c = conversation();
  const rate = await c.say('8481.80.99 TQ', fakeApi({ composed: prose }));
  assert.equal((await c.say('sai rồi, form E không bắt buộc đâu', fakeApi(), msg0(rate))).confirms.length, 0);
  assert.deepEqual(pairs(await c.say('mã này sai', fakeApi(), msg0(rate))), [['84818099', 'wrong']], 'quote đúng câu tra trên bàn và phán mã sai thì vẫn ghi');
});

test('R13 (S29, S30, D05–D07): "HS đúng là X" quote câu soạn không ghi gì; quote lời mời cũng không, kể cả lời mời nêu đúng mã đang nhớ', async () => {
  const hs = await afterHs();
  await hs.say('3005.10.10 TQ', fakeApi());
  assert.equal((await hs.say('HS đúng là 3005.90.00', fakeApi(), hs.reply)).confirms.length, 0, 'S29');

  const l = await afterLookup();
  const planned = plannedOf(plan08({ intent: 'legal', ...noGoods }), { codeRole: 'subject', mode: 'legal', ack: null });
  const legal = await l.say('van 8481.80.99 có phải kiểm tra chuyên ngành không', fakeApi({ planned, composed: { ...composedLegal, codeRole: 'subject', answerMd: 'Van này thuộc danh mục kiểm tra [1].' } }));
  await l.say('8481.80.99 TQ', fakeApi());
  assert.equal((await l.say('sai rồi, HS đúng là 8481.80.10', fakeApi(), msg0(legal))).confirms.length, 0, 'S30');

  // An offer names no origin, date or owner: the same text answers a TQ lookup, a JP one, or a colleague's (D05, D06, D20).
  const o = await afterLookup();
  const offer = await o.say('63079090 mới đúng', planOf('correction'));
  assert.equal((await o.say('HS đúng là 6307.90.90', fakeApi(), msg0(offer))).confirms.length, 0, 'lời mời về chính bàn này');
  const jp = await afterLookup();
  const bare = await jp.say('sai rồi, sao lại ra mã này', planOf('correction'));
  await jp.say('8481.80.99 JP', fakeApi());
  assert.equal((await jp.say('HS đúng là 8481.80.91', fakeApi(), msg0(bare))).confirms.length, 0, 'D05: lời mời của lượt tra TQ, bàn JP');
  const dated = await afterLookup();
  const today = await dated.say('63079090 mới đúng', planOf('correction'));
  await dated.say('8481.80.99 TQ 2025-01-01', fakeApi());
  assert.equal((await dated.say('HS đúng là 6307.90.90', fakeApi(), msg0(today))).confirms.length, 0, 'D07: lời mời hôm nay, bàn 2025');
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

// --- Plan 08 Việc 12 round 3 (2026-09-15): the ledger is written only from a closed list of whole-message forms (R13) ----

test('R13 văn phạm đóng: một từ phán quyết có "?" hay "à" không ghi; lễ phép cuối tin vẫn ghi; "ok" không bao giờ ghi', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['đúng?', 'sai?', 'Sai???', 'không chắc?', 'chuẩn?', 'đúng rồi?', 'chính xác?', 'đúng…?', 'sai à', 'đúng hả', 'ok', 'oke', 'đúng không', 'sai hay sao']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const [text, verdict] of [
    ['đúng ạ', 'correct'], ['chuẩn ạ', 'correct'], ['đúng rồi nhé', 'correct'], ['đúng rồi nha', 'correct'], ['Đúng rồi bạn', 'correct'], ['chính xác ạ', 'correct'],
    ['đúng nha', 'correct'], ['dung r', 'correct'], ['sai ạ', 'wrong'], ['Sai.', 'wrong'], ['sai rồi!', 'wrong'], ['không đúng nhá', 'wrong'], ['ko đúng', 'wrong'], ['không chắc', 'unsure'],
  ]) {
    assert.deepEqual(fastPath({ text, ...fresh }), { action: 'confirm', verdict }, text);
  }
});

test('R13 văn phạm đóng: phán sai không mã chỉ khi cả tin là "(mã (này))? sai/không đúng/chưa đúng/nhầm mã"; dài hơn là bước kế hoạch', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of ['mã này sai', 'mã HS này không đúng', 'kết quả vừa tra sai rồi', 'mã vừa tra không đúng', 'chưa đúng', 'code đó sai ạ']) {
    assert.equal(fastPath({ text, ...fresh })?.action, 'correction', text);
  }
  for (const text of ['sai rồi, sao lại ra mã này', 'sai rồi, không phải loại này', 'mã này sai, không phải mã đó', 'sai rồi 😅', 'chắc sai rồi', 'sai rồi thì phải', 'mã này sai không']) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  assert.equal(fastPath({ text: 'mã này sai', ...fresh, tariffFresh: false, quoteText: TARIFF_ANSWER_QUOTE }), null, 'kết quả đã cũ: như một từ phán quyết');
});

test('R13 văn phạm đóng: "HS đúng là <một mã>" chỉ kèm xuất xứ, số công văn, lễ phép; mọi câu hỏi, phỏng đoán, vế sau khác không ghi', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of [
    'HS đúng là 8481.80.91', 'HS đúng là 8481.80.91 nhé', 'HS đúng là 8481.80.91 theo CV 123/HQ-TXNK', 'sai rồi, mã đúng phải là 8481.80.91 xuất xứ Trung Quốc',
    'Sai. Mã đúng là 8481.80.91.', 'mã HS đúng: 8481.80.91', 'HS đúng là 84818091 căn cứ công văn số 12/TCHQ nha', 'HS ĐÚNG LÀ 8481 80 91',
  ]) {
    assert.deepEqual(fastPath({ text, ...fresh }), { action: 'correction' }, text);
  }
  for (const text of [
    'mã đúng là 8481.80.91 thì thuế bao nhiêu', 'HS đúng là 8481.80.91 thì thuế bao nhiêu', 'mã đúng là 8481.80.91 thì phải', 'hs dung la 8481.80.91 hay sao ay',
    'HS đúng là 8481.80.91 nhưng em chưa chắc lắm', 'ma dung la 8481.80.91 thi thue nk bao nhieu', 'nếu HS đúng là 8481.80.91 thì sao', 'HS đúng là 8481.80.91 chứ nhỉ',
    'HS đúng là 8481.80.91 hay 8481.80.10', 'không phải, HS đúng là 8481.80.91', 'sai rồi 😅 HS đúng là 8481.80.91', 'HS đúng là 8481.80.91?', 'HS đúng là 8481.80.91 chưa',
    'HS đúng là 8481.80.91 xuất xứ không rõ',
  ]) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  assert.equal(fastPath({ text: 'HS đúng là 8481.80.91', ...fresh, table: { ...OPEN, open: false } }), null, 'câu trước không phải câu tra: lời mời, không ghi');
});

test('R13: quote câu tra phải khớp xuất xứ và ngày; không nhãn xuất xứ chỉ khớp bảng không xuất xứ', () => {
  const dated = TARIFF_ANSWER_QUOTE.split('\n')[1];
  const lead = (origin) => `Hàng hóa có mã HS 8481.80.99 (Vòi, van) có xuất xứ ${origin} có thuế nhập khẩu ưu đãi thông thường (MFN) 10% [1].\n${dated}`;
  const base = { text: 'sai', topic: 'tariff', tariffFresh: true };
  assert.equal(fastPath({ ...base, quoteText: TARIFF_ANSWER_QUOTE, table: { ...OPEN, origin: 'CN' } }), null, 'quote không xuất xứ, bảng CN');
  assert.equal(fastPath({ ...base, quoteText: lead('Trung Quốc'), table: OPEN }), null, 'quote CN, bảng không xuất xứ');
  assert.deepEqual(fastPath({ ...base, quoteText: lead('Trung Quốc'), table: { ...OPEN, origin: 'CN' } }), { action: 'confirm', verdict: 'wrong' });
  assert.equal(fastPath({ ...base, quoteText: TARIFF_ANSWER_QUOTE, table: { ...OPEN, date: '2025-01-01' } }), null, 'quote in ngày khác bảng');
  // Round 4 (D01–D03): part 1 of a long lookup has no date line, and part 1 of an older lookup of the same code and origin reads
  // the same as today's.
  const undated = TARIFF_ANSWER_QUOTE.split('\n')[0];
  for (const text of ['sai', 'đúng rồi', 'mã này sai', 'HS đúng là 8481.80.91']) {
    assert.equal(fastPath({ ...base, text, quoteText: undated, table: OPEN }), null, `quote không dòng ngày: ${text}`);
  }
});

test('R13 luồng ứng viên: "HS đúng là X" quote tin khác câu đặt các ứng viên đó lên bàn không ghi; không quote chỉ ghi khi câu trước là câu ứng viên', async () => {
  const G2 = { ...composedHs, userCodes: [], codeRole: 'none', answerMd: 'Máy cắt cỏ chạy xăng: chỗ quyết định là công dụng chính [1].', candidates: [{ hs: '84.33', level: 4, title: 'Máy thu hoạch', evidence: [1] }, { hs: '84.32', level: 4, title: 'Máy nông nghiệp', evidence: [1] }] };
  const g2Plan = fakeApi({ planned: plannedOf(plan08({ question: 'máy cắt cỏ chạy xăng mã gì', goods: { facts: ['máy cắt cỏ chạy xăng'], missing: [] } }), { codeRole: 'none', mode: 'hs' }), composed: G2 });
  const onG2 = async (before) => {
    const c = conversation();
    const quote = await before(c);
    await c.say('máy cắt cỏ chạy xăng mã gì', g2Plan);
    return { c, quote };
  };
  const cases = {
    N01: (c) => c.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: composedHs })).then(msg0),
    N02: async () => 'miếng dán ngải cứu mã gì vậy mọi người',
    N03: (c) => c.say('thời hạn nộp thuế', fakeApi({ planned: plannedOf(plan08({ intent: 'legal', ...noGoods }), { codeRole: 'none', mode: 'legal', ack: null }), composed: composedLegal })).then(msg0),
    N04: async (c) => { await c.say('8481.80.99 TQ', fakeApi()); return msg0(await c.say('30059000 mới đúng', planOf('correction'))); },
  };
  for (const [id, before] of Object.entries(cases)) {
    const { c, quote } = await onG2(before);
    assert.equal((await c.say('HS đúng là 3005.90.00', fakeApi(), quote)).confirms.length, 0, id);
  }
  const quoted = await afterHs();
  assert.equal((await quoted.say('HS đúng là 3005.90.00', fakeApi(), quoted.reply)).confirms.length, 0, 'round 4: quote cả câu ứng viên của chính bàn này cũng không ghi');
  const plain = await afterHs();
  assert.deepEqual(pairs(await plain.say('sai rồi, mã đúng là 3005.90.00', fakeApi())), [['30059000', 'correct']], 'không quote, ngay sau câu ứng viên');
  const later = await afterHs();
  await later.say('thuế cái này bao nhiêu', planOf('tariff'));
  assert.equal((await later.say('HS đúng là 3005.90.00', fakeApi())).confirms.length, 0, 'sau NEEDS_CODE, không quote');
});

test('R13: sau NEEDS_CODE hay một câu đính chính vừa ghi, không có gì mở cho phán quyết; lời mời nêu lệnh nào thì gửi đúng lệnh đó ghi được', async () => {
  const needs = await afterLookup();
  await needs.say('thuế cái kia bao nhiêu', planOf('tariff'));
  assert.equal((await needs.say('mã đúng là 8481.80.91', fakeApi())).confirms.length, 0, 'D14');
  const fixed = await afterLookup();
  assert.equal((await fixed.say('sai rồi, HS đúng là 8481.80.91', fakeApi())).confirms.length, 2);
  assert.equal((await fixed.say('đúng', fakeApi())).confirms.length, 0, 'D08: không ghi phán quyết thứ hai');
  const offered = await afterLookup();
  await offered.say('63079090 mới đúng', planOf('correction'));
  assert.deepEqual(pairs(await offered.say('HS đúng là 6307.90.90', fakeApi())), [['63079090', 'correct'], ['84818099', 'wrong']]);
  const reopened = await afterLookup();
  await reopened.say('63079090 mới đúng', planOf('correction'));
  assert.equal((await reopened.say('đúng', fakeApi())).confirms.length, 0, 'lời mời về mã khác không mở "đúng" cho mã vừa tra');
  const cands = await afterHs();
  const offer = await cands.say('63079090 mới đúng', fakeApi({ planned: plannedOf(plan08({ intent: 'correction', question: '[mã 1] mới đúng', goods: { facts: [], missing: [] } })) }));
  assert.match(offer.text, /nhắn "HS đúng là 6307\.90\.90"/);
  assert.deepEqual(pairs(await cands.say('HS đúng là 6307.90.90', fakeApi())), [['63079090', 'correct']]);
});

// --- Plan 08 Việc 12 round 4 (2026-09-15): words read as typed, quotes that never write, ruled tables, groups, a notice (R13) ----

test('R13 văn phạm đóng (F01–F20): tin có dấu chỉ khớp dạng có dấu; "dùng", "sài", "á", "nhẹ" không thành phán quyết; tin không dấu vẫn đọc bỏ dấu', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of [
    'không dùng', 'ko dùng', 'chưa dùng', 'mã này chưa dùng', 'dùng rồi', 'dùng r ạ', 'mã dùng là 8481.80.91', 'HS dùng là 8481.80.91', 'sài rồi',
    'mã này sài rồi', 'sai á', 'đúng á', 'chính xác á', 'k chắc á', 'HS đúng là 8481.80.91 á', 'sai nhẹ', 'code dùng: 8481.80.91', 'mã đó dùng rồi',
    'hs dùng phải là 8481.80.91', 'không dùng ạ', 'dùng', 'dùng nhé', 'dũng', 'đụng rồi', 'k dùng', 'mã này không dùng',
  ]) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  assert.deepEqual(fastPath({ text: 'dung roi', ...fresh }), { action: 'confirm', verdict: 'correct' });
  assert.deepEqual(fastPath({ text: 'sai roi', ...fresh }), { action: 'confirm', verdict: 'wrong' });
  assert.deepEqual(fastPath({ text: 'HS đúng là 8481.80.91', ...fresh }), { action: 'correction' });
});

test('R13 luồng ứng viên (D08–D10): quote câu ứng viên hay lời mời của hàng khác cùng các nhóm không ghi cho hàng đang nhớ', async () => {
  const goods = (desc) => fakeApi({
    planned: plannedOf(plan08({ question: `${desc} mã gì`, goods: { facts: [desc], missing: [] }, keywords: [desc] }), { codeRole: 'none', mode: 'hs' }),
    composed: { ...composedHs, userCodes: [], codeRole: 'none', answerMd: `Với ${desc}, chỗ quyết định là công dụng chính [1].` },
  });
  for (const pick of ['reply', 'offer']) {
    const c = conversation();
    const first = await c.say('miếng dán ngải cứu mã gì', goods('miếng dán ngải cứu'));
    const offer = await c.say('30059000 mới đúng', planOf('correction'));
    await c.say('miếng dán hạ sốt mã gì', goods('miếng dán hạ sốt'));
    assert.equal((await c.say('HS đúng là 3005.90.00', fakeApi(), msg0(pick === 'reply' ? first : offer))).confirms.length, 0, pick);
  }
});

test('R13 ảnh (D14–D16): lượt tra gõ tay rồi "đúng" trả lời một ảnh hay làm chú thích ảnh mới: lời mời, không ghi, không chạy lại vision; "đúng" không ảnh sau lời mời thì ghi', async () => {
  const c = await afterLookup();
  const photo = await c.say('đúng', fakeApi(), null, { imageUrls: ['https://cdn.example/p1.jpg'] });
  assert.deepEqual([photo.confirms.length, photo.answers.length, pathsOf(photo).includes('/p1.jpg')], [0, 0, false]);
  assert.match(photo.text, /mã 8481\.80\.99 vừa tra: .*nhắn "đúng"/);
  assert.deepEqual(pairs(await c.say('đúng', fakeApi())), [['84818099', 'correct']]);
});

test('R13 bàn đã ghi (D11–D13, S01–S03): không nhận phán quyết thứ hai, quote câu tra hay không; lời mời sau đó không mở lại bàn', async () => {
  for (const [first, second] of [['đúng', 'đúng'], ['đúng', 'sai'], ['chuẩn', 'mã này sai'], ['đúng', 'HS đúng là 8481.80.91']]) {
    const c = conversation();
    const lookup = await c.say('8481.80.99 TQ', fakeApi());
    assert.equal((await c.say(first, fakeApi())).confirms.length, 1, first);
    assert.equal((await c.say(second, fakeApi(), msg0(lookup))).confirms.length, 0, `${first}, rồi quote câu tra: ${second}`);
  }
  for (const [first, reply, intent, again] of [
    ['đúng', 'ok chuẩn rồi đó bạn', 'confirm', 'đúng'],
    ['sai rồi, HS đúng là 8481.80.91', 'cảm ơn, giờ đúng rồi đó', 'confirm', 'đúng'],
    ['sai', 'sai rồi mà', 'correction', 'sai'],
  ]) {
    const c = await afterLookup();
    assert.ok((await c.say(first, fakeApi())).confirms.length > 0, first);
    const offer = await c.say(reply, planOf(intent));
    assert.doesNotMatch(offer.text, /chưa ghi nhận gì/, reply);
    assert.equal((await c.say(again, fakeApi())).confirms.length, 0, `${first} → ${reply} → ${again}`);
  }
});

test('R13 xuất xứ (D21, D22): "HS đúng là <mã> xuất xứ <nước>" khác xuất xứ vừa tra không ghi gì và chỉ cách tra xuất xứ đó', async () => {
  const cn = await afterLookup();
  const jp = await cn.say('HS đúng là 8481.80.99 xuất xứ Nhật Bản', fakeApi());
  assert.equal(jp.confirms.length, 0);
  assert.match(jp.text, /nhắn "8481\.80\.99 xuất xứ Nhật Bản"/);
  const none = conversation();
  await none.say('8481.80.99', fakeApi());
  assert.equal((await none.say('HS đúng là 8481.80.99 xuất xứ TQ', fakeApi())).confirms.length, 0, 'bàn không xuất xứ');
  const other = await afterLookup();
  assert.equal((await other.say('HS đúng là 8481.80.91 xuất xứ Nhật Bản', fakeApi())).confirms.length, 0, 'mã khác: dòng wrong của mã vừa tra không mang xuất xứ tin nêu');
  const same = await afterLookup();
  assert.deepEqual(pairs(await same.say('HS đúng là 8481.80.99 xuất xứ Trung Quốc', fakeApi())), [['84818099', 'correct']]);
});

/** The photo reply for "van nhựa" whose three hints tie: a candidates table of full codes. */
async function borderlinePhoto(origin) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const body = u.pathname === '/tariff/search' ? CANDS[u.searchParams.get('prefix')] ?? [] : u.pathname === '/tariff/confirmations/match' ? [] : u.pathname === '/tariff' ? tariff8481({ origin }) : null;
    return { ok: body !== null, status: body !== null ? 200 : 404, json: async () => body };
  };
  try {
    return await tariffByClues({ keywords: ['van nhựa'], origin, hsHints: ['8481', '7307', '3926'], date: '2026-09-13' }, 'van nhựa');
  } finally {
    globalThis.fetch = real;
  }
}

test('R13 ảnh ranh giới (D23, D24): ba mã ngang nhau là bàn ứng viên: "đúng" không ghi; "HS đúng là <mã thứ hai>" chỉ ghi correct cho mã đó', async () => {
  const photo = await borderlinePhoto('CN');
  assert.deepEqual([photo.tariff.hs, photo.tariff.candidates], [null, ['8481.80.99', '7307.99.90', '3926.90.99']]);
  const onPhoto = () => {
    const c = conversation();
    [c.memo.topic, c.memo.state] = ['tariff', nextState({}, photo)];
    return c;
  };
  assert.equal((await onPhoto().say('đúng', fakeApi())).confirms.length, 0);
  assert.deepEqual(pairs(await onPhoto().say('HS đúng là 7307.99.90', fakeApi())), [['73079990', 'correct']]);
});

test('đồng ý thường sau câu pháp luật là AGREED, không soạn lại; "đúng?" đi bước kế hoạch; trên kết quả tra còn mới thì ra lời mời nêu lệnh', async () => {
  const legal = fakeApi({ planned: plannedOf(plan08({ intent: 'legal', question: 'thời hạn nộp thuế', ...noGoods }), { codeRole: 'none', mode: 'legal', ack: null }), composed: composedLegal });
  for (const text of ['chuẩn rồi', 'đúng vậy', 'chính xác rồi', 'chuẩn luôn']) {
    const l = conversation();
    await l.say('thời hạn nộp thuế', legal);
    const run = await l.say(text, legal);
    assert.deepEqual([run.answers.length, run.notices.length, run.text], [0, 0, 'Dạ, bạn cần gì thêm cứ nhắn mình nhé.'], text);
  }
  const q = conversation();
  await q.say('thời hạn nộp thuế', legal);
  assert.equal((await q.say('đúng?', legal)).answers.filter((a) => a.planOnly).length, 1);

  for (const text of ['chuẩn rồi', 'đúng vậy', 'chưa chắc']) {
    const t = await afterLookup();
    const offer = await t.say(text, planOf('general'));
    assert.deepEqual([offer.confirms.length, offer.answers.length], [0, 0], text);
    assert.match(offer.text, /nhắn "đúng"/, text);
    assert.deepEqual(pairs(await t.say('đúng', fakeApi())), [['84818099', 'correct']], text);
  }
  // A quote is what the word answers: an older lookup quoted with "sai rồi" never gets an offer about the code on the table.
  const two = conversation();
  const older = await two.say('8481.80.99 TQ', fakeApi());
  await two.say('8481.80.91 TQ', fakeApi());
  const quoted = await two.say('sai rồi', planOf('general'), msg0(older));
  assert.deepEqual([quoted.confirms.length, quoted.answers.length], [0, 1]);
  assert.doesNotMatch(quoted.text, /vừa tra/);
});

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
let listenerThreads = 0;

/** The Zalo message handler (index.mjs) on a fresh thread against `api`: memory per user as the API keeps it, what it sends, what it writes. */
async function onThread(api, run, { group = false, saveFails = () => false } = {}) {
  const threadId = `listener-${++listenerThreads}`;
  const memos = new Map();
  const memo = (id) => memos.get(id) ?? memos.set(id, { topic: null, state: {}, turns: [] }).get(id);
  const sent = [];
  const confirms = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    let out;
    if (u.pathname === '/conversation') out = structuredClone(memo(u.searchParams.get('userId')));
    else if (u.pathname === '/conversation/turn' && saveFails(body)) out = null;
    else if (u.pathname === '/conversation/turn') {
      const m = memo(body.userId);
      if ('topic' in body) m.topic = body.topic;
      if ('state' in body) m.state = body.state;
      out = {};
    } else {
      if (u.pathname === '/tariff/confirm') confirms.push(body);
      out = await api(u.pathname, body, u);
    }
    return { ok: out != null, status: out != null ? 200 : 404, json: async () => out };
  };
  const handle = messageHandler({ sendMessage: async (content) => { sent.push(content.msg); } }, 'bot');
  const say = (uid, text, quote = null) =>
    handle({
      threadId, type: group ? ThreadType.Group : ThreadType.User,
      data: { uidFrom: uid, dName: uid, content: group ? `@bot ${text}` : text, mentions: group ? [{ uid: 'bot', pos: 0, len: 4 }] : [], ...(quote ? { quote: { msg: quote } } : {}) },
    });
  try {
    return await run({ say, sent, confirms });
  } finally {
    globalThis.fetch = real;
  }
}

const LEGAL_Q = 'van nhập khẩu có phải kiểm tra chuyên ngành không';
const legalPlanned = plannedOf(plan08({ intent: 'legal', question: LEGAL_Q, ...noGoods }), { codeRole: 'none', mode: 'legal', ack: 'Bạn đang hỏi van nhập khẩu có phải kiểm tra chuyên ngành không' });

test('R13 (P01–P06): "đúng rồi" gửi lúc câu soạn còn chạy sau lời báo đã hiểu câu hỏi được đọc sau khi câu soạn đã lưu: không ghi cho lượt tra phía trên', async () => {
  const gate = deferred();
  const api = async (path, body, u) => {
    if (path === '/answer' && body.q === LEGAL_Q) {
      if (body.planOnly) return legalPlanned;
      await gate.promise;
      return composedLegal;
    }
    return fakeApi()(path, body, u);
  };
  await onThread(api, async ({ say, sent, confirms }) => {
    await say('u1', '8481.80.99 TQ');
    const slow = say('u1', LEGAL_Q);
    for (let i = 0; i < 200 && !sent.some((m) => m.includes('mình tra văn bản')); i++) await tick();
    assert.ok(sent.some((m) => m.includes('mình tra văn bản')), 'lời báo đã gửi, câu soạn còn chờ');
    const agree = say('u1', 'đúng rồi');
    for (let i = 0; i < 50; i++) await tick();
    gate.resolve();
    await Promise.all([slow, agree]);
    assert.equal(confirms.length, 0);
    assert.equal(sent.at(-1), 'Dạ, bạn cần gì thêm cứ nhắn mình nhé.');
  });
});

test('R13 nhóm (D18, D19): tin cuối của bot trả lời người khác thì phán quyết không quote không ghi mà ra lời mời; quote câu tra của mình, hay nhắn ngay sau lời mời, thì ghi', async () => {
  const api = (path, body, u) => (path === '/answer' && body.q === LEGAL_Q ? (body.planOnly ? legalPlanned : composedLegal) : fakeApi()(path, body, u));
  await onThread(api, async ({ say, sent, confirms }) => {
    await say('U', '8481.80.99 TQ');
    const mine = sent.at(-1);
    await say('V', '8481.80.91 TQ');
    await say('U', 'chuẩn');
    assert.equal(confirms.length, 0, 'D18');
    assert.match(sent.at(-1), /mã 8481\.80\.99 vừa tra: .*nhắn "đúng"/);
    await say('V', LEGAL_Q);
    await say('U', 'đúng rồi');
    assert.equal(confirms.length, 0, 'D19');
    await say('V', '8481.80.10 TQ');
    await say('U', 'sai', mine);
    assert.deepEqual(confirms.map((x) => [x.hs, x.verdict, x.origin]), [['84818099', 'wrong', 'CN']], 'quote câu tra của mình');
  }, { group: true });
  await onThread(api, async ({ say, confirms }) => {
    await say('U', '8481.80.99 TQ');
    await say('V', '8481.80.91 TQ');
    await say('U', 'chuẩn');
    await say('U', 'đúng');
    assert.deepEqual(confirms.map((x) => [x.hs, x.verdict]), [['84818099', 'correct']], 'ngay sau lời mời gửi cho mình');
  }, { group: true });
});

test('R13 nhóm (fastPath): tin cuối của bot trả lời người khác thì không quote không ghi; quote câu tra của mình, hay tin cuối trả lời chính mình, thì ghi', () => {
  const shared = { topic: 'tariff', tariffFresh: true, table: OPEN, lastReplyElsewhere: true };
  for (const text of ['chuẩn', 'đúng rồi', 'mã này sai', 'HS đúng là 8481.80.91']) assert.equal(fastPath({ text, ...shared }), null, text);
  assert.deepEqual(fastPath({ text: 'đúng', ...shared, quoteText: TARIFF_ANSWER_QUOTE }), { action: 'confirm', verdict: 'correct' });
  assert.deepEqual(fastPath({ text: 'đúng', ...shared, lastReplyElsewhere: false }), { action: 'confirm', verdict: 'correct' });
});

// --- Plan 08 Việc 12 round 6 (2026-09-15): an origin the ledger takes is one detectOrigin reads; unaccented forms that read two
// ways; a ruling whose memory save failed (R13) ----

test('R13 xuất xứ (round 6): mỗi cách viết nước văn phạm nhận là một cách detectOrigin đọc được; "jp", "nhat", "han quoc", NFD, hai xuất xứ không ghi', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: { ...OPEN, origin: 'CN' } };
  for (const c of COUNTRY) {
    const text = `HS đúng là 8481.80.99 xuất xứ ${c}`;
    assert.ok(detectOrigin(c), c);
    assert.equal(detectOrigin(text), detectOrigin(c), text);
    assert.deepEqual(ruling(text), { coded: true }, text);
  }
  for (const text of [
    'HS đúng là 8481.80.99 xuất xứ jp', 'hs dung la 8481.80.99 xuat xu nhat', 'hs dung la 8481.80.91 xuat xu han quoc', 'HS đúng là 8481.80.99 xuất xứ cn',
    'hs dung la 8481.80.99 xuat xu thai lan', 'HS đúng là 8481.80.91 xuất xứ us', 'sai r, ma dung la 8481.80.91 xuat xu an do', 'HS đúng là 8481.80.99 xuất xứ my',
    'hs dung la 8481.80.99 xuat xu nhat ban', 'hs dung la 8481.80.99 xuat xu chau au', 'hs dung la 8481.80.99 xuat xu ma lai', 'HS đúng là 8481.80.99 xuất xứ trung quoc',
    'HS đúng là 8481.80.99 xuất xứ Nhật Bản, xuất xứ Trung Quốc', 'HS đúng là 8481.80.99 xuất xứ Nhật Bản theo CV 12/tq', 'HS đúng là 8481.80.99 xuất xứ Trung Quốc theo CV 12/JP',
    'HS đúng là 8481.80.99 xuất xứ Nhật Bản'.normalize('NFD'), 'HS đúng là 8481.80.99 xuất xứ trung  quốc',
  ]) {
    assert.equal(ruling(text), null, text);
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const text of ['HS đúng là 8481.80.99 xuất xứ tq', 'HS đúng là 8481.80.99 xuất xứ TQ', 'HS ĐÚNG LÀ 8481 80 99 XUẤT XỨ TRUNG QUỐC', 'sai rồi, mã đúng phải là 8481.80.91 xuất xứ Trung Quốc theo CV 12/TCHQ nhé']) {
    assert.deepEqual(fastPath({ text, ...fresh }), { action: 'correction' }, text);
  }
});

test('R13 xuất xứ (round 6, O01–O10): trên lượt tra TQ, xuất xứ detectOrigin không đọc được không ghi; khớp bàn thì ghi, khác bàn thì bảo tra xuất xứ đó', async () => {
  const nfd = 'HS đúng là 8481.80.99 xuất xứ Nhật Bản'.normalize('NFD');
  for (const text of ['HS đúng là 8481.80.99 xuất xứ jp', 'hs dung la 8481.80.99 xuat xu nhat', 'hs dung la 8481.80.91 xuat xu han quoc', 'HS đúng là 8481.80.91 xuất xứ us', 'sai r, ma dung la 8481.80.91 xuat xu an do', 'HS đúng là 8481.80.99 xuất xứ my', nfd]) {
    const c = await afterLookup();
    assert.equal((await c.say(text, planOf('correction'))).confirms.length, 0, text);
  }
  const none = conversation();
  await none.say('8481.80.99', fakeApi());
  assert.equal((await none.say('HS đúng là 8481.80.99 xuất xứ cn', planOf('correction'))).confirms.length, 0, 'O04: bàn không xuất xứ');
  const tq = await afterLookup();
  assert.deepEqual((await tq.say('HS đúng là 8481.80.99 xuất xứ tq', fakeApi())).confirms.map((x) => [x.hs, x.verdict, x.origin]), [['84818099', 'correct', 'CN']]);
  const jp = conversation();
  await jp.say('8481.80.99 JP', fakeApi());
  assert.deepEqual((await jp.say('HS đúng là 8481.80.99 xuất xứ Nhật Bản', fakeApi())).confirms.map((x) => [x.hs, x.verdict, x.origin]), [['84818099', 'correct', 'JP']]);
  const other = await afterLookup();
  const asked = await other.say('HS đúng là 8481.80.99 xuất xứ JP', fakeApi());
  assert.equal(asked.confirms.length, 0);
  assert.match(asked.text, /nhắn "8481\.80\.99 xuất xứ Nhật Bản"/);
});

test('R13 văn phạm đóng (round 6, X06–X09): tin không dấu đọc được hai cách ("dung a" = "đúng à", "khong dung" = "không dùng"), "nhầm mã", "vừa tra sai" không ghi; dạng có dấu vẫn ghi', () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  for (const text of [
    'dung a', 'sai a', 'dung roi a', 'chuan a', 'khong chac a', 'hs dung la 8481.80.91 a', 'khong dung', 'ko dung', 'k dung', 'khong dung nha', 'ma nay khong dung',
    'chua dung', 'ma nay chua dung', 'nhầm mã rồi', 'nhầm mã rồi bạn', 'vừa tra nhầm mã rồi', 'vừa tra sai rồi', 'nham ma roi', 'vua tra sai',
  ]) {
    assert.equal(fastPath({ text, ...fresh }), null, text);
  }
  for (const [text, action] of [
    ['không đúng', 'confirm'], ['ko đúng', 'confirm'], ['k đúng ạ', 'confirm'], ['đúng ạ', 'confirm'], ['sai ạ', 'confirm'], ['đúng a', 'confirm'], ['đúng rồi nha', 'confirm'],
    ['sai roi', 'confirm'], ['khong chac', 'confirm'], ['kết quả vừa tra sai rồi', 'correction'], ['mã vừa tra không đúng', 'correction'], ['ma nay sai', 'correction'],
    ['này sai', 'correction'], ['chưa đúng', 'correction'], ['HS đúng là 8481.80.91 nhé', 'correction'],
  ]) {
    assert.equal(fastPath({ text, ...fresh })?.action, action, text);
  }
});

test('R13 (round 6, H05, H06): phán quyết đã ghi mà lưu bộ nhớ lỗi: quote câu tra kèm "sai", hay "đúng" lần nữa, không ghi dòng thứ hai; lời mời không nói "chưa ghi nhận gì"', async () => {
  const failRuling = (body) => body.turns.some((x) => x.role === 'bot' && x.body.startsWith('Đã ghi nhận'));
  await onThread(fakeApi(), async ({ say, sent, confirms }) => {
    await say('u1', '8481.80.99 TQ');
    const lookup = sent.at(-1);
    await say('u1', 'đúng');
    assert.equal(confirms.length, 1);
    await say('u1', 'sai', lookup);
    await say('u1', 'đúng');
    await say('u1', 'đúng');
    assert.deepEqual(confirms.map((x) => [x.hs, x.verdict, x.origin]), [['84818099', 'correct', 'CN']]);
    assert.doesNotMatch(sent.at(-1), /chưa ghi nhận gì/);
  }, { saveFails: failRuling });
  await onThread(fakeApi(), async ({ say, confirms }) => {
    await say('u1', '8481.80.99 TQ');
    await say('u1', 'sai rồi, HS đúng là 8481.80.91');
    await say('u1', 'sai rồi, HS đúng là 8481.80.91');
    await say('u1', 'mã này sai');
    assert.deepEqual(confirms.map((x) => [x.hs, x.verdict]), [['84818091', 'correct'], ['84818099', 'wrong']], 'đính chính');
  }, { saveFails: failRuling });
});

// --- Plan 08 Việc 12 round 8 (2026-09-15): a citation that reads as an origin, any failed memory save, unaccented forms that read two
// ways (R13) ----

test('R13 xuất xứ (round 8, N19–N24): tin có mã không ô xuất xứ mà vẫn đọc ra xuất xứ (số "CV 12/HQ-CN", "TB 12/TB-TH") không ghi', async () => {
  for (const text of ['HS đúng là 3005.90.00 theo CV 12/HQ-CN', 'HS đúng là 3005.90.00 theo TB 12/TB-TH', 'HS đúng là 8481.80.91 theo CV 12/tq', 'HS đúng là 8481.80.91 theo CV 12/HQ-CN']) {
    assert.equal(ruling(text), null, text);
  }
  for (const text of ['HS đúng là 8481.80.91 theo CV 12/TCHQ', 'HS đúng là 8481.80.91 xuất xứ TQ theo CV 12/HQ-CN']) assert.deepEqual(ruling(text), { coded: true }, text);
  for (const text of ['HS đúng là 3005.90.00 theo CV 12/HQ-CN', 'HS đúng là 3005.90.00 theo TB 12/TB-TH', 'hs dung la 3005.90.00 theo cv 12/tq']) {
    const c = await afterHs();
    assert.equal((await c.say(text, planOf('correction'))).confirms.length, 0, text);
  }
  const photo = conversation();
  [photo.memo.topic, photo.memo.state] = ['tariff', nextState({}, await borderlinePhoto(null))];
  assert.equal((await photo.say('HS đúng là 8481.80.99 theo CV 12/HQ-CN', planOf('correction'))).confirms.length, 0, 'N21: bàn ảnh');
  const tq = await afterLookup();
  assert.equal((await tq.say('HS đúng là 8481.80.91 theo CV 12/HQ-CN', planOf('correction'))).confirms.length, 0, 'N24: lượt tra TQ');
});

test('R13 văn phạm đóng (round 8, U01–U08): tin không dấu không nhận "nhe"/"nha", "nay"/"do" trơn, "k chac", dạng có mã ("hs dung la" có thể là "dùng là"); có dấu vẫn ghi', async () => {
  const fresh = { topic: 'tariff', tariffFresh: true, table: OPEN };
  const unaccented = ['dung nhe', 'dung nha', 'do sai', 'nay sai', 'dung roi nha', 'hs dung la 8481.80.91', 'ma dung la 8481.80.91', 'k chac'];
  for (const text of [...unaccented, 'sai nha', 'ma nay sai nhe', 'hs dung la 8481.80.91 xuat xu tq', 'sai r, ma dung la 8481.80.91', 'code dung: 8481.80.91']) {
    assert.equal(ruling(text), null, text);
  }
  for (const text of unaccented) {
    const c = await afterLookup();
    assert.equal((await c.say(text, planOf('correction'))).confirms.length, 0, text);
  }
  for (const [text, action] of [
    ['đúng nhé', 'confirm'], ['sai nhé', 'confirm'], ['k chắc', 'confirm'], ['này sai', 'correction'], ['đó sai nhé', 'correction'], ['HS đúng là 8481.80.91 nhé', 'correction'],
    ['mã đúng là 8481.80.91', 'correction'], ['dung roi', 'confirm'], ['khong chac', 'confirm'], ['ma nay sai', 'correction'],
  ]) {
    assert.equal(fastPath({ text, ...fresh })?.action, action, text);
  }
});

test('R13 (round 8, S01, S03–S05, S08): lưu bộ nhớ lỗi ở bất cứ câu nào đóng đường không quote; "mã này sai" đã ghi thì bàn đóng; lời mời bàn ứng viên không in "undefined"', async () => {
  const userSaid = (text) => (body) => body.turns.some((x) => x.role === 'user' && x.body === text);
  const rows = (confirms) => confirms.map((x) => [x.hs, x.verdict, x.origin]);
  await onThread(fakeApi(), async ({ say, sent, confirms }) => {
    await say('u1', '8481.80.99 TQ');
    const lookup = sent.at(-1);
    await say('u1', 'mã này sai');
    await say('u1', 'đúng', lookup);
    assert.deepEqual(rows(confirms), [['84818099', 'wrong', 'CN']], 'S01');
  }, { saveFails: userSaid('mã này sai') });
  const legal = (path, body, u) => (path === '/answer' && body.q === LEGAL_Q ? (body.planOnly ? legalPlanned : composedLegal) : fakeApi()(path, body, u));
  await onThread(legal, async ({ say, confirms }) => {
    await say('u1', '8481.80.99 TQ');
    await say('u1', LEGAL_Q);
    await say('u1', 'đúng');
    assert.equal(confirms.length, 0, 'S03');
  }, { saveFails: userSaid(LEGAL_Q) });
  for (const [id, text] of [['S04', 'sai'], ['S05', 'HS đúng là 8481.80.99']]) {
    await onThread(fakeApi(), async ({ say, confirms }) => {
      await say('u1', '8481.80.91 TQ');
      await say('u1', '8481.80.99 TQ');
      await say('u1', text);
      assert.equal(confirms.length, 0, id);
    }, { saveFails: userSaid('8481.80.99 TQ') });
  }
  const G1 = 'miếng dán ngải cứu mã gì';
  const hs = (path, body, u) => (path === '/answer' && body.q === G1 ? (body.planOnly ? plannedOf(plan08({ question: G1 }), { codeRole: 'none' }) : composedHs) : planOf('correction')(path, body, u));
  await onThread(hs, async ({ say, sent, confirms }) => {
    await say('u1', G1);
    await say('u1', 'HS đúng là 3005.90.00');
    await say('u1', '3005.90.00 mới đúng');
    assert.deepEqual(rows(confirms), [['30059000', 'correct', null]]);
    assert.doesNotMatch(sent.at(-1), /undefined/);
    assert.match(sent.at(-1), /đã ghi nhận phán quyết cho hàng vừa hỏi nên không ghi thêm/, 'S08');
  }, { saveFails: userSaid('HS đúng là 3005.90.00') });
});

// --- 2026-09-22: a reply to the bot's answer means the question that answer was for ----------------------------------------

test('nhóm: "trả lời lại đi" quote câu bot đáp cho người khác đọc câu hỏi của người đó, không phải hội thoại riêng của người reply', async () => {
  const CHI_Q = 'hs code Lưỡi dao răng cưa bằng thép không gỉ, kích thước: W105 x L1600 x H2 (mm), dùng để cắt cuộn màng khi sang cuộn ở máy ghép đùn';
  const DOWN = 'Mình tạm thời chưa trả lời được: dịch vụ AI (Claude) báo lỗi "Failed to authenticate. API Error: 401 OAuth access token has been revoked.". Trong lúc chờ, tra thuế theo mã HS 8 số (kèm xuất xứ) vẫn dùng được.';
  const c = conversation();
  // This person's own memory is about other goods: the quote is the only way to the colleague's question.
  c.memo.turns = [{ role: 'user', body: 'máy sấy ly tâm tự động dùng cho đầu khóa mã gì' }, { role: 'bot', body: 'Máy sấy ly tâm …' }];
  const looked = [];
  const api = (path, body, u) => {
    if (path !== '/conversation/quoted') return fakeApi({ planned: plannedOf(plan08({ question: CHI_Q }), { codeRole: 'none' }), composed: composedHs })(path, body, u);
    looked.push(u.searchParams.get('text'));
    return { question: CHI_Q, staffName: 'Chi' };
  };
  const run = await c.say('trả lời lại đi', api, DOWN);
  assert.ok(DOWN.startsWith(looked[0]), 'tra câu hỏi theo chính chữ của tin được quote');
  for (const a of run.answers) {
    assert.ok(a.quote.includes(CHI_Q) && a.quote.includes('Chi'), a.quote);
    assert.ok(a.quote.includes(DOWN), 'vẫn giữ tin được quote');
  }

  // Not a bot answer the API can place (a colleague's own message, an old reply): the quote goes as it came.
  const plain = await conversation().say('trả lời lại đi', fakeApi({ planned: plannedOf(plan08()), composed: composedHs }), CHI_Q);
  assert.equal(plain.answers[0].quote, CHI_Q);
});

// --- 2026-09-22: sources print only when asked ------------------------------------------------------------------------------

test('asksSources / onlyAsksSources: hỏi nguồn/căn cứ thì đúng; "nguồn" là hàng hóa ("đèn kèm nguồn", "nguồn đầu vào") thì không', () => {
  // The whole message only asks for sources: answered from memory, no model call.
  for (const t of ['nguồn?', 'Nguồn', 'căn cứ đâu', 'căn cứ vào đâu vậy', 'cho mình xin nguồn với ạ', 'nguồn ở đâu ạ', 'trích dẫn đi', 'nguon dau', 'link nguồn câu trên', 'kèm căn cứ giúp mình'])
    assert.equal(onlyAsksSources(t), true, t);
  // A question with sources asked for: composed, sources printed under it.
  for (const t of ['căn cứ pháp lý của việc miễn thuế hàng gia công là gì', 'miếng dán ngải cứu mã gì, ghi nguồn giúp mình', 'nguồn gốc xuất xứ căn cứ vào đâu'])
    assert.equal(asksSources(t) && !onlyAsksSources(t), true, t);
  // Review 2026-09-22: goods and real questions the first matcher took for a request, each shorter than the old 60-character cap.
  for (const t of ['đèn LED kèm nguồn mã hs gì', 'adapter kèm nguồn 12V', 'dây dẫn nguồn điện mã gì', 'ổ cắm dẫn nguồn', 'cáp cho nguồn máy chủ', 'nguồn đầu vào 24V thì sao', 'bộ nguồn nào phù hợp', 'adapter nguồn điện 220V', 'hs code Lưỡi dao răng cưa bằng thép không gỉ', 'trả lời lại đi'])
    assert.equal(asksSources(t), false, t);
  for (const t of ['hàng này căn cứ nào để khai', 'nguồn gốc xuất xứ căn cứ vào đâu']) assert.equal(onlyAsksSources(t), false, t);
});

test('câu soạn mặc định không in nguồn; "nguồn?" sau đó in nguồn đã nhớ, không gọi mô hình; quote đúng câu đó cũng vậy, quote câu khác thì không', async () => {
  const c = conversation();
  const first = await c.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: composedHs }));
  assert.ok(!first.text.includes('Nguồn:') && !/\[\d+\]/.test(first.text), first.text);

  const again = await c.say('nguồn đâu?', fakeApi());
  assert.equal(again.answers.length, 0, 'nguồn lấy từ bộ nhớ, không soạn lại');
  assert.deepEqual(toText(again.r.text).split('\n'), ['Nguồn:', '[1] Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05']);
  // Asked twice, still there: printing the sources does not clear the reply they belong to.
  assert.equal((await c.say('căn cứ đâu', fakeApi(), first.text)).answers.length, 0);

  const other = await c.say('nguồn?', fakeApi({ planned: plannedOf(plan08()), composed: composedHs }), 'Một câu trả lời cũ hơn, không phải câu vừa rồi.');
  assert.ok(other.answers.length > 0, 'quote câu khác: bộ nhớ không giữ nguồn của nó');

  // Review 2026-09-22: after a reply that is not the composed one ("Dạ, bạn cần gì thêm…"), the remembered sources are not
  // the ones asked about.
  const d = conversation();
  await d.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: composedHs }));
  await d.say('ok', fakeApi());
  assert.ok((await d.say('căn cứ đâu', fakeApi({ planned: plannedOf(plan08()), composed: composedHs }))).answers.length > 0);
});

test('câu hỏi kèm "căn cứ" thì câu soạn in nguồn ngắn ngay bên dưới', async () => {
  const run = await conversation().say(`${PHOTO_Q}, kèm căn cứ giúp mình`, fakeApi({ planned: plannedOf(plan08()), composed: composedHs }));
  assert.ok(run.text.includes('Nguồn:\n[1] Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05'), run.text);
});

test('câu hs gọn có dòng 8 số dưới nhóm (2026-09-22): không tra /tariff, bộ nhớ chỉ giữ nhóm 4 số, "đúng" sau đó không ghi gì (R2, R13)', async () => {
  const withLine = { ...composedHs, candidates: composedHs.candidates.map((c, i) => ({ ...c, line: i ? null : { code: '3005.90.90', text: 'Loại khác › Loại khác' } })) };
  const c = conversation();
  const run = await c.say(PHOTO_Q, fakeApi({ planned: plannedOf(plan08()), composed: withLine }));
  assert.ok(run.text.includes('↳ 3005.90.90 · Loại khác › Loại khác'), run.text);
  assert.ok(!run.calls.some((x) => x.path === '/tariff'), 'bản gọn không tra thuế');
  assert.deepEqual(c.memo.state.tariff.candidates, ['30.05', '38.24'], 'dòng 8 số không vào bộ nhớ như kết quả tra');
  assert.equal(c.memo.state.tariff.hs, null);
  const agree = await c.say('đúng', fakeApi({ planned: plannedOf(plan08({ intent: 'confirm', verdict: 'correct', goods: { facts: [], missing: [] } }), { codeRole: 'none' }) }));
  assert.equal(agree.confirms.length, 0);
});

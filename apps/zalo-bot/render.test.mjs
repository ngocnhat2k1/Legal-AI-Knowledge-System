/**
 * The Zalo presenter: offsets, splitting, escaping and the colour boundary.
 *
 *   node --test apps/zalo-bot/
 *
 * Pure functions only — no Zalo login, no API, no LLM.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TextStyle } from 'zca-js';

import { tariffReply } from './dispatch.mjs';
import { formatAnswerMd } from './format.mjs';
import { L, md, render, ST, toText } from './render.mjs';

const texts = (p, st) => p.styles.filter((s) => s.st === st).map((s) => p.msg.slice(s.start, s.start + s.len));
const marksOf = (lines) => new Set(lines.flatMap((ln) => [...(ln.marks ?? []), ...ln.segs.flatMap((s) => (typeof s === 'string' ? [] : s.slice(1)))]));

test('bảng nhãn khớp TextStyle của zca-js', () => {
  assert.deepEqual(ST, {
    b: TextStyle.Bold,
    i: TextStyle.Italic,
    green: TextStyle.Green,
    orange: TextStyle.Orange,
    red: TextStyle.Red,
    small: TextStyle.Small,
    ul: TextStyle.UnorderedList,
    ol: TextStyle.OrderedList,
  }, 'nâng zca-js mà đổi mã style thì màu/đậm gửi đi sai âm thầm');
  assert.throws(() => render([L([['x', 'gren']])]), /unknown mark/, 'nhãn gõ sai phải throw');
});

test('offset đúng trên chữ có dấu, kể cả khi đầu vào là NFD', () => {
  const [p] = render([L(['Đối với mã ', ['8481.80.99', 'b'], ' có xuất xứ ', ['Trung Quốc', 'b']])]);
  const bold = p.styles.filter((s) => s.st === 'b');
  assert.equal(bold[1].start, p.msg.indexOf('Trung Quốc'));
  assert.equal(bold[1].len, 10);
  const [q] = render([L(['Đối với mã '.normalize('NFD'), ['Trung Quốc'.normalize('NFD'), 'b']])]);
  assert.equal(q.msg, q.msg.normalize('NFC'), 'msg gửi đi phải là NFC');
  assert.deepEqual(texts(q, 'b'), ['Trung Quốc'], 'offset phải tính trên chuỗi đã NFC');
});

test('emoji đếm 2 đơn vị UTF-16', () => {
  const [p] = render([L(['🔍 ', ['x', 'b']])]);
  assert.equal(p.styles[0].start, 3);
});

test('đậm + xanh cùng đoạn ra hai style trùng khoảng; nhãn dòng không gồm \\n', () => {
  const [p] = render([L(['Có C/O: ', ['0%', 'b', 'green']], 'ul'), L(['dòng sau'])]);
  const b = p.styles.find((s) => s.st === 'b');
  const g = p.styles.find((s) => s.st === ST.green);
  assert.deepEqual([b.start, b.len], [g.start, g.len]);
  const ul = p.styles.find((s) => s.st === ST.ul);
  assert.deepEqual([ul.start, ul.len], [0, 'Có C/O: 0%'.length]);
});

test('tách tin tại ranh giới đoạn, style mỗi tin tính từ 0, có (k/n)', () => {
  const lines = [
    L(['Đoạn một có ', ['chữ đậm', 'b'], ' ở giữa, thêm vài chữ nữa.']),
    L([]),
    L([['Đoạn hai toàn chữ đỏ', 'red']]),
    L([]),
    L(['Đoạn ba ', ['nghiêng', 'i'], ' ở cuối câu.']),
  ];
  const parts = render(lines, { budget: 60 });
  assert.ok(parts.length >= 2, 'phải tách thành nhiều tin');
  for (const [k, p] of parts.entries()) {
    assert.ok(p.msg.length <= 60, `tin ${k + 1} dài ${p.msg.length}`);
    assert.ok(p.msg.endsWith(`(${k + 1}/${parts.length})`), 'mỗi tin kết bằng (k/n)');
    for (const s of p.styles) assert.ok(s.start + s.len <= p.msg.length, 'style vượt khỏi tin');
  }
  for (const piece of ['chữ đậm', 'Đoạn hai toàn chữ đỏ', 'nghiêng']) {
    assert.equal(parts.filter((p) => p.msg.includes(piece)).length, 1, `"${piece}" phải nằm trọn trong đúng một tin`);
  }
  const redPart = parts.find((p) => p.msg.includes('Đoạn hai'));
  assert.notEqual(redPart, parts[0], 'đoạn hai phải sang tin sau để kiểm offset tính lại từ 0');
  assert.deepEqual(texts(redPart, ST.red), ['Đoạn hai toàn chữ đỏ'], 'style của tin sau tính từ 0');
});

test('đoạn có nhãn dài hơn ngân sách bị cắt ở khoảng trắng, hai nửa cùng nhãn', () => {
  const long = 'một hai ba bốn năm sáu bảy tám chín mười mười một mười hai mười ba mười bốn';
  const parts = render([L([[long, 'red']], 'ul')], { budget: 50 });
  assert.ok(parts.length >= 2);
  for (const p of parts) {
    const red = texts(p, ST.red);
    assert.equal(red.length, 1, 'mỗi nửa giữ nhãn đỏ');
    assert.ok(!red[0].startsWith(' ') && !red[0].endsWith(' '), 'cắt ở khoảng trắng, không cắt giữa từ');
    assert.equal(texts(p, ST.ul).length, 1, 'nhãn dòng lặp trên mỗi nửa');
  }
  assert.equal(parts.map((p) => texts(p, ST.red)[0]).join(' '), long);
});

test('đoạn dài xếp tiếp vào tin hiện tại, không đẩy đoạn ngắn trước nó thành một tin riêng', () => {
  const src = Array.from({ length: 6 }, (_, k) => L([`Dòng nguồn số ${k + 1} dài vừa phải cho đủ.`], 'note'));
  const parts = render([L(['Mở đầu ngắn.']), L([]), ...src], { budget: 120 });
  assert.ok(parts[0].msg.startsWith('Mở đầu ngắn.\n\nDòng nguồn số 1'), parts[0].msg);
  const near = render([L(['x'.repeat(100)]), L([]), ...src], { budget: 120 });
  for (const p of [...parts, ...near]) {
    assert.ok(p.msg.length <= 120, `tin dài ${p.msg.length}`);
    assert.ok(!p.msg.includes('\n\n('), 'không có dòng trống thừa trước (k/n)');
    for (const s of p.styles) assert.ok(s.start + s.len <= p.msg.length, 'style vượt khỏi tin');
  }
});

test('thoát ký tự: chỉ chuỗi đưa vào md() mới bị đọc ký hiệu', () => {
  for (const s of ['173.6*162.6*12.1', '**không**']) {
    const [p] = render([L([s])]);
    assert.equal(p.msg, s);
    assert.equal(p.styles.length, 0, 'đoạn thuần của builder không bao giờ sinh style');
  }
  const plain = (x) => render(md(x))[0];
  assert.equal(plain('173.6*162.6*12.1').styles.length, 0);
  const excl = plain('0405.90.10 (*) và 0405.90.90 (*)');
  assert.equal(excl.msg, '0405.90.10 (*) và 0405.90.90 (*)');
  assert.equal(excl.styles.length, 0, '(*) là dấu loại trừ trong văn bản, không phải nghiêng');
  assert.equal(plain('\\*x\\*').msg, '*x*');
  assert.equal(plain('**x').msg, '**x');
  assert.equal(plain('**x').styles.length, 0);
});

test('md(): danh sách, tiêu đề, đậm, nghiêng lồng nhau, [n] giữ nguyên', () => {
  const lines = md('## Tiêu đề\n- a\n1. b\nThuế **0% *có* điều kiện** [1]');
  assert.deepEqual(lines.map((l) => l.marks), [['b'], ['ul'], ['ol'], []]);
  assert.equal(toText(lines), 'Tiêu đề\na\nb\nThuế 0% có điều kiện [1]');
  const [p] = render(lines);
  assert.deepEqual(texts(p, 'b'), ['Tiêu đề', '0% có điều kiện']);
  assert.deepEqual(texts(p, 'i'), ['có']);
  const clauses = md('2. khoản hai\n4. khoản bốn');
  assert.deepEqual(clauses.map((l) => l.marks), [[], []], 'số không liền mạch từ 1 thì không thành ol');
  assert.equal(toText(clauses), '2. khoản hai\n4. khoản bốn', 'giữ số khoản gốc (R10)');
  assert.deepEqual(md('1. a\n2. b').map((l) => l.marks), [['ol'], ['ol']]);
});

test('md() không có đường nào sinh màu', () => {
  const lines = md('{red}0%{/red} <b>x</b> ~~y~~ `z` [l](u)\n- **a** *b*');
  const allowed = new Set(['b', 'i', 'ul', 'ol']);
  for (const m of marksOf(lines)) assert.ok(allowed.has(m), `md() sinh nhãn ngoài tập cho phép: ${m}`);
  const [p] = render(md('{red}0%{/red} <b>x</b>'));
  assert.equal(p.styles.length, 0);
});

test('mọi dòng warn gộp thành một dòng cam, không bị thu nhỏ', () => {
  const [p] = render([
    L(['Mặt hàng có thể thuộc nhiều nhóm'], 'warn'),
    L(['thân']),
    L(['Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP'], 'warn'),
  ]);
  const orange = texts(p, ST.orange);
  assert.equal(orange.length, 1, 'đúng một dòng cảnh báo');
  assert.equal(orange[0], 'Mặt hàng có thể thuộc nhiều nhóm; Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP');
  assert.equal(p.styles.filter((s) => s.st === ST.small).length, 0, 'warn không bao giờ thành chữ nhỏ');
  assert.equal(p.msg.split('\n').length, 2);
  const W = L(['Cảnh báo chung'], 'warn');
  const [r] = render([W, L(['thân']), W]);
  assert.equal(texts(r, ST.orange).length, 1, 'cùng một đối tượng warn dùng hai lần vẫn chỉ một dòng cam');
  assert.equal(r.msg.split('\n').length, 2);
  const [s] = render([L(['Cần chốt mã trước khi khai.'], 'warn'), L(['thân']), L(['Biểu thuế trong kho'], 'warn')]);
  assert.deepEqual(texts(s, ST.orange), ['Cần chốt mã trước khi khai. Biểu thuế trong kho'], 'câu đã có dấu chấm thì nối bằng khoảng trắng, không ".; "');
});

// --- formatAnswerMd: a composed POST /answer reply (plan 08 §5) ------------------------

const all = (lines, st) => render(lines).flatMap((p) => texts(p, st));
const rowsOf = (lines) => toText(lines).split('\n');
const EN_NOTE = 'tài liệu hướng dẫn áp dụng của cơ quan hải quan, không phải văn bản quy phạm pháp luật';
const R5 = 'Hàng khó chốt thì có thể đề nghị hải quan xác định trước mã số.';
const HINT = 'Cần xem thuế của mã nào thì nhắn mã đó kèm xuất xứ.';
const CUT = 'Một phần câu trả lời bị lược vì không dẫn được nguồn.';
const cite = (n, over) => ({
  n, key: `e:${n}`, kind: 'en', label: '', instrument: 'CV 1810/TCHQ-TXNK', hsHeading: null, quotes: [], authority: 'authoritative',
  note: EN_NOTE, verification: 'auto_unverified', window: 'current', expired: null, effectiveness: 'con_hieu_luc',
  documentNumber: 'CV 1810/TCHQ-TXNK', url: null, ...over,
});
/** POST /answer for the photo question (foot patch with mugwort + a code the user is considering), rewritten: no user data. */
const HS_PHOTO = {
  plan: { intent: 'hs' }, codeRole: 'premise', mode: 'hs', depth: 'brief',
  userCodes: [{ code: '3005.10.10', level: 8, heading: '30.05', exists: true, inCandidates: true }],
  ack: 'Bạn đang muốn biết miếng dán bàn chân ngải cứu có khai được vào mã bạn tham khảo không.',
  answerMd: [
    'Chỉ từ "miếng dán bàn chân, thành phần ngải cứu" thì mình chưa chốt được nhóm: chỗ quyết định không phải nguyên liệu mà là miếng dán **có tẩm dược chất và được trình bày để dùng cho y tế** hay không.',
    '',
    '- Nếu có — nhãn ghi công dụng chữa bệnh, hoạt chất tẩm vào miếng dán có lớp dính — thì đó đúng dạng hàng Chú giải chi tiết nhóm **30.05** mô tả, và loại có lớp dính tách riêng ở phân nhóm **3005.10** [1].',
    '- Nếu ngải cứu chỉ để làm ấm, tạo mùi, chăm sóc bàn chân mà không trình bày cho mục đích y tế, thì Chú giải Chương 30 loại khỏi chương các chế phẩm thuộc nhóm 33.03 đến 33.07 [2]; khi đó cần so thêm với nhóm **38.24** [3].',
    '',
    'Bạn xem giúp mình hai điểm: nhãn hoặc hồ sơ có ghi công dụng chữa bệnh không, và ngải cứu ở dạng hoạt chất tẩm vào miếng dán hay chỉ là bột thảo mộc đóng túi.',
  ].join('\n'),
  citations: [
    cite(1, {
      label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 — Bông, gạc, băng và các sản phẩm tương tự (ví dụ, băng để băng bó, cao dán, thuốc đắp)',
      hsHeading: '30.05',
      quotes: ['Nhóm này bao gồm bông, gạc, băng và các sản phẩm tương tự như cao dán, thuốc đắp, đã được thấm tẩm hoặc tráng phủ dược chất hoặc làm thành dạng nhất định hay đóng gói để bán lẻ dùng cho y tế, phẫu thuật, nha khoa hoặc thú y.'],
    }),
    cite(2, {
      kind: 'hs_note', label: 'Chú giải Chương 30', instrument: '31/2022/TT-BTC', documentNumber: '31/2022/TT-BTC', authority: 'binding', note: null,
      quotes: ['Chương này không bao gồm: các chế phẩm thuộc các nhóm từ 33.03 đến 33.07, ngay cả khi các chế phẩm đó có đặc tính phòng bệnh hoặc chữa bệnh'],
    }),
    cite(3, {
      label: 'Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24 — Chất gắn đã điều chế dùng cho các loại khuôn đúc hoặc lõi đúc; các sản phẩm và chế phẩm hóa học (có thể gồm cả nhóm 38.23)',
      hsHeading: '38.24',
      quotes: ['Nhóm này bao gồm các sản phẩm và chế phẩm hóa học của ngành công nghiệp hóa chất hoặc các ngành công nghiệp có liên quan, chưa được chi tiết hoặc ghi ở nơi khác'],
    }),
  ],
  candidates: [
    { hs: '30.05', level: 4, title: 'Bông, gạc, băng và các sản phẩm tương tự (ví dụ, băng để băng bó, cao dán, thuốc đắp), đã thấm tẩm hoặc tráng phủ dược chất', evidence: [1] },
    { hs: '38.24', level: 4, title: 'Chất gắn đã điều chế dùng cho các loại khuôn đúc hoặc lõi đúc; các sản phẩm và chế phẩm hóa học', evidence: [3] },
  ],
  ruling: null, missingFacts: ['có tẩm dược chất không', 'công dụng ghi trên nhãn'], coverage: 'partial',
  warnings: [], cut: 0, repaired: false, missingDoc: null, gazetteMatchKind: 'none', gazetteMatches: [], calls: 2,
};
/** /tariff for a candidate code: one ACFTA row a verified member origin is eligible for (the only case that could be green). */
const lookup = (dotted) => ({
  q: { dotted, origin: 'CN', date: '2026-09-14' },
  tariff: {
    hs: dotted.replace(/\./g, ''), origin: 'CN', date: '2026-09-14', goods: { heading: 'Cao dán', path: '' },
    import: {
      mfn: { schedule: 'NK_uu_dai', scheduleName: 'Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)', type: 'ad_valorem', percent: '5', decree: '26/2023/NĐ-CP', statement: '5%' },
      preferential: [{ schedule: 'ACFTA', scheduleName: 'ASEAN–Trung Quốc (ACFTA)', type: 'ad_valorem', percent: '0', decree: '118/2022/NĐ-CP', form: 'E', rate: '0%', excludedOrigins: [], originExcluded: false, sublines: [], originEligible: true }],
      outOfQuota: null,
    },
    export: null, antiDumping: [], notes: [],
    staleness: { warning: 'Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP — đối chiếu trước khi khai.', unloadedInstruments: [] },
    ftaMembership: { verifiedBy: 'Người Xác Minh', verifiedAt: '2026-09-01' },
  },
  confirm: null,
});

test('formatAnswerMd câu ảnh (hs): không câu mẫu cũ, một câu so mã, một đầu mục ứng viên, ≤ 2 tin', () => {
  const lines = formatAnswerMd(HS_PHOTO);
  const text = toText(lines);
  for (const s of ['MFN', 'Căn cứ phân loại', 'Với mô tả', 'trả lời "đúng"']) assert.ok(!text.includes(s), `không được có "${s}"`);
  const rows = rowsOf(lines);
  assert.deepEqual(rows.filter((l) => l.includes('bạn nêu')), ['Mã 3005.10.10 bạn nêu thuộc nhóm 30.05 — nằm trong các nhóm dưới đây.']);
  const head = rows.indexOf('Ứng viên để chuyên viên chốt:');
  assert.equal(rows.filter((l) => l === 'Ứng viên để chuyên viên chốt:').length, 1);
  assert.match(rows[head + 1], /^30\.05 · .{1,50} · \[1\]$/);
  assert.match(rows[head + 2], /^38\.24 · .{1,50} · \[3\]$/);
  const unbroken = rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates: [{ ...HS_PHOTO.candidates[0], title: 'Bông-gạc-băng-'.repeat(6) }] }));
  assert.match(unbroken[unbroken.indexOf('Ứng viên để chuyên viên chốt:') + 1], /^30\.05 · .{1,50} · \[1\]$/, 'đầu mục ≤ 50 ký tự kể cả dấu …');
  assert.equal(rows[head + 3], R5);
  assert.ok(render(lines).length <= 2, `${render(lines).length} tin`);
  assert.equal(all(lines, ST.orange).length, 0, 'câu so mã không bao giờ tô cam');
});

test('formatAnswerMd bất biến R13: không tin nào của câu soạn khớp tariffReply — brief, full, mixed', () => {
  const tariffLines = ['3005.10.10', '3824.99.99'].map(lookup);
  const replies = {
    brief: formatAnswerMd(HS_PHOTO, { tariffLines }),
    full: formatAnswerMd({ ...HS_PHOTO, depth: 'full' }, { tariffLines }),
    mixed: formatAnswerMd({ ...HS_PHOTO, mode: 'mixed', userCodes: [], candidates: [] }, { tariffLines: tariffLines.slice(0, 1) }),
  };
  for (const [name, lines] of Object.entries(replies)) {
    // A Zalo user quotes one message, not the whole reply.
    for (const msg of render(lines).map((p) => p.msg)) assert.equal(tariffReply(msg), false, `${name}: ${msg.slice(0, 120)}`);
  }
});

test('formatAnswerMd: ứng viên thiếu [n] bị bỏ, không làm hỏng cả câu trả lời (R2)', () => {
  const candidates = [{ ...HS_PHOTO.candidates[0], evidence: undefined }, { ...HS_PHOTO.candidates[1], evidence: [] }, { hs: '33.07', level: 4, title: 'Chế phẩm dùng trước, trong hoặc sau khi cạo', evidence: [2] }];
  const rows = rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates }));
  const head = rows.indexOf('Ứng viên để chuyên viên chốt:');
  assert.deepEqual(rows.slice(head + 1), ['33.07 · Chế phẩm dùng trước, trong hoặc sau khi cạo · [2]', ...rows.slice(head + 2)]);
  assert.ok(!rows.some((l) => /^\d{2}\.\d{2} · .* · $/.test(l)));
  assert.ok(!rows.includes(R5), 'còn một ứng viên thì không có dòng R5');
});

test('formatAnswerMd: có ruling thì thêm một dòng dưới các ứng viên, lời văn như tra theo mô tả hôm nay', () => {
  const ruling = { dotted: '3005.10.90', staffName: 'Chuyên Viên A', note: 'miếng dán hạ sốt có tẩm dược chất' };
  const rows = rowsOf(formatAnswerMd({ ...HS_PHOTO, ruling }));
  const head = rows.indexOf('Ứng viên để chuyên viên chốt:');
  assert.equal(rows[head + 3], 'Mã 3005.10.90 đã được Chuyên Viên A xác nhận cho hàng tương tự (miếng dán hạ sốt có tẩm dược chất) — mình ưu tiên mã này, bạn vẫn đối chiếu căn cứ.');
  assert.equal(rows[head + 4], R5);
});

test('formatAnswerMd: câu so mã do code viết từ userCodes, kể cả khi mã lệch nhóm hoặc không có trong Danh mục', () => {
  const said = (u) => rowsOf(formatAnswerMd({ ...HS_PHOTO, userCodes: [u] })).filter((l) => /^(Mã|Nhóm) \S+ (bạn nêu|không có)/.test(l));
  const u = HS_PHOTO.userCodes[0];
  assert.deepEqual(said({ ...u, inCandidates: false }), ['Mã 3005.10.10 bạn nêu thuộc nhóm 30.05 — không nằm trong các nhóm dưới đây; nếu hàng có đặc điểm khiến nó thuộc nhóm đó, bạn gửi thêm để mình đọc lại.']);
  assert.deepEqual(said({ ...u, exists: false, inCandidates: false }), ['Mã 3005.10.10 không có trong Danh mục hàng hóa đã nạp.']);
  assert.deepEqual(said({ code: '30.05', level: 4, heading: '30.05', exists: true, inCandidates: true }), ['Nhóm 30.05 bạn nêu — nằm trong các nhóm dưới đây.']);
  // coverage 'none': no list below, but a code that does not exist is still said.
  const bare = (x) => rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates: [], coverage: 'none', userCodes: [x] })).filter((l) => /^(Mã|Nhóm) \S+ (bạn nêu|không có)/.test(l));
  assert.deepEqual(bare({ ...u, exists: false, inCandidates: false }), ['Mã 3005.10.10 không có trong Danh mục hàng hóa đã nạp.']);
  assert.deepEqual(bare({ ...u, inCandidates: false }), [], 'không có danh sách thì không nói "các nhóm dưới đây"');
  assert.equal(all(formatAnswerMd({ ...HS_PHOTO, userCodes: [{ ...u, inCandidates: false }] }), ST.orange).length, 0);
});

test('formatAnswerMd: dòng R5 chỉ khi từ 2 ứng viên và văn xuôi chưa nói "xác định trước"', () => {
  const has = (res) => rowsOf(formatAnswerMd(res)).includes(R5);
  assert.equal(has(HS_PHOTO), true);
  assert.equal(has({ ...HS_PHOTO, answerMd: `${HS_PHOTO.answerMd}\n\nHàng khó chốt thì bạn có thể đề nghị **xác định trước** mã số.` }), false);
  assert.equal(has({ ...HS_PHOTO, candidates: HS_PHOTO.candidates.slice(0, 1) }), false);
});

test('formatAnswerMd D3(a): walkthrough full in khối thuế gọn cho tối đa 2 mã, không xanh; brief không khối, một câu gợi ý', () => {
  // A verdict history on a candidate code: its "trả lời đúng/sai" footer is a promise nothing keeps after a composed reply.
  const confirm = { correct: 2, wrong: 0, unsure: 0, recent: [{ verdict: 'correct', staffName: 'Chuyên Viên A' }] };
  const tariffLines = ['3005.10.10', '3005.90.10', '3824.99.99'].map((d) => ({ ...lookup(d), confirm }));
  const full = formatAnswerMd({ ...HS_PHOTO, depth: 'full' }, { tariffLines });
  const rows = rowsOf(full);
  assert.equal(rows.filter((l) => l.startsWith('Nếu hàng thuộc mã')).length, 2);
  assert.equal(all(full, ST.green).length, 0, 'mức ưu đãi của một mã chưa ai chốt không bao giờ xanh');
  assert.ok(!rows.includes(HINT) && !toText(full).includes('trả lời "đúng"'));
  const [orange] = all(full, ST.orange);
  assert.equal(orange.split('Biểu thuế trong kho').length - 1, 1, orange);
  // R10: one [k] means one source across the tariff legends and the "Nguồn:" block.
  const labels = rows.flatMap((l) => (l.startsWith('Tra theo ngày') ? [...l.matchAll(/\[(\d+)\] /g)].map((m) => m[1]) : (l.match(/^\[(\d+)\] /) ?? []).slice(1)));
  assert.deepEqual(labels, [...new Set(labels)], labels.join(','));
  assert.ok(labels.length > 3, labels.join(','));
  const brief = formatAnswerMd(HS_PHOTO, { tariffLines });
  assert.ok(!toText(brief).includes('MFN'));
  assert.equal(rowsOf(brief).filter((l) => l === HINT).length, 1);
});

test('formatAnswerMd status: văn xuôi nói "còn hiệu lực" vẫn in dòng đỏ từ citation.expired (R8)', () => {
  const res = {
    ...HS_PHOTO, mode: 'status', userCodes: [], candidates: [], answerMd: 'Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực [1].',
    citations: [cite(1, {
      kind: 'status', label: 'Tình trạng hiệu lực — 69/2018/NĐ-CP', instrument: '69/2018/NĐ-CP', documentNumber: '69/2018/NĐ-CP', authority: 'binding', note: null,
      quotes: ['69/2018/NĐ-CP hết hiệu lực từ 05/09/2026'], expired: '69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo 292/2026/NĐ-CP',
    })],
  };
  const lines = formatAnswerMd(res);
  assert.deepEqual(all(lines, ST.red), ['[1] 69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo 292/2026/NĐ-CP.']);
  assert.equal(all(lines, ST.orange).length, 0, 'mục bằng chứng không phải văn bản bot tự nạp');
  assert.ok(!toText(lines).includes('Ứng viên') && !rowsOf(lines).includes(HINT));
});

test('formatAnswerMd: văn bản bot tự nạp, cảnh báo của API và dòng phạm vi biểu thuế gộp thành đúng một dòng cam', () => {
  const clause = (n, doc) => cite(n, { kind: null, label: `Khoản 1 Điều ${n} ${doc}`, instrument: doc, documentNumber: doc, authority: 'binding', note: null, quotes: ['Hàng hóa nhập khẩu để gia công được miễn thuế nhập khẩu.'] });
  const res = {
    ...HS_PHOTO, mode: 'mixed', userCodes: [], candidates: [], answerMd: 'Hàng gia công được **miễn thuế** [1] [2].',
    citations: [clause(1, 'VB-A'), clause(2, 'VB-B'), HS_PHOTO.citations[0]], warnings: ['unverified', 'upcoming'],
  };
  const lines = formatAnswerMd(res, { tariffLines: [lookup('3005.10.10')] });
  const orange = all(lines, ST.orange);
  assert.equal(orange.length, 1, 'tối đa một dòng cam');
  assert.ok(orange[0].includes('VB-A, VB-B do bot tự nạp') && !orange[0].includes('CV 1810'), orange[0]);
  assert.ok(orange[0].includes('Biểu thuế trong kho') && orange[0].includes('chưa có hiệu lực'), orange[0]);
  assert.ok(rowsOf(lines).some((l) => l.startsWith('Tra theo ngày 14/09/2026')), 'khối thuế mixed giữ ngày và nghị định (R7)');
  assert.ok(!toText(lines).includes('trả lời "đúng"'));
});

test('formatAnswerMd nguồn: nhãn thẩm quyền một lần rồi "như [1]", quote ≤ 160 ký tự, nhãn EN giữ "(có thể gồm cả nhóm …)"', () => {
  const rows = rowsOf(formatAnswerMd(HS_PHOTO));
  const src = (n) => rows.find((l) => l.startsWith(`[${n}] `));
  assert.equal(rows.filter((l) => l.includes(EN_NOTE)).length, 1);
  assert.ok(src(1).startsWith(`[1] Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 (${EN_NOTE}) — “`), src(1));
  assert.ok(src(2).startsWith('[2] Chú giải Chương 30 — “'), src(2));
  assert.ok(src(3).startsWith('[3] Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24 (có thể gồm cả nhóm 38.23) (như [1]) — “'), src(3));
  for (const n of [1, 2, 3]) assert.ok(src(n).match(/“(.*)”$/)[1].length <= 160, src(n));
  assert.ok(!rows.some((l) => l.includes('(trích đoạn đầu)')));
});

test('formatAnswerMd: cut > 0 thêm đúng một dòng "bị lược"', () => {
  const count = (res) => rowsOf(formatAnswerMd(res)).filter((l) => l === CUT).length;
  assert.equal(count(HS_PHOTO), 0);
  assert.equal(count({ ...HS_PHOTO, cut: 2 }), 1);
});

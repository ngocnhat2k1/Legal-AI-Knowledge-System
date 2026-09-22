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

import { offerReply, tariffReply } from './dispatch.mjs';
import { formatAnswer, formatAnswerMd, sourceLines, sourcesOf } from './format.mjs';
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
/** A line every hs reply used to end with, dropped as boilerplate (owner, 2026-09-22): asserted never to print. */
const HINT = 'Cần xem thuế của mã nào thì nhắn mã đó kèm xuất xứ.';
const UNCHECKED = 'Có nguồn trích tự động, chưa có người đối chiếu; nhắn "nguồn" để xem.';
const CUT = 'Một phần câu trả lời bị lược vì không dẫn được nguồn.';

// coverage 'none' is what the API sets when §4.1 dropped every sentence the model wrote; the prose that is left is the
// goods section code writes, so "một phần" would be false. `written` used to carry this and stopped when the dropped
// path began keeping code's sections (2026-09-15).
test('the trimming note never says "một phần" when none of the prose stood', () => {
  const some = formatAnswerMd({ ...HS_PHOTO, cut: 2, coverage: 'partial', answerMd: '## I. THÔNG TIN HÀNG HÓA\nBạn đã cho biết:\n- thép' });
  assert.ok(toText(some).includes(CUT), 'a partly cut answer still says a part was trimmed');
  const none = formatAnswerMd({ ...HS_PHOTO, cut: 2, coverage: 'none', answerMd: '## I. THÔNG TIN HÀNG HÓA\nBạn đã cho biết:\n- thép' });
  assert.ok(!toText(none).includes(CUT), toText(none));
});
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
  // Sources print only when asked (owner, 2026-09-22): no [n] on a candidate, none in the prose, no "Nguồn:" block.
  assert.match(rows[head + 1], /^30\.05 · .{1,50}$/);
  assert.match(rows[head + 2], /^38\.24 · .{1,50}$/);
  const unbroken = rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates: [{ ...HS_PHOTO.candidates[0], title: 'Bông-gạc-băng-'.repeat(6) }] }));
  assert.match(unbroken[unbroken.indexOf('Ứng viên để chuyên viên chốt:') + 1], /^30\.05 · .{1,50}$/, 'đầu mục ≤ 50 ký tự kể cả dấu …');
  assert.ok(!/\[\d+\]/.test(toText(lines)) && !rows.includes('Nguồn:'), toText(lines));
  assert.equal(rows[head + 3], R5);
  assert.ok(!rows.includes(HINT));
  // The evidence rows here are machine-extracted: with their source lines hidden, one line still says so (R18).
  assert.equal(rows.filter((l) => l === UNCHECKED).length, 1);
  const asked = rowsOf(formatAnswerMd(HS_PHOTO, { sources: true }));
  assert.match(asked[asked.indexOf('Ứng viên để chuyên viên chốt:') + 1], /^30\.05 · .{1,50} · \[1\]$/);
  assert.ok(asked.includes('Nguồn:') && !asked.includes(UNCHECKED));
  assert.ok(render(lines).length <= 2, `${render(lines).length} tin`);
  assert.equal(all(lines, ST.orange).length, 0, 'câu so mã không bao giờ tô cam');
});

/**
 * answerMd as the classification walkthrough flattens it (walkthrough.run.ts): the owner's section titles written by code as
 * "## " lines, the model's prose under them, and the policy block the code prints — a list the corpus lacks reads "chưa nạp".
 */
const WALK_MD = [
  '## I. THÔNG TIN HÀNG HÓA',
  'Bạn mới nói miếng dán bàn chân ngải cứu, chưa nói miếng dán có tẩm dược chất hay không.',
  '',
  '## II.2 Xem xét các nhóm có khả năng áp dụng',
  'Nhóm **30.05** gồm sản phẩm "đã được thấm tẩm hoặc tráng phủ dược chất dùng cho y tế" [1]; nếu lớp ngải cứu chỉ để làm ấm thì cần so thêm nhóm **38.24** [3].',
  '',
  '## II.5 Kết luận mã HS đề xuất',
  'Trong nhóm 30.05 thì phân nhóm 3005.10 là loại có lớp dính [1].',
  '',
  '## CHÍNH SÁCH CHUYÊN NGÀNH',
  'Mã **3005.10.10** (ứng viên, chưa chốt):',
  '- **36/2026/TT-BKHCN Phụ lục I**: có tên trong danh mục — "1 | Băng dán y tế | 3005.10.10"',
  '- Kho **chưa nạp** nên mình chưa kiểm tra được: 11/2024/TT-BTTTT',
  '',
  '## KẾT LUẬN CUỐI CÙNG',
  'Mình để mở giữa hai nhóm cho tới khi biết nhãn ghi công dụng gì.',
].join('\n');

test('formatAnswerMd walkthrough: tiêu đề mục in đậm thành dòng riêng, dòng "chưa nạp" giữ nguyên, khối thuế ứng viên ở dưới', () => {
  const tariffLines = ['3005.10.10', '3824.99.99'].map(lookup);
  const lines = formatAnswerMd({ ...HS_PHOTO, answerMd: WALK_MD, depth: 'full' }, { tariffLines });
  const rows = rowsOf(lines);
  for (const title of ['I. THÔNG TIN HÀNG HÓA', 'II.2 Xem xét các nhóm có khả năng áp dụng', 'CHÍNH SÁCH CHUYÊN NGÀNH', 'KẾT LUẬN CUỐI CÙNG'])
    assert.ok(rows.includes(title), `thiếu tiêu đề "${title}"`);
  // A "## " line is a bold line to md(): no "#" reaches the reader.
  assert.ok(!rows.some((l) => l.includes('#')), 'không còn dấu # nào');
  assert.equal(all(lines, ST.b).filter((t) => t === 'I. THÔNG TIN HÀNG HÓA').length, 1);
  // The policy block is code's: a list the corpus has not loaded says so, and no line says "Không" about it.
  assert.ok(rows.some((l) => l.startsWith('Kho chưa nạp nên mình chưa kiểm tra được:')));
  assert.ok(!rows.some((l) => /^Không /.test(l)));
  // D3(a): at full depth the candidate blocks print under the report, at most two, and the brief hint does not.
  assert.ok(!rows.includes(HINT));
  assert.equal(rows.filter((l) => l.startsWith('Nếu hàng thuộc mã ')).length, 2);
});

test('formatAnswerMd bất biến R13: không tin nào của câu soạn khớp tariffReply — brief, full, mixed, walkthrough', () => {
  const tariffLines = ['3005.10.10', '3824.99.99'].map(lookup);
  const replies = {
    brief: formatAnswerMd(HS_PHOTO, { tariffLines }),
    full: formatAnswerMd({ ...HS_PHOTO, depth: 'full' }, { tariffLines }),
    walk: formatAnswerMd({ ...HS_PHOTO, answerMd: WALK_MD, depth: 'full' }, { tariffLines }),
    mixed: formatAnswerMd({ ...HS_PHOTO, mode: 'mixed', userCodes: [], candidates: [] }, { tariffLines: tariffLines.slice(0, 1) }),
  };
  for (const [name, lines] of Object.entries(replies)) {
    // A Zalo user quotes one message, not the whole reply.
    for (const msg of render(lines).map((p) => p.msg)) assert.equal(tariffReply(msg), false, `${name}: ${msg.slice(0, 120)}`);
  }
  // Re-review 2026-09-14: from ~790 characters of prose a full reply put a candidate's rate block at the top of message 2,
  // away from the candidates heading. Sweep prose lengths so wherever render splits, no message reads as a tariff reply.
  const filler = 'Chú giải chi tiết nhóm này mô tả tiêu chí phân biệt theo công dụng và cách trình bày của hàng [1]. ';
  for (let chars = 0; chars <= 4000; chars += 50) {
    const pad = filler.repeat(Math.ceil(chars / filler.length)).slice(0, chars);
    const answerMd = `${HS_PHOTO.answerMd}\n\n${pad}`;
    const variants = {
      full: formatAnswerMd({ ...HS_PHOTO, answerMd, depth: 'full' }, { tariffLines }),
      // Owner 2026-09-22: a brief reply names each candidate's picked 8-digit line under it.
      briefLine: formatAnswerMd({ ...HS_PHOTO, answerMd, candidates: HS_PHOTO.candidates.map((c, i) => ({ ...c, line: { code: ['3005.90.90', '3824.99.99'][i], text: 'Loại khác › Loại khác' } })) }),
      // The walkthrough's own titles split a long reply at different places: sweep them too.
      walk: formatAnswerMd({ ...HS_PHOTO, answerMd: `${WALK_MD}\n\n${pad}`, depth: 'full' }, { tariffLines }),
      mixed: formatAnswerMd({ ...HS_PHOTO, answerMd, mode: 'mixed', userCodes: [], candidates: [] }, { tariffLines: tariffLines.slice(0, 1) }),
    };
    for (const [name, lines] of Object.entries(variants)) {
      for (const msg of render(lines).map((p) => p.msg)) {
        assert.equal(tariffReply(msg), false, `${name} +${chars}: ${msg.slice(0, 120)}`);
        assert.equal(offerReply(msg), false, `lời mời ${name} +${chars}: ${msg.slice(0, 120)}`);
      }
    }
  }
});

test('bất biến R13 mixed: khối by_subline 70 dòng dài hơn một tin, tách ở đâu cũng không tin nào khớp tariffReply hay mở dòng bằng câu dẫn khối thuế', () => {
  const base = lookup('8481.80.99');
  const acfta = base.tariff.import.preferential[0];
  const sublines = Array.from({ length: 70 }, (_, i) => ({
    codeDotted: `8481.80.99.${String(i).padStart(2, '0')}`, desc: 'Loại khác, bằng thép không gỉ, dùng cho đường ống', percent: '5', type: 'ad_valorem', originExcluded: null,
  }));
  const huge = { ...base, tariff: { ...base.tariff, import: { ...base.tariff.import, preferential: [{ ...acfta, type: 'by_subline', rate: null, originEligible: null, originExcluded: null, sublines }] } } };
  const sentence = 'Van thuộc danh mục phải kiểm tra chuyên ngành trước khi thông quan theo quy định hiện hành [1]. ';
  const res = { ...HS_PHOTO, mode: 'mixed', userCodes: [], candidates: [] };
  // Re-review round 3 (D05): the block's first paragraph outgrew a message, render split it line by line, and the heading ended
  // one message while the bare lead opened the next.
  for (let chars = 1; chars <= 1800; chars++) {
    const answerMd = sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
    for (const msg of render(formatAnswerMd({ ...res, answerMd }, { tariffLines: [huge] })).map((p) => p.msg)) {
      assert.equal(tariffReply(msg), false, `+${chars}: ${msg.slice(0, 120)}`);
      assert.doesNotMatch(msg, /^(?:Đối với h|H)àng hóa có mã HS/m, `+${chars}`);
    }
  }
});

test('bất biến R13: câu pháp luật, tình trạng và hs không ứng viên có "Cảm ơn"/"MFN"/"bạn nêu" hay mở dòng bằng câu dẫn khối thuế không khớp tariffReply, tách tin ở đâu cũng vậy; khối thuế thật vẫn khớp', () => {
  // Re-review 2026-09-15: a subject code is unmasked into the compose prompt, so prose can open a line with the tariff lead.
  // Re-review round 2: markdown inside an opener ("Hàng hóa có **mã HS …**") went through the reword, then md() dropped the
  // asterisks; an offer's wording ('nhắn "HS đúng là …"') would let a coded ruling quoting the reply write too.
  const lead = [
    'Hàng hóa có mã HS 8481.80.99 thuộc danh mục phải kiểm tra chất lượng trước thông quan [1].',
    'Đối với hàng hóa có mã HS 8481.80.99 có xuất xứ Trung Quốc, hồ sơ cần C/O mẫu E [1].',
    'Đã xác nhận mã 8481.80.99 cho hàng tương tự.',
    'Đã ghi nhận sai cho mã 8481.80.99 trước đây [1].',
    'Hàng hóa có **mã HS 8481.80.99** thuộc danh mục kiểm tra chuyên ngành [1].',
    '**Hàng hóa** có mã HS 8481.80.99 thuộc danh mục kiểm tra chuyên ngành [1].',
    '*Đối với hàng hóa có mã HS* 8481.80.99, hồ sơ cần C/O mẫu E [1].',
    'Đã xác nhận mã **8481.80.99** cho hàng tương tự trong danh mục [1].',
    'Đã **ghi nhận** sai cho mã 8481.80.99 trước đây [1].',
    'Muốn đổi mã thì nhắn "HS đúng là 8481.80.99" kèm công văn [1].',
    '- Nếu cần, nhắn **"HS đúng là <mã>"** [1].',
  ];
  const prose = `Cảm ơn bạn đã mô tả thêm. Thuế MFN không đổi theo mô tả; mã bạn nêu cần đối chiếu chú giải [1].\n${lead.join('\n')}`;
  const noCands = { ...HS_PHOTO, candidates: [], userCodes: [{ ...HS_PHOTO.userCodes[0], exists: false, inCandidates: false }] };
  const legal = {
    ...HS_PHOTO, mode: 'legal', userCodes: [], candidates: [],
    citations: [cite(1, { kind: null, label: 'Khoản 1 Điều 9 VB-A', documentNumber: 'VB-A', note: null, quotes: ['Mũ bảo hiểm mã 6506.10.10 thuộc danh mục hàng hóa kiểm tra chuyên ngành.'] })],
  };
  const modes = { noCands, legal, status: { ...legal, mode: 'status' } };
  const noTariffReply = (answerMd, label) => {
    for (const [name, res] of Object.entries(modes)) {
      for (const msg of render(formatAnswerMd({ ...res, answerMd })).map((p) => p.msg)) {
        assert.equal(tariffReply(msg), false, `${name} ${label}: ${msg.slice(0, 120)}`);
        assert.equal(offerReply(msg), false, `lời mời ${name} ${label}: ${msg.slice(0, 120)}`);
      }
    }
  };
  const filler = 'Văn bản này quy định hồ sơ, thủ tục và thời hạn kiểm tra đối với hàng hóa nhập khẩu [1]. ';
  const fill = (chars) => filler.repeat(Math.ceil(chars / filler.length)).slice(0, chars);
  for (let chars = 0; chars <= 4000; chars += 50) noTariffReply(`${prose}\n\n${fill(chars)}\n${lead.join('\n')}`, `+${chars}`);
  // One paragraph longer than a message is cut at a space, so a message may open mid-sentence: every cut near the budget.
  for (let chars = 1400; chars <= 1850; chars++) noTariffReply(`${fill(chars)} ${lead.join(' ')}`, `một đoạn +${chars}`);
  const { q, tariff } = lookup('8481.80.99');
  const [rate] = render([...md('Mã bạn nêu là van; mức FTA chỉ áp khi có C/O đúng form.'), L([]), ...formatAnswer(q, tariff, null)]);
  assert.equal(tariffReply(rate.msg), true, rate.msg.slice(0, 120));
});

test('formatAnswerMd: ứng viên thiếu [n] bị bỏ, không làm hỏng cả câu trả lời (R2)', () => {
  const candidates = [{ ...HS_PHOTO.candidates[0], evidence: undefined }, { ...HS_PHOTO.candidates[1], evidence: [] }, { hs: '33.07', level: 4, title: 'Chế phẩm dùng trước, trong hoặc sau khi cạo', evidence: [2] }];
  const rows = rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates }));
  const head = rows.indexOf('Ứng viên để chuyên viên chốt:');
  assert.deepEqual(rows.slice(head + 1), ['33.07 · Chế phẩm dùng trước, trong hoặc sau khi cạo', ...rows.slice(head + 2)]);
  assert.ok(!rows.some((l) => /^\d{2}\.\d{2} · .* · $/.test(l)));
  const asked = rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates }, { sources: true }));
  assert.equal(asked[asked.indexOf('Ứng viên để chuyên viên chốt:') + 1], '33.07 · Chế phẩm dùng trước, trong hoặc sau khi cạo · [2]');
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

test('formatAnswerMd: dòng R5 chỉ khi từ 2 ứng viên và văn xuôi chưa nói "xác định trước"; dòng khuôn "nhắn mã kèm xuất xứ" không bao giờ', () => {
  const has = (res) => rowsOf(formatAnswerMd(res)).includes(R5);
  assert.equal(has(HS_PHOTO), true);
  assert.equal(has({ ...HS_PHOTO, answerMd: `${HS_PHOTO.answerMd}\n\nHàng khó chốt thì bạn có thể đề nghị **xác định trước** mã số.` }), false);
  assert.equal(has({ ...HS_PHOTO, candidates: HS_PHOTO.candidates.slice(0, 1) }), false);
  for (const res of [HS_PHOTO, { ...HS_PHOTO, depth: 'full' }]) for (const sources of [false, true]) assert.ok(!rowsOf(formatAnswerMd(res, { sources })).includes(HINT));
});

test('formatAnswerMd D3(a): walkthrough full in khối thuế gọn cho tối đa 2 mã, không xanh; brief không khối', () => {
  // A verdict history on a candidate code: its "trả lời đúng/sai" footer is a promise nothing keeps after a composed reply.
  const confirm = { correct: 2, wrong: 0, unsure: 0, recent: [{ verdict: 'correct', staffName: 'Chuyên Viên A' }] };
  const tariffLines = ['3005.10.10', '3005.90.10', '3824.99.99'].map((d) => ({ ...lookup(d), confirm }));
  const full = formatAnswerMd({ ...HS_PHOTO, depth: 'full' }, { tariffLines, sources: true });
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
  // Sources hidden, the blocks still number after them: a later "nguồn?" prints [1]–[3], never a second [1] (R10).
  const hidden = rowsOf(formatAnswerMd({ ...HS_PHOTO, depth: 'full' }, { tariffLines }));
  assert.ok(hidden.find((l) => l.startsWith('Tra theo ngày')).includes('[4] NĐ 26/2023/NĐ-CP'), hidden.join('\n'));
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
  // Printed whether or not sources are; numbered only when they are.
  assert.deepEqual(all(lines, ST.red), ['69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo 292/2026/NĐ-CP.']);
  assert.deepEqual(all(formatAnswerMd(res, { sources: true }), ST.red), ['[1] 69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo 292/2026/NĐ-CP.']);
  assert.equal(all(lines, ST.orange).length, 0, 'mục bằng chứng không phải văn bản bot tự nạp');
  assert.ok(!toText(lines).includes('Ứng viên') && !rowsOf(lines).includes(HINT));
});

test('formatAnswerMd: dòng đỏ hiệu lực gộp theo (văn bản, hiệu lực), mang mọi dấu [n] của nó, dù văn xuôi nói gì (R8)', () => {
  // Tới Việc 13 rule này nằm trong test của câu trả lời pháp luật cũ; `redLines` nay chỉ còn `formatAnswerMd` gọi.
  const clause = (n, doc, effectiveness) =>
    cite(n, { kind: null, label: `Khoản 1 Điều ${n} ${doc}`, instrument: doc, documentNumber: doc, authority: 'binding', note: null, verification: 'verified', effectiveness });
  const res = {
    ...HS_PHOTO, mode: 'legal', userCodes: [], candidates: [],
    answerMd: 'Hàng gia công được miễn thuế [1], trừ khi bán nội địa [2] [3]; chú giải nhóm nói thêm [4].',
    citations: [
      clause(1, 'VB-A', 'con_hieu_luc'), clause(2, 'VB-B', 'het_hieu_luc_mot_phan'), clause(3, 'VB-B', 'het_hieu_luc_mot_phan'),
      // Mục bằng chứng (Chú giải chi tiết, SEN, phụ lục…) mang tình trạng trên DÒNG NGUỒN của nó (R18): dù dữ liệu gắn
      // `effectiveness` gì, nó không bao giờ sinh một dòng đỏ hiệu lực như một điều khoản văn bản.
      cite(4, { effectiveness: 'het_hieu_luc_mot_phan' }),
    ],
  };
  const red = all(formatAnswerMd(res, { sources: true }), ST.red);
  assert.deepEqual(red, ['[2] [3] VB-B hết hiệu lực một phần — kiểm tra điều khoản còn áp dụng.']);
  assert.deepEqual(all(formatAnswerMd(res), ST.red), ['VB-B hết hiệu lực một phần — kiểm tra điều khoản còn áp dụng.']);
  assert.ok(!red.some((l) => l.includes('CV 1810')), red.join('\n'));
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
  const confirm = { correct: 2, wrong: 0, unsure: 0, recent: [{ verdict: 'correct', staffName: 'Chuyên Viên A' }] };
  const history = rowsOf(formatAnswerMd(res, { tariffLines: [{ ...lookup('3005.10.10'), confirm }] }));
  assert.ok(history.includes('Đã xác nhận đúng 2 lần (gần nhất: Chuyên Viên A).'), 'mixed giữ lịch sử xác nhận của mã được hỏi (R18)');
  assert.ok(!history.some((l) => l.includes('trả lời "đúng"')), 'câu soạn không mời "đúng"/"sai": không mã nào đang chờ xác nhận');
});

test('formatAnswerMd nguồn khi được hỏi: mỗi nguồn một dòng ngắn "[n] nhãn — link", không trích, không ghi chú; bằng chứng trích tự động ghi nhỏ trên dòng nguồn (R18)', () => {
  const AUTO = ' (trích tự động, chưa đối chiếu)';
  const url = 'https://congbao.chinhphu.vn/vb-a';
  const withUrl = { ...HS_PHOTO, citations: HS_PHOTO.citations.map((c, i) => (i < 2 ? { ...c, url } : c)) };
  const rows = rowsOf(formatAnswerMd(withUrl, { sources: true }));
  const src = (n) => rows.find((l) => l.startsWith(`[${n}] `));
  assert.equal(src(1), `[1] Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05${AUTO} — ${url}`);
  assert.equal(src(2), `[2] Chú giải Chương 30${AUTO}`, 'một link mỗi văn bản');
  assert.equal(src(3), `[3] Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24 (có thể gồm cả nhóm 38.23)${AUTO}`);
  assert.ok(!rows.some((l) => l.includes(EN_NOTE) || l.includes('“')), rows.join('\n'));
  // Owner decision 2026-09-15: an evidence row a person checked carries nothing; neither does a statute clause, whose standing
  // stays the orange "bot tự nạp" line. The evidence mark is never orange.
  const verified = { ...HS_PHOTO, citations: HS_PHOTO.citations.map((c) => ({ ...c, verification: 'verified' })) };
  assert.ok(!rowsOf(formatAnswerMd(verified, { sources: true })).some((l) => l.includes(AUTO)));
  assert.ok(!rowsOf(formatAnswerMd(verified)).includes(UNCHECKED), 'không nguồn nào chưa đối chiếu thì không có dòng R18');
  const clause = cite(4, { kind: null, label: 'Khoản 1 Điều 9 VB-A', documentNumber: 'VB-A', note: null, quotes: ['Hàng hóa nhập khẩu để gia công được miễn thuế nhập khẩu.'] });
  const legal = formatAnswerMd({ ...HS_PHOTO, mode: 'legal', userCodes: [], candidates: [], citations: [...HS_PHOTO.citations, clause] }, { sources: true });
  assert.equal(rowsOf(legal).find((l) => l.startsWith('[4] ')), '[4] Khoản 1 Điều 9 VB-A');
  const orange = all(legal, ST.orange);
  assert.equal(orange.length, 1);
  assert.ok(orange[0].startsWith('VB-A do bot tự nạp') && !orange[0].includes('trích tự động'), orange[0]);
  // The follow-up "nguồn?" prints the same lines from memory.
  assert.deepEqual(toText(sourceLines(sourcesOf(withUrl.citations))), toText(formatAnswerMd(withUrl, { sources: true }).slice(-4)));
});

test('formatAnswerMd tariff (Q1): văn xuôi và khối thuế dựng một lần: [k] không trùng, cảnh báo của khối nằm dưới văn xuôi, còn lời mời đúng/sai, vẫn là câu tra thuế', () => {
  const res = {
    ...HS_PHOTO, mode: 'tariff', userCodes: [], candidates: [], warnings: ['upcoming'],
    answerMd: 'Mức ưu đãi theo ACFTA chỉ áp khi hàng có C/O form E hợp lệ [1].',
    citations: [cite(1, { kind: null, label: 'Điều 5 Nghị định 26/2023/NĐ-CP', documentNumber: '26/2023/NĐ-CP', authority: 'binding', note: null, verification: 'verified', quotes: ['Hàng hóa có C/O hợp lệ được áp dụng thuế suất ưu đãi đặc biệt.'] })],
  };
  const lines = formatAnswerMd(res, { tariffLines: [lookup('8481.80.99')], showFooter: true, sources: true });
  const rows = rowsOf(lines);
  const labels = rows.flatMap((l) => (l.startsWith('Tra theo ngày') ? [...l.matchAll(/\[(\d+)\] /g)].map((m) => m[1]) : (l.match(/^\[(\d+)\] /) ?? []).slice(1)));
  assert.deepEqual(labels, [...new Set(labels)], labels.join(','));
  assert.ok(labels.length >= 3, labels.join(','));
  const parts = render(lines);
  const [orange] = parts.flatMap((p) => texts(p, ST.orange));
  assert.ok(orange.includes('Biểu thuế trong kho') && orange.includes('chưa có hiệu lực'), orange);
  const msg = parts.map((p) => p.msg).join('\n');
  const at = (s) => msg.indexOf(s);
  assert.ok(at('Mức ưu đãi theo ACFTA') < at('Đối với hàng hóa có mã HS 8481.80.99') && at('Đối với hàng hóa') < at(orange) && at(orange) < at('Nguồn:'), msg);
  assert.ok(rows.some((l) => l.includes('trả lời "đúng"')), 'tra thuế thật: lời mời đúng/sai ở lượt tra đầu');
  assert.equal(tariffReply(parts[0].msg), true);
  // Sources not asked for: the prose has no [n], the block's decrees still follow the hidden [1], and it is still the lookup.
  const plain = render(formatAnswerMd(res, { tariffLines: [lookup('8481.80.99')], showFooter: true }));
  assert.ok(plain[0].msg.startsWith('Mức ưu đãi theo ACFTA chỉ áp khi hàng có C/O form E hợp lệ.\n'), plain[0].msg);
  assert.ok(!plain.some((p) => p.msg.includes('Nguồn:')) && plain.some((p) => /Tra theo ngày .*\[2\] NĐ/.test(p.msg)));
  assert.equal(tariffReply(plain[0].msg), true);
});

test('formatAnswerMd: văn xuôi bị lược hết mà còn nguồn thì mở bằng một câu do code viết, không nói "Một phần"; không nguồn thì để trống', () => {
  const res = { ...HS_PHOTO, mode: 'legal', userCodes: [], candidates: [], answerMd: '', cut: 2 };
  const rows = rowsOf(formatAnswerMd(res));
  assert.match(rows[0], /^Mình chưa viết được câu trả lời/);
  assert.ok(!rows.includes(CUT));
  assert.equal(toText(formatAnswerMd({ ...res, citations: [] })).trim(), '', 'bot nói thật thay cho một dòng "bị lược" đứng một mình');
});

test('formatAnswerMd: cut > 0 thêm đúng một dòng "bị lược"', () => {
  const count = (res) => rowsOf(formatAnswerMd(res)).filter((l) => l === CUT).length;
  assert.equal(count(HS_PHOTO), 0);
  assert.equal(count({ ...HS_PHOTO, cut: 2 }), 1);
});

test('formatAnswerMd: chú giải chưa có hiệu lực / sắp hết hiệu lực vẫn nói ngày khi ẩn nguồn, và nói trên dòng nguồn khi hỏi (R8, review 2026-09-22)', () => {
  const when = 'CHƯA CÓ HIỆU LỰC — có hiệu lực từ 01/01/2027';
  const res = { ...HS_PHOTO, citations: [cite(1, { ...HS_PHOTO.citations[0], note: `${EN_NOTE} · ${when}` }), ...HS_PHOTO.citations.slice(1)], warnings: ['upcoming'] };
  const hidden = rowsOf(formatAnswerMd(res));
  assert.ok(hidden.includes(`Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05: ${when}.`), hidden.join('\n'));
  assert.ok(!hidden.some((l) => l.includes(EN_NOTE)), 'nhãn thẩm quyền không in');
  const shown = rowsOf(formatAnswerMd(res, { sources: true }));
  assert.equal(shown.find((l) => l.startsWith('[1] ')), `[1] Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 (${when}) (trích tự động, chưa đối chiếu)`);
});

// --- Owner 2026-09-22: "hs code 8 số nhưng nó mới trả lời 4 số" ------------------------------------------------------------

test('formatAnswerMd: dòng 8 số mô hình chọn nằm ngay dưới nhóm của nó, mã in đậm, không thuế suất, vẫn một tin', () => {
  const res = { ...HS_PHOTO, candidates: [{ ...HS_PHOTO.candidates[0], line: { code: '3005.90.90', text: 'Loại khác › Loại khác' } }, HS_PHOTO.candidates[1]] };
  const lines = formatAnswerMd(res);
  const rows = rowsOf(lines);
  const at = rows.findIndex((l) => l.startsWith('30.05 · '));
  assert.equal(rows[at + 1], '↳ 3005.90.90 · Loại khác › Loại khác');
  assert.ok(rows[at + 2].startsWith('38.24 · '), 'một nhóm không có dòng thì không có dòng ↳');
  assert.ok(all(lines, ST.b).includes('3005.90.90'));
  const text = toText(lines);
  for (const s of ['MFN', 'Nếu hàng thuộc mã ']) assert.ok(!text.includes(s), s);
  assert.equal(all(lines, ST.green).length, 0);
  assert.equal(render(lines).length, 1);
  // Sources asked for: the [n] stays on the heading's row, never on the line's.
  const asked = rowsOf(formatAnswerMd(res, { sources: true }));
  const h = asked.findIndex((l) => l.startsWith('30.05 · '));
  assert.ok(asked[h].endsWith('[1]') && !/\[\d+\]/.test(asked[h + 1]), `${asked[h]}\n${asked[h + 1]}`);
});

test('formatAnswerMd: câu lưỡi dao răng cưa (2026-09-22) — hai đoạn gọn, hai nhóm, mỗi nhóm một dòng 8 số, vừa một tin', () => {
  const answerMd = [
    'Lưỡi này lắp trên máy ghép đùn để cắt màng khi sang cuộn, nên chỗ cần phân định là nó thuộc "dao và lưỡi cắt, dùng cho máy" hay "lưỡi cưa các loại". Nhóm 82.08 còn đứng vì câu chữ nhóm là "Dao và lưỡi cắt, dùng cho máy hoặc dụng cụ cơ khí" [1]; các dòng riêng trong nhóm dành cho gia công kim loại, gỗ, nhà bếp và máy nông nghiệp, còn lưỡi cắt màng nhựa rơi vào dòng "Loại khác".',
    '',
    'Nhóm 82.02 vẫn còn đứng vì nhóm kể cả "lưỡi rạch, lưỡi khía răng cưa hoặc lưỡi cưa không răng" [2]; một lưỡi thẳng không dùng cho kim loại như bạn tả ứng với dòng "Lưỡi cưa thẳng". Điều quyết định là lưỡi làm việc như lưỡi cưa hay như dao cắt của máy: bạn xem catalogue hoặc bản vẽ máy ghép đùn gọi bộ phận này là gì.',
  ].join('\n');
  const res = {
    ...HS_PHOTO, userCodes: [], answerMd,
    citations: [cite(1, { label: 'Chú giải chi tiết HS 2022 · Chương 82 · nhóm 82.08', hsHeading: '82.08' }), cite(2, { label: 'Chú giải chi tiết HS 2022 · Chương 82 · nhóm 82.02', hsHeading: '82.02' })],
    candidates: [
      { hs: '82.08', level: 4, title: 'Dao và lưỡi cắt, dùng cho máy hoặc dụng cụ cơ khí', evidence: [1], line: { code: '8208.90.00', text: 'Loại khác' } },
      { hs: '82.02', level: 4, title: 'Cưa tay; lưỡi cưa các loại (kể cả các loại lưỡi rạch, lưỡi khía răng cưa hoặc lưỡi cưa không răng)', evidence: [2], line: { code: '8202.99.10', text: 'Lưỡi cưa khác › Loại khác › Lưỡi cưa thẳng' } },
    ],
  };
  const parts = render(formatAnswerMd(res));
  assert.equal(parts.length, 1, parts.map((p) => p.msg).join('\n---\n'));
  for (const s of ['Ứng viên để chuyên viên chốt:', '↳ 8208.90.00 · Loại khác', '↳ 8202.99.10 · Lưỡi cưa khác › Loại khác › Lưỡi cưa thẳng', R5, UNCHECKED]) assert.ok(parts[0].msg.includes(s), s);
  assert.ok(!/\[\d+\]/.test(parts[0].msg) && !parts[0].msg.includes('Nguồn:'));
  assert.equal(tariffReply(parts[0].msg), false);
});

test('formatAnswerMd: dòng 8 số giữ tên của chính nó (phần lá), cắt các cấp cha từ bên trái (review 2026-09-22)', () => {
  // Real catalogue paths: cut from the right, both printed "Máy xử lý dữ liệu tự động loại xách tay, có khối lượng…".
  const parent = 'Máy xử lý dữ liệu tự động loại xách tay, có khối lượng không quá 10 kg, gồm ít nhất một đơn vị xử lý dữ liệu trung tâm, một bàn phím và một màn hình';
  const row = (code, text) => rowsOf(formatAnswerMd({ ...HS_PHOTO, candidates: [{ ...HS_PHOTO.candidates[0], line: { code, text } }] })).find((l) => l.startsWith('↳ '));
  assert.equal(row('8471.30.20', `${parent} › Máy tính xách tay kể cả notebook và subnotebook`), '↳ 8471.30.20 · … › Máy tính xách tay kể cả notebook và subnotebook');
  assert.equal(row('8471.30.90', `${parent} › Loại khác`), '↳ 8471.30.90 · … › Loại khác');
  // Parents stay while they fit.
  assert.equal(row('8202.99.10', 'Lưỡi cưa khác › Loại khác › Lưỡi cưa thẳng'), '↳ 8202.99.10 · Lưỡi cưa khác › Loại khác › Lưỡi cưa thẳng');
});

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

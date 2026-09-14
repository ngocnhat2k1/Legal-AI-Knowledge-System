import { dropInForceClaims, numberMarkers } from './legal.grounding';

describe('dropInForceClaims — an instrument the data says has ended is never called in force (R8)', () => {
  const expired = ['43/2017/NĐ-CP'];

  it('drops the opening the model wrote on 14/09/2026 and keeps the correct sentence', () => {
    const answer =
      'Còn hiệu lực tại thời điểm hiện tại (14/09/2026), nhưng sẽ hết hiệu lực từ 23/01/2026. Phần nhãn hàng hóa đã hết hiệu lực từ 23/01/2026 [1].';
    expect(dropInForceClaims(answer, expired, [])).toBe('Phần nhãn hàng hóa đã hết hiệu lực từ 23/01/2026 [1].');
  });

  it('keeps a negated claim', () => {
    expect(dropInForceClaims('Nghị định 43/2017/NĐ-CP không còn hiệu lực [1].', expired, [])).toBe('Nghị định 43/2017/NĐ-CP không còn hiệu lực [1].');
  });

  it('keeps a claim about a source still in force; drops one that also names the expired instrument', () => {
    const current = 'Nghị định 85/2019/NĐ-CP vẫn được áp dụng tới 15/10/2026 [2].';
    expect(dropInForceClaims(current, expired, ['85/2019/NĐ-CP'])).toBe(current);
    expect(dropInForceClaims('Nghị định 43/2017/NĐ-CP vẫn còn hiệu lực, 37/2026/NĐ-CP bổ sung [1].', expired, ['37/2026/NĐ-CP'])).toBe('');
  });

  it('changes nothing when no source has ended', () => {
    expect(dropInForceClaims('Nghị định 08/2015/NĐ-CP còn hiệu lực [1].', [], ['08/2015/NĐ-CP'])).toBe('Nghị định 08/2015/NĐ-CP còn hiệu lực [1].');
  });
});

/** Five provisions as the model saw them: "{articleCitation}\n{articleBody}". */
const five = [
  'Điều 1 Nghị định 08/2015/NĐ-CP\nNội dung một',
  'Điều 2 Nghị định 08/2015/NĐ-CP\nNộp thuế trong thời hạn 15 ngày',
  'Điều 3\nba',
  'Điều 4\nbốn',
  'Điều 5\nnăm',
];

describe('numberMarkers — [n] points at citations[n-1], and the numbers beside it are in that source (R10)', () => {
  it('renumbers by first appearance and returns the original positions', () => {
    expect(numberMarkers('A [3]. B [1].', [1, 3], five, '')).toEqual({ answer: 'A [1]. B [2].', order: [3, 1] });
  });

  it('removes a marker outside the provision list', () => {
    expect(numberMarkers('A [9]. B [2].', [2], five, '')).toEqual({ answer: 'A. B [1].', order: [2] });
  });

  it('splits a grouped marker and merges an adjacent duplicate', () => {
    expect(numberMarkers('A [1, 2].', [1, 2], five, '').answer).toBe('A [1] [2].');
    expect(numberMarkers('A [1] [1].', [1], five, '').answer).toBe('A [1].');
  });

  it('keeps an answer without markers; citations follow the model list', () => {
    expect(numberMarkers('Không có dấu.', [2], five, '')).toEqual({ answer: 'Không có dấu.', order: [2] });
  });

  it('empties the answer when a rate is not in the source its sentence cites', () => {
    expect(numberMarkers('Thuế suất **0%** [1].', [1], five, '').answer).toBe('');
  });

  it('strips marker and bold from a sentence whose duration its source lacks; the next sentence keeps its marker', () => {
    expect(numberMarkers('Nộp trong **30 ngày** [2]. Câu khác [1].', [1, 2], five, '')).toEqual({
      answer: 'Nộp trong 30 ngày. Câu khác [1].',
      order: [1],
    });
  });

  it('keeps a duration its source states', () => {
    expect(numberMarkers('Nộp trong **15 ngày** [2].', [2], five, '').answer).toBe('Nộp trong **15 ngày** [1].');
  });

  it('exempts a document number the user wrote, never a percentage', () => {
    const s = 'Kho chưa có Nghị định 43/2017/NĐ-CP [3].';
    expect(numberMarkers(s, [3], five, 'nghị định 43/2017 còn hiệu lực không').answer).toBe('Kho chưa có Nghị định 43/2017/NĐ-CP [1].');
    expect(numberMarkers(s, [3], five, '').answer).toBe('Kho chưa có Nghị định 43/2017/NĐ-CP.');
    expect(numberMarkers('Mức 5% [3].', [3], five, 'mức 5% đúng không').answer).toBe('');
  });

  it('matches a figure on digit boundaries: 0% is not inside 10%, 30 ngày not inside 130 ngày', () => {
    const src = ['Điều 1\nThuế suất 10%, nộp trong 130 ngày, phạt 11.000.000 đồng'];
    expect(numberMarkers('Thuế suất **0%** [1].', [1], src, '').answer).toBe('');
    expect(numberMarkers('Phạt **1.000.000 đồng** [1].', [1], src, '').answer).toBe('');
    expect(numberMarkers('Nộp trong **30 ngày** [1].', [1], src, '').answer).toBe('Nộp trong 30 ngày.');
  });

  it('reads a leading zero as the same document number', () => {
    expect(numberMarkers('Theo **08/2015/NĐ-CP** [1].', [1], ['Điều 1 Nghị định 8/2015/NĐ-CP\nx'], '').answer).toBe('Theo **08/2015/NĐ-CP** [1].');
  });

  it('reads a bold, quoted or directly marked document number without the characters around it', () => {
    expect(numberMarkers('Theo **Nghị định 08/2015/NĐ-CP** [1].', [1], five, '').answer).toBe('Theo **Nghị định 08/2015/NĐ-CP** [1].');
    expect(numberMarkers('Theo “08/2015/NĐ-CP”[1].', [1], five, '').answer).toBe('Theo “08/2015/NĐ-CP”[1].');
  });
});

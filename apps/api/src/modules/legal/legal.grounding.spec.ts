import { numberMarkers } from './legal.grounding';

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

  it('reads a bold, quoted or directly marked document number without the characters around it', () => {
    expect(numberMarkers('Theo **Nghị định 08/2015/NĐ-CP** [1].', [1], five, '').answer).toBe('Theo **Nghị định 08/2015/NĐ-CP** [1].');
    expect(numberMarkers('Theo “08/2015/NĐ-CP”[1].', [1], five, '').answer).toBe('Theo “08/2015/NĐ-CP”[1].');
  });
});

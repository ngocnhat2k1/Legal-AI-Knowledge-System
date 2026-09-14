import { quoteInBody, ratesInProse, settlementClaims, splitSentences, unknownCitations, userCodesIn } from './guards';

describe('ratesInProse — rates live in the code-built block, never in prose (owner decision 2026-09-14)', () => {
  it('flags a percentage, "phần trăm" and an amount, whatever the sentence cites', () => {
    const prose = 'Thuế MFN là 8% [1]. Ưu đãi ACFTA còn 0,8 % nếu có C/O. Mức năm phần trăm áp dụng. Phạt 1.500.000 đồng [2]. Nhóm 30.05 gồm cao dán [3].';
    expect(ratesInProse(prose)).toEqual([
      'Thuế MFN là 8% [1].',
      'Ưu đãi ACFTA còn 0,8 % nếu có C/O.',
      'Mức năm phần trăm áp dụng.',
      'Phạt 1.500.000 đồng [2].',
    ]);
  });

  it('leaves provisions, durations, codes and dates alone', () => {
    expect(ratesInProse('Theo Điều 8 khoản 2 [1], trong 30 ngày kể từ 15/07/2023, mã 3005.10.10 thuộc nhóm 30.05.')).toEqual([]);
  });
});

describe('settlementClaims — no heading settled from thin facts (R2, R3, R5)', () => {
  it('flags the over-conclusion observed on 2026-09-14 and its kin', () => {
    const prose = [
      'Với miếng dán ngải cứu chưa xác định được công dụng cụ thể, nên phải xét vào 38.24 [1].',
      'Hàng này chắc chắn thuộc nhóm 30.05.',
      'Mình đề xuất khai mã 3005.10.10 cho lô này.',
      'Độ tin cậy cho 30.04 khoảng cao.',
    ].join(' ');
    expect(settlementClaims(prose)).toHaveLength(4);
  });

  it('lets conditional reasoning and plain descriptions of a heading pass', () => {
    const prose =
      'Nếu sản phẩm có chỉ định điều trị và cơ chế thẩm thấu qua da thì hướng về 30.04 [1]. Nhóm 30.05 gồm cao dán đã thấm tẩm dược chất [2]. Cần xác định công dụng ghi trên nhãn.';
    expect(settlementClaims(prose)).toEqual([]);
  });
});

describe('userCodesIn — the user\'s own code never reaches a prompt (R4)', () => {
  it('finds the 8-digit code in any spelling, not the 4-digit heading', () => {
    const texts = ['Căn cứ phân loại miếng dán [mã 1], nhóm 30.05', 'e tham khảo mã 3005 10 10', 'mã 30051010'];
    expect(userCodesIn([texts[0]!], ['3005.10.10'])).toEqual([]);
    expect(userCodesIn([texts[1]!], ['3005.10.10'])).toEqual(['3005.10.10']);
    expect(userCodesIn([texts[2]!], ['3005.10.10'])).toEqual(['3005.10.10']);
    expect(userCodesIn(['số lô 130051010'], ['3005.10.10'])).toEqual([]);
  });
});

describe('unknownCitations and quoteInBody (R10)', () => {
  it('reports ids outside the retrieved set, once each', () => {
    expect(unknownCitations([812, 40, 999, 999], [812, 40, 1201])).toEqual([999]);
  });

  it('accepts a verbatim quote under whitespace, case and Unicode-form differences only', () => {
    const body = 'Nhóm này bao gồm:\n(1) Bông, gạc,   băng đã thấm tẩm dược chất.';
    expect(quoteInBody('bông, gạc, băng đã thấm tẩm dược chất', body)).toBe(true);
    expect(quoteInBody('“Bông, gạc, băng đã thấm tẩm dược chất.”'.normalize('NFD'), body)).toBe(true);
    expect(quoteInBody('bông, gạc, băng chưa thấm tẩm dược chất', body)).toBe(false);
    expect(quoteInBody('   ', body)).toBe(false);
  });

  it('splits sentences the way numberMarkers does', () => {
    expect(splitSentences('Một [1]. Hai?\nBa; bốn')).toEqual(['Một [1].', 'Hai?', 'Ba;', 'bốn']);
  });
});

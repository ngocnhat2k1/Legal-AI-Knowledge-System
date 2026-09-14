import {
  CUT_LINE,
  type Draft,
  quoteInBody,
  ratesInProse,
  settlementClaims,
  type Source,
  splitSentences,
  unknownCitations,
  userCodesIn,
  verify,
  type VerifyContext,
} from './guards';

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
      'Hàng này chỉ có thể thuộc 38.24.',
      'Sau khi đối chiếu, chắc chắn thuộc nhóm 30.05.',
      'Mức độ tin cậy cao.',
    ].join(' ');
    expect(settlementClaims(prose)).toHaveLength(7);
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

const source = (over: Partial<Source>): Source => ({
  kind: 'en',
  label: '',
  body: '',
  hsHeading: null,
  hsCodes: [],
  documentNumber: null,
  expired: null,
  ...over,
});
const ctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  userText: '',
  codeRole: 'none',
  userCodes: [],
  headings: new Set(['30.04', '30.05', '33.07', '38.24']),
  ...over,
});
const draft = (answerMd: string, citations: Draft['citations'], over: Partial<Draft> = {}): Draft => ({
  answerMd,
  citations,
  candidates: [],
  missingFacts: [],
  ...over,
});

const en3005 = source({
  label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05',
  hsHeading: '30.05',
  hsCodes: ['3005.10.10'],
  body: 'Nhóm này bao gồm bông, gạc, băng đã thấm tẩm dược chất. Phân nhóm 3005.10 gồm loại có lớp dính.',
});
const en3824 = source({
  label: 'Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24',
  hsHeading: '38.24',
  body: 'Nhóm này bao gồm các chế phẩm hóa chất chưa được chi tiết ở nơi khác.',
});
const note30 = source({ kind: 'hs_note', label: 'Chú giải Chương 30', body: 'Chương này không bao gồm các chế phẩm thuộc các nhóm từ 33.03 đến 33.07.' });
const q1 = { n: 1, quotes: ['bông, gạc, băng đã thấm tẩm dược chất'] };
const q2 = { n: 2, quotes: ['các chế phẩm hóa chất chưa được chi tiết ở nơi khác'] };
const lead = 'Nhóm 30.05 gồm hàng đã thấm tẩm dược chất [1].';

describe('verify — the code guards over a compose draft (plan 08 §4.1)', () => {
  it('G1: cuts "MFN là 0% [1]" even when its quote holds the rate', () => {
    const tariff = source({ kind: 'annex_table', label: 'Nghị định 26/2023/NĐ-CP · Phụ lục II', body: 'Thuế suất MFN 0% cho mã này.' });
    const r = verify(draft('Hàng cần C/O hợp lệ mới được hưởng ưu đãi [1]. MFN là 0% [1].', [{ n: 1, quotes: ['Thuế suất MFN 0%'] }]), [tariff], ctx());
    expect(r.answerMd).toBe(`Hàng cần C/O hợp lệ mới được hưởng ưu đãi [1].\n\n${CUT_LINE}`);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G1', sentence: 'MFN là 0% [1].' })]);
    expect(r.cut).toBe(1);
  });

  it('G1: "Đúng, 5% [1]" against a body with only 10% drops the whole prose, sources stay', () => {
    const tariff = source({ kind: 'annex_table', label: 'Biểu thuế', body: 'Thuế suất ưu đãi 10% cho mã này.' });
    const r = verify(draft('Đúng, 5% [1]. Cần C/O mẫu E [1].', [{ n: 1, quotes: ['Thuế suất ưu đãi 10%'] }]), [tariff], ctx());
    expect(r.answerMd).toBe('');
    expect(r.citations).toEqual([{ n: 1, source: 0, quotes: ['Thuế suất ưu đãi 10%'] }]);
  });

  it('G2: a paraphrased quote or an id outside the sources takes its [n] away', () => {
    const r = verify(
      draft('Bông gạc tẩm thuốc thuộc loại này [1]. Chương 30 loại trừ mỹ phẩm [2]. Xem thêm [3].', [
        q1,
        { n: 2, quotes: ['Chương này loại trừ mỹ phẩm'] },
        { n: 3, quotes: ['không có'] },
      ]),
      [en3005, note30],
      ctx(),
    );
    expect(r.answerMd).toBe('Bông gạc tẩm thuốc thuộc loại này [1]. Chương 30 loại trừ mỹ phẩm. Xem thêm.');
    expect(r.citations).toEqual([{ n: 1, source: 0, quotes: q1.quotes }]);
    expect(r.violations.map((v) => [v.rule, v.citation])).toEqual([
      ['G2', 2],
      ['G2', 3],
    ]);
  });

  it('G3: "điểm b khoản 4 Điều 97 NĐ 37/2026/NĐ-CP [1]" stands when its quote has it, is cut when the quote lacks "Điều 97"', () => {
    const nd37 = source({
      kind: 'guidance',
      label: 'Nghị định 37/2026/NĐ-CP',
      documentNumber: '37/2026/NĐ-CP',
      body: 'Hồ sơ thực hiện theo điểm b khoản 4 Điều 97 Nghị định 37/2026/NĐ-CP.',
    });
    const prose = 'Hồ sơ nộp theo điểm b khoản 4 Điều 97 NĐ 37/2026/NĐ-CP [1]. Nộp bản chính [1].';
    expect(verify(draft(prose, [{ n: 1, quotes: ['điểm b khoản 4 Điều 97 Nghị định 37/2026/NĐ-CP'] }]), [nd37], ctx()).answerMd).toBe(prose);
    const r = verify(draft(prose, [{ n: 1, quotes: ['điểm b khoản 4'] }]), [nd37], ctx());
    expect(r.answerMd).toBe(`Nộp bản chính [1].\n\n${CUT_LINE}`);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G3', sentence: 'Hồ sơ nộp theo điểm b khoản 4 Điều 97 NĐ 37/2026/NĐ-CP [1].' })]);
  });

  it('G3: "Nhóm 30.05 chỉ nhận … [1]" stands on the label of [1]', () => {
    const prose = 'Nhóm 30.05 chỉ nhận hàng đã thấm tẩm dược chất [1].';
    expect(verify(draft(prose, [q1]), [en3005], ctx()).answerMd).toBe(prose);
    expect(verify(draft(prose, [q1]), [{ ...en3005, label: 'Chú giải chi tiết HS 2022' }], ctx()).answerMd).toBe('');
  });

  it('G3: "NĐ 336/2026 thay thế NĐ 85/2019 [1]; kho không có quan hệ nào với NĐ 08/2015" stands: the user wrote 08/2015', () => {
    const status = source({
      kind: 'status',
      label: 'Tình trạng hiệu lực Nghị định 85/2019/NĐ-CP',
      documentNumber: '85/2019/NĐ-CP',
      body: 'Nghị định 85/2019/NĐ-CP được thay thế bởi Nghị định 336/2026/NĐ-CP từ 15/10/2026.',
    });
    const prose = 'NĐ 336/2026 thay thế NĐ 85/2019 [1]; kho không có quan hệ nào với NĐ 08/2015';
    const r = verify(draft(prose, [{ n: 1, quotes: ['được thay thế bởi Nghị định 336/2026/NĐ-CP'] }]), [status], ctx({ userText: 'NĐ 08/2015 còn áp dụng không' }));
    expect(r.answerMd).toBe(prose);
  });

  it('G4: cuts the over-conclusion from the 14/09 log, "phải xét vào 38.24" and "phải xét 38.24" alike', () => {
    for (const settle of ['nên phải xét vào 38.24', 'phải xét 38.24']) {
      const r = verify(draft(`${lead} Miếng dán chưa rõ công dụng, ${settle} [2].`, [q1, q2]), [en3005, en3824], ctx());
      expect(r.answerMd).toBe(`${lead}\n\n${CUT_LINE}`);
      expect(r.violations).toEqual([expect.objectContaining({ rule: 'G4', sentence: `Miếng dán chưa rõ công dụng, ${settle} [2].` })]);
    }
  });

  it('G4: conditional reasoning passes: "nếu có tẩm dược chất thì xét 30.05 [1]"', () => {
    const prose = 'Nếu có tẩm dược chất thì xét 30.05 [1]. Nếu chỉ để làm ấm thì chương loại nó ra, khi đó phải xét tiếp nhóm 38.24 [2].';
    const r = verify(draft(prose, [q1, q2]), [en3005, en3824], ctx());
    expect(r.answerMd).toBe(prose);
    expect(r.violations).toEqual([]);
  });

  it('G4: two candidates with no missing fact is a violation for repair only', () => {
    const d = draft('Hai hướng [1] [2].', [q1, q2], { candidates: [{ hs: '30.05', evidence: [1] }, { hs: '38.24', evidence: [2] }] });
    const r = verify(d, [en3005, en3824], ctx());
    expect(r.violations).toEqual([{ rule: 'G4', detail: expect.any(String), repairOnly: true }]);
    expect(r.cut).toBe(0);
    expect(verify({ ...d, missingFacts: ['công dụng ghi trên nhãn'] }, [en3005, en3824], ctx()).violations).toEqual([]);
  });

  it('"Mức độ tin cậy 95%" empties the prose', () => {
    expect(verify(draft(`${lead} Mức độ tin cậy 95%.`, [q1]), [en3005], ctx()).answerMd).toBe('');
  });

  it('G5: a candidate resting only on a business note is dropped', () => {
    const memo = source({ kind: 'note', label: 'Ghi chú nghiệp vụ · nhóm 38.24', hsHeading: '38.24', body: 'Miếng dán thảo dược thường khai nhóm 38.24.' });
    const d = draft('Hướng chính là 30.05 [1].', [q1, { n: 2, quotes: ['Miếng dán thảo dược thường khai nhóm 38.24'] }], {
      candidates: [{ hs: '30.05', evidence: [1] }, { hs: '38.24', evidence: [2] }],
      missingFacts: ['công dụng'],
    });
    expect(verify(d, [en3005, memo], ctx()).candidates).toEqual([{ hs: '30.05', evidence: [1] }]);
  });

  it('G5: a heading with no hs_description line is dropped', () => {
    const d = draft(lead, [q1], { candidates: [{ hs: '30.05', evidence: [1] }] });
    expect(verify(d, [en3005], ctx({ headings: new Set(['38.24']) })).candidates).toEqual([]);
  });

  it('G5: "8422.90.90" in prose, no candidate, is cut', () => {
    const r = verify(draft(`${lead} Có thể khai 8422.90.90 [1].`, [q1]), [en3005], ctx());
    expect(r.answerMd).toBe(`${lead}\n\n${CUT_LINE}`);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G5', sentence: 'Có thể khai 8422.90.90 [1].' })]);
  });

  it('G5: "Chú giải Chương 30 loại trừ nhóm 33.07 [2]" stands when quote [2] has 33.07', () => {
    const prose = `${lead} Chú giải Chương 30 loại trừ nhóm 33.07 [2].`;
    const r = verify(draft(prose, [q1, { n: 2, quotes: ['các chế phẩm thuộc các nhóm từ 33.03 đến 33.07'] }]), [en3005, note30], ctx());
    expect(r.answerMd).toBe(prose);
  });

  it('G5: an eight-digit candidate needs a ruling or annex quote naming it, else it falls back to its heading', () => {
    const ruling = source({ kind: 'ruling', label: 'Công văn phân loại', body: 'Mặt hàng miếng dán hạ sốt phân loại vào mã số 3005.10.10.' });
    const citations = [q1, { n: 2, quotes: ['phân loại vào mã số 3005.10.10'] }];
    const candidates = (evidence: number[]) =>
      verify(draft('Xem [1] [2].', citations, { candidates: [{ hs: '3005.10.10', evidence }] }), [en3005, ruling], ctx()).candidates;
    expect(candidates([2])).toEqual([{ hs: '3005.10.10', evidence: [2] }]);
    expect(candidates([1])).toEqual([{ hs: '30.05', evidence: [1] }]);
  });

  it('G6: at subject role "miếng dán thuộc mã 3005.10.10 [1]" is cut', () => {
    const prose = 'Mã 3005.10.10 gồm băng dán có lớp dính [1]. Miếng dán thuộc mã 3005.10.10 [1].';
    const r = verify(
      draft(prose, [{ n: 1, quotes: ['Phân nhóm 3005.10 gồm loại có lớp dính'] }]),
      [en3005],
      ctx({ userText: '3005.10.10 gồm những hàng gì, khác 3005.90 chỗ nào', codeRole: 'subject', userCodes: ['3005.10.10'] }),
    );
    expect(r.answerMd).toBe(`Mã 3005.10.10 gồm băng dán có lớp dính [1].\n\n${CUT_LINE}`);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G6', sentence: 'Miếng dán thuộc mã 3005.10.10 [1].' })]);
  });

  it('G7: "Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực" is dropped when the data says it ended', () => {
    const status = source({
      kind: 'status',
      label: 'Tình trạng hiệu lực Nghị định 69/2018/NĐ-CP',
      documentNumber: '69/2018/NĐ-CP',
      expired: 'Nghị định 69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo Nghị định 292/2026/NĐ-CP',
      body: 'Nghị định 69/2018/NĐ-CP được thay thế bởi Nghị định 292/2026/NĐ-CP từ ngày 05/09/2026.',
    });
    const prose = 'Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực [1]. Văn bản thay thế là Nghị định 292/2026/NĐ-CP [1].';
    const r = verify(draft(prose, [{ n: 1, quotes: ['được thay thế bởi Nghị định 292/2026/NĐ-CP'] }]), [status], ctx());
    expect(r.answerMd).toBe(`Văn bản thay thế là Nghị định 292/2026/NĐ-CP [1].\n\n${CUT_LINE}`);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G7', sentence: 'Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực [1].' })]);
  });

  it('cut > 0 appends exactly one "bị lược" line, and a cut sentence leaves the next line a line', () => {
    const d = draft(`${lead} Có thể khai 8422.90.90.\n\n• Hoặc 8479.89.10.\n• Nếu có lớp dính thì xét 30.05 [1].`, [q1]);
    const r = verify(d, [en3005], ctx());
    expect(r.cut).toBe(2);
    expect(r.answerMd).toBe(`${lead}\n\n• Nếu có lớp dính thì xét 30.05 [1].\n\n${CUT_LINE}`);
    expect(verify({ ...d, answerMd: r.answerMd }, [en3005], ctx()).answerMd.split(CUT_LINE)).toHaveLength(2);
  });
});

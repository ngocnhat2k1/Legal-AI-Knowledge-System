import { numberMarkers } from '../legal/legal.grounding';
import {
  digits,
  dotted,
  type Draft,
  HEADING_OR_CODE,
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

describe('digits, dotted and HEADING_OR_CODE — shared with the classification walkthrough', () => {
  it('spells a code both ways and finds a heading or code only on digit boundaries', () => {
    expect([digits('3005.10.10'), dotted('3005'), dotted('300510'), dotted('30051010')]).toEqual(['30051010', '30.05', '3005.10', '3005.10.10']);
    expect([dotted('3005.10.10'), dotted('38.24'), dotted(''), dotted('30')]).toEqual(['3005.10.10', '38.24', '', '30']);
    expect(['nhóm 38.24', 'mã 3005.10.10', '30051010'].map((s) => HEADING_OR_CODE.test(s))).toEqual([true, true, true]);
    expect(['38.245', '15/07/2023', '3,5%', '138.24'].map((s) => HEADING_OR_CODE.test(s))).toEqual([false, false, false, false]);
    // Not global, so `test` keeps no lastIndex; a caller that needs every match builds its own global copy.
    expect(HEADING_OR_CODE.global).toBe(false);
    expect([...'nhóm 38.24 hay mã 3005.10.10'.matchAll(new RegExp(HEADING_OR_CODE.source, 'g'))].map(([m]) => m)).toEqual(['38.24', '3005.10.10']);
  });
});

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

  it('flags an amount with a unit word between the number and the currency; a count with a unit word is none', () => {
    const prose =
      'Phạt 20 triệu đồng [1]. Mức 1 tỷ. Phí 500 nghìn đồng. Phạt 1,5 tỷ VND. Hàng có 20 thành phần. Tỷ lệ dược chất cao. Sản phẩm men vi sinh chứa 1 tỷ CFU mỗi gói [1]. Lô hàng gồm 20 nghìn miếng dán [1].';
    expect(ratesInProse(prose)).toEqual(['Phạt 20 triệu đồng [1].', 'Mức 1 tỷ.', 'Phí 500 nghìn đồng.', 'Phạt 1,5 tỷ VND.']);
  });

  it('reads a count through markdown and punctuation after the unit word: "**1 tỷ** CFU", "1 tỷ/gói", "1 triệu (IU)", "1 tỷ-10 tỷ CFU"', () => {
    const counts = [
      'Men vi sinh chứa **1 tỷ** CFU mỗi gói [1].',
      'Men vi sinh chứa 1 tỷ/gói CFU [1].',
      'Mỗi viên chứa 1 triệu (IU) vitamin A [1].',
      'Mỗi gói chứa từ 1 tỷ-10 tỷ CFU [1].',
      'Mỗi gói chứa 1 tỷ – 10 tỷ CFU [1].',
      'Nhóm 38.24 có khoảng 2 nghìn, tùy cách đếm [2].',
      'Men vi sinh chứa 1 nghìn tỷ CFU [1].',
      // Known ceilings (AMOUNT): a per-unit amount, a unit word before "(" or ", " and a word, and "đô" read as counts.
      'Phạt 20 triệu/lần vi phạm.',
      'Phạt 50 triệu (đối với cá nhân).',
      'Phạt tối đa 1 tỷ, đối với tổ chức gấp đôi.',
      'Phạt 20 triệu đô.',
    ];
    const amounts = [
      'Phạt **20 triệu** đồng [1].',
      'Mức phạt 20 triệu đồng.',
      'Doanh thu 7 nghìn tỷ đồng [1].',
      'Doanh thu 7 nghìn tỷ.',
      'Mức 1 tỷ VND.',
      'Phạt **1 tỷ**.',
      'Phạt 20 triệu - 30 triệu đồng.',
      'Phạt 1 tỷ, 2 tỷ nếu tái phạm.',
      'Phạt 20 triệu (đồng) [1].',
    ];
    expect(ratesInProse([...counts, ...amounts].join(' '))).toEqual(amounts);
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
    const r = verify(draft('Hàng cần C/O hợp lệ mới được hưởng ưu đãi [1]. MFN là 0% [1].', [{ n: 1, quotes: ['Thuế suất MFN 0% cho mã này'] }]), [tariff], ctx());
    expect(r.answerMd).toBe('Hàng cần C/O hợp lệ mới được hưởng ưu đãi [1].');
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G1', sentence: 'MFN là 0% [1].' })]);
    expect(r.cut).toBe(1);
  });

  it('G1: a count with a unit word stands: "1 tỷ CFU", "**1 tỷ** CFU", "20 nghìn miếng"', () => {
    const prose = `${lead} Sản phẩm men vi sinh chứa 1 tỷ CFU mỗi gói [1]. Men vi sinh chứa **1 tỷ** CFU mỗi gói [1]. Lô hàng gồm 20 nghìn miếng dán [1].`;
    expect(verify(draft(prose, [q1]), [en3005], ctx()).answerMd).toBe(prose);
  });

  it('G1: "Đúng, 5% [1]" against a body with only 10% drops the whole prose, sources stay', () => {
    const tariff = source({ kind: 'annex_table', label: 'Biểu thuế', body: 'Thuế suất ưu đãi 10% cho mã này.' });
    const r = verify(draft('Đúng, 5% [1]. Cần C/O mẫu E [1].', [{ n: 1, quotes: ['Thuế suất ưu đãi 10%'] }]), [tariff], ctx());
    expect(r.answerMd).toBe('');
    expect(r.citations).toEqual([{ n: 1, source: 0, quotes: ['Thuế suất ưu đãi 10%'] }]);
  });

  it('G2: a quote under 20 characters holds only a body it equals: "5%" against "15%" does not anchor "Đúng, 5% [1]"', () => {
    const r = verify(draft('Đúng, 5% [1]. Cần C/O mẫu E [1].', [{ n: 1, quotes: ['5%'] }]), [source({ kind: 'annex_table', body: '15%' })], ctx());
    expect(r.answerMd).toBe('');
    expect(r.citations).toEqual([]);
    expect(quoteInBody('15%', '15%')).toBe(true);
    expect(quoteInBody('đã thấm tẩm', en3005.body)).toBe(false);
  });

  it('G2: a citation with no quote left and an in-range marker with no citation are each a violation', () => {
    const r = verify(draft(`${lead} Chương 38 gồm chế phẩm hóa chất [2]. Xem [3].`, [q1, { n: 3, quotes: [] }]), [en3005, en3824, note30], ctx());
    expect(r.answerMd).toBe(`${lead} Chương 38 gồm chế phẩm hóa chất. Xem.`);
    expect(r.violations.map((v) => [v.rule, v.citation])).toEqual([
      ['G2', 3],
      ['G2', 2],
    ]);
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
    const r = verify(draft(prose, [{ n: 1, quotes: ['Hồ sơ thực hiện theo điểm b khoản 4'] }]), [nd37], ctx());
    expect(r.answerMd).toBe('Nộp bản chính [1].');
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

  it('G3: a heading, provision or code is exempt only as the user wrote it: a stray 38 and 24 exempt nothing', () => {
    const r = verify(draft(`${lead} Chú giải loại trừ nhóm 38.24 theo Điều 24 [1].`, [q1]), [en3005], ctx({ userText: 'lô 38 kiện giao trong 24 giờ' }));
    expect(r.answerMd).toBe(lead);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G3', sentence: 'Chú giải loại trừ nhóm 38.24 theo Điều 24 [1].' })]);
    expect(verify(draft(`${lead} Theo khoản 1 Chú giải Chương 30 [1].`, [q1]), [en3005], ctx({ userText: '[mã 1] dùng được không' })).answerMd).toBe(lead);
    const abstain = `${lead} Kho chưa có Nghị định 08/2015/NĐ-CP.`;
    expect(verify(draft(abstain, [q1]), [en3005], ctx({ userText: 'NĐ 08/2015 còn áp dụng không' })).answerMd).toBe(abstain);
  });

  it('G3: at premise role the user\'s code and its heading exempt nothing, even from unmasked userText', () => {
    const c = ctx({ userText: 'miếng dán khai 3004.90.99 (nhóm 30.04) được không', codeRole: 'premise', userCodes: ['3004.90.99'] });
    expect(verify(draft(`${lead} Nhóm 30.04 gồm thuốc [1].`, [q1]), [en3005], c).answerMd).toBe(lead);
  });

  it('G3: headings and codes the runner put in the prompt from code (anchors) stand like labels; others still need a quote', () => {
    const ruling = source({ kind: 'ruling', label: 'Công văn phân loại', body: 'Mặt hàng miếng dán hạ sốt phân loại vào mã số 3005.10.10.' });
    const d = (answerMd: string) =>
      draft(answerMd, [q1, { n: 2, quotes: ['phân loại vào mã số 3005.10.10'] }], { candidates: [{ hs: '3005.10.10', evidence: [2] }], missingFacts: ['công dụng'] });
    const prose = 'Nhóm 38.24 cần đối chiếu thêm [1]. Mã 3005.10.10 gồm băng có lớp dính [1].';
    expect(verify(d(prose), [en3005, ruling], ctx()).answerMd).toBe('');
    const r = verify(d(`${prose} Nhóm 33.07 cần đối chiếu thêm [1].`), [en3005, ruling], ctx({ anchors: ['38.24', '30051010'] }));
    expect(r.answerMd).toBe(prose);
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G3', sentence: 'Nhóm 33.07 cần đối chiếu thêm [1].' })]);
    // Anchors stand beside the labels of sources a quote holds: with no quote left, marked or not, the heading is cut.
    for (const dead of ['Nhóm 38.24 cần đối chiếu [2].', 'Nhóm 38.24 cần đối chiếu.']) {
      const cut = verify(draft(dead, [{ n: 2, quotes: ['không có trong thân'] }]), [en3005, ruling], ctx({ anchors: ['38.24'] }));
      expect([cut.answerMd, cut.violations]).toEqual(['', [expect.objectContaining({ rule: 'G2' }), expect.objectContaining({ rule: 'G3', sentence: dead })]]);
    }
  });

  it('G4: cuts the over-conclusion from the 14/09 log, "phải xét vào 38.24" and "phải xét 38.24" alike', () => {
    for (const settle of ['nên phải xét vào 38.24', 'phải xét 38.24']) {
      const r = verify(draft(`${lead} Miếng dán chưa rõ công dụng, ${settle} [2].`, [q1, q2]), [en3005, en3824], ctx());
      expect(r.answerMd).toBe(lead);
      expect(r.violations).toEqual([expect.objectContaining({ rule: 'G4', sentence: `Miếng dán chưa rõ công dụng, ${settle} [2].` })]);
    }
  });

  it('G4: conditional reasoning passes: "nếu có tẩm dược chất thì xét 30.05 [1]"', () => {
    const prose = 'Nếu có tẩm dược chất thì xét 30.05 [1]. Nếu chỉ để làm ấm thì chương loại nó ra, khi đó phải xét tiếp nhóm 38.24 [2].';
    const r = verify(draft(prose, [q1, q2]), [en3005, en3824], ctx());
    expect(r.answerMd).toBe(prose);
    expect(r.violations).toEqual([]);
  });

  it('G4: reworded over-conclusions are cut; a bare "khi" or "trường hợp này" is no condition', () => {
    for (const s of [
      'Khi chưa rõ công dụng, phải xét 38.24 [2].',
      'Chưa rõ công dụng khi dùng, nên phải xét vào 38.24 [2].',
      'Trong trường hợp này hàng chắc chắn thuộc 38.24 [2].',
      'Hàng phải khai 38.24 [2].',
      'Hàng phải thuộc nhóm 38.24 [2].',
      'Hàng nên thuộc nhóm 38.24 [2].',
      'Hàng nên là 38.24 [2].',
      'Mình chốt 38.24 [2].',
      'Mình chốt là 38.24 [2].',
      'Mình đề xuất 38.24 [2].',
      // Re-review of a0d5864: "sau/trước khi … thì" and "khiếu … thì" are no condition; "Đã đủ căn cứ để chốt" settles.
      'Sau khi đối chiếu thì chắc chắn thuộc nhóm 38.24 [2].',
      'Sau khi xem Chú giải thì hàng phải xét vào 38.24 [2].',
      'Trước khi có nhãn thì mình chốt 38.24 [2].',
      'Hàng khiếu nại thì chắc chắn thuộc 38.24 [2].',
      'Đã đủ căn cứ để chốt 38.24 [2].',
      // A condition saying what is not known settles as if there were none: the verb's own condition, from the last
      // "nếu/khi/trường hợp" before it to its "thì" or comma.
      'Khi chưa rõ công dụng thì phải xét 38.24 [2].',
      'Nếu chưa xác định được công dụng, thì nên khai 38.24 [2].',
      'Trường hợp chưa có thông tin về dược chất thì chỉ có thể thuộc 38.24 [2].',
      'Nếu chưa rõ công dụng thì khi đó phải xét 38.24 [2].',
    ]) {
      const r = verify(draft(`${lead} ${s}`, [q1, q2]), [en3005, en3824], ctx());
      expect([r.answerMd, r.violations]).toEqual([lead, [expect.objectContaining({ rule: 'G4', sentence: s })]]);
    }
  });

  it('G4: "khi … thì", "trường hợp … thì", a heading still to check and a question pass', () => {
    const prose = [
      'Nên xét thêm nhóm 38.24 [2].',
      'Nếu chỉ để làm ấm thì chương loại nó ra, khi đó phải xét tiếp nhóm 38.24 [2].',
      'Khi hàng có tẩm dược chất thì xét 30.05 [1].',
      'Trường hợp hàng có lớp dính thì thuộc phân nhóm 3005.10 [1].',
      'Khi hàng có lớp dính và thuộc nhóm 30.05 thì phải xét 3005.10 [1].',
      'Để biết có phải 38.24 không, cần xác định công dụng.',
      'Chưa thể chốt 38.24 khi thiếu nhãn, và hàng không phải là 30.04 [1].',
      'Chưa đủ căn cứ để chốt 38.24.',
      'Để chốt 30.05 hay 38.24, cần biết công dụng.',
      'Sau khi có nhãn, nếu có dược chất thì phải xét 30.05 [1].',
      'Khi có nhãn ghi công dụng điều trị thì phải xét 30.04 [1].',
      // A trait that is absent is a fact; what is not known before no settling verb, or in another case of the sentence, passes.
      'Nếu không có dược chất thì xét 38.24 [2].',
      'Nếu không có dược chất thì phải xét 38.24 [2].',
      'Nếu chưa rõ công dụng thì cần bổ sung tài liệu [1].',
      'Nếu chưa rõ công dụng thì chưa thể chốt 38.24.',
      'Nếu có dược chất thì phải xét 30.05, còn nếu chưa rõ công dụng thì cần bổ sung tài liệu [1].',
      'Nếu chưa rõ công dụng thì cần bổ sung tài liệu, còn nếu có dược chất thì phải xét 30.05 [1].',
      // After what is not known: a hedge before the verb, headings listed after it, a condition of its own after it.
      'Nếu chưa rõ công dụng thì chưa nên vội chốt 38.24 [2].',
      'Nếu chưa rõ công dụng thì chưa thể khẳng định chắc chắn thuộc 38.24 [2].',
      'Khi chưa xác định được dược chất thì không được chốt 30.05 [1].',
      'Khi chưa có tài liệu kỹ thuật thì rất khó kết luận 30.05 hay 38.24 [1] [2].',
      'Nếu chưa rõ công dụng thì phải xét nhóm 30.05 và nhóm 38.24 song song [1] [2].',
      'Nếu chưa rõ công dụng thì phải xét nhóm 30.05 (hàng có dược chất) và nhóm 38.24 (chế phẩm hóa chất) [1] [2].',
      'Nếu chưa rõ công dụng thì phải xét 30.05 hay là 38.24 tùy kết quả giám định [1] [2].',
      'Nếu chưa rõ công dụng thì chỉ nên khai 30.05 khi có chứng từ chứng minh dược chất [1].',
      // Two cases, the ignorance case first: the other case's heading comes after the verb.
      'Nếu chưa rõ thì phải xét 38.24, nếu có dược chất thì xét 30.05 [1] [2].',
      // Long clauses: "chưa" 131 characters before "để", "Khi" 212 characters before "thì".
      'Hiện hồ sơ chưa thể hiện đầy đủ thành phần hoạt chất và hàm lượng từng chất trong miếng dán cũng như công dụng được công bố trên nhãn sản phẩm để chốt 38.24 [2].',
      'Khi miếng dán có chứa tinh dầu ngải cứu, long não, bạc hà cùng các thành phần thảo dược khác được tẩm trên nền vải không dệt có lớp keo dính, đóng gói bán lẻ với nhãn ghi công dụng giảm đau và lưu thông khí huyết thì phải xét nhóm 30.05 [1].',
      // Known ceilings: a condition after the verb is not read, as on main; nor is ignorance in other words.
      'Hàng phải xét 38.24 nếu chưa rõ công dụng [2].',
      'Nếu thông tin chưa đủ để xác định công dụng thì phải xét 38.24 [2].',
    ];
    expect(settlementClaims(prose.join(' '))).toEqual([]);
    // Known ceilings, cut and left to repair where main let them pass: a finding, a fact about the label or a Chapter test
    // reads as ignorance; a heading still to check settles after ignorance as it does with no condition at all.
    const ceilings = [
      'Nếu kết quả kiểm nghiệm không xác định được dược chất nào thì phải xét 38.24 [2].',
      'Nếu nhà sản xuất không xác định công dụng điều trị trên nhãn thì phải xét 38.24 [2].',
      'Nếu hàng không có thông tin về dược chất trên nhãn, thì hải quan thường phải xét 38.24 [2].',
      'Nếu không xác định được là hàng thuộc Chương 30 thì phải xét 38.24 [2].',
      'Nếu chưa rõ công dụng thì nên xét 30.05 trước, vì Chú giải Chương 38 loại trừ hàng thuộc Chương 30 [1] [2].',
      'Nếu chưa rõ công dụng thì phải xét nhóm 38.24 như một khả năng [2].',
      'Nếu chưa rõ công dụng thì cũng nên xét nhóm 38.24 để loại trừ [2].',
      // The same two cases with the ignorance case second: the other case's heading comes before the verb.
      'Nếu có dược chất thì xét 30.05, nếu chưa rõ thì phải xét 38.24 [1] [2].',
    ];
    expect(settlementClaims(ceilings.join(' '))).toEqual(ceilings);
    expect(settlementClaims('Nên xét 30.05 trước [1].')).toHaveLength(1);
  });

  it('G4: a verdict label before one lone heading settles; a list or an explanation after the label passes, as on main', () => {
    for (const s of ['**Kết luận:** nhóm 38.24 [2].', 'Kết luận: 38.24 [2].', 'Đề xuất: 38.24 [2].', '**Đề xuất:** khai mã 38.24 [2].']) {
      const r = verify(draft(`${lead} ${s}`, [q1, q2]), [en3005, en3824], ctx());
      expect([r.answerMd, r.violations]).toEqual([lead, [expect.objectContaining({ rule: 'G4', sentence: s })]]);
    }
    const prose = [
      'Kết luận: 30.05 hoặc 38.24 [1] [2].',
      '**Kết luận:** nhóm 30.05 hoặc nhóm 38.24, tùy công dụng ghi trên nhãn [1] [2].',
      'Kết luận: cần thêm dữ kiện để phân biệt 30.05 và 38.24.',
      '**Kết luận:** mã 3005.10.10 chỉ áp dụng cho băng, gạc có lớp dính [1].',
      '**Kết luận:** nhóm 30.05 chỉ nhận hàng đã thấm tẩm dược chất [1].',
      // Known ceilings: words after the heading, a longer label, goods named before "thuộc".
      'Kết luận: 38.24 vì hàng không có dược chất [2].',
      '**Kết luận sơ bộ:** 38.24 [2].',
      '**Kết luận:** hàng thuộc nhóm 38.24 [2].',
    ];
    expect(settlementClaims(prose.join(' '))).toEqual([]);
  });

  it('G1, G4: a criterion quoted verbatim from a cited note is its wording; unquoted, from a table or beside a tariff it is cut', () => {
    const note = source({
      kind: 'hs_note',
      label: 'Chú giải Chương 30',
      body: 'Hàng chứa trên 50% tính theo trọng lượng là dược chất thì thuộc nhóm 30.04. Chế phẩm không chứa dược chất thì phải xét vào nhóm 38.24.',
    });
    const rate = { n: 1, quotes: ['trên 50% tính theo trọng lượng'] };
    const quoted = 'Chú giải chỉ nhận hàng chứa “trên 50% tính theo trọng lượng” là dược chất [1].';
    expect(verify(draft(quoted, [rate]), [note], ctx()).answerMd).toBe(quoted);
    for (const [prose, kind] of [
      ['Chú giải chỉ nhận hàng chứa trên 50% tính theo trọng lượng là dược chất [1].', 'hs_note'],
      [quoted, 'annex_table'],
      ['Thuế suất ưu đãi chỉ áp cho hàng chứa "trên 50% tính theo trọng lượng" là dược chất [1].', 'hs_note'],
    ]) {
      const r = verify(draft(prose!, [rate]), [{ ...note, kind: kind! }], ctx());
      expect(r.violations).toContainEqual(expect.objectContaining({ rule: 'G1', sentence: prose }));
    }
    const settle = { n: 1, quotes: ['chế phẩm không chứa dược chất thì phải xét vào nhóm 38.24'] };
    const criterion = 'Chú giải viết “chế phẩm không chứa dược chất thì phải xét vào nhóm 38.24” [1].';
    expect(verify(draft(criterion, [settle]), [note], ctx()).answerMd).toBe(criterion);
    const r = verify(draft(criterion.replace(/[“”]/g, ''), [settle]), [note], ctx());
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G4' })]);
    // Mixed marks stand, as the walkthrough normaliser reads them; a span shortened with "…" is a known ceiling, cut.
    const mixed = 'Chú giải chỉ nhận hàng chứa “trên 50% tính theo trọng lượng" là dược chất [1].';
    expect(verify(draft(mixed, [rate]), [note], ctx()).answerMd).toBe(mixed);
    const elided = 'Chú giải ghi "Hàng chứa trên 50% … là dược chất" [1].';
    expect(verify(draft(elided, [rate]), [note], ctx()).violations).toContainEqual(expect.objectContaining({ rule: 'G1', sentence: elided }));
    // Quoted from the body while the citation quotes another sentence, the figure has no quote to stand on: the prose drops
    // and the sentence carries its G1 for repair.
    const dropped = verify(draft(`${quoted} Cần xác nhận công dụng trên nhãn [1].`, [settle]), [note], ctx());
    expect([dropped.answerMd, dropped.cut]).toEqual(['', 2]);
    expect(dropped.violations).toContainEqual(expect.objectContaining({ rule: 'G1', sentence: quoted }));
    // A sentence marking only a tariff table is read whole though a cited note holds the span; so is one with any "thuế".
    const annex = source({ kind: 'annex_table', label: 'Phụ lục I', body: 'Rượu có hàm lượng cồn trên 50% tính theo trọng lượng' });
    const fromAnnex = 'Phụ lục ghi “trên 50% tính theo trọng lượng” [2].';
    const both = verify(draft(`${quoted} ${fromAnnex}`, [rate, { n: 2, quotes: rate.quotes }]), [note, annex], ctx());
    expect(both.violations).toEqual([expect.objectContaining({ rule: 'G1', sentence: fromAnnex })]);
    const cv = source({ kind: 'ruling', label: 'CV 3831/TCHQ-TXNK', body: 'Mặt hàng máy bay không người lái thuộc đối tượng chịu thuế GTGT 10%.' });
    const vat = 'Công văn nêu “máy bay không người lái thuộc đối tượng chịu thuế GTGT 10%” [1].';
    const tax = verify(draft(vat, [{ n: 1, quotes: ['máy bay không người lái thuộc đối tượng chịu thuế GTGT 10%'] }]), [cv], ctx());
    expect(tax.violations).toEqual([expect.objectContaining({ rule: 'G1', sentence: vat })]);
    // Only the first 20 quoted spans of a sentence are read as wording; the rest are read as written.
    const spans = (k: number) => `Chú giải ghi ${'“dược chất” '.repeat(k)}và “trên 50% tính theo trọng lượng” [1].`;
    expect(verify(draft(spans(19), [rate]), [note], ctx()).violations).toEqual([]);
    expect(verify(draft(spans(20), [rate]), [note], ctx()).violations).toContainEqual(expect.objectContaining({ rule: 'G1', sentence: spans(20) }));
  });

  it('G1, G4: a verify call looks up at most 40 quoted spans, 2,000,000 body characters in all; past that a span is read as written', () => {
    const body = 'Hàng chứa trên 50% tính theo trọng lượng là dược chất. Chế phẩm không chứa dược chất thì phải xét vào nhóm 38.24.';
    const cite = [{ n: 1, quotes: ['trên 50% tính theo trọng lượng', 'chế phẩm không chứa dược chất thì phải xét vào nhóm 38.24'] }];
    const rate = 'Chú giải chỉ nhận hàng chứa “trên 50% tính theo trọng lượng” là dược chất [1].';
    const settle = 'Chú giải viết “chế phẩm không chứa dược chất thì phải xét vào nhóm 38.24” [1].';
    const fillers = (k: number) => Array.from({ length: k }, (_, i) => `Chú giải không ghi “câu mẫu số ${i} không có trong chú giải” [1]. `).join('');
    const rules = (k: number, note: Source) => verify(draft(`${fillers(k)}${rate} ${settle}`, cite), [note], ctx()).violations.map((v) => [v.rule, v.sentence]);
    const small = source({ kind: 'hs_note', label: 'Chú giải Chương 30', body });
    // Spans each distinct: the rates pass looks up 40 and refuses the rest, and the settling pass refuses the same ones.
    expect(rules(38, small)).toEqual([]);
    expect(rules(39, small)).toEqual([['G4', settle]]);
    expect(rules(40, small)).toEqual([['G1', rate], ['G4', settle]]);
    // A body of 600,000 characters: three lookups fit in 2,000,000 characters, a fourth does not.
    const large = { ...small, body: `${'đoạn đệm. '.repeat(60_000)}${body}` };
    expect(rules(1, large)).toEqual([]);
    expect(rules(2, large)).toEqual([['G4', settle]]);
    expect(rules(3, large)).toEqual([['G1', rate], ['G4', settle]]);
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
    expect(r.answerMd).toBe(lead);
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
    expect(r.answerMd).toBe('Mã 3005.10.10 gồm băng dán có lớp dính [1].');
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G6', sentence: 'Miếng dán thuộc mã 3005.10.10 [1].' })]);
  });

  it('G6: at subject role a sentence explaining the code itself stands: "Mã 3005.10.10 thuộc nhóm 30.05, gồm …"', () => {
    const c = ctx({ userText: '3005.10.10 gồm những hàng gì', codeRole: 'subject', userCodes: ['3005.10.10'] });
    const q = [{ n: 1, quotes: ['Phân nhóm 3005.10 gồm loại có lớp dính'] }];
    for (const code of ['3005.10.10', '30051010']) {
      const prose = `Mã ${code} thuộc nhóm 30.05, gồm băng có lớp dính [1].`;
      expect(verify(draft(prose, q), [en3005], c).answerMd).toBe(prose);
    }
    expect(verify(draft('Miếng dán thuộc mã 3005.10.10 [1]. Hàng này thuộc nhóm 30.05 [1].', q), [en3005], c).answerMd).toBe('');
    // Naming the code earlier in the sentence does not make it the subject of a later placement.
    for (const prose of ['Mã 3005.10.10 thuộc nhóm 30.05 nên miếng dán cũng thuộc nhóm 30.05 [1].', 'Với mã 3005.10.10, miếng dán của bạn thuộc mã 3005.10.10 [1].']) {
      expect(verify(draft(prose, q), [en3005], c).answerMd).toBe('');
    }
  });

  it('G6: at subject role goods of the code in general before "gồm", or the code as "mã/nhóm này", stand; "bạn" places goods', () => {
    const c = ctx({ userText: '3005.10.10 gồm những hàng gì', codeRole: 'subject', userCodes: ['3005.10.10'] });
    const q = [{ n: 1, quotes: ['Phân nhóm 3005.10 gồm loại có lớp dính'] }];
    for (const prose of [
      'Các hàng thuộc mã 3005.10.10 gồm băng có lớp dính [1].',
      'Những sản phẩm thuộc mã 3005.10.10 bao gồm băng, gạc có lớp dính [1].',
      'Mã này thuộc nhóm 30.05 [1].',
      'Phân nhóm này thuộc nhóm 30.05 [1].',
    ]) {
      expect(verify(draft(prose, q), [en3005], c).answerMd).toBe(prose);
    }
    for (const prose of [
      'Hàng hóa thuộc mã 3005.10.10 [1].',
      'Miếng dán thuộc mã 3005.10.10 là đúng [1].',
      'Với thông tin bạn cung cấp, hàng hóa thuộc mã 3005.10.10 [1].',
      'Các hàng thuộc mã 3005.10.10 gồm cả miếng dán của bạn [1].',
    ]) {
      const r = verify(draft(prose, q), [en3005], c);
      expect([r.answerMd, r.violations]).toEqual(['', [expect.objectContaining({ rule: 'G6', sentence: prose })]]);
    }
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
    expect(r.answerMd).toBe('Văn bản thay thế là Nghị định 292/2026/NĐ-CP [1].');
    expect(r.violations).toEqual([expect.objectContaining({ rule: 'G7', sentence: 'Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực [1].' })]);
  });

  it('cut counts what was taken out and adds no "bị lược" line (formatAnswerMd prints it); a cut keeps line breaks and list markers', () => {
    const r = verify(draft(`${lead} Có thể khai 8422.90.90.\n\n• Hoặc 8479.89.10.\n• Nếu có lớp dính thì xét 30.05 [1].`, [q1]), [en3005], ctx());
    expect(r.cut).toBe(2);
    expect(r.answerMd).toBe(`${lead}\n\n• Nếu có lớp dính thì xét 30.05 [1].`);
    const lists = verify(
      draft(`${lead}\n• Có thể khai 8422.90.90. Nếu có lớp dính thì xét 30.05 [1].\n- Theo Điều 97 [1]. Nộp bản chính [1].\n1. Có thể khai 8479.89.10.\n2. Cần nhãn hàng [1].`, [q1]),
      [en3005],
      ctx(),
    );
    expect(lists.cut).toBe(3);
    expect(lists.answerMd).toBe(`${lead}\n• Nếu có lớp dính thì xét 30.05 [1].\n- Nộp bản chính [1].\n2. Cần nhãn hàng [1].`);
  });
});

describe('guards run on every answer in the event loop: linear in the length of adversarial prose', () => {
  const numbered = (unit: (i: number) => string, n: number): string => {
    let s = '';
    for (let i = 0; s.length < n; i++) s += unit(i);
    return s.slice(0, n);
  };
  // Three criteria bodies of 80,000 characters, as long as a whole Chapter note.
  const bodies = [0, 1, 2].map((k) => numbered((i) => `đoạn ${k}-${i} chú giải chương 38 chế phẩm hóa chất. `, 80_000));
  /** The adversarial inputs at about N characters, each built by repeating its unit. */
  const inputsAt = (N: number): string[] => {
    const fill = (unit: string, n = N): string => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    const [spaces, stars] = [' '.repeat(N), '*'.repeat(N)];
    return [
      // Runs of digits, spaces and line breaks.
      fill('1'),
      fill('1.'),
      `${fill('1', N / 2)}${' '.repeat(N / 2)}triệu x`,
      `${fill('1', N / 2)}${' '.repeat(N / 2)}nghìn tỷ x`,
      fill('1 nghìn tỷ '),
      `x${spaces}x`,
      `x${'\n'.repeat(N)}x`,
      fill('1. \n'),
      fill(' 1.'),
      // Stars, list and heading markers before spaces, a verdict label before stars.
      stars,
      ...['*', '#', '>', '•', '-'].map((m) => `${m}${spaces}x 38.24`),
      `**Kết luận:**${stars} x 38.24`,
      `Kết luận:${fill('* ')} 38.24`,
      `Kết luận${fill(' :')} 38.24`,
      fill('Kết luận: 38.24 '),
      // Settling verbs and what negates them, repeated.
      `38.24 ${fill('để phải ')}`,
      `38.24 ${fill('phải ')}x`,
      `x${spaces}để phải xét 38.24`,
      `38.24 không${spaces}chốt 38.24`,
      `38.24 không${fill(' thể')} chốt 38.24`,
      // Conditions: many khi/nếu/thì, one spread by spaces, what is not known before a hedged or listed verb.
      `38.24 ${fill('khi ')}phải xét 38.24`,
      fill('khi nếu thì '),
      `Khi chưa rõ${spaces}thì phải xét 38.24`,
      fill('Nếu chưa rõ công dụng thì chưa nên vội chốt 38.24 '),
      fill('nếu chưa rõ thì phải xét 38.24 và 30.05, '),
      // Markers, headings, the user's code placed again and again, many sentences.
      fill(' [1]'),
      fill('[1, 2] '),
      fill('38.24 [1] '),
      fill('38.24, '),
      fill('3005.10.10 thuộc mã '),
      fill('Phải xét 38.24. '),
      // What a quote is trimmed of, dots, quoted spans in any marks, a document number before a run of dots.
      `x${fill('“”‘’…-,;:')}x`,
      `x${'.'.repeat(N)}x`,
      fill('. '),
      fill('“bông, gạc, băng đã thấm tẩm dược chất” '),
      numbered((i) => `“mẫu câu không có trong thân ${i}” `, N),
      numbered((i) => `Chú giải ghi “mẫu câu không có trong thân ${i}” [1]. `, N),
      fill('“"'),
      fill(`“${'a'.repeat(299)}`),
      fill('thuế '),
      `Theo 31/2022${'.'.repeat(N)}x [1].`,
      `Số 12/2024${fill('.:')}x [1]`,
      // Placements of codes other than the user's, or of its heading after the code, and alternating rate sentences.
      fill('vào mã 1234 '),
      `Mã 3005.10.10 ${fill('áp mã 30.05 ')}`,
      fill('1 đ. a b. '),
    ];
  };
  const subject = ctx({ userText: '3005.10.10 gồm những hàng gì', codeRole: 'subject', userCodes: ['3005.10.10'] });
  const guards: Array<[string, (s: string) => unknown]> = [
    ['splitSentences', (s) => splitSentences(s)],
    ['ratesInProse', (s) => ratesInProse(s)],
    ['settlementClaims', (s) => settlementClaims(s)],
    ['verify at subject role', (s) => verify(draft(s, [q1, q2]), [en3005, en3824], subject)],
    ['verify on a quote as long as the prose', (s) => verify(draft(s, [{ n: 1, quotes: [s] }]), [source({ kind: 'hs_note', body: s })], ctx())],
    [
      'verify on the prose cut into quotes of a body four times as long',
      (s) => verify(draft('Chế phẩm thuộc Chương 38 [1].', [{ n: 1, quotes: s.match(/[^]{1,30}/g) ?? [] }]), [source({ kind: 'hs_note', body: s.repeat(4) })], ctx()),
    ],
    [
      'verify on quoted spans marking three criteria bodies of 80,000 characters',
      (s) =>
        verify(
          draft(`${s} [1] [2] [3].`, bodies.map((b, i) => ({ n: i + 1, quotes: [b.slice(0, 200)] }))),
          bodies.map((body) => source({ kind: 'hs_note', body })),
          ctx(),
        ),
    ],
    ['quoteInBody', (s) => quoteInBody(s, s)],
    ['numberMarkers', (s) => [numberMarkers(s, [1], [s], s), numberMarkers(s, [1], [s], s, { cut: true, labels: [s] })]],
  ];

  const ms = (f: () => unknown): number => {
    const t = performance.now();
    f();
    return performance.now() - t;
  };
  const [at10k, at20k] = [inputsAt(10_000), inputsAt(20_000)];
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
  // Growth, not a wall-clock budget: under full jest the CPU is shared and a thread can move to a slower core for seconds.
  // A best-of-three per length failed there twice (10 → 44 ms, 7 → 21 ms) on "38.24 để phải …", which alone takes 5.4 →
  // 11 ms and doubles exactly up to 80,000 characters. Doubling the prose doubles a linear guard's time and quadruples a
  // quadratic one's, so each input runs at 10,000 then at once 20,000 characters, up to five pairs, and the median ratio
  // of the pairs must stay under 3: a slowdown skews only the pairs it overlaps. Under 5 ms at both lengths (best runs)
  // passes too. The first super-linear input ends the test; a run over 1,000 ms at 20,000 characters, a hang, at once.
  it.each(guards)('%s grows linearly with the length of each input', (_, guard) => {
    guard('Nếu chưa rõ công dụng thì phải xét 38.24 [1].');
    for (const [i, small] of at10k.entries()) {
      const [t10, t20]: number[][] = [[], []];
      const fast = (): boolean => Math.min(...t10) < 5 && Math.min(...t20) < 5;
      const ratios = (): number[] => t20.map((t, k) => t / t10[k]!);
      for (let k = 0; k < 5; k++) {
        t10.push(ms(() => guard(small)));
        t20.push(ms(() => guard(at20k[i]!)));
        // Three passing pairs already fix the verdict of five.
        if (t20[k]! >= 1000 || (k >= 2 && (fast() || ratios().filter((r) => r < 3).length >= 3))) break;
      }
      const linear = Math.max(...t20) < 1000 && (fast() || median(ratios()) < 3);
      expect(linear ? [] : [JSON.stringify(small.slice(0, 24)), Math.round(Math.min(...t10)), Math.round(Math.min(...t20)), +median(ratios()).toFixed(1)]).toEqual([]);
    }
  }, 300_000);
});

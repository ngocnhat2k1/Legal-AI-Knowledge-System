import { buildComposeInput, buildRepairPrompt, type ComposeInput, looseJson, parseDraft, parseRepair, SYSTEM, WORD_CAP } from './compose';

const base: ComposeInput = {
  mode: 'hs',
  asOf: '2026-09-14',
  message: 'e có mặt hàng miếng dán bàn chân thành phần từ ngải cứu, e đang tham khảo mã này không biết được không ạ',
  understanding: 'Người hỏi muốn biết miếng dán bàn chân ngải cứu thuộc nhóm nào',
  question: 'Miếng dán bàn chân thành phần ngải cứu thuộc nhóm HS nào, căn cứ chú giải nào',
  goods: { facts: ['miếng dán bàn chân', 'thành phần ngải cứu'], missing: ['có tẩm dược chất không'] },
  previousQuestion: null,
  facts: [],
  tariffLines: [],
  sources: [
    { label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05', note: 'tài liệu hướng dẫn áp dụng của cơ quan hải quan', text: 'Nhóm này bao gồm bông, gạc, băng đã thấm tẩm dược chất.' },
    { label: 'Chú giải Chương 30', note: null, text: 'x'.repeat(5000) },
  ],
  maxSourceChars: 3000,
};

describe('compose prompts (plan 08 §3)', () => {
  it('keeps the rules and reading conventions in the system prompt, and no user text there', () => {
    expect(SYSTEM).toContain('QUY ƯỚC ĐỌC BẰNG CHỨNG');
    expect(SYSTEM).toContain('Thứ tự GRI bắt buộc');
    expect(SYSTEM).toContain('Không bao giờ viết thuế suất, phần trăm, số tiền');
    // A date or duration written differently from its source ("1 tháng" for "30 ngày") is one no quote holds (R10).
    expect(SYSTEM).toContain('không quy đổi đơn vị');
    expect(SYSTEM).not.toContain('ngải cứu');
  });

  it('builds the user prompt from the plan without codes, cuts sources to the budget, and caps the length by mode', () => {
    const prompt = buildComposeInput(base);
    expect(prompt).not.toMatch(/3005|30051010|\[mã/);
    expect(prompt).toContain('DỮ KIỆN HÀNG: đã có — miếng dán bàn chân; thành phần ngải cứu · còn thiếu — có tẩm dược chất không');
    expect(prompt).toContain(`ĐỘ DÀI TỐI ĐA: khoảng ${WORD_CAP.hs} từ`);
    expect(prompt).not.toContain('LƯỢT TRƯỚC');
    expect(prompt.match(/x/g)!.length).toBeLessThanOrEqual(3000);
    expect(buildComposeInput({ ...base, previousQuestion: 'Hộp cách ly nhiễu RF thuộc nhóm nào' })).toContain('LƯỢT TRƯỚC: Hộp cách ly nhiễu RF thuộc nhóm nào');
  });

  it('hands tariff lines over for reasoning with an order not to restate them', () => {
    const prompt = buildComposeInput({ ...base, mode: 'tariff', tariffLines: ['ACFTA: 0% nếu có C/O form E hợp lệ (118/2022/NĐ-CP)'] });
    expect(prompt).toContain('ĐỪNG nhắc lại con số');
    expect(prompt).toContain('ACFTA: 0% nếu có C/O form E hợp lệ');
  });

  it('asks repair only about the violating sentences and their own quotes', () => {
    const prompt = buildRepairPrompt([{ sentence: 'Thuế MFN là 0% [1].', rule: 'rate-in-prose', quotes: ['Mức thuế 10%'] }]);
    expect(prompt).toContain('CÂU 1 (vi phạm: rate-in-prose): Thuế MFN là 0% [1].');
    expect(prompt).toContain('TRÍCH DẪN: "Mức thuế 10%"');
    expect(prompt).not.toContain('ngải cứu');
  });
});

describe('reading what the model returns', () => {
  it('reads fenced JSON, chatter around it and raw newlines inside strings', () => {
    const raw = 'Đây là kết quả:\n```json\n{"answerMd":"Dòng một [1].\nDòng hai.","citations":[{"n":1,"quotes":["bông, gạc, băng đã thấm tẩm dược chất"]}],"candidates":[{"hs":"30.05","evidence":[1]}],"missingFacts":["có tẩm dược chất không"],"coverage":"partial"}\n```\nXong.';
    const draft = parseDraft(raw);
    expect(draft).toEqual({
      answerMd: 'Dòng một [1].\nDòng hai.',
      citations: [{ n: 1, quotes: ['bông, gạc, băng đã thấm tẩm dược chất'] }],
      candidates: [{ hs: '30.05', evidence: [1] }],
      missingFacts: ['có tẩm dược chất không'],
      coverage: 'partial',
    });
  });

  it('drops malformed parts instead of trusting them, and returns null without an answer', () => {
    const draft = parseDraft('{"answerMd":"Có [1].","citations":[{"n":"x"},{"n":2,"quote":"một câu nguyên văn đủ dài"}],"candidates":[{"hs":"bông"},{"hs":"3005.10.10","evidence":["1"]}],"missingFacts":"không phải mảng"}');
    expect(draft!.citations).toEqual([{ n: 2, quotes: ['một câu nguyên văn đủ dài'] }]);
    expect(draft!.candidates).toEqual([{ hs: '3005.10.10', evidence: [1] }]);
    expect(draft!.missingFacts).toEqual([]);
    expect(parseDraft('không có JSON')).toBeNull();
    expect(parseDraft('{"answerMd":"  "}')).toBeNull();
    expect(looseJson('{"a": ')).toBeNull();
  });

  it('accepts a repair only with one sentence per violation', () => {
    expect(parseRepair('{"sentences":["Câu đã sửa [1].", ""]}', 2)).toEqual(['Câu đã sửa [1].', '']);
    expect(parseRepair('{"sentences":["chỉ một"]}', 2)).toBeNull();
  });
});

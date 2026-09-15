import type { ClaudeOpts } from './claude';
import { assertNoUserCodes, codeRole, defaultPlan, fold, maskCodes, normalizePlan, PLAN_SYSTEM, PLAN_TIMEOUT_MS, type PlanInput, planParts, planStep, userCodes } from './plan';

describe('planStep — claude call #1 (Việc 6)', () => {
  const screenshot: PlanInput = {
    text: 'e có mặt hàng miếng dán bàn chân thành phần từ ngải cứu, e đang tham khảo mã này không biết được không ạ 30051010',
    quote: 'Mã 3005.10.10 bạn tham khảo thuộc nhóm 30.05, trùng một nhóm ứng viên',
    topic: 'tariff',
    state: { tariff: { dotted: '3005.10.10', desc: 'miếng dán', candidates: ['30.05', '38.24'] }, answer: { question: 'Miếng dán nhóm [mã 1] được không' } },
    turns: [
      { role: 'user', body: 'mã 30051010 thuế bao nhiêu' },
      { role: 'bot', body: 'Hàng hóa có mã HS 3005.10.10 có thuế MFN …' },
    ],
    documents: [{ number: '08/2015/NĐ-CP', title: 'Quy định chi tiết thủ tục hải quan', consolidates: null }],
  };
  const runner = (reply: { text: string; isError?: boolean } | null) => {
    const calls: Array<{ prompt: string; opts: ClaudeOpts }> = [];
    const run = async (prompt: string, opts: ClaudeOpts) => {
      calls.push({ prompt, opts });
      return reply && { text: reply.text, isError: reply.isError ?? false, durationMs: 1 };
    };
    return { run, calls };
  };

  it('never shows the model a digit of the user code — message, quote, earlier turns or state line — and asks at sonnet/low within 30 s', async () => {
    const { run, calls } = runner({ text: 'Kế hoạch: {"intent":"hs","understanding":"Người hỏi muốn biết miếng dán ngải cứu thuộc nhóm nào","question":"Miếng dán bàn chân ngải cứu thuộc nhóm nào","goods":{"facts":["miếng dán bàn chân","ngải cứu"],"missing":["có tẩm dược chất không"]}}' });
    const out = await planStep(screenshot, run);
    expect(calls).toHaveLength(1);
    expect(PLAN_SYSTEM + calls[0]!.prompt).not.toMatch(/3005|30\.05|30051010|38\.24/);
    expect(calls[0]!.prompt).toContain('08/2015/NĐ-CP');
    expect(calls[0]!.prompt).toContain('TIN NHẮN MỚI: "e có mặt hàng miếng dán bàn chân thành phần từ ngải cứu, e đang tham khảo mã này không biết được không ạ [mã 1]"');
    expect(calls[0]!.opts).toEqual({ timeoutMs: PLAN_TIMEOUT_MS, systemPrompt: PLAN_SYSTEM, model: 'sonnet', effort: 'low' });
    expect(out).toMatchObject({ calls: 1, fallback: false, codeRole: 'premise', leakDrops: [] });
    expect(out.plan.intent).toBe('hs');
    expect(out.plan.goods.facts).toEqual(['miếng dán bàn chân', 'ngải cứu']);
    expect(out.userCodes.map((c) => c.code)).toEqual(['3005.10.10']);
  });

  it('latches with premise spellings whatever the role: a heading written in a turn never reaches the model, even for a rate question', async () => {
    const { run, calls } = runner({ text: '{"intent":"hs"}' });
    const input = { text: '3005.10.10 là mã cho miếng dán ngải cứu với thuế 5%?', quote: null, topic: 'tariff', state: {}, documents: [] };
    const out = await planStep({ ...input, turns: [{ role: 'user', body: 'hàng này vào 30 05 hay 38 24' }] }, run);
    expect(calls[0]!.prompt).not.toMatch(/30 05/);
    expect(out.leakDrops).toEqual(['turns']);
  });

  it('falls back to defaultPlan on no result, is_error, no JSON or an unknown intent', async () => {
    for (const reply of [null, { text: '{"intent":"hs"}', isError: true }, { text: 'không có JSON' }, { text: '{"intent":"check_code"}' }]) {
      const out = await planStep({ ...screenshot, quote: null, turns: [], state: {} }, runner(reply).run);
      expect(out).toMatchObject({ fallback: true, calls: 1 });
      expect(out.plan.intent).toBe('hs'); // defaultPlan: a code the message doubts
    }
  });

  it('names the sources just cited by the label the bot saves, or by the provisionLabel of a state saved before it', () => {
    const label = 'Khoản 1 Điều 18 Nghị định 08/2015/NĐ-CP';
    for (const cite of [{ label, kind: null, instrument: '08/2015/NĐ-CP', documentNumber: '08/2015/NĐ-CP' }, { provisionLabel: label }]) {
      const { parts } = planParts({ text: 'nguyên văn điều đó', quote: null, topic: 'legal', state: { legal: { citations: [cite] } }, turns: [], documents: [] });
      expect(parts.find((p) => p.name === 'state')!.text).toContain(`nguồn vừa trích: ${label}`);
    }
  });

  it('reads a status question without a code as status when the model says so, the document kept only as the user wrote it', async () => {
    const { run } = runner({ text: '{"intent":"status","question":"Nghị định 69/2018 còn áp dụng không","scope":{"doc":"69/2018/NĐ-CP"}}' });
    const out = await planStep({ text: 'Nghị định 69/2018 còn áp dụng không', quote: null, topic: null, state: {}, turns: [], documents: [] }, run);
    expect(out.plan).toMatchObject({ intent: 'status', scope: { doc: '69/2018' } });
    expect(out.codeRole).toBe('none');
  });
});

describe('maskCodes — the plan prompt never sees the digits of a code (R4)', () => {
  it('masks every spelling of a code or heading, NFD and no-diacritic text included', () => {
    for (const [text, masked] of [
      ['khai 3005.10 được không', 'khai [mã 1] được không'],
      ['e nghĩ là 30.05 được không', 'e nghĩ là [mã 1] được không'],
      ['HS: 3005', 'HS: [mã 1]'],
      ['mã số 30.05.10.10', 'mã số [mã 1]'],
      ['nhóm hàng 3005 hay 3824', 'nhóm hàng [mã 1] hay [mã 2]'],
      ['thuộc chương 30', 'thuộc chương [mã 1]'],
      ['nhóm 3005'.normalize('NFD'), 'nhóm [mã 1]'],
      ['3005 10 10', '[mã 1]'],
      ['vi sao mieng dan ngai cuu vao ma 30051010', 'vi sao mieng dan ngai cuu vao ma [mã 1]'],
      ['nhom hang 3005 hoac 3824', 'nhom hang [mã 1] hoac [mã 2]'],
      ['ma so 3005 duoc khong', 'ma so [mã 1] duoc khong'],
      ['chuong 30', 'chuong [mã 1]'],
      // A word after the code is never a unit unless it names money, a time or a duration of a bare chapter.
      ['e khai 3005.10 sang 3824.90 được không', 'e khai [mã 1] sang [mã 2] được không'],
      ['đổi mã 3005 sang 3824 được không', 'đổi mã [mã 1] sang [mã 2] được không'],
      ['tra giúp mã 3005 ngay nhé', 'tra giúp mã [mã 1] ngay nhé'],
      ['khai 3005.10 tháng trước bị bác', 'khai [mã 1] tháng trước bị bác'],
      ['mã 7411 đồng tinh luyện', 'mã [mã 1] đồng tinh luyện'],
      ['e thấy 30.05 sang 38.24 hợp lý hơn', 'e thấy [mã 1] sang [mã 2] hợp lý hơn'],
      ['thuộc chương 30.', 'thuộc chương [mã 1].'],
      ['tramã 3005 được không', 'tramã [mã 1] được không'],
      // Leaks the second review round found: nothing after a keyword or a dddd.dd is a unit.
      ['khai 3005.10 usd được không', 'khai [mã 1] usd được không'],
      ['khai 3005.10 triệu', 'khai [mã 1] triệu'],
      ['mã 30.05 đồng', 'mã [mã 1] đồng'],
      ['nop thue ma 30 ngay', 'nop thue ma [mã 1] ngay'],
      ['e thay 3005.10 vnd', 'e thay [mã 1] vnd'],
      ['nhóm 3005 hoặc 3824, và 3926', 'nhóm [mã 1] hoặc [mã 2], và [mã 3]'],
      ['nhóm 3005, 3824.', 'nhóm [mã 1], [mã 2].'],
      // A bare heading of a code the text also names, wherever it stands.
      ['miếng dán thuộc 3005 hay 3824, mã 3005.10.10 có đúng không', 'miếng dán thuộc [mã 2] hay [mã 3], mã [mã 1] có đúng không'],
      // A joined six-digit run after a code word is a subheading.
      ['mã hs 848180', 'mã hs [mã 1]'],
      ['mã 848180', 'mã [mã 1]'],
      ['hs 848180 dùng cho van được không', 'hs [mã 1] dùng cho van được không'],
      ['phân nhóm 300510 gồm gì', 'phân nhóm [mã 1] gồm gì'],
    ]) {
      expect(maskCodes(text!).text).toBe(masked);
    }
  });

  it('numbers each code once across parts, so the same code keeps its label in the state line', () => {
    const first = maskCodes('tham khảo nhóm 3005, mã 30051010 và 3005.90.10; lại mã 3005.10.10');
    expect(first).toEqual({ text: 'tham khảo nhóm [mã 1], mã [mã 2] và [mã 3]; lại mã [mã 2]', codes: ['3005', '3005.10.10', '3005.90.10'] });
    expect(maskCodes('mã HS vừa tra: 3005.10.10', first.codes)).toEqual({ text: 'mã HS vừa tra: [mã 2]', codes: first.codes });
    expect(maskCodes('câu đã che: [mã 12] hay [mã 3]').text).toBe('câu đã che: [mã 12] hay [mã 3]');
  });

  it('leaves document numbers, dates, rates and accented money or time words alone', () => {
    for (const text of [
      'Nghị định 26/2023/NĐ-CP ngày 31/05/2023, năm 2026',
      'ngày 30.05 nộp 12.50% lúc 08.30 sáng, phạt 12.50 triệu',
      '15.000.000 đồng',
      'hạn 14.09.2026',
      // Ten joined digits are a tax number or a phone, never a code.
      'mã số thuế 0312345678 theo Thông tư 36/2026',
      'mã số 0312345678, gọi 0912345678',
    ]) {
      expect(maskCodes(text)).toEqual({ text, codes: [] });
    }
  });

  it('over-masks a number shaped like a code rather than risk a leak (R4)', () => {
    expect(maskCodes('1234.56 USD').text).toBe('[mã 1] USD');
    expect(maskCodes('phat 12.50 trieu').text).toBe('phat [mã 1] trieu');
  });
});

describe('codeRole — code decides what a code in the message is (§4.2)', () => {
  it('folds case, marks and đ', () => {
    expect(fold('ĐƯỢC Không'.normalize('NFD'))).toBe('duoc khong');
  });

  it('premise by default and whenever the message doubts the code; FIT cues win', () => {
    expect(codeRole('e có măt hàng miếng dán bàn chân thành phần từ ngải cứu, e đang tham khảo mã này không biết được không ạ 30051010')).toBe('premise');
    expect(codeRole('nhập 94054090 có phải kiểm tra năng lượng, áp mã này được không')).toBe('premise');
    expect(codeRole('8481.80.99 có sai không ạ')).toBe('premise');
    expect(codeRole('miếng dán ngải cứu mã 3005.10.10 có hợp không')).toBe('premise');
    expect(codeRole('mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro, mã này hợp không')).toBe('premise');
    // "trường hợp không" is no doubt about the code.
    expect(codeRole('thuế mã 8481.80.99 trường hợp không có C/O bao nhiêu')).toBe('key');
  });

  it('subject for a list or explanation question, key for a rate question, none without a code', () => {
    expect(codeRole('Mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro nào theo Thông tư 36/2026?')).toBe('subject');
    expect(codeRole('3005.10.10 gồm những hàng gì, khác 3005.90 chỗ nào')).toBe('subject');
    expect(codeRole('Xe 8703.23.51 đã qua sử dụng nhập khẩu được không')).toBe('subject');
    expect(codeRole('cho mình hỏi thuế 8481.80.99 bao nhiêu vậy'.normalize('NFD'))).toBe('key');
    expect(codeRole('thủ tục nhập khẩu xe đã qua sử dụng')).toBe('none');
  });

  it('a plan with goods facts can only tighten an explanation subject to premise', () => {
    const text = 'miếng dán ngải cứu 30051010 gồm những gì';
    expect(codeRole(text)).toBe('subject');
    expect(codeRole(text, { intent: 'hs', goods: { facts: ['miếng dán ngải cứu'], missing: [] } })).toBe('premise');
  });

  it('a rate code under a plan that is not tariff is a premise', () => {
    const text = 'cho mình hỏi thuế 8481.80.99 bao nhiêu vậy';
    expect(codeRole(text, { intent: 'tariff', goods: { facts: [], missing: [] } })).toBe('key');
    expect(codeRole(text, { intent: 'hs', goods: { facts: [], missing: [] } })).toBe('premise');
  });
});

describe('userCodes and assertNoUserCodes — the last latch before a spawn (R4)', () => {
  it('reports each code once with its level and heading', () => {
    expect(userCodes('nhóm 3005 hay 30.05, mã 3005 10 10, chương 30')).toEqual([
      { code: '30.05', level: 4, heading: '30.05' },
      { code: '3005.10.10', level: 8, heading: '30.05' },
      { code: '30', level: 2, heading: null },
    ]);
  });

  it('lists a code followed by a word that is also a unit, so the latch checks it', () => {
    expect(userCodes('e khai 3005.10 sang 3824.90 được không').map((c) => c.code)).toEqual(['3005.10', '3824.90']);
  });

  it('lists a joined six-digit run after a code word dotted, so the latch drops a part spelling it', () => {
    for (const text of ['mã hs 848180', 'mã 848180', 'hs 848180 dùng cho van được không']) {
      const codes = userCodes(text);
      expect(codes).toEqual([{ code: '8481.80', level: 6, heading: '84.81' }]);
      expect(assertNoUserCodes([{ name: 'turns', text: `NGƯỜI DÙNG: ${text}` }], codes, 'key').leakDrops).toEqual(['turns']);
    }
    expect(userCodes('mã số thuế 0312345678')).toEqual([]);
  });

  it('drops a part holding the code in any spelling, keeps a document number', () => {
    const codes = userCodes('e tham khảo mã 3005.10.10 được không');
    const parts = [
      { name: 'message', text: 'e tham khảo mã [mã 1] được không' },
      { name: 'turn:0', text: 'BOT: Mã 3005.10.10 bạn tham khảo thuộc nhóm' },
      { name: 'turn:1', text: 'NGƯỜI DÙNG: mã 30051010' },
      { name: 'state', text: 'mã HS vừa tra: 3005 10 10' },
      { name: 'manifest', text: '- 26/2023/NĐ-CP: sửa đổi Nghị định 08/2015/NĐ-CP' },
      { name: 'goods', text: 'số lô 130051010' },
    ];
    expect(assertNoUserCodes(parts, codes, 'key')).toEqual({ parts: [parts[0], parts[4], parts[5]], leakDrops: ['turn:0', 'turn:1', 'state'] });
  });

  it('for a premise code also drops the 4-digit heading (owner decision D1: the heading reaches compose only as a pin)', () => {
    const codes = userCodes('mã 3005.10.10 được không');
    const parts = [
      { name: 'question', text: 'miếng dán thuộc nhóm 30.05 không' },
      { name: 'understanding', text: 'Bạn muốn biết miếng dán có khai vào 3005 được không' },
    ];
    expect(assertNoUserCodes(parts, codes, 'premise')).toEqual({ parts: [], leakDrops: ['question', 'understanding'] });
    expect(assertNoUserCodes(parts, codes, 'key').leakDrops).toEqual([]);
  });
});

describe('normalizePlan — the model output in a fixed shape, user data only where the user wrote it (§2.4)', () => {
  it('keeps only goods facts the user wrote, without serials, models or long digit groups (G10)', () => {
    const said = ['máy kiểm tra điện trở bo mạch, model XT-200, serial 99812345, sản xuất năm 2019, hàng đã qua sử dụng, SN: 4411-22'];
    const plan = normalizePlan(
      {
        intent: 'hs',
        question: 'HS của máy kiểm tra điện trở bo mạch',
        understanding: 'Bạn cần mã HS cho máy kiểm tra điện trở model XT-200 serial 99812345',
        goods: {
          facts: ['kiểm tra điện trở bo mạch', 'thải độc', 'model XT-200', 'SN: 4411-22', 'sản xuất năm 2019', 'đã qua sử dụng'],
          missing: ['máy chỉ đo điện trở hay kiểm tra cả mạch'],
        },
      },
      said,
    );
    expect(plan?.goods).toEqual({ facts: ['kiểm tra điện trở bo mạch', 'đã qua sử dụng'], missing: ['máy chỉ đo điện trở hay kiểm tra cả mạch'] });
    expect(plan?.understanding).toBe('Bạn cần mã HS cho máy kiểm tra điện trở');
    expect(normalizePlan({ intent: 'hs', question: 'q', understanding: 'Bạn hỏi mã 3005.10.10 có đúng không' }, [])?.understanding).toBe('Bạn hỏi mã có đúng không');
  });

  it('keeps a document number only when the user wrote it, its issuer only when written', () => {
    const raw = { intent: 'status', question: 'q', understanding: 'Bạn hỏi Thông tư 36/2016/TT-BKHCN còn hiệu lực không', scope: { doc: '36/2016/TT-BKHCN', article: 'Điều 18', clause: null } };
    const full = normalizePlan(raw, ['thông tư 36/2016/TT-BKHCN còn hiệu lực không']);
    expect(full?.scope).toEqual({ doc: '36/2016/TT-BKHCN', article: '18', clause: null });
    expect(full?.understanding).toBe(raw.understanding);
    const bare = normalizePlan(raw, ['thông tư 36/2016 còn hiệu lực không']);
    expect(bare?.scope.doc).toBe('36/2016');
    expect(bare?.understanding).toBe('Bạn hỏi Thông tư 36/2016 còn hiệu lực không');
    const minted = normalizePlan(raw, ['đọc lại thông tư 36 của bộ Khoa học công nghệ']);
    expect(minted?.scope.doc).toBeNull();
    expect(minted?.understanding).toBe('Bạn hỏi Thông tư còn hiệu lực không');
  });

  it('accepts only the nine intents and coerces every other field', () => {
    expect(normalizePlan({ intent: 'check_code', question: 'x' }, [])).toBeNull();
    expect(normalizePlan('{"intent":"hs"}', [])).toBeNull();
    expect(
      normalizePlan(
        { intent: 'hs', question: ' Miếng dán thuộc nhóm nào ', queries: ['a', 'b', 'c'], hsHints: ['30.05', '3824', '8479.89', '38', '30051010'], origin: 'cn', date: '14/09/2026', verdict: 'maybe', refines: 'yes', reuseLastHs: true, reply: '' },
        [],
      ),
    ).toEqual({
      intent: 'hs',
      understanding: null,
      question: 'Miếng dán thuộc nhóm nào',
      queries: ['a', 'b'],
      goods: { facts: [], missing: [] },
      refines: false,
      scope: { doc: null, article: null, clause: null },
      keywords: [],
      hsHints: ['3005', '3824', '847989'],
      origin: 'CN',
      date: null,
      reuseLastHs: true,
      verdict: null,
      reply: null,
    });
  });
});

describe('defaultPlan — no model, timeout or is_error (§2.2 row 23)', () => {
  it('code with a FIT cue, code, document number, then the topic', () => {
    expect(defaultPlan('Nghị định 69/2018/NĐ-CP còn áp dụng không', null)).toMatchObject({ intent: 'status', scope: { doc: '69/2018/NĐ-CP' } });
    expect(defaultPlan('vì sao miếng dán vào mã 30051010', 'tariff')).toMatchObject({ intent: 'hs', question: 'vì sao miếng dán vào mã [mã 1]' });
    expect(defaultPlan('miếng dán ngải cứu mã 3005.10.10 có hợp không', null).intent).toBe('hs');
    expect(defaultPlan('thuế mã 8481.80.99 trường hợp không có C/O', null).intent).toBe('tariff');
    expect(defaultPlan('thuế 8481.80.99 TQ', null).intent).toBe('tariff');
    expect(defaultPlan('Nghị định 08/2015/NĐ-CP quy định gì về hồ sơ', null).intent).toBe('legal');
    expect(defaultPlan('còn trường hợp khác thì sao', 'legal').intent).toBe('legal');
    expect(defaultPlan('van bi bằng đồng', null).intent).toBe('tariff');
  });
});

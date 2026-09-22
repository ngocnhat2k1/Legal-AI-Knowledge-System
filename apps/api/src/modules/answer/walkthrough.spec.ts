import { existsSync, readFileSync } from 'node:fs';
import { looseJson } from './compose';
import { userCodesIn } from './guards';
import type {
  Authority,
  ClassifyInput,
  EvidenceRow,
  HeadingAssessment,
  WalkthroughOutput,
  WalkthroughSection,
  WalkthroughSectionKey,
} from './types';
import { buildWalkthroughPrompt, normalizeWalkthrough, validateWalkthrough, walkthroughSchema } from './walkthrough';

const row = (id: number, kind: string, authority: Authority, title: string, body = '', meta: Record<string, unknown> = {}): EvidenceRow => ({
  id,
  kind,
  authority,
  title,
  body,
  window: 'current',
  meta,
});

const GRI3 = row(1, 'gri', 'binding', 'Quy tắc 3 GRI — nội dung quy tắc', 'Khi áp dụng Quy tắc 2(b) hoặc vì bất cứ một lý do nào khác…');
const GRI1 = row(2, 'gri', 'binding', 'Quy tắc 1 GRI — nội dung quy tắc', 'Việc phân loại phải được xác định theo nội dung của từng nhóm và bất cứ chú giải của phần hoặc chương có liên quan.');
const NOTE30 = row(10, 'hs_note', 'binding', 'Chú giải Chương 30 (TT 31/2022/TT-BTC)', 'Chương này không bao gồm: (e) Các chế phẩm thuộc các nhóm từ 33.03 đến 33.07.');
const EN3005 = row(11, 'en', 'authoritative', 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05', 'Nhóm này gồm băng dán đã tráng phủ dược chất.');
const SEN30 = row(12, 'sen', 'authoritative', 'SEN 2022 · Chương 30');
const RULING_L1 = row(13, 'ruling', 'administrative', 'TB 123/TB-CHQ', '', { case_id: 'tb-123#1', muc_lap_luan: 'L1' });
const RULING_L4 = row(14, 'ruling', 'administrative', 'TB 456/TB-CHQ', '', { case_id: 'tb-456#1', muc_lap_luan: 'L4', rang_buoc: 'chi_nguoi_de_nghi' });
/** A ruling as gather() returns it today: no căn cứ, no binding scope. */
const RULING_BARE = row(15, 'ruling', 'administrative', 'TB 16238/TB-CHQ — Thông báo về kết quả xác định trước mã số', '', { hs2022: {} });
const NOTE38 = row(21, 'hs_note', 'binding', 'Chú giải Chương 38 (TT 31/2022/TT-BTC)');
const EN3824 = row(22, 'en', 'authoritative', 'Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24');
const ANNEX = row(30, 'annex_table', 'binding', '36/2026/TT-BKHCN — Phụ lục I');
const USED = row(31, 'annex_table', 'binding', '18/2019/QĐ-TTg — Bảng 1', 'Tên máy | Mã số HS | Tuổi thiết bị (tính theo năm) không vượt quá');

const HEADING_3005 = 'Bông, gạc, băng và các sản phẩm tương tự…';
/** The user's own code: the runner holds it, the prompt only ever sees "[mã 1]" (R4). */
const USER_CODE = '3919.90.99';

/** Two candidates for "miếng dán bàn chân ngải cứu"; the GRI row is shared, so either may cite it. */
const input: ClassifyInput = {
  question: 'Miếng dán bàn chân ngải cứu, tôi định khai [mã 1], đúng không?',
  goodsFacts: 'miếng dán bàn chân ngải cứu, hộp 10 miếng, mỗi miếng 5 g',
  depth: 'full',
  asOf: '2026-09-14',
  candidates: [
    {
      heading: '30.05',
      headingText: HEADING_3005,
      lines: [
        { code: '30051010', path: `${HEADING_3005} › Băng dán › Đã tráng phủ` },
        { code: '30059090', path: `${HEADING_3005} › Loại khác › Loại khác` },
      ],
      evidence: [GRI3, GRI1, NOTE30, EN3005, SEN30, RULING_L1, RULING_L4],
    },
    {
      heading: '38.24',
      headingText: 'Chất gắn đã điều chế dùng cho các loại khuôn đúc…',
      lines: [{ code: '38249999', path: 'Chất gắn… › Loại khác › Loại khác' }],
      evidence: [GRI3, NOTE38, EN3824],
    },
  ],
  tariffLines: [{ code: '3005.10.10', line: 'Nếu hàng thuộc mã 3005.10.10 (Bông, gạc…), thuế nhập khẩu ưu đãi thông thường (MFN) là 8% — NĐ 26/2023/NĐ-CP' }],
  policyRows: [ANNEX, USED],
};
const bothLines: ClassifyInput = { ...input, tariffLines: [...input.tariffLines, { code: '3824.99.99', line: 'MFN …' }] };

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe('buildWalkthroughPrompt', () => {
  const prompt = buildWalkthroughPrompt(input);

  it('carries every evidence id and the LINES dotted without the repeated heading text; list rows stay with code', () => {
    for (const id of [1, 2, 10, 11, 12, 13, 14, 21, 22]) expect(prompt).toContain(`[#${id}]`);
    for (const id of [30, 31]) expect(prompt).not.toContain(`[#${id}]`);
    expect(prompt).toContain('- 3005.10.10 · Băng dán › Đã tráng phủ');
    expect(prompt).toContain('- 3824.99.99 · Chất gắn… › Loại khác › Loại khác');
    expect(count(prompt, HEADING_3005)).toBe(1);
  });

  it('keeps the user code masked: "[mã 1]" stays, no digit of the code the runner holds (R4)', () => {
    expect(prompt).toContain('[mã 1]');
    expect(userCodesIn([prompt], [USER_CODE])).toEqual([]);
    expect(prompt).not.toContain('3919');
  });

  it('prints notes, GRI and a row shared by headings once in a neutral block before the headings; the rest stays under its heading', () => {
    const shared = buildWalkthroughPrompt({ ...input, candidates: [input.candidates[0]!, { ...input.candidates[1]!, evidence: [...input.candidates[1]!.evidence, EN3005] }] });
    for (const id of [1, 2, 10, 11, 21]) {
      expect(count(shared, `[#${id}]`)).toBe(1);
      expect(shared.indexOf(`[#${id}]`)).toBeLessThan(shared.indexOf('NHÓM 30.05'));
    }
    expect(shared.indexOf('[#12]')).toBeGreaterThan(shared.indexOf('NHÓM 30.05'));
    expect(shared.indexOf('[#22]')).toBeGreaterThan(shared.indexOf('NHÓM 38.24'));
  });

  it('is the same prompt whatever order the headings come in, so a heading the user named, appended last, has no telltale place (R4)', () => {
    expect(buildWalkthroughPrompt({ ...input, candidates: [...input.candidates].reverse() })).toBe(prompt);
  });

  it('tags standing from data: SEN tier, a ruling without note or GIR, its binding scope, a row not yet in force, a row nobody verified', () => {
    const upcoming: EvidenceRow = { ...NOTE38, window: 'upcoming', meta: { effective_from: '2027-01-01', verification: 'auto_unverified' } };
    const tagged = buildWalkthroughPrompt({ ...input, candidates: [input.candidates[0]!, { ...input.candidates[1]!, evidence: [GRI3, upcoming, RULING_BARE] }] });
    expect(tagged).toContain('[#12] sen · tầng ASEAN, không tự ràng buộc · SEN 2022 · Chương 30');
    expect(tagged).toContain('[#13] ruling · hành chính · TB 123/TB-CHQ · chỉ cho mặt hàng nêu trong văn bản · không nêu chú giải hay GIR');
    expect(tagged).toContain('[#14] ruling · hành chính · TB 456/TB-CHQ · chỉ ràng buộc người đề nghị · có viện dẫn chú giải/GIR');
    expect(tagged).toContain(`[#15] ruling · hành chính · ${RULING_BARE.title} · chỉ ràng buộc người đề nghị · không nêu chú giải hay GIR`);
    expect(tagged).toContain('[#21] hs_note · ràng buộc · Chú giải Chương 38 (TT 31/2022/TT-BTC) · CHƯA CÓ HIỆU LỰC (từ 2027-01-01) · tự nạp, chưa có người xác minh');
  });

  it('gives brief and full their own word cap and heading instructions', () => {
    const brief = buildWalkthroughPrompt({ ...input, depth: 'brief' });
    expect(brief).toContain('Độ sâu brief: tối đa khoảng 170 từ');
    expect(brief).not.toContain('Độ sâu full');
    expect(prompt).toContain('Độ sâu full: viết đủ tám mục');
    expect(prompt).not.toContain('Độ sâu brief');
  });

  // The owner wants the sectioned report their sample document is made of, so the nine keys ARE the outline. The prompt
  // used to say the opposite ("đó không phải dàn bài … không có gì để nói thì bỏ") and the model dropped up to five
  // sections of ten on a live question (2026-09-15); the runner's titles then printed a report starting at II.2.
  it('full asks for all eight model sections, in order, merged into nothing and headed by nothing', () => {
    expect(prompt).toContain('viết đủ tám mục');
    expect(prompt).toContain('mục nào chưa có gì để nói thì nói thẳng là chưa có');
    expect(prompt).toContain('Không gộp mục, không bỏ mục nào, không tự viết dòng');
    expect(prompt).toContain('nature, candidates, exclusions, gir, levels, explanation, risk, conclusion');
    // THÔNG TIN HÀNG HÓA is the system's: it restates the asker's own measurements, and G1 cut every sentence of it as
    // a number no quote backs — as the first section, that dropped the whole answer (2026-09-15).
    expect(prompt).toContain('Phần thông tin hàng hóa do hệ thống in từ dữ kiện người hỏi đã viết, đừng chép lại');
    expect(prompt).not.toMatch(/"key":"facts\|/);
    expect(prompt).not.toContain('đó không phải dàn bài');
    // brief is the short continuous answer: one message, no headings, no outline, no section written only to say it is empty.
    const brief = buildWalkthroughPrompt({ ...input, depth: 'brief' });
    expect(brief).toContain('Độ sâu brief: tối đa khoảng 170 từ');
    expect(brief).toContain('bỏ mục không có gì');
    expect(brief).not.toContain('viết đủ tám mục');
  });

  it('asks for [#id] beside a verbatim quote in the same sentence, and sections carry no cite list', () => {
    expect(prompt).toContain('ghi [#id] của dòng đó cuối câu');
    // verify() cuts a sentence whose quote holds a rate or a ruling's settling words; a shared opener proves neither row.
    // guards now exempt a criterion quoted verbatim from a note (G1/G4), so the prompt asks for the quote instead of forbidding the figure.
    expect(prompt).toContain('được mang %, số tiền, tiêu chí hay lời xếp mã');
    expect(prompt).toContain('không nói thuế, ưu đãi, MFN, FTA, VAT');
    expect(prompt).toContain('câu mở chung như "Chương này không bao gồm" không tính');
    expect(prompt).toContain('"markdown":"…"}],"candidates"');
    expect(prompt).not.toContain('"markdown":"…","cite_ids"');
  });

  it('prints tariff lines only when every heading has one, under a label that keeps them out of the classification (R4)', () => {
    const label = 'DÒNG THUẾ (không phải căn cứ phân loại; chỉ để nói loại thuế nào áp khi nào; không chép số)';
    const both = buildWalkthroughPrompt(bothLines);
    expect(both.indexOf(label)).toBeGreaterThan(-1);
    expect(both.indexOf(input.tariffLines[0]!.line)).toBeGreaterThan(both.indexOf(label));
    // 38.24 has no line: the runner dropped the user's code, so the gap would point at the heading the user named.
    expect(prompt).not.toContain(label);
    expect(prompt).not.toContain(input.tariffLines[0]!.line);
    expect(buildWalkthroughPrompt({ ...input, tariffLines: [] })).not.toContain(label);
  });
});

describe('walkthroughSchema — the output contract, for the prompt and for the hand check', () => {
  it('lists exactly the section keys, assessments and fields of types.ts, with the R2 limits', () => {
    const keys = { facts: 0, nature: 0, candidates: 0, exclusions: 0, gir: 0, levels: 0, explanation: 0, policy: 0, risk: 0, conclusion: 0 } satisfies Record<
      WalkthroughSectionKey,
      0
    >;
    const assessments = { phu_hop: 0, co_the_neu: 0, loai: 0, chua_du_du_kien: 0 } satisfies Record<HeadingAssessment, 0>;
    const fields = { sections: 0, candidates: 0, conclusion: 0, tariff_ref: 0 } satisfies Record<keyof WalkthroughOutput, 0>;
    const section = { key: 0, markdown: 0, cites: 0 } satisfies Record<keyof WalkthroughSection, 0>;
    const cite = { id: 0, quotes: 0 } satisfies Record<keyof WalkthroughSection['cites'][number], 0>;
    const candidate = { heading: 0, assessment: 0, deciding_facts: 0, cite_ids: 0 } satisfies Record<keyof WalkthroughOutput['candidates'][number], 0>;
    const conclusion = { headings: 0, needs_advance_ruling: 0, missing_facts: 0 } satisfies Record<keyof WalkthroughOutput['conclusion'], 0>;
    expect(walkthroughSchema).toMatchObject({
      additionalProperties: false,
      required: Object.keys(fields),
      properties: {
        sections: {
          items: { required: Object.keys(section), properties: { key: { enum: Object.keys(keys) }, cites: { items: { required: Object.keys(cite) } } } },
        },
        candidates: { items: { required: Object.keys(candidate), properties: { assessment: { enum: Object.keys(assessments) }, deciding_facts: { maxItems: 3 } } } },
        conclusion: {
          required: Object.keys(conclusion),
          properties: { headings: { maxItems: 3, items: { pattern: '^\\d{2}\\.\\d{2}$' } }, missing_facts: { maxItems: 3 } },
        },
        tariff_ref: { items: { pattern: '^\\d{4}\\.?\\d{2}\\.?\\d{2}$' } },
      },
    });
    // Abstaining is a success (R5): no concluded heading is allowed.
    expect(walkthroughSchema).not.toHaveProperty('properties.conclusion.properties.headings.minItems');
  });
});

const cites = (...ids: number[]): WalkthroughSection['cites'] => ids.map((id) => ({ id, quotes: [] }));

/** An answer every rule accepts; each test changes one thing. */
const good = (): WalkthroughOutput => ({
  sections: [
    { key: 'facts', markdown: 'Hàng là miếng dán bàn chân ngải cứu, hộp 10 miếng, mỗi miếng 5 g.', cites: [] },
    { key: 'exclusions', markdown: 'Chú giải 1 Chương 30 loại trừ chế phẩm không chứa dược chất [1].', cites: cites(10) },
    { key: 'gir', markdown: 'Quy tắc 3(a) chỉ dùng khi hai nhóm cùng thoạt nhìn áp dụng được [1].', cites: cites(1) },
    { key: 'conclusion', markdown: 'Hướng về nhóm **30.05** nếu miếng dán có dược chất [1]; nếu không, xét 38.24.', cites: cites(11) },
  ],
  candidates: [
    { heading: '30.05', assessment: 'co_the_neu', deciding_facts: ['miếng dán có thấm tẩm dược chất hay không'], cite_ids: [11] },
    { heading: '38.24', assessment: 'chua_du_du_kien', deciding_facts: ['thành phần của lớp ngải cứu'], cite_ids: [21, 1] },
  ],
  conclusion: { headings: ['30.05', '38.24'], needs_advance_ruling: false, missing_facts: ['Công dụng ghi trên nhãn'] },
  tariff_ref: ['3005.10.10'],
});

const edit = (change: (o: WalkthroughOutput) => void): WalkthroughOutput => {
  const o = good();
  change(o);
  return o;
};
const withSection = (key: WalkthroughSectionKey, markdown: string, ids: number[] = []) => edit((o) => o.sections.push({ key, markdown, cites: cites(...ids) }));
/** The answer with `key` written as given, replacing that section if the good answer has one. */
const only = (key: WalkthroughSectionKey, markdown: string, ids: number[] = []) =>
  edit((o) => (o.sections = [...o.sections.filter((s) => s.key !== key), { key, markdown, cites: cites(...ids) }]));
const rules = (o: WalkthroughOutput, i: ClassifyInput = input): string[] => validateWalkthrough(o, i).map((v) => v.rule);

describe('validateWalkthrough', () => {
  it('accepts a sound answer', () => {
    expect(validateWalkthrough(good(), input)).toEqual([]);
  });

  it('passes ordinary teaching prose that earlier rules flagged', () => {
    const pass: Array<[WalkthroughSectionKey, string, number[]]> = [
      ['explanation', 'Loại thuế nào áp tùy xuất xứ: có C/O mẫu D thì xét ưu đãi đặc biệt, khác với dòng không có C/O.', []],
      ['explanation', 'Thuế suất của nhóm 30.05 in ở khối thuế bên dưới.', []],
      ['risk', 'Thuế áp khác nhau tùy có C/O mẫu D hay không.', []],
      ['levels', 'Theo SEN (tầng ASEAN, không tự ràng buộc), dòng thuốc đông y cần:\n- được xác nhận là thuốc [1]\n- nhãn ghi bệnh cụ thể [1]', [12]],
      ['gir', 'Theo GIR 1, xét theo nội dung nhóm và chú giải của phần hoặc chương có liên quan [1].', [2]],
      ['gir', 'Theo GIR 1, "Việc phân loại phải được xác định theo nội dung của từng nhóm và bất cứ chú giải của phần hoặc chương có liên quan" [1].', [2]],
      ['gir', 'GIR 1 đã phân định được nên chưa sang GIR 3 [1].', [2]],
      ['gir', 'Chỉ khi GIR 1 không phân định được mới tới GIR 3 [1].', [2]],
      ['exclusions', 'Chú giải 1(e) Chương 30 đưa chế phẩm nhóm 33.07 ra khỏi chương [1]. Thông báo 1 cũng kết luận như vậy [2].', [10, 13]],
      ['nature', 'Hàng xếp theo Danh mục HS 2022, là miếng dán ngải cứu.', []],
      ['explanation', 'Nên nhờ chuyên gia giám định thành phần của lớp ngải cứu.', []],
      ['candidates', 'Hai hướng 30.05 ↔ 38.24 cùng được nêu.', []],
      ['explanation', 'Miếng dán không có tên trong lời văn nhóm 30.05 [1].', [11]],
      ['explanation', 'Dòng 3005.10.10 nằm trong Danh mục hàng hóa xuất khẩu, nhập khẩu Việt Nam.', []],
    ];
    for (const [key, markdown, ids] of pass) expect([markdown, rules(only(key, markdown, ids))]).toEqual([markdown, []]);
  });

  it('shape: enforces the schema by hand, and stops only when a field cannot be read', () => {
    const o = edit((x) => {
      x.conclusion.headings = ['30.05', '38.24', '3005', '39.26'];
      x.sections[0]!.markdown = '  ';
      (x.sections[1] as { key: string }).key = 'intro';
      x.tariff_ref = ['3005.10'];
      (x as unknown as Record<string, unknown>).confidence = 0.9;
    });
    const details = validateWalkthrough(o, input)
      .filter((v) => v.rule === 'walkthrough-shape')
      .map((v) => v.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        'output: unknown field "confidence"',
        'output.sections[0].markdown: is empty (omit it instead)',
        expect.stringContaining('"intro" is not one of'),
        'output.conclusion.headings: allows at most 3 items',
        expect.stringContaining('"3005" does not match'),
        expect.stringContaining('"3005.10" does not match'),
      ]),
    );
    expect(() => validateWalkthrough({ sections: 'x' } as unknown as WalkthroughOutput, input)).not.toThrow();
    expect(new Set(rules({ sections: 'x' } as unknown as WalkthroughOutput))).toEqual(new Set(['walkthrough-shape']));
    // hs_description stores lines undotted; the tariff block keys on digits.
    expect(rules(edit((x) => (x.tariff_ref = ['30051010'])))).toEqual([]);
  });

  it('shape: a type slip or a missing array is reported and filled, so the rules behind it still reach the repair pass', () => {
    const o = edit((x) => {
      (x.sections[1] as unknown as { cites: unknown }).cites = [{ id: '10', quotes: [] }];
      (x.candidates[0] as unknown as { deciding_facts: unknown }).deciding_facts = 'miếng dán có thấm tẩm dược chất hay không';
      x.sections[3]!.markdown = 'Hàng không cần giấy phép; nếu có dược chất thì hướng về 30.05 [1].';
    });
    expect(validateWalkthrough(o, input).map((v) => [v.rule, v.detail])).toEqual([
      ['walkthrough-shape', 'output.sections[1].cites[0].id: expected integer, got string'],
      ['walkthrough-shape', 'output.candidates[0].deciding_facts: expected array, got string'],
      ['walkthrough-policy-claim', expect.stringContaining('printed by code from policyStatus')],
    ]);
    const bare = edit((x) => delete (x.sections[1] as Partial<WalkthroughSection>).cites);
    expect(rules(bare)).toEqual(['walkthrough-shape', 'walkthrough-marker-range', 'walkthrough-exclusion-support', 'walkthrough-named-source']);
  });

  it('structure: one section per key, [n] within cites, every cite marked, no [#id] or range', () => {
    expect(rules(withSection('facts', 'Hộp 10 miếng.'))).toEqual(['walkthrough-section-duplicate']);
    expect(rules(edit((o) => (o.sections[1]!.markdown = 'Chú giải 1 Chương 30 loại trừ chế phẩm này [1] [2].')))).toEqual(['walkthrough-marker-range']);
    const unused = validateWalkthrough(
      edit((o) => o.sections[1]!.cites.push({ id: 11, quotes: [] })),
      input,
    );
    expect(unused).toMatchObject([{ rule: 'walkthrough-cite-unused', citation: 11 }]);
    expect(rules(edit((o) => Object.assign(o.sections[1]!, { markdown: 'Chú giải 1 Chương 30 loại trừ chế phẩm này [1, 2].', cites: cites(10, 11) })))).toEqual([]);
    expect(rules(edit((o) => (o.sections[1]!.markdown = 'Chương này loại trừ chế phẩm không chứa dược chất [#10].')))).toEqual(['walkthrough-marker-range']);
    expect(rules(edit((o) => Object.assign(o.sections[1]!, { markdown: 'Chương này loại trừ chế phẩm không chứa dược chất [1–2].', cites: cites(10, 11) })))).toEqual([
      'walkthrough-marker-range',
    ]);
  });

  it('candidates: same set, support for phu_hop, an exclusion that bears on the heading for loai, cross-heading cites that teach, deciding facts', () => {
    expect(rules(edit((o) => o.candidates.pop()))).toContain('walkthrough-candidate-missing');
    expect(rules(edit((o) => o.candidates.push({ heading: '39.26', assessment: 'co_the_neu', deciding_facts: ['chất liệu'], cite_ids: [] })))).toEqual([
      'walkthrough-candidate-extra',
    ]);
    // A fit resting on a ruling and SEN alone is not enough; the EN beside the ruling is.
    expect(rules(edit((o) => Object.assign(o.candidates[0]!, { assessment: 'phu_hop', cite_ids: [13, 12] })))).toEqual(['walkthrough-candidate-support']);
    expect(rules(edit((o) => Object.assign(o.candidates[0]!, { assessment: 'phu_hop', cite_ids: [11, 13] })))).toEqual([]);
    // An exclusion needs a note or EN that can carry it: GRI alone, or Chapter 30's note for 38.24, does not.
    const excludedBy = (cite_ids: number[]) =>
      rules(
        edit((o) => {
          Object.assign(o.candidates[1]!, { assessment: 'loai', cite_ids });
          o.conclusion.headings = ['30.05'];
        }),
      );
    expect(excludedBy([1])).toEqual(['walkthrough-candidate-support']);
    expect(excludedBy([10])).toEqual(['walkthrough-candidate-support']);
    expect(excludedBy([21])).toEqual([]);
    // GRI and notes cross headings (an exclusion note is the lesson); a neighbour's EN does only when it names the heading.
    expect(rules(edit((o) => o.candidates[0]!.cite_ids.push(1)))).toEqual([]);
    expect(rules(edit((o) => o.candidates[0]!.cite_ids.push(21)))).toEqual([]);
    expect(validateWalkthrough(edit((o) => o.candidates[0]!.cite_ids.push(22)), input)).toMatchObject([{ rule: 'walkthrough-candidate-cite-scope', citation: 22 }]);
    const naming: ClassifyInput = {
      ...input,
      candidates: [input.candidates[0]!, { ...input.candidates[1]!, evidence: [GRI3, NOTE38, { ...EN3824, body: 'Nhóm này không gồm băng dán thuộc nhóm 30.05.' }] }],
    };
    expect(rules(edit((o) => o.candidates[0]!.cite_ids.push(22)), naming)).toEqual([]);
    expect(rules(edit((o) => (o.candidates[0]!.deciding_facts = [])))).toEqual(['walkthrough-deciding-facts']);
    // An outright exclusion by a cited binding note needs no deciding fact.
    const excluded = edit((o) => {
      Object.assign(o.candidates[1]!, { assessment: 'loai', deciding_facts: [], cite_ids: [21] });
      o.conclusion.headings = ['30.05'];
    });
    expect(rules(excluded)).toEqual([]);
    // Facts are named, not argued: at most twelve words each.
    expect(rules(edit((o) => (o.conclusion.missing_facts = ['miếng dán có thấm tẩm dược chất hay không, và nếu có thì là dược chất gì trên nhãn'])))).toEqual([
      'walkthrough-item-length',
    ]);
  });

  it('conclusion: no excluded heading; an open or empty conclusion names the missing facts or the advance ruling (R5)', () => {
    expect(rules(edit((o) => Object.assign(o.candidates[1]!, { assessment: 'loai' })))).toEqual(['walkthrough-conclusion-heading']);

    const twoOpen = edit((o) => {
      Object.assign(o.candidates[0]!, { assessment: 'phu_hop' });
      o.conclusion.missing_facts = [];
    });
    expect(rules(twoOpen)).toEqual(['walkthrough-conclusion-open']);
    twoOpen.conclusion.needs_advance_ruling = true;
    expect(rules(twoOpen)).toEqual([]);

    // Two headings that both fit is the advance-ruling case, whatever facts are listed.
    const twoFit = edit((o) => {
      Object.assign(o.candidates[0]!, { assessment: 'phu_hop' });
      Object.assign(o.candidates[1]!, { assessment: 'phu_hop' });
    });
    expect(rules(twoFit)).toEqual(['walkthrough-conclusion-open']);
    twoFit.conclusion.needs_advance_ruling = true;
    expect(rules(twoFit)).toEqual([]);

    expect(rules(edit((o) => (o.conclusion = { headings: ['30.05'], needs_advance_ruling: false, missing_facts: [] })))).toEqual(['walkthrough-conclusion-open']);
    // Abstaining is allowed, with the facts or the advance ruling that would decide it.
    const none = (c: Partial<WalkthroughOutput['conclusion']>) => rules(edit((o) => Object.assign(o, { conclusion: { ...o.conclusion, headings: [], ...c }, tariff_ref: [] })));
    expect(none({})).toEqual([]);
    expect(none({ missing_facts: [], needs_advance_ruling: true })).toEqual([]);
    expect(none({ missing_facts: [] })).toEqual(['walkthrough-conclusion-open']);
  });

  it('rate: no rate in deciding or missing facts, no rate comparison in words anywhere; tariff_ref under a concluded heading', () => {
    const o = edit((x) => {
      x.candidates[0]!.deciding_facts = ['thuế suất ưu đãi 5% khi có C/O'];
      x.conclusion.missing_facts = ['mức phạt 500.000 đồng nếu khai sai'];
    });
    expect(validateWalkthrough(o, input).map((v) => [v.rule, v.sentence])).toEqual([
      ['walkthrough-rate', 'thuế suất ưu đãi 5% khi có C/O'],
      ['walkthrough-rate', 'mức phạt 500.000 đồng nếu khai sai'],
    ]);
    expect(rules(withSection('risk', 'Thuế nhập khẩu ưu đãi thông thường khác nhau giữa các nhóm này.'))).toEqual(['walkthrough-rate']);
    expect(rules(edit((o) => (o.tariff_ref = ['3824.99.99'])))).toEqual(['walkthrough-tariff-ref']);
    expect(rules(edit((o) => (o.tariff_ref = ['3824.99.99'])), bothLines)).toEqual([]);
    expect(rules(edit((o) => Object.assign(o, { tariff_ref: ['3824.99.99'], conclusion: { ...o.conclusion, headings: ['30.05'] } })), bothLines)).toEqual([
      'walkthrough-tariff-ref',
    ]);
  });

  it('facts: no figure with a unit that neither the user nor a cited row wrote, wherever the goods are restated; masks stay masked', () => {
    const facts = (markdown: string, i: ClassifyInput = input) => rules(edit((o) => (o.sections[0]!.markdown = markdown)), i);
    expect(facts('Hộp 12 miếng, mỗi miếng 5 kg.')).toEqual(['walkthrough-fact-number']);
    expect(facts('Người dùng định khai [mã 1]; mỗi miếng 5 g, hộp 10 miếng.')).toEqual([]);
    // Candidate headings are not goods figures, and "6,5 kg" is the "6.5kg" the user wrote.
    expect(facts('Hộp nặng 6,5 kg; hàng có thể thuộc 30.05 hoặc 38.24.', { ...input, goodsFacts: `${input.goodsFacts}, nặng 6.5kg/hộp` })).toEqual([]);
    expect(rules(withSection('nature', 'Miếng dán dày 2 mm, bằng vải không dệt.'))).toEqual(['walkthrough-fact-number']);
    expect(rules(withSection('explanation', 'Máy nặng dưới 100 kg nên dễ lắp.'))).toEqual(['walkthrough-fact-number']);
    const thin: ClassifyInput = {
      ...input,
      candidates: [{ ...input.candidates[0]!, evidence: [...input.candidates[0]!.evidence, { ...EN3005, id: 16, body: 'miếng dán dày không quá 2 mm' }] }, input.candidates[1]!],
    };
    expect(rules(withSection('explanation', 'Chú giải chi tiết tính cả miếng dán dày tới 2 mm [1].', [16]), thin)).toEqual([]);
    expect(rules(withSection('explanation', 'Mã bạn nêu [mã 1] (3005.10.10) sẽ được so sau.'))).toEqual(['walkthrough-mask-expanded']);
    expect(rules(withSection('explanation', 'Mã bạn nêu [mã 1] được so sau khi xếp ứng viên.'))).toEqual([]);
  });

  it('exclusions and named sources: the heading excluded has a row bearing on it, and the kind named is the kind cited', () => {
    expect(rules(edit((o) => Object.assign(o.sections[1]!, { markdown: 'Hàng tương tự đã được xếp ngoài 38.24 [1].', cites: cites(13) })))).toEqual([
      'walkthrough-exclusion-support',
    ]);
    expect(rules(edit((o) => Object.assign(o.sections[1]!, { markdown: 'Chú giải 1 Chương 30 cũng loại 38.24 [1].', cites: cites(10) })))).toEqual([
      'walkthrough-exclusion-support',
    ]);
    expect(rules(edit((o) => Object.assign(o.sections[1]!, { markdown: 'Thông báo đã kết luận hàng như vậy [1].', cites: cites(13) })))).toEqual([
      'walkthrough-exclusion-support',
    ]);
    expect(rules(edit((o) => Object.assign(o.sections[1]!, { markdown: 'Theo Chú giải chi tiết, 30.05 không gồm hàng này [1].', cites: cites(10) })))).toEqual([
      'walkthrough-named-source',
    ]);
    expect(rules(withSection('levels', 'SEN Chương 30 tách dòng băng dán [1].', [11]))).toEqual(['walkthrough-named-source']);
    expect(rules(withSection('levels', 'SEN Chương 30 tách dòng băng dán [1].', [12]))).toEqual([]);
    expect(rules(withSection('nature', 'Hàng không phải hạt sen; quy tắc xuất xứ chỉ quyết định mẫu C/O.'))).toEqual([]);
    // The EN called plain "Chú giải" is a naming slip, and the detail offers the rename rather than a binding note.
    expect(validateWalkthrough(withSection('levels', 'Chú giải 30.05 kể cả băng dán [1].', [11]), input)).toMatchObject([
      { rule: 'walkthrough-named-source', detail: expect.stringContaining('the row cited is Chú giải chi tiết (EN)') },
    ]);
  });

  it('gir: "Quy tắc N" cites the GRI row of that rule in its paragraph, and rule 3 goes in order', () => {
    const gir = (markdown: string, ids = [1]) => rules(edit((o) => Object.assign(o.sections[2]!, { markdown, cites: cites(...ids) })));
    expect(gir('Quy tắc 3(b) xét đặc trưng cơ bản khi 3(a) không phân định được [1].')).toEqual([]);
    expect(gir('Quy tắc 6 chỉ so các phân nhóm cùng cấp [1].')).toEqual(['walkthrough-gir-rule']);
    expect(gir('GRI 1 đặt lời văn nhóm lên trước [1].')).toEqual(['walkthrough-gir-rule']);
    // A lead line, a follow-up in the cited paragraph and a rule not needed all pass.
    expect(gir('Áp quy tắc.\nTheo GIR 1, xét theo nội dung nhóm và chú giải [1]. Vì vậy Quy tắc 1 đã giải quyết xong.\n\nChưa cần tới GIR 3.', [2])).toEqual([]);
    expect(gir('Lúc đó sang GIR 3(b) [1].')).toEqual(['walkthrough-gir-order']);
  });

  it('SEN and duty: SEN conditions say they are SEN; a duty sentence borrows no classification row', () => {
    expect(rules(withSection('levels', 'Dòng thuốc đông y đòi đủ các điều kiện sau [1].', [12]))).toEqual(['walkthrough-sen-tier']);
    expect(rules(withSection('levels', 'Theo SEN, dòng thuốc đông y đòi đủ các điều kiện sau [1].', [12]))).toEqual([]);
    expect(rules(withSection('explanation', 'Có C/O mẫu D thì xét thuế ưu đãi đặc biệt, như Chú giải 1 Chương 30 nêu [1].', [10]))).toEqual(['walkthrough-duty-cite']);
    expect(rules(withSection('explanation', 'Có C/O mẫu D thì xét thuế ưu đãi đặc biệt.'))).toEqual([]);
  });

  it('lists, risk and persona: never said in prose, in any section', () => {
    expect(rules(withSection('policy', 'Hàng không phải kiểm tra chuyên ngành.'))).toEqual(['walkthrough-policy-claim']);
    expect(rules(withSection('explanation', 'Máy thuộc Phụ lục I nên phải xin giấy phép.'))).toEqual(['walkthrough-policy-claim']);
    expect(rules(withSection('risk', 'Rủi ro trung bình vì hai nhóm cùng khả dĩ.'))).toEqual(['walkthrough-risk-score']);
    expect(rules(withSection('risk', 'Hai nhóm cùng có chỗ đứng nên có thể bị xếp khác; xác định trước mã số giải quyết được.'))).toEqual([]);
    expect(rules(edit((o) => (o.sections[0]!.markdown = `Chào bạn, với tư cách chuyên gia: ${o.sections[0]!.markdown}`)))).toEqual(['walkthrough-persona']);
    expect(rules(edit((o) => (o.candidates[0]!.deciding_facts = ['đề xuất khai theo nhóm 30.05'])))).toEqual(['walkthrough-persona']);
  });

  it('ruling standing: a ruling with no căn cứ shown, as gather returns it, concluded; it did not reason', () => {
    expect(rules(withSection('explanation', 'Hải quan lập luận rằng hàng có dược chất [1].', [13]))).toEqual(['walkthrough-ruling-reasoning']);
    expect(rules(withSection('explanation', 'Thông báo kết luận miếng dán có dược chất thuộc 30.05 [1].', [13]))).toEqual([]);
    expect(rules(withSection('explanation', 'Hải quan lập luận rằng hàng có dược chất [1].', [14]))).toEqual([]);
    const bare: ClassifyInput = { ...input, candidates: [{ ...input.candidates[0]!, evidence: [...input.candidates[0]!.evidence, RULING_BARE] }, input.candidates[1]!] };
    expect(rules(withSection('explanation', 'Hải quan lập luận rằng hàng có dược chất [1].', [15]), bare)).toEqual(['walkthrough-ruling-reasoning']);
    // An unmarked sentence in a paragraph that cites only the ruling is still about the ruling.
    expect(rules(withSection('explanation', 'Thông báo xếp hàng vào 30.05 [1]. Hải quan lập luận rằng hàng có dược chất.', [15]), bare)).toEqual([
      'walkthrough-ruling-reasoning',
    ]);
  });

  it('length and markdown: brief is one message without headings, full shows no template; Zalo renders no tables or emoji', () => {
    const brief = { ...input, depth: 'brief' as const };
    const used = good().sections.reduce((n, s) => n + s.markdown.length, 0);
    expect(rules(withSection('nature', 'a'.repeat(1501 - used)), brief)).toEqual(['walkthrough-length']);
    expect(rules(withSection('nature', 'a'.repeat(1500 - used)), brief)).toEqual([]);
    expect(rules(withSection('nature', 'a'.repeat(4201 - used)))).toEqual(['walkthrough-length']);
    expect(rules(withSection('nature', 'a'.repeat(4200 - used)))).toEqual([]);
    expect(rules(withSection('nature', '## Bản chất\nHàng là miếng dán.'), brief)).toEqual(['walkthrough-brief-headings']);
    expect(rules(withSection('nature', '## Bản chất\nHàng là miếng dán.'))).toEqual(['walkthrough-template-headings']);
    expect(rules(withSection('nature', '## A\nHàng là miếng dán.\n## B\nMột.\n## C\nHai.'))).toEqual(['walkthrough-template-headings']);
    expect(rules(withSection('nature', 'Hàng là miếng dán.'))).toEqual([]);
    expect(rules(withSection('nature', '| Nhóm | Mô tả |\n| 30.05 | băng |'))).toEqual(['walkthrough-markdown-subset']);
    expect(rules(withSection('nature', '### Bản chất\nHàng là miếng dán.'))).toEqual(['walkthrough-markdown-subset']);
    expect(rules(withSection('nature', 'Hàng là miếng dán ✅'))).toEqual(['walkthrough-markdown-subset']);
  });
});

/** Verbatim in NOTE30, EN3005 and GRI1, each at least 20 characters. */
const Q10 = 'Các chế phẩm thuộc các nhóm từ 33.03 đến 33.07';
const Q11 = 'băng dán đã tráng phủ dược chất';
const Q2 = 'theo nội dung của từng nhóm';
/** The sound answer as the model sends it, with these sections and fields. */
const draft = (sections: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({ ...good(), tariff_ref: [], sections, ...extra });
const sectionsOf = (sections: unknown[]) => normalizeWalkthrough(draft(sections), input).sections;

describe('normalizeWalkthrough', () => {
  it('turns the sound answer written with [#id] into the contract every check accepts', () => {
    const sent = good().sections.map((s) => ({ key: s.key, markdown: s.markdown.replace('[1]', `[#${s.cites[0]?.id}]`) }));
    const out = normalizeWalkthrough({ ...good(), sections: sent }, input);
    expect(out).toEqual({ ...good(), tariff_ref: [] });
    expect(validateWalkthrough(out, input)).toEqual([]);
  });

  it('numbers each section from [1] by first appearance, however the model numbered across sections', () => {
    expect(
      sectionsOf([
        { key: 'exclusions', markdown: `Chương 30 không gồm "${Q10}" [#10]. Nhóm 30.05 gồm "${Q11}" [#11].` },
        { key: 'conclusion', markdown: `Nhóm 30.05 gồm "${Q11}" [#11]; Chương 30 thì loại "${Q10}" [#10].` },
      ]),
    ).toEqual([
      { key: 'exclusions', markdown: `Chương 30 không gồm "${Q10}" [1]. Nhóm 30.05 gồm "${Q11}" [2].`, cites: [{ id: 10, quotes: [Q10] }, { id: 11, quotes: [Q11] }] },
      { key: 'conclusion', markdown: `Nhóm 30.05 gồm "${Q11}" [1]; Chương 30 thì loại "${Q10}" [2].`, cites: [{ id: 11, quotes: [Q11] }, { id: 10, quotes: [Q10] }] },
    ]);
    // Old style numbered on across sections, as the G runs of 2026-09-15 were: [3] is past this section's list, so it goes
    // rather than being guessed onto the next id (R10); a guess swapped rows when the lists lined up.
    expect(
      sectionsOf([
        { key: 'candidates', markdown: `Nhóm 30.05 gồm "${Q11}" [1]. Chương 30 không gồm "${Q10}" [2].`, cite_ids: [11, 10] },
        { key: 'gir', markdown: `Quy tắc 1 xét "${Q2}" [3].`, cite_ids: [2] },
      ])[1],
    ).toEqual({ key: 'gir', markdown: `Quy tắc 1 xét "${Q2}".`, cites: [] });
    // Numbered per section with one stray [2]: the lists end to end place nothing better, so the stray goes and nothing moves.
    expect(
      sectionsOf([
        { key: 'candidates', markdown: `Nhóm 30.05 gồm "${Q11}" [1].`, cite_ids: [11] },
        { key: 'gir', markdown: `Quy tắc 1 xét "${Q2}" [1]. Còn Quy tắc 3 thì chưa cần [2].`, cite_ids: [2] },
      ])[1],
    ).toEqual({ key: 'gir', markdown: `Quy tắc 1 xét "${Q2}" [1]. Còn Quy tắc 3 thì chưa cần.`, cites: [{ id: 2, quotes: [Q2] }] });
  });

  it("keeps, for each cite, the quoted spans of its marker's own sentence that are verbatim in that row", () => {
    const [s] = sectionsOf([
      {
        key: 'exclusions',
        markdown: [
          'Chương 30 “không bao gồm: (e) Các chế phẩm” [#10].',
          'Chú giải còn nói "không bao gồm hàng dệt kim đã thấm tẩm" [#10].',
          `Nhóm 30.05 gồm "${Q11}", còn Chương 30 loại "${Q10}" [#11][#10].`,
          'Câu này chép "Chương này không bao gồm" mà không dẫn dòng nào.',
          'Chỉ "dược chất" thôi [#11].',
        ].join(' '),
      },
    ]);
    expect(s!.cites).toEqual([
      { id: 10, quotes: ['không bao gồm: (e) Các chế phẩm', Q10] },
      { id: 11, quotes: [Q11] },
    ]);
    expect(s!.markdown).toContain(`"${Q10}" [2][1].`);
  });

  it('keeps a marker no quote holds, with quotes: [], for G2 to decide', () => {
    expect(sectionsOf([{ key: 'exclusions', markdown: 'Chương 30 loại trừ chế phẩm này [#10].' }])).toEqual([
      { key: 'exclusions', markdown: 'Chương 30 loại trừ chế phẩm này [1].', cites: [{ id: 10, quotes: [] }] },
    ]);
  });

  it('never lands a marker on a row the model did not cite (R10): a bare [n] needs its row quoted, a shared phrase credits no row', () => {
    // GRI rows 1 and 2 exist: a per-section [1] [2] quoting the EN and the note is not about them.
    expect(sectionsOf([{ key: 'exclusions', markdown: `EN gồm "${Q11}" [1]. Chương 30 loại "${Q10}" [2]. Quy tắc 1 xét "${Q2}" [2].` }])).toEqual([
      { key: 'exclusions', markdown: `EN gồm "${Q11}". Chương 30 loại "${Q10}". Quy tắc 1 xét "${Q2}" [1].`, cites: [{ id: 2, quotes: [Q2] }] },
    ]);
    const twin: ClassifyInput = {
      ...input,
      candidates: [{ ...input.candidates[0]!, evidence: [...input.candidates[0]!.evidence, { ...EN3005, id: 16, body: 'Chương này không bao gồm: hàng dệt.' }] }, input.candidates[1]!],
    };
    const [s] = normalizeWalkthrough(draft([{ key: 'exclusions', markdown: 'Cả hai mở bằng "Chương này không bao gồm" và EN nói "băng dán y tế các loại" [#10][#16].' }]), twin).sections;
    expect(s!.cites).toEqual([
      { id: 10, quotes: [] },
      { id: 16, quotes: [] },
    ]);
  });

  it('reads quotes as written: "; " or ". " inside, the marker after the full stop or inside the quote, mixed marks, "…"', () => {
    const note = { ...NOTE30, body: `Chương này không bao gồm: (a) Thực phẩm; (e) ${Q10}. Chú giải 2. Theo mục đích của nhóm 30.02 thì khác.` };
    const i: ClassifyInput = { ...input, candidates: [{ ...input.candidates[0]!, evidence: [GRI3, GRI1, note, EN3005] }, input.candidates[1]!] };
    const cases: Array<[string, string[]]> = [
      ['Chú giải ghi "(a) Thực phẩm; (e) Các chế phẩm thuộc các nhóm" [#10].', ['(a) Thực phẩm; (e) Các chế phẩm thuộc các nhóm']],
      [`Chú giải ghi "${Q10}. Chú giải 2. Theo mục đích" [#10].`, [`${Q10}. Chú giải 2. Theo mục đích`]],
      [`Chú giải loại "${Q10}". [#10]`, [Q10]],
      [`Chú giải loại "${Q10} [#10]".`, [Q10]],
      [`Chú giải loại “${Q10}" [#10].`, [Q10]],
      ['Chú giải ghi "Chương này không bao gồm: … (e) Các chế phẩm thuộc các nhóm" [#10].', ['Chương này không bao gồm:', '(e) Các chế phẩm thuộc các nhóm']],
    ];
    for (const [markdown, quotes] of cases)
      expect([markdown, normalizeWalkthrough(draft([{ key: 'exclusions', markdown }]), i).sections[0]!.cites]).toEqual([markdown, [{ id: 10, quotes }]]);
  });

  it('drops a marker naming a row not given for this answer and never moves it onto another; list rows stay citable', () => {
    expect(
      sectionsOf([
        { key: 'exclusions', markdown: `Hàng dệt kim thì khác [#999]. Chương 30 không gồm "${Q10}" [#999, #10]. Bảng máy cũ [#31].` },
        { key: 'risk', markdown: ' [#998] ' },
      ]),
    ).toEqual([
      { key: 'exclusions', markdown: `Hàng dệt kim thì khác. Chương 30 không gồm "${Q10}" [1]. Bảng máy cũ [2].`, cites: [{ id: 10, quotes: [Q10] }, { id: 31, quotes: [] }] },
    ]);
    expect(sectionsOf([{ key: 'exclusions', markdown: 'Hàng dệt kim thì khác [1]. Chương 30 loại trừ chế phẩm này [2].', cite_ids: [999, 10] }])).toEqual([
      { key: 'exclusions', markdown: 'Hàng dệt kim thì khác. Chương 30 loại trừ chế phẩm này [1].', cites: [{ id: 10, quotes: [] }] },
    ]);
  });

  it('reads an old-style [n] against cite_ids, coerced, and merges a quotes map under the same body check', () => {
    expect(
      sectionsOf([
        {
          key: 'exclusions',
          markdown: 'Chương 30 loại trừ chế phẩm này [1]; nhóm 30.05 gồm băng dán [2].',
          cite_ids: ['10', 11],
          quotes: { 10: [Q10, 'hàng dệt kim đã thấm tẩm dược chất'], 11: Q11, 2: [Q2] },
        },
      ]),
    ).toEqual([
      { key: 'exclusions', markdown: 'Chương 30 loại trừ chế phẩm này [1]; nhóm 30.05 gồm băng dán [2].', cites: [{ id: 10, quotes: [Q10] }, { id: 11, quotes: [Q11] }] },
    ]);
  });

  it('reads [# id], lists, and a bare evidence id its sentence quotes as the ids they name; a bare number naming no row goes, masks stay', () => {
    expect(sectionsOf([{ key: 'exclusions', markdown: `Một [#10, #11]. Hai [# 10][#11]. Ba "${Q10}" [10, 11]. Bốn [3]. Mã [mã 1] để hệ thống so.` }])).toEqual([
      { key: 'exclusions', markdown: `Một [1][2]. Hai [1][2]. Ba "${Q10}" [1]. Bốn. Mã [mã 1] để hệ thống so.`, cites: [{ id: 10, quotes: [Q10] }, { id: 11, quotes: [] }] },
    ]);
  });

  it('tariff_ref: [] exactly when the prompt printed no DÒNG THUẾ; otherwise only given lines, dotted and deduped', () => {
    const tariff_ref = ['3005.10.10', '30051010', '3919.90.99', '3824.99.99'];
    for (const i of [input, bothLines, { ...input, tariffLines: [] }])
      expect(normalizeWalkthrough(draft([], { tariff_ref }), i).tariff_ref.length > 0).toBe(buildWalkthroughPrompt(i).includes('\nDÒNG THUẾ ('));
    expect(normalizeWalkthrough(draft([], { tariff_ref }), bothLines).tariff_ref).toEqual(['3005.10.10', '3824.99.99']);
  });

  it("dots codes with guards' dotted: 8 digits as before; a 4- or 6-digit code, which DB checks keep out of LINES and DÒNG THUẾ, now dots as verify's anchors do", () => {
    // Before the swap the local helper dotted 8 digits only and printed "3005" and "300510" as written.
    const short: ClassifyInput = {
      ...input,
      candidates: [{ ...input.candidates[0]!, lines: [{ code: '3005', path: 'a' }, { code: '300510', path: 'b' }, { code: '30051010', path: 'c' }] }],
      tariffLines: [{ code: '300510', line: 'x' }],
    };
    const p = buildWalkthroughPrompt(short);
    for (const l of ['- 30.05 · a', '- 3005.10 · b', '- 3005.10.10 · c', '- 3005.10: x']) expect(p).toContain(l);
    const out = normalizeWalkthrough(draft([], { tariff_ref: ['3005.10', '300510', '3005.10.10'] }), short);
    expect(out.tariff_ref).toEqual(['3005.10']);
    expect(normalizeWalkthrough(out, short).tariff_ref).toEqual(['3005.10']);
  });

  it('keeps candidates to given ids, deduped in order, drops empty sections, leaves the draft alone and reads its own output back unchanged', () => {
    const raw = draft(
      [
        { key: 'facts', markdown: '  ' },
        { key: 'exclusions', markdown: `Chương 30 không gồm "${Q10}" [1] [#11].`, cite_ids: [10], quotes: { 11: [Q11] } },
      ],
      { candidates: [{ heading: '30.05', assessment: 'co_the_neu', deciding_facts: 'dược chất', cite_ids: [21, '1', 999, 21, 30] }], tariff_ref: ['3005.10.10'] },
    );
    const before = structuredClone(raw);
    const once = normalizeWalkthrough(raw, input);
    expect(raw).toEqual(before);
    expect(once).toEqual({
      sections: [{ key: 'exclusions', markdown: `Chương 30 không gồm "${Q10}" [1] [2].`, cites: [{ id: 10, quotes: [Q10] }, { id: 11, quotes: [Q11] }] }],
      candidates: [{ heading: '30.05', assessment: 'co_the_neu', deciding_facts: ['dược chất'], cite_ids: [21, 1, 30] }],
      conclusion: good().conclusion,
      tariff_ref: [],
    });
    expect(normalizeWalkthrough(once, input)).toEqual(once);
    expect(normalizeWalkthrough(JSON.parse(JSON.stringify(once)), input)).toEqual(once);
  });
});

/** Saved dry runs of 2026-09-15 (claude envelope + fixture), kept outside the repo: set WALKTHROUGH_RUNS to their folder. */
const RUNS = process.env.WALKTHROUGH_RUNS ?? '';
(RUNS && existsSync(`${RUNS}/out/G-crimper.json`) ? describe : describe.skip)('normalizeWalkthrough on the saved G runs', () => {
  it.each([
    ['crimper', 'G-crimper'],
    ['moxa-right', 'G-moxa-right'],
    ['moxa-wrong-dropped', 'G-moxa-wrong-dropped'],
  ])('%s: no marker-range, cite-unused or tariff-ref left, and idempotent', (fixture, run) => {
    const i = JSON.parse(readFileSync(`${RUNS}/${fixture}.json`, 'utf8')) as ClassifyInput;
    const { raw } = JSON.parse(readFileSync(`${RUNS}/out/${run}.json`, 'utf8')) as { raw: string };
    const out = normalizeWalkthrough(looseJson((JSON.parse(raw) as { result: string }).result), i);
    expect(validateWalkthrough(out, i).filter((v) => /marker-range|cite-unused|tariff-ref/.test(v.rule))).toEqual([]);
    expect(normalizeWalkthrough(out, i)).toEqual(out);
  });
});

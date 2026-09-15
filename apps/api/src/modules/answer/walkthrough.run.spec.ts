import type { Source } from '../legal/legal.service';
import type { Source as GuardSource, VerifyContext } from './guards';
import type { PolicyList } from './policy';
import type { EvidenceRow, WalkthroughOutput } from './types';
import { buildWalkthroughPrompt, normalizeWalkthrough, validateWalkthrough } from './walkthrough';
import {
  applyRepair,
  candidateHeadings,
  classifyInput,
  cutSentences,
  evidenceRow,
  flatten,
  type HeadingLines,
  policyBlock,
  repairItems,
  SECTION_TITLES,
  verifySections,
} from './walkthrough.run';

// Every message below is written for the test; none is a real user's.

const source = (
  id: number,
  o: { kind?: string; label: string; body: string; heading?: string | null; chapter?: number | null; authority?: string; meta?: Record<string, unknown> },
): Source =>
  ({
    key: `e:${id}`,
    label: o.label,
    note: null,
    text: o.body,
    body: o.body,
    hs: { heading: o.heading ?? null, chapter: o.chapter ?? null, codes: [] },
    meta: { ...(o.authority ? { authority: o.authority } : {}), ...(o.meta ?? {}) },
    citation: {
      documentNumber: '31/2022/TT-BTC',
      documentTitle: o.label,
      articleLabel: o.label,
      provisionLabel: o.label,
      verbatimText: o.body,
      path: o.label,
      effectiveness: 'con_hieu_luc',
      effectiveFrom: null,
      effectiveTo: null,
      gazetteUrl: null,
      verification: 'verified',
      kind: o.kind ?? 'en',
      instrument: '31/2022/TT-BTC',
      note: null,
      expired: null,
    },
  }) as unknown as Source;

const EN_QUOTE = 'đã được thấm tẩm hoặc tráng phủ dược chất dùng cho y tế';
const NOTE_QUOTE = 'Chương này không bao gồm các chế phẩm thuộc các nhóm từ 33.03 đến 33.07';
const EN3005 = source(1, {
  heading: '30.05',
  label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05',
  body: `Nhóm này bao gồm bông, gạc, băng và các sản phẩm tương tự, ${EN_QUOTE}.`,
});
const NOTE30 = source(2, { kind: 'hs_note', chapter: 30, authority: 'binding', label: 'Chú giải Chương 30', body: `${NOTE_QUOTE}.` });
const EN3824 = source(3, {
  heading: '38.24',
  label: 'Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24',
  body: 'Nhóm này bao gồm các sản phẩm và chế phẩm hóa học chưa được chi tiết hoặc ghi ở nơi khác.',
});
const ANNEX = source(4, {
  kind: 'annex_table',
  authority: 'binding',
  label: '36/2026/TT-BKHCN — Phụ lục I',
  body: 'STT | Tên hàng | Mã số HS\n1 | Băng dán y tế | 3005.10.10',
  meta: { document_number: '36/2026/TT-BKHCN', anchor: 'Phụ lục I', hs_codes: ['3005.10.10'] },
});
const SOURCES = [EN3005, NOTE30, EN3824, ANNEX];

const HEAD_3005 = 'Bông, gạc, băng và các sản phẩm tương tự';
const HEAD_3824 = 'Chất gắn đã điều chế; các sản phẩm và chế phẩm hóa học';
const HEADINGS: HeadingLines[] = [
  {
    heading: '30.05',
    headingText: HEAD_3005,
    lines: [
      { code: '30051010', path: `${HEAD_3005} › Băng dán › Đã tráng phủ` },
      { code: '30059090', path: `${HEAD_3005} › Loại khác › Loại khác` },
    ],
  },
  { heading: '38.24', headingText: HEAD_3824, lines: [{ code: '38249999', path: `${HEAD_3824} › Loại khác` }] },
];

const input = classifyInput({
  question: 'Miếng dán bàn chân ngải cứu, mình định khai [mã 1], được không?',
  goodsFacts: 'miếng dán bàn chân, thành phần ngải cứu',
  depth: 'full',
  asOf: '2026-09-15',
  headings: HEADINGS,
  sources: SOURCES,
  tariffLines: [],
});

const guardsOf = (list: Source[]): GuardSource[] =>
  list.map((s) => ({
    kind: s.citation.kind ?? 'provision',
    label: s.label,
    body: s.body,
    hsHeading: s.hs.heading,
    hsCodes: s.hs.codes,
    documentNumber: s.citation.documentNumber,
    expired: null,
  }));
const guardSources = guardsOf(SOURCES);

const ctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  userText: 'miếng dán bàn chân ngải cứu, mã 3005.10.10 có phù hợp không',
  codeRole: 'premise',
  userCodes: ['3005.10.10'],
  headings: new Set(['30.05', '38.24']),
  ...over,
});
/** What the runner passes: the headings and the lines it printed in the prompt from hs_description. */
const ANCHORS = [...HEADINGS.map((h) => h.heading), ...HEADINGS.flatMap((h) => h.lines.map((l) => l.code))];

const section = (key: string, markdown: string, cites: Array<{ id: number; quotes: string[] }> = []) => ({ key, markdown, cites }) as WalkthroughOutput['sections'][number];

/** A walkthrough as the model writes one: most sentences name a candidate heading, only some of them inside a quote. */
const walked = (): WalkthroughOutput => ({
  sections: [
    section('facts', 'Bạn mới mô tả miếng dán bàn chân có thành phần ngải cứu, chưa nói có tẩm dược chất hay không.'),
    section('candidates', `Nhóm 30.05 gồm sản phẩm "${EN_QUOTE}" [1]. Còn nhóm 38.24 là nhóm quét của chương 38 [2].`, [
      { id: 1, quotes: [EN_QUOTE] },
      { id: 3, quotes: ['các sản phẩm và chế phẩm hóa học chưa được chi tiết hoặc ghi ở nơi khác'] },
    ]),
    section('exclusions', `Chú giải Chương 30 ghi "${NOTE_QUOTE}" [1], nên miếng dán chăm sóc bàn chân dễ rơi ra khỏi nhóm 30.05.`, [{ id: 2, quotes: [NOTE_QUOTE] }]),
    section('levels', 'Trong nhóm 30.05 thì phân nhóm 3005.10 dành cho loại có lớp dính [1].', [{ id: 1, quotes: [EN_QUOTE] }]),
    section('conclusion', 'Mình để mở giữa 30.05 và 38.24 cho tới khi biết nhãn ghi công dụng gì.'),
  ],
  candidates: [
    { heading: '30.05', assessment: 'co_the_neu', deciding_facts: ['có tẩm dược chất hay không'], cite_ids: [1] },
    { heading: '38.24', assessment: 'chua_du_du_kien', deciding_facts: ['thành phần lớp ngải cứu'], cite_ids: [3] },
  ],
  conclusion: { headings: ['30.05', '38.24'], needs_advance_ruling: false, missing_facts: ['công dụng ghi trên nhãn'] },
  tariff_ref: [],
});

describe('classifyInput — what the walkthrough prompt may see', () => {
  it('numbers every gathered source by its own place, gives a note to every chapter it belongs to, and keeps the rest citable', () => {
    expect(input.candidates.map((c) => [c.heading, c.evidence.map((r) => r.id)])).toEqual([
      ['30.05', [1, 2]],
      ['38.24', [3]],
    ]);
    // A row no candidate block prints stays in policyRows, so a marker naming it is not re-pointed onto another row (R10).
    expect(input.policyRows.map((r) => r.id)).toEqual([4]);
    expect(input.candidates[0]!.evidence[0]).toMatchObject({ id: 1, kind: 'en', authority: 'authoritative', title: EN3005.label });
    // Standing comes from the data where retrieve set it, from the kind only where it did not.
    expect(evidenceRow(NOTE30, 1, '2026-09-15').authority).toBe('binding');
    // Where the two disagree the data wins: 'sen' alone would be 'authoritative' (AUTHORITY_BY_KIND), the row says otherwise.
    expect(evidenceRow(source(9, { kind: 'sen', label: 'SEN 2022', body: 'x', authority: 'reference' }), 8, '2026-09-15')).toMatchObject({
      id: 9,
      authority: 'reference',
      window: 'current',
    });
  });

  it('the prompt built from it carries the LINES and both headings, and no heading is a candidate without lines', () => {
    const prompt = buildWalkthroughPrompt(input);
    expect(prompt).toContain('- 3005.10.10 · Băng dán › Đã tráng phủ');
    expect(prompt).toContain('NHÓM 38.24');
    expect(candidateHeadings(['30.05', '99.99'], SOURCES, new Set(['30.05', '38.24']))).toEqual(['30.05', '38.24']);
    // Pinned first, then whatever a classifying row came back under; an annex table names no candidate on its own.
    expect(candidateHeadings([], [ANNEX], new Set(['30.05']))).toEqual([]);
    expect(candidateHeadings(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [], new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']))).toHaveLength(6);
  });
});

describe('verifySections — the shared guards over the walkthrough', () => {
  it('G3: without the candidate headings as anchors, every sentence naming one outside a quote is cut', () => {
    const bare = verifySections(walked(), guardSources, ctx());
    const held = verifySections(walked(), guardSources, ctx({ anchors: ANCHORS }));
    // The measurement this wiring exists to fix: a heading the runner itself printed reads as an ungrounded figure. What
    // survives without anchors is what an Explanatory Note's own label happens to name ("… · nhóm 30.05"); a sentence resting
    // on a Chú giải, or naming a subheading, has no such luck. Six sentences, two gone — 33% here, 42% on the real corpus.
    expect([bare.said, bare.cut]).toEqual([6, 2]);
    expect(bare.violations.filter((v) => v.rule === 'G3').map((v) => v.sentence)).toEqual([
      `Chú giải Chương 30 ghi "${NOTE_QUOTE}" [1], nên miếng dán chăm sóc bàn chân dễ rơi ra khỏi nhóm 30.05.`,
      'Trong nhóm 30.05 thì phân nhóm 3005.10 dành cho loại có lớp dính [1].',
    ]);
    expect(held.cut).toBe(0);
    expect(held.violations.filter((v) => v.rule === 'G3')).toEqual([]);
    expect(held.sections.map((s) => s.key)).toEqual(['facts', 'candidates', 'exclusions', 'levels', 'conclusion']);
    // Anchors are not a blanket pass: a heading the runner never printed still needs a quote.
    const stray = walked();
    stray.sections[0]!.markdown = 'Miếng dán này có thể còn phải so với nhóm 39.26.';
    expect(verifySections(stray, guardSources, ctx({ anchors: ANCHORS })).violations).toEqual([expect.objectContaining({ rule: 'G3' })]);
  });

  it('numbers the surviving citations once across the answer and rebuilds each section from what verify() kept', () => {
    const out = verifySections(walked(), guardSources, ctx({ anchors: ANCHORS }));
    // [1] of "candidates" is evidence 1, [2] is evidence 3, and "exclusions" cites evidence 2: three sources, in first use.
    expect(out.citations).toEqual([
      { n: 1, source: 0, quotes: [EN_QUOTE] },
      { n: 2, source: 2, quotes: ['các sản phẩm và chế phẩm hóa học chưa được chi tiết hoặc ghi ở nơi khác'] },
      { n: 3, source: 1, quotes: [NOTE_QUOTE] },
    ]);
    expect(out.sections[1]!.markdown).toContain('[1].');
    expect(out.sections[1]!.markdown).toContain('chương 38 [2].');
    expect(out.sections[2]!.markdown).toContain(`"${NOTE_QUOTE}" [3]`);
  });

  it('a quote no body holds loses its citation, and the marker goes with it (G2, R10)', () => {
    const made = walked();
    made.sections[1] = section('candidates', 'Nhóm 30.05 gồm sản phẩm "miếng dán chân bằng thảo dược" [1].', [{ id: 1, quotes: ['miếng dán chân bằng thảo dược'] }]);
    const out = verifySections(made, guardSources, ctx({ anchors: ANCHORS }));
    expect(out.violations.some((v) => v.rule === 'G2')).toBe(true);
    // The sentence's only support was made up, so it goes and its section with it; the rest of the answer stands.
    expect(out.sections.map((s) => s.key)).toEqual(['facts', 'exclusions', 'levels', 'conclusion']);
    expect(out.citations.map((c) => c.source)).toEqual([1, 0]);
  });

  it('a policy section the model returned never reaches the reply: that title is the code block\'s (R12, R18)', () => {
    const w = walked();
    w.sections.push(section('policy', 'Mặt hàng này cần công bố hợp quy trước khi thông quan.'));
    const out = verifySections(w, guardSources, ctx({ anchors: ANCHORS }));
    expect(out.sections.map((s) => s.key)).not.toContain('policy');
    const md = flatten(out.sections, 'Mã **3005.10.10** (ứng viên, chưa chốt):\n- Kho **chưa nạp** nên mình chưa kiểm tra được: 36/2026/TT-BKHCN');
    expect(md).not.toContain('công bố hợp quy');
    expect(md.match(/## CHÍNH SÁCH CHUYÊN NGÀNH/g)).toHaveLength(1);
  });

  it('two paragraphs under one key are both verified and joined, the second renumbered onto the answer (the prompt tags paragraphs)', () => {
    const CHEM = 'các sản phẩm và chế phẩm hóa học chưa được chi tiết hoặc ghi ở nơi khác';
    const w = walked();
    w.sections.push(section('candidates', `Nhóm 38.24 là nhóm quét cuối chương, gồm "${CHEM}" [1].`, [{ id: 3, quotes: [CHEM] }]));
    const out = verifySections(w, guardSources, ctx({ anchors: ANCHORS }));
    expect(out.sections.map((s) => s.key)).toEqual(['facts', 'candidates', 'exclusions', 'levels', 'conclusion']);
    // Both paragraphs under the one title, and the second section's own [1] is evidence 3, already the answer's [2].
    expect(out.sections[1]!.markdown.split('\n\n')).toHaveLength(2);
    expect(out.sections[1]!.markdown).toContain(`"${CHEM}" [2].`);
    // Counted, so a §4.1 cut of the second paragraph is not invisible: six sentences before, seven now.
    expect(out.said).toBe(7);
  });

  it('prose that survives marking nothing still lists the evidence the answer quoted, as compose does', () => {
    const w = walked();
    w.sections = [
      section('facts', 'Bạn mới mô tả miếng dán bàn chân có thành phần ngải cứu.', [{ id: 1, quotes: [EN_QUOTE] }]),
      section('conclusion', 'Mình để mở giữa 30.05 và 38.24 cho tới khi biết nhãn ghi công dụng gì.'),
    ];
    const out = verifySections(w, guardSources, ctx({ anchors: ANCHORS }));
    expect(out.sections.map((s) => s.key)).toEqual(['facts', 'conclusion']);
    expect(out.citations).toEqual([{ n: 1, source: 0, quotes: [EN_QUOTE] }]);
  });

  it('an unmarked sentence is read against every quote the whole answer holds of a row, not only the last section\'s', () => {
    const RULING = source(5, {
      kind: 'ruling',
      label: 'TB 1234/TB-TCHQ',
      body: 'Mẫu lưu trong 30 ngày kể từ ngày thông quan; hồ sơ kỹ thuật kèm theo phải còn nguyên bao bì.',
    });
    const Q1 = 'Mẫu lưu trong 30 ngày kể từ ngày thông quan';
    const Q2 = 'hồ sơ kỹ thuật kèm theo phải còn nguyên bao bì';
    const w = walked();
    w.sections = [
      // Unmarked, so it is read against the answer's quotes: "30 ngày" is a fact only Q1 holds.
      section('facts', 'Mẫu của lô này được lưu 30 ngày theo hướng dẫn.'),
      section('candidates', `Văn bản đã kết luận "${Q1}" [1].`, [{ id: 5, quotes: [Q1] }]),
      section('conclusion', `Hồ sơ đi kèm thì "${Q2}" [1].`, [{ id: 5, quotes: [Q2] }]),
    ];
    const out = verifySections(w, guardsOf([...SOURCES, RULING]), ctx({ anchors: ANCHORS }));
    expect([out.cut, out.sections.map((s) => s.key)]).toEqual([0, ['facts', 'candidates', 'conclusion']]);
  });

  it('the answer losing its own first sentence is reported, so the runner drops the prose as compose does (§4.1)', () => {
    const bad = walked();
    bad.sections[0] = section('facts', 'Thuế nhập khẩu của nhóm này là 8%.');
    expect(verifySections(bad, guardSources, ctx({ anchors: ANCHORS })).firstCut).toBe(true);
    expect(verifySections(walked(), guardSources, ctx({ anchors: ANCHORS })).firstCut).toBe(false);
  });
});

describe('repairItems / applyRepair', () => {
  it('carries the violating sentence with the quotes its own markers hold, and puts the rewrite back in its section', () => {
    const out = walked();
    out.sections[3] = section('levels', 'Trong nhóm 30.05 thì thuế suất là 8% [1].', [{ id: 1, quotes: [EN_QUOTE, 'không có trong thân'] }]);
    const checked = verifySections(out, guardSources, ctx({ anchors: ANCHORS }));
    const items = repairItems(out, guardSources, checked.violations);
    expect(items).toEqual([{ sentence: 'Trong nhóm 30.05 thì thuế suất là 8% [1].', rule: expect.stringContaining('G1'), quotes: [EN_QUOTE] }]);
    const fixed = applyRepair(out, items, ['Trong nhóm 30.05 thì loại có lớp dính tách riêng [1].']);
    expect(fixed.sections[3]!.markdown).toBe('Trong nhóm 30.05 thì loại có lớp dính tách riêng [1].');
    // A rewrite the model gave up on is left where it stands, for the next verify() to cut.
    expect(applyRepair(out, items, [''])).toEqual(out);
  });

  it('a deciding fact that is a fragment of prose is no repair item: the rewrite would be spliced mid-sentence', () => {
    const w = walked();
    const fragment = `Chú giải Chương 30 ghi "${NOTE_QUOTE}" [1], nên miếng dán chăm sóc bàn chân`;
    w.candidates[0]!.deciding_facts = [fragment];
    expect(repairItems(w, guardSources, validateWalkthrough(w, input))).toEqual([]);
  });
});

describe('cutSentences — the section checks take out what they still name', () => {
  it('a deciding fact that is a fragment of prose is not deleted from it: the cut takes whole sentences', () => {
    const w = walked();
    const fragment = `Chú giải Chương 30 ghi "${NOTE_QUOTE}" [1], nên miếng dán chăm sóc bàn chân`;
    w.candidates[0]!.deciding_facts = [fragment];
    const gone = new Set(validateWalkthrough(w, input).flatMap((v) => (v.sentence ? [v.sentence] : [])));
    // The over-long item is named, so it would have been deleted by substring from the exclusions sentence it opens.
    expect([...gone]).toEqual([fragment]);
    expect(cutSentences(w, gone).sections[2]!.markdown).toBe(walked().sections[2]!.markdown);
  });

  it('a banned sentence written in NFD is still the sentence the cut deletes (the checks read NFC)', () => {
    const banned = 'Đây là trường hợp rủi ro thấp cho lô hàng này.';
    for (const form of ['NFC', 'NFD'] as const) {
      const draft = {
        sections: [{ key: 'risk', markdown: banned.normalize(form) }],
        candidates: [],
        conclusion: { headings: [], needs_advance_ruling: true, missing_facts: [] },
        tariff_ref: [],
      };
      const out = normalizeWalkthrough(draft, input);
      const gone = new Set(validateWalkthrough(out, input).flatMap((v) => (v.sentence ? [v.sentence] : [])));
      expect(cutSentences(out, gone).sections[0]!.markdown).toBe('');
    }
  });
});

describe('policyBlock — printed by code, never by the model', () => {
  const list = (over: Partial<PolicyList>): PolicyList =>
    ({
      id: 'x',
      instrument: '36/2026/TT-BKHCN',
      annex_anchor: 'Phụ lục I',
      ministry: 'Bộ KHCN',
      subject: 'rủi ro cao',
      authority: 'binding',
      effective_from: '2026-01-01',
      effective_to: null,
      validity_verified: true,
      loaded: { kind: 'annex_table', document_number: '36/2026/TT-BKHCN', source_hint: '' },
      granularity: [8],
      exact_only: false,
      qualifier_heavy: false,
      applies_when: null,
      note: '',
      ...over,
    }) as PolicyList;
  const rows: EvidenceRow[] = [evidenceRow(ANNEX, 3, '2026-09-15')];

  it('a listing prints its entry verbatim; a list the corpus has not loaded reads "chưa nạp", never "Không" (R3, R12, R18)', () => {
    const registry = [
      list({}),
      list({ id: 'gone', instrument: '11/2024/TT-BTTTT', annex_anchor: null, loaded: null }),
      list({ id: 'empty', instrument: '27/2026/TT-BNNMT', annex_anchor: null, loaded: { kind: 'annex_table', document_number: '27/2026/TT-BNNMT', source_hint: '' } }),
      list({
        id: 'doubt',
        instrument: '33/2026/TT-BCT',
        annex_anchor: null,
        validity_verified: false,
        loaded: { kind: 'annex_table', document_number: '33/2026/TT-BCT', source_hint: '' },
      }),
    ];
    const block = policyBlock(registry, rows, ['30051010'], '2026-09-15');
    // Whether a list is loaded does not depend on the code, so those two groups are gathered across the candidates and
    // said once, after them: per candidate they repeated the same twenty names and buried the findings (2026-09-15).
    expect(block.split('\n').filter(Boolean)).toEqual([
      'Mã **3005.10.10** (ứng viên, chưa chốt):',
      '- **36/2026/TT-BKHCN Phụ lục I**: có tên trong danh mục — "1 | Băng dán y tế | 3005.10.10"',
      '- Không có tên trong danh mục đã nạp: 27/2026/TT-BNNMT',
      'Còn 2 danh mục mình **chưa kiểm tra được** (kho chưa nạp, hoặc chưa chắc đã lấy đủ dòng): 11/2024/TT-BTTTT, 33/2026/TT-BCT — cần thì bạn nhắn tên danh mục, mình tra riêng.',
    ]);
    // Two candidates, one caveat: the unchecked lists are named once for the whole answer, not once per code.
    const two = policyBlock(registry, rows, ['30051010', '84818099'], '2026-09-15');
    expect(two.match(/chưa kiểm tra được/g)).toHaveLength(1);
    // "Không" is only ever said about a list that is loaded: an unloaded one is never folded into that line.
    expect(block).not.toMatch(/Không có tên[^\n]*11\/2024/);
    expect(policyBlock(registry, rows, [], '2026-09-15')).toBe('');
    expect(policyBlock(registry, rows, ['30.05'], 'hôm nay')).toBe('');
  });

  it('the unchecked-list caveat counts them all and names only the first six', () => {
    const doubt = Array.from({ length: 8 }, (_, i) =>
      list({ id: `d${i}`, instrument: `${10 + i}/2026/TT-BCT`, annex_anchor: null, validity_verified: false, loaded: { kind: 'annex_table', document_number: `${10 + i}/2026/TT-BCT`, source_hint: '' } }),
    );
    const line = policyBlock(doubt, rows, ['30051010'], '2026-09-15').split('\n').filter(Boolean).at(-1)!;
    // The count is of every list left unchecked, not of the six named: a silent drop reads as if six were the registry.
    expect(line.startsWith('Còn 8 danh mục mình **chưa kiểm tra được**')).toBe(true);
    expect(line).toContain('10/2026/TT-BCT, 11/2026/TT-BCT, 12/2026/TT-BCT, 13/2026/TT-BCT, 14/2026/TT-BCT, 15/2026/TT-BCT và 2 danh mục khác');
  });
});

describe('flatten — the sectioned report of the owner sample', () => {
  it('prints his titles in his order, the policy block among them, in the markdown md() renders', () => {
    const out = verifySections(walked(), guardSources, ctx({ anchors: ANCHORS }));
    const md = flatten(out.sections, 'Mã **3005.10.10** (ứng viên, chưa chốt):\n- Kho **chưa nạp** nên mình chưa kiểm tra được: 11/2024/TT-BTTTT');
    expect(md.split('\n').filter((l) => l.startsWith('#'))).toEqual([
      `## ${SECTION_TITLES.facts}`,
      `## ${SECTION_TITLES.candidates}`,
      `## ${SECTION_TITLES.exclusions}`,
      `## ${SECTION_TITLES.levels}`,
      `## ${SECTION_TITLES.policy}`,
      `## ${SECTION_TITLES.conclusion}`,
    ]);
    // md() renders "## ", "- ", "**…**" and nothing else: no table, no HTML, no heading of another depth.
    expect(md).not.toMatch(/^\s*\|.*\|\s*$|<\/?[a-z][^>]*>|^\s*(?:#|#{3,})\s/m);
    expect(flatten([], '')).toBe('');
  });

  it('the owner section titles are his, key by key (agreed 2026-09-15)', () => {
    expect(SECTION_TITLES).toEqual({
      facts: 'I. THÔNG TIN HÀNG HÓA',
      nature: 'II.1 Xác định bản chất hàng hóa',
      candidates: 'II.2 Xem xét các nhóm có khả năng áp dụng',
      exclusions: 'II.3 Loại trừ các nhóm không phù hợp',
      gir: 'II.4 Áp dụng quy tắc GIR',
      levels: 'II.5 Kết luận mã HS đề xuất',
      explanation: 'II.6 Giải thích lựa chọn mã',
      policy: 'CHÍNH SÁCH CHUYÊN NGÀNH',
      risk: 'ĐÁNH GIÁ RỦI RO HẢI QUAN',
      conclusion: 'KẾT LUẬN CUỐI CÙNG',
    });
  });

  it('a heading the model opened a section with keeps its words, not its "## ": the title above it is the heading', () => {
    const md = flatten([{ key: 'conclusion', markdown: '## Chốt lại\nMình để mở giữa hai nhóm.' }], '');
    expect(md).toContain('\nChốt lại\n');
    const lines = md.split('\n');
    expect(lines.some((l, i) => /^#{1,3}\s/.test(l) && /^#{1,3}\s/.test(lines[i + 1] ?? ''))).toBe(false);
  });
});

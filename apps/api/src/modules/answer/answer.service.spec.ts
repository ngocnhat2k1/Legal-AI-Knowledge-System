import { Logger } from '@nestjs/common';

import { AUTHORITY_NOTE, type DocScope, type GatherOpts, type Source } from '../legal/legal.service';
import type { TariffResponse } from '../tariff/tariff.types';
import { type AnswerRequest, AnswerService } from './answer.service';
import type { ClaudeOpts } from './claude';
import { SYSTEM } from './compose';
import { userCodesIn } from './guards';
import { PLAN_SYSTEM } from './plan';
import { CUT_ALL, SECTION_TITLES, WALKTHROUGH_SYSTEM } from './walkthrough.run';

// Every message below is written for the test; none is a real user's.

const source = (
  id: number,
  o: { kind?: string; label: string; body: string; heading?: string | null; note?: string | null; expired?: string | null; documentNumber?: string },
): Source => ({
  key: `e:${id}`,
  label: o.label,
  note: [o.expired, o.note].filter(Boolean).join(' · ') || null,
  text: o.body,
  body: o.body,
  hs: { heading: o.heading ?? null, chapter: null, codes: [] },
  meta: {},
  citation: {
    documentNumber: o.documentNumber ?? 'CV 1810/TCHQ-TXNK',
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
    instrument: o.documentNumber ?? 'CV 1810/TCHQ-TXNK',
    note: o.note ?? null,
    expired: o.expired ?? null,
  },
});

interface Fakes {
  plan?: object;
  drafts?: object[];
  /** What the classification walkthrough returns (hs mode). */
  walks?: object[];
  repairs?: object[];
  sources?: Source[];
  scope?: Partial<DocScope>;
  tariff?: TariffResponse;
  lines?: Array<{ prefix: string; heading: string }>;
  /** hs_description rows the walkthrough's LINES are built from. */
  hsRows?: Array<{ hs_code: string; heading: string; path: string }>;
}

function setup(f: Fakes = {}) {
  const drafts = [...(f.drafts ?? [])];
  const walks = [...(f.walks ?? [])];
  const repairs = [...(f.repairs ?? [])];
  const run = jest.fn(async (_prompt: string, opts: ClaudeOpts) => {
    const reply =
      opts.systemPrompt === PLAN_SYSTEM
        ? f.plan
        : opts.systemPrompt === WALKTHROUGH_SYSTEM
          ? walks.shift()
          : opts.systemPrompt === SYSTEM
            ? drafts.shift()
            : repairs.shift();
    return reply ? { text: JSON.stringify(reply), isError: false, durationMs: 1 } : null;
  });
  const legal = {
    documents: jest.fn(async () => []),
    scope: jest.fn(async (_q: string, _doc?: string | null) => ({
      requestedDoc: null, missingDoc: null, gazetteMatchKind: 'none', gazetteMatches: [], reason: null, ref: null,
      documentIds: [], documentNumbers: [], evidenceNumbers: [], ...f.scope,
    })),
    gather: jest.fn(async (_q: string, opts: GatherOpts) => ({ asOf: opts.asOf ?? '2026-09-14', sources: f.sources ?? [] })),
  };
  const tariff = { lookup: jest.fn(async (_hs: string, _origin: string | undefined, _date: string) => f.tariff) };
  const confirmation = { matchByProduct: jest.fn(async (): Promise<unknown[]> => []) };
  // Two queries share this fake: hsLines (prefix → heading) and headingLines (the hs_description rows of a candidate).
  const db = { execute: jest.fn(async (q: unknown) => (JSON.stringify(q).includes('substring') ? (f.hsRows ?? []) : (f.lines ?? []))) };
  const svc = new AnswerService(legal as never, tariff as never, confirmation as never, db as never, run);
  const prompts = (system: string | undefined) => run.mock.calls.filter(([, o]) => o.systemPrompt === system).map(([p, o]) => ({ prompt: p, opts: o }));
  return { svc, run, legal, tariff, confirmation, prompts };
}

let logged: jest.SpyInstance;
beforeEach(() => {
  logged = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const PHOTO = 'miếng dán bàn chân ngải cứu, mã 3005.10.10 có phù hợp không';
const PHOTO_PLAN = {
  intent: 'hs',
  understanding: 'Bạn muốn biết miếng dán bàn chân ngải cứu có khai được vào mã bạn tham khảo không',
  question: 'Miếng dán bàn chân ngải cứu có phù hợp với [mã 1] không',
  queries: ['miếng dán ngải cứu dán bàn chân thuộc nhóm hàng nào'],
  goods: { facts: ['miếng dán bàn chân', 'ngải cứu'], missing: ['có tẩm dược chất không'] },
  hsHints: ['3824', '3307', '300490'],
};
const OLD_TURNS = [
  { role: 'user', body: 'mã 30051010 thuế bao nhiêu' },
  { role: 'bot', body: 'Hàng hóa có mã HS 3005.10.10 có thuế nhập khẩu ưu đãi thông thường 5%' },
];
const EN3005 = source(1, {
  heading: '30.05',
  label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 — Bông, gạc, băng',
  body: 'Nhóm này bao gồm bông, gạc, băng và các sản phẩm tương tự như cao dán, thuốc đắp, đã được thấm tẩm hoặc tráng phủ dược chất dùng cho y tế.',
});
const PHOTO_DRAFT = {
  answerMd: 'Nếu miếng dán có tẩm dược chất và dùng cho y tế thì xét nhóm 30.05 [1]. Bạn xem giúp công dụng ghi trên nhãn.',
  citations: [{ n: 1, quotes: ['đã được thấm tẩm hoặc tráng phủ dược chất dùng cho y tế'] }],
  candidates: [{ hs: '30.05', evidence: [1] }],
  missingFacts: ['công dụng ghi trên nhãn'],
  coverage: 'partial',
};
const HEADING_TEXT = 'Bông, gạc, băng và các sản phẩm tương tự';
const CHEM_TEXT = 'Chất gắn đã điều chế; các sản phẩm và chế phẩm hóa học';
const EN_QUOTE = 'đã được thấm tẩm hoặc tráng phủ dược chất dùng cho y tế';
/** hs_description as the walkthrough reads it: two headings with lines, so there is something to weigh 30.05 against. */
const HS_ROWS = [
  { hs_code: '30051010', heading: HEADING_TEXT, path: `${HEADING_TEXT} › Băng dán › Đã tráng phủ` },
  { hs_code: '30059090', heading: HEADING_TEXT, path: `${HEADING_TEXT} › Loại khác › Loại khác` },
  { hs_code: '38249999', heading: CHEM_TEXT, path: `${CHEM_TEXT} › Loại khác › Loại khác` },
];
/**
 * A walkthrough the guards and the section checks both accept: the 30.05 sentence rests on a verbatim EN quote, the 38.24
 * sentence names a candidate heading outside any quote (what the anchors hold), and the conclusion stays open (R2, R5).
 */
const PHOTO_WALK = {
  sections: [
    { key: 'nature', markdown: 'Bạn mới nói miếng dán bàn chân ngải cứu, chưa nói miếng dán có tẩm dược chất hay không.' },
    {
      key: 'candidates',
      markdown: `Nhóm 30.05 gồm sản phẩm "${EN_QUOTE}" [#1]; nếu lớp ngải cứu chỉ để làm ấm thì cần so thêm nhóm 38.24.`,
    },
    { key: 'conclusion', markdown: 'Mình để mở giữa hai nhóm cho tới khi biết nhãn ghi công dụng gì.' },
  ],
  candidates: [
    { heading: '30.05', assessment: 'co_the_neu', deciding_facts: ['miếng dán có tẩm dược chất không'], cite_ids: [1] },
    { heading: '38.24', assessment: 'chua_du_du_kien', deciding_facts: ['thành phần của lớp ngải cứu'], cite_ids: [] },
  ],
  conclusion: { headings: ['30.05', '38.24'], needs_advance_ruling: false, missing_facts: ['công dụng ghi trên nhãn'] },
  tariff_ref: [],
};
const photo = () =>
  setup({
    plan: PHOTO_PLAN,
    walks: [PHOTO_WALK],
    sources: [EN3005],
    hsRows: HS_ROWS,
    lines: [{ prefix: '3005', heading: HEADING_TEXT }, { prefix: '30051010', heading: HEADING_TEXT }],
  });
const PHOTO_BODY: AnswerRequest = { q: PHOTO, context: { topic: 'tariff', state: { tariff: { dotted: '3005.10.10', desc: 'miếng dán' } }, turns: OLD_TURNS } };

const rate = (schedule: string, scheduleName: string, statement: string) => ({
  schedule, scheduleName, type: 'ad_valorem', percent: '5', amount: null, currency: null, unit: null, decree: '26/2023/NĐ-CP',
  effectiveFrom: '2023-07-15', effectiveTo: null, statement,
});
const tariffOf = (preferential: object[]) =>
  ({
    hs: '84818099', origin: 'CN', date: '2026-09-14', goods: null,
    import: { mfn: rate('NK_uu_dai', 'Biểu thuế nhập khẩu ưu đãi', '5%'), preferential, outOfQuota: null, chapter98: [] },
    export: null, antiDumping: [], notes: [], ftaMembership: null,
    staleness: { latestInstrument: null, unloadedInstruments: [], pendingExtension: null, warning: 'Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP.' },
  }) as unknown as TariffResponse;
const TARIFF_DRAFT = { answerMd: 'Hàng có C/O form E hợp lệ thì hưởng biểu ưu đãi ACFTA; không có C/O thì áp biểu ưu đãi thông thường.', citations: [], candidates: [], missingFacts: [], coverage: 'full' };

const RATE_Q = 'cho mình hỏi thuế 8481.80.99 bao nhiêu vậy';
const RATE_PLAN = { intent: 'tariff', understanding: 'Bạn hỏi thuế nhập khẩu của mã này', question: 'Thuế của [mã 1] bao nhiêu', origin: 'CN' };

const GUIDE = source(2, {
  kind: 'guidance',
  label: 'Hướng dẫn áp dụng biểu thuế ưu đãi đặc biệt',
  body: 'Hàng hóa nhập khẩu có C/O mẫu E hợp lệ được áp dụng thuế suất ưu đãi đặc biệt theo biểu ACFTA.',
});
const MFN_DRAFT = { answerMd: 'MFN là 0% [1].', citations: [{ n: 1, quotes: ['có C/O mẫu E hợp lệ được áp dụng thuế suất ưu đãi đặc biệt'] }], candidates: [], missingFacts: [], coverage: 'partial' };
const LEGAL_Q = 'Hàng nhập từ Trung Quốc được hưởng ưu đãi thế nào';
const LEGAL_PLAN = { intent: 'legal', understanding: 'Bạn hỏi điều kiện hưởng ưu đãi', question: 'Hàng nhập từ Trung Quốc được hưởng ưu đãi thế nào' };

describe('AnswerService — POST /answer (plan 08 Việc 10)', () => {
  it('(a) planOnly on the photo question: hs plan, premise code, the code compared by code, an ack with no digit, one call', async () => {
    const { svc, run } = photo();
    const res = await svc.answer({ ...PHOTO_BODY, planOnly: true });
    expect(res.plan.intent).toBe('hs');
    expect(res.codeRole).toBe('premise');
    expect(res.mode).toBe('hs');
    expect(res.userCodes[0]).toMatchObject({ code: '3005.10.10', level: 8, heading: '30.05', exists: true });
    expect(res.ack).toBeTruthy();
    expect(res.ack).not.toMatch(/\d/);
    expect(res.calls).toBe(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('(b) planOnly with a tariff plan composes nothing and looks nothing up', async () => {
    const { svc, prompts, tariff } = setup({ plan: RATE_PLAN, tariff: tariffOf([]) });
    const res = await svc.answer({ q: RATE_Q, planOnly: true });
    expect(res).toMatchObject({ mode: 'tariff', codeRole: 'key', calls: 1 });
    expect(prompts(SYSTEM)).toHaveLength(0);
    expect(tariff.lookup).not.toHaveBeenCalled();
  });

  it('(c) a plan sent back with forceIntent legal is never re-planned', async () => {
    const { svc, run } = setup();
    const res = await svc.answer({ q: 'Thời hạn nộp thuế đối với hàng nhập khẩu là bao lâu', plan: { intent: 'general' }, forceIntent: 'legal' });
    expect(run).not.toHaveBeenCalled();
    expect(res).toMatchObject({ mode: 'legal', calls: 0 });
    expect(res.plan.intent).toBe('legal');
  });

  it('(d) premise hs walks the classification: the ĐỀ BÀI holds no user code or old turn, its heading is pinned unlabelled, the candidate backs the code', async () => {
    const { svc, prompts, legal } = photo();
    const res = await svc.answer(PHOTO_BODY);
    const [plan] = prompts(PLAN_SYSTEM);
    const [walk] = prompts(WALKTHROUGH_SYSTEM);
    expect(prompts(SYSTEM)).toHaveLength(0); // hs never runs the interim compose prompt again
    expect(userCodesIn([plan!.prompt], ['3005.10.10'])).toEqual([]);
    expect(plan!.prompt).not.toMatch(/3005|30\.05/);
    // The question, the goods and the rules; LINES and evidence bodies below are the nomenclature, exempt as in userCodesIn.
    const brief = walk!.prompt.split(/\n\n(?=BẰNG CHỨNG CHUNG|NHÓM )/)[0]!;
    expect(userCodesIn([brief], ['3005.10.10'])).toEqual([]);
    expect(brief).not.toMatch(/3005|30\.05/);
    // The masks stay in, unlike compose: the walkthrough is told "[mã n] là mã người hỏi viết, đã che" (R4, D1).
    expect(brief).toContain('[mã 1]');
    for (const t of OLD_TURNS) expect(walk!.prompt).not.toContain(t.body);
    expect(walk!.prompt).toContain('NHÓM 30.05');
    expect(walk!.prompt).toContain('NHÓM 38.24');

    const [first, ...others] = legal.gather.mock.calls.map(([, o]) => o);
    expect(first).toMatchObject({ hsCodes: [], headings: ['30.04', '30.05', '33.07', '38.24'], clauses: 0, cases: true, sen: 2 });
    for (const o of others) expect(o).toMatchObject({ hsCodes: [], headings: [], cases: false });
    for (const o of others) expect(o.sen).toBeUndefined();

    // The reply is the owner's sectioned report: titles by code, in the "## " md() renders, the model's own prose under them.
    // THÔNG TIN HÀNG HÓA is there although the model wrote no facts section: code prints it from the planner's goods.
    expect(res.answerMd.split('\n').filter((l) => l.startsWith('## '))).toEqual([
      `## ${SECTION_TITLES.facts}`,
      `## ${SECTION_TITLES.nature}`,
      `## ${SECTION_TITLES.candidates}`,
      `## ${SECTION_TITLES.conclusion}`,
    ]);
    expect(res.answerMd).toContain(`Nhóm 30.05 gồm sản phẩm "${EN_QUOTE}" [1];`);
    expect(res.answerMd).toContain('cần so thêm nhóm 38.24.');
    expect(res.candidates).toEqual([{ hs: '30.05', level: 4, title: HEADING_TEXT, evidence: [1] }]);
    expect(res.userCodes[0]).toMatchObject({ code: '3005.10.10', exists: true, inCandidates: true });
    expect(res.citations[0]).toMatchObject({ n: 1, key: 'e:1', kind: 'en', hsHeading: '30.05', quotes: [EN_QUOTE] });
    expect(res).toMatchObject({ calls: 2, cut: 0, depth: 'full', missingFacts: ['công dụng ghi trên nhãn'] });
  });

  it('(e) a rate in prose is repaired: a clean rewrite keeps the prose, a second rate is cut', async () => {
    const clean = 'Hàng có C/O mẫu E hợp lệ được áp thuế suất ưu đãi đặc biệt [1].';
    const ok = setup({ plan: LEGAL_PLAN, drafts: [MFN_DRAFT], repairs: [{ sentences: [clean] }], sources: [GUIDE] });
    const res = await ok.svc.answer({ q: LEGAL_Q });
    expect(res).toMatchObject({ cut: 0, repaired: true, calls: 3, answerMd: clean });
    const [repair] = ok.prompts(undefined);
    expect(repair!.prompt).toContain('MFN là 0% [1].');
    expect(repair!.opts).toMatchObject({ model: 'sonnet', effort: 'low' });

    const bad = setup({ plan: LEGAL_PLAN, drafts: [MFN_DRAFT], repairs: [{ sentences: ['MFN vẫn là 0% [1].'] }], sources: [GUIDE] });
    // Prose was composed, then cut: no reason code.
    expect(await bad.svc.answer({ q: LEGAL_Q })).toMatchObject({ cut: 1, repaired: true, answerMd: '', reason: null });
  });

  it('(f) under 30 s left after compose, no repair is asked', async () => {
    const { svc, run } = setup({ drafts: [MFN_DRAFT], repairs: [{ sentences: ['x'] }], sources: [GUIDE] });
    const res = await svc.answer({ q: LEGAL_Q, plan: LEGAL_PLAN, deadlineAt: Date.now() + 25_000 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ calls: 1, cut: 1, repaired: false, answerMd: '' });
  });

  it('(g) nothing gathered: no compose, coverage none', async () => {
    const { svc, prompts } = setup({ plan: LEGAL_PLAN });
    const res = await svc.answer({ q: LEGAL_Q });
    expect(prompts(SYSTEM)).toHaveLength(0);
    expect(res).toMatchObject({ coverage: 'none', answerMd: '', calls: 1, reason: 'no_sources' });
  });

  it('fallback is true only when defaultPlan stood in for the plan step', async () => {
    // No model result, or a reply naming no known intent.
    for (const plan of [undefined, { intent: 'check_code' }]) {
      expect(await setup({ plan }).svc.answer({ q: LEGAL_Q, planOnly: true })).toMatchObject({ fallback: true, calls: 1, llmError: { kind: 'failed' } });
    }
    expect(await setup({ plan: LEGAL_PLAN }).svc.answer({ q: LEGAL_Q, planOnly: true })).toMatchObject({ fallback: false, llmError: null });
    // The plan step never ran: a client plan, even one naming no known intent, and forceIntent without a plan.
    expect((await setup().svc.answer({ q: LEGAL_Q, plan: { intent: 'check_code' }, planOnly: true })).fallback).toBe(false);
    expect((await setup().svc.answer({ q: LEGAL_Q, forceIntent: 'legal', planOnly: true })).fallback).toBe(false);
  });

  it('(h) planOnly carries a missing document from scope', async () => {
    const gazetteMatches = [{ number: '36/2019/TT-BKHCN', docType: 'thong_tu', title: 't', sourceUrl: 'https://congbao.chinhphu.vn/x' }];
    const { svc } = setup({
      plan: { intent: 'legal', question: 'Thông tư 36 của Bộ Khoa học và Công nghệ quy định gì' },
      scope: { missingDoc: 'Thông tư 36 của Bộ Khoa học và Công nghệ', gazetteMatchKind: 'ambiguous', gazetteMatches },
    });
    const res = await svc.answer({ q: 'thông tư 36 của bộ KHCN quy định gì', planOnly: true });
    expect(res).toMatchObject({ missingDoc: 'Thông tư 36 của Bộ Khoa học và Công nghệ', gazetteMatchKind: 'ambiguous', gazetteMatches });
  });

  it('(i) a status source keeps its end-of-force line from data, stated to compose as a fact', async () => {
    const expired = 'Nghị định 69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo Nghị định 292/2026/NĐ-CP';
    const status = source(3, {
      kind: 'status',
      label: 'Tình trạng hiệu lực — 69/2018/NĐ-CP',
      documentNumber: '69/2018/NĐ-CP',
      expired,
      body: 'Nghị định 69/2018/NĐ-CP được thay thế bởi Nghị định 292/2026/NĐ-CP từ ngày 05/09/2026.',
    });
    const q = 'Nghị định 69/2018/NĐ-CP còn áp dụng không';
    const draft = {
      answerMd: 'Không, Nghị định 69/2018/NĐ-CP đã được thay thế bởi Nghị định 292/2026/NĐ-CP [1].',
      citations: [{ n: 1, quotes: ['được thay thế bởi Nghị định 292/2026/NĐ-CP'] }],
      candidates: [], missingFacts: [], coverage: 'full',
    };
    const { svc, prompts, legal } = setup({ drafts: [draft], sources: [status] });
    const res = await svc.answer({ q, plan: { intent: 'status', question: q, scope: { doc: '69/2018/NĐ-CP' } } });
    expect(legal.scope).toHaveBeenCalledWith(q, '69/2018/NĐ-CP');
    expect(prompts(SYSTEM)[0]!.prompt).toContain(`- ${expired}`);
    expect(res.mode).toBe('status');
    expect(res.citations[0]!.expired).toBe(expired);
    expect(res.answerMd).toBe(draft.answerMd);
  });

  it('(j) one JSON log line per turn, without the question or any word of it (R14)', async () => {
    const { svc } = photo();
    await svc.answer(PHOTO_BODY);
    const lines = logged.mock.calls.map(([m]) => String(m)).filter((m) => m.startsWith('{'));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ mode: 'hs', intent: 'hs', codeRole: 'premise', calls: 2, sources: 1, cut: 0, repaired: false, fallback: false });
    for (const word of [PHOTO, '3005', ...(PHOTO.match(/\p{L}+/gu) ?? [])]) expect(lines[0]).not.toContain(word);
  });

  it('(k) a rate question with its code as key: looked up, explained at sonnet/medium without the code, the lookup returned', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', '0% nếu có C/O form E hợp lệ, ngược lại 5% (MFN)'), form: 'E', requiresCo: true }]);
    const { svc, tariff, prompts } = setup({ plan: RATE_PLAN, drafts: [TARIFF_DRAFT], tariff: t });
    const res = await svc.answer({ q: RATE_Q });
    expect(tariff.lookup).toHaveBeenCalledWith('84818099', 'CN', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    const [compose] = prompts(SYSTEM);
    expect(compose!.opts).toMatchObject({ model: 'sonnet', effort: 'medium' });
    expect(compose!.prompt).toContain('DÒNG THUẾ TỪ DỮ LIỆU');
    expect(compose!.prompt).not.toMatch(/8481/);
    expect(res).toMatchObject({ mode: 'tariff', codeRole: 'key', calls: 2, answerMd: TARIFF_DRAFT.answerMd });
    expect(res.tariff).toBe(t);
  });

  it('(l) the bot\'s partial tariff plan: no plan call, origin kept, the rate lines kept with the code\'s digits taken out (R4)', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', 'Theo dòng 10 số: 8481.80.99.10 Van bi: 0%; 8481 80 99 90 Loại khác: 5%'), form: 'E', requiresCo: true }]);
    const { svc, run, tariff, prompts } = setup({ drafts: [TARIFF_DRAFT], tariff: t });
    const res = await svc.answer({ q: 'thuế nk 8481.80.99 tq', plan: { intent: 'tariff', origin: 'CN', date: null }, forceIntent: 'tariff' });
    expect(prompts(PLAN_SYSTEM)).toHaveLength(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(tariff.lookup).toHaveBeenCalledWith('84818099', 'CN', expect.any(String));
    const [compose] = prompts(SYSTEM);
    expect(userCodesIn([compose!.prompt], ['8481.80.99'])).toEqual([]);
    expect(compose!.prompt.replace(/[.\s]/g, '')).not.toMatch(/8481/);
    expect(compose!.prompt).toContain('DÒNG THUẾ TỪ DỮ LIỆU');
    expect(compose!.prompt).toContain('Van bi');
    expect(res.plan.question).toBe('thuế nk [mã 1] tq');
    expect(res.calls).toBe(1);
    const line = logged.mock.calls.map(([m]) => String(m)).find((m) => m.startsWith('{'))!;
    expect(JSON.parse(line).leakDrops).toEqual([]);
  });

  it('(l2) a tariff turn with no rate line and no source composes nothing: the rate block stands alone (Q1)', async () => {
    const t = { ...tariffOf([]), import: { mfn: null, preferential: [], outOfQuota: null, chapter98: [] } } as unknown as TariffResponse;
    const { svc, run } = setup({ drafts: [TARIFF_DRAFT], tariff: t });
    const res = await svc.answer({ q: 'thuế nk 8481.80.99 tq', plan: { intent: 'tariff', origin: 'CN' }, forceIntent: 'tariff' });
    expect(run).not.toHaveBeenCalled();
    expect(res).toMatchObject({ mode: 'tariff', answerMd: '', calls: 0, reason: 'no_sources' });
    expect(res.tariff).toBe(t);
  });

  it('a tariff follow-up naming no code looks up the state\'s code as a key: never prompted in any spelling, never a userCodes line (R4)', async () => {
    const t = tariffOf([{ ...rate('AJCEP', 'ASEAN–Nhật Bản', 'Theo dòng 10 số: 8481.80.99.10 Van bi: 0%; 84818099 90 Loại khác: 5%'), form: 'AJ', requiresCo: true }]);
    const { svc, tariff, prompts } = setup({ drafts: [TARIFF_DRAFT], tariff: t });
    const body: AnswerRequest = {
      q: 'còn từ Nhật thì sao',
      context: { topic: 'tariff', state: { tariff: { dotted: '8481.80.99', origin: 'CN' } }, turns: [{ role: 'user', body: 'thuế nk 8481.80.99 tq' }] },
      plan: { intent: 'tariff', origin: 'JP', date: '2026-09-01' },
      forceIntent: 'tariff',
    };
    const res = await svc.answer(body);
    expect(tariff.lookup).toHaveBeenCalledWith('84818099', 'JP', '2026-09-01');
    const [compose] = prompts(SYSTEM);
    expect(compose!.prompt).toContain('Van bi');
    expect(compose!.prompt.replace(/[.\s]/g, '')).not.toMatch(/8481/);
    expect(res).toMatchObject({ mode: 'tariff', userCodes: [], answerMd: TARIFF_DRAFT.answerMd, calls: 1 });
    expect(res.tariff).toBe(t);

    // No 8-digit state code, or a planned tariff turn that neither is forced nor reuses the last code: the plan alone, as before.
    const planned = { q: 'van bi bằng đồng thuế bao nhiêu', context: body.context };
    for (const [f, req] of [[{}, { ...body, context: { state: { tariff: { dotted: '8481.80' } } } }], [{ plan: { intent: 'tariff' } }, planned]] as const) {
      const other = setup({ ...f, drafts: [TARIFF_DRAFT], tariff: t });
      expect(await other.svc.answer(req)).toMatchObject({ mode: null, answerMd: '' });
      expect(other.tariff.lookup).not.toHaveBeenCalled();
    }
  });

  it('a planned tariff turn reusing the last code, not forced, looks up the state\'s code too: no prompt spells it, no userCodes line (R4)', async () => {
    const plan = { intent: 'tariff', reuseLastHs: true, origin: 'JP' };
    const context = { topic: 'tariff', state: { tariff: { dotted: '8481.80.99', origin: 'CN' } }, turns: [{ role: 'user', body: 'thuế nk 8481.80.99 tq' }] };
    // The model's plan, then the same plan sent back by the bot.
    for (const [f, sent] of [[{ plan }, {}], [{}, { plan }]] as const) {
      const t = tariffOf([{ ...rate('AJCEP', 'ASEAN–Nhật Bản', 'Theo dòng 10 số: 8481.80.99.10 Van bi: 0%; 84818099 90 Loại khác: 5%'), form: 'AJ', requiresCo: true }]);
      const { svc, run, tariff } = setup({ ...f, drafts: [TARIFF_DRAFT], tariff: t });
      const res = await svc.answer({ q: 'còn từ Nhật thì sao', context, ...sent });
      expect(tariff.lookup).toHaveBeenCalledWith('84818099', 'JP', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
      expect(run).toHaveBeenCalled();
      for (const [prompt] of run.mock.calls) expect(prompt.replace(/[.\s]/g, '')).not.toMatch(/8481/);
      expect(res).toMatchObject({ mode: 'tariff', codeRole: 'key', userCodes: [], answerMd: TARIFF_DRAFT.answerMd });
    }
  });

  it('drops every non-status source of 128/2020/NĐ-CP and 102/2021/NĐ-CP before compose, the cap and the sources-only reply', async () => {
    const penalty = (id: number, documentNumber: string, kind = 'guidance') =>
      source(id, { kind, documentNumber, label: `Nguồn ${id} — ${documentNumber}`, body: `Mức phạt theo ${documentNumber}.` });
    const clause = { ...penalty(20, '128/2020/NĐ-CP'), key: 'p:20', citation: { ...penalty(20, '128/2020/NĐ-CP').citation, kind: undefined } };
    const status = penalty(21, '128/2020/NĐ-CP', 'status');
    const sources = [clause, ...Array.from({ length: 11 }, (_, i) => penalty(30 + i, i % 2 ? '102/2021/NĐ-CP' : '128/2020/ND-CP')), status, GUIDE];
    const kept = [status.key, GUIDE.key];

    const alone = await setup({ sources }).svc.answer({ q: LEGAL_Q, plan: LEGAL_PLAN, deadlineAt: Date.now() });
    expect(alone.citations.map((c) => c.key)).toEqual(kept);

    const composed = setup({ drafts: [MFN_DRAFT], sources });
    await composed.svc.answer({ q: LEGAL_Q, plan: LEGAL_PLAN });
    const said = composed.prompts(SYSTEM)[0]!.prompt;
    expect(said).toContain(status.label);
    expect(said).toContain(GUIDE.label);
    expect(said).not.toMatch(/Nguồn (2[0]|3\d) /);
  });

  it('R4 addendum: a premise hs turn looks up no rate for the user code, and no prompt line carries it', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', 'Theo dòng 10 số: 3005.10.10.10 Miếng dán: 0%'), form: 'E', requiresCo: true }]);
    const { svc, prompts, tariff } = setup({ plan: PHOTO_PLAN, drafts: [PHOTO_DRAFT], sources: [EN3005], tariff: t, lines: [{ prefix: '3005', heading: HEADING_TEXT }] });
    await svc.answer(PHOTO_BODY);
    expect(tariff.lookup).not.toHaveBeenCalled();
    const [compose] = prompts(SYSTEM);
    expect(compose!.prompt).not.toContain('DÒNG THUẾ');
    expect(compose!.prompt.replace(/[.\s]/g, '')).not.toContain('30051010');
  });

  it('R4 in the walkthrough: a heading holding the user\'s own line is looked up for nothing, and a rate line still naming it is dropped whole', async () => {
    // 30.05 holds the user's own leaf, so none of its lines is looked up: a sibling would put the policy and duty blocks on
    // a leaf the report never argued for. 38.24's line is clean but its statement names the code, so DÒNG THUẾ never prints.
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', 'Theo dòng 10 số: 3005.10.10.10 Miếng dán: 0%'), form: 'E', requiresCo: true }]);
    const { svc, prompts, tariff } = setup({ plan: PHOTO_PLAN, walks: [PHOTO_WALK], sources: [EN3005], hsRows: HS_ROWS, tariff: t });
    const res = await svc.answer(PHOTO_BODY);
    const looked = tariff.lookup.mock.calls.map(([hs]) => hs);
    expect(looked).toEqual(['38249999']); // no leaf of 30.05 at all, the user's own or its siblings'
    const [walk] = prompts(WALKTHROUGH_SYSTEM);
    expect(walk!.prompt).not.toContain('\nDÒNG THUẾ (');
    expect(userCodesIn([walk!.prompt.split(/\n\n(?=NHÓM )/)[0]!], ['3005.10.10'])).toEqual([]);
    expect(res.tariffRef).toEqual([]);
  });

  it('D3(a): with a rate line under every heading the walkthrough may point at one, and the code prints its policy block', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', '0% nếu có C/O form E hợp lệ'), form: 'E', requiresCo: true }]);
    const walk = { ...PHOTO_WALK, tariff_ref: ['30051010'] };
    const q = 'miếng dán bàn chân ngải cứu thì khai nhóm nào';
    const { svc, prompts } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS, tariff: t });
    const res = await svc.answer({ q });
    expect(prompts(WALKTHROUGH_SYSTEM)[0]!.prompt).toContain('\nDÒNG THUẾ (');
    expect(res).toMatchObject({ depth: 'full', tariffRef: ['3005.10.10'] });
    // The policy block is code's, in its own section, and a list the corpus has not loaded reads "chưa kiểm tra được",
    // never "Không" (R12, R18). No list in this registry answers for 3005.10.10, so the caveat is all there is to say —
    // and it is said once for the whole answer, not repeated under each candidate.
    expect(res.answerMd).toContain(`## ${SECTION_TITLES.policy}`);
    expect(res.answerMd).toMatch(/chưa kiểm tra được\*\* \(kho chưa nạp, hoặc chưa chắc đã lấy đủ dòng\)/);
    expect(res.answerMd.match(/chưa kiểm tra được/g)).toHaveLength(1);
    expect(res.answerMd).not.toMatch(/^- Không\b/m);
    expect(res.answerMd).not.toMatch(/\bKhông\b(?![ ]có tên trong danh mục đã nạp)/);
  });

  it('D3(a): a tariff_ref under a heading the walkthrough did not conclude points at no block', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', '0% nếu có C/O form E hợp lệ'), form: 'E', requiresCo: true }]);
    const walk = { ...PHOTO_WALK, tariff_ref: ['38249999'], conclusion: { ...PHOTO_WALK.conclusion, headings: ['30.05'] } };
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS, tariff: t });
    const res = await svc.answer({ q: 'miếng dán bàn chân ngải cứu thì khai nhóm nào' });
    expect(res.tariffRef).toEqual([]);
    expect(res.answerMd).not.toContain('3824.99.99');
  });

  it('R10: a candidate\'s evidence must back that heading — a note kind, or a row of another heading, backs none', async () => {
    // Two rows besides the EN: a `note` (never evidence, R10) and a chapter Chú giải the prompt prints under every heading.
    const NOTE = source(2, { kind: 'note', label: 'Ghi chú nội bộ của nhóm', body: 'Hồ sơ kỹ thuật của lô hàng nên được lưu cùng tờ khai để tra cứu về sau.' });
    const CHAPTER = source(3, { kind: 'hs_note', label: 'Chú giải Chương 30', body: 'Chương này không bao gồm các sản phẩm đã đóng gói để bán lẻ dùng cho mục đích khác.' });
    const NOTE_Q = 'Hồ sơ kỹ thuật của lô hàng nên được lưu cùng tờ khai';
    const CHAPTER_Q = 'Chương này không bao gồm các sản phẩm đã đóng gói để bán lẻ';
    const walk = {
      ...PHOTO_WALK,
      sections: [
        ...PHOTO_WALK.sections,
        { key: 'risk', markdown: `Bảng nội bộ nhắc "${NOTE_Q}" [#2]; chú giải chương ghi "${CHAPTER_Q}" [#3].` },
      ],
      candidates: [
        { heading: '30.05', assessment: 'co_the_neu', deciding_facts: ['miếng dán có tẩm dược chất không'], cite_ids: [1] },
        { heading: '38.24', assessment: 'chua_du_du_kien', deciding_facts: ['thành phần của lớp ngải cứu'], cite_ids: [2, 3] },
      ],
    };
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005, NOTE, CHAPTER], hsRows: HS_ROWS });
    const res = await svc.answer(PHOTO_BODY);
    const chapterAt = res.citations.find((c) => c.key === 'e:3')!.n;
    const noteAt = res.citations.find((c) => c.key === 'e:2')!.n;
    // The shared Chú giải the prompt printed under 38.24 backs it; the `note` row, quoted in the same sentence, does not.
    expect(res.candidates.map((c) => [c.hs, c.evidence])).toEqual([
      ['30.05', [1]],
      ['38.24', [chapterAt]],
    ]);
    expect(res.candidates[1]!.evidence).not.toContain(noteAt);
  });

  it('R2: a walk that concludes four headings comes back with three candidates', async () => {
    const FOUR_ROWS = [
      ...HS_ROWS,
      { hs_code: '30049099', heading: 'Thuốc (trừ các mặt hàng thuộc nhóm 30.02, 30.05 hoặc 30.06)', path: 'Thuốc › Loại khác' },
      { hs_code: '33079090', heading: 'Chế phẩm dùng trước, trong hoặc sau khi cạo râu', path: 'Chế phẩm › Loại khác' },
    ];
    // A chapter Chú giải the prompt prints under every heading, so each of the four has evidence that backs it (R10).
    const CHAPTER = source(2, { kind: 'hs_note', label: 'Chú giải Chương 30', body: 'Chương này không bao gồm các sản phẩm đã đóng gói để bán lẻ dùng cho mục đích khác.' });
    const CHAPTER_Q = 'Chương này không bao gồm các sản phẩm đã đóng gói để bán lẻ';
    const heads = ['30.05', '38.24', '30.04', '33.07'];
    const walk = {
      sections: [
        PHOTO_WALK.sections[0]!,
        { key: 'candidates', markdown: `Chú giải chương ghi "${CHAPTER_Q}" [#2], nên cả bốn nhóm đều còn phải đối chiếu.` },
        PHOTO_WALK.sections[2]!,
      ],
      candidates: heads.map((heading) => ({ heading, assessment: 'chua_du_du_kien', deciding_facts: ['thành phần của lớp ngải cứu'], cite_ids: [2] })),
      conclusion: { headings: heads, needs_advance_ruling: true, missing_facts: ['công dụng ghi trên nhãn'] },
      tariff_ref: [],
    };
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005, CHAPTER], hsRows: FOUR_ROWS });
    const res = await svc.answer(PHOTO_BODY);
    expect(res.candidates.map((c) => c.hs)).toEqual(['30.05', '38.24', '30.04']);
  });

  it('every section of the walkthrough emptied leaves the sources, not a reply with no prose and no source', async () => {
    const walk = {
      ...PHOTO_WALK,
      sections: [
        { key: 'nature', markdown: 'Thuế nhập khẩu của dòng này là 8%.' },
        { key: 'conclusion', markdown: 'Thuế suất ưu đãi của dòng kia là 5%.' },
      ],
    };
    // 25 s left: enough for the walkthrough, never enough for the repair pass.
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS });
    const res = await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + 25_000 });
    // The model gave nothing usable, so nothing of its prose may appear — but the asker still gets what code knows:
    // the goods they described and what is still open (owner decision 2026-09-15).
    expect(res).toMatchObject({ mode: 'hs', reason: 'compose_failed' });
    expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
    expect(res.answerMd).toContain('Mình chưa kịp viết phần lập luận');
    expect(res.answerMd).not.toContain('## II.');
    expect(res.citations.map((c) => c.n)).toEqual([1]);
  });

  // The bot spends one /answer call planning before this one, so the second call never sees the whole compose cap:
  // gating full on the cap made it unreachable through the bot, which is how full went unused until 2026-09-15. The
  // gate is full's own slowest measured run plus a little, so a turn with room for it gets it.
  it('full needs room for its own slow tail, not the whole compose cap', async () => {
    const ask = async (left: number) => {
      const { svc, prompts } = setup({ plan: PHOTO_PLAN, walks: [PHOTO_WALK], sources: [EN3005], hsRows: HS_ROWS });
      await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + left });
      return prompts(WALKTHROUGH_SYSTEM)[0]!.prompt;
    };
    // A bot turn that spent ~30 s planning still reaches full.
    expect(await ask(120_000)).toContain('Độ sâu full');
    // Below full's measured tail it is brief, which still prints every section title.
    expect(await ask(112_000)).toContain('Độ sâu brief');
  });

  it('a deadline too short for the full walkthrough asks for brief, looks no rate up, and points at no block', async () => {
    const { svc, prompts, tariff } = setup({ plan: PHOTO_PLAN, walks: [PHOTO_WALK], sources: [EN3005], hsRows: HS_ROWS });
    const res = await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + 60_000 });
    expect(prompts(WALKTHROUGH_SYSTEM)[0]!.prompt).toContain('Độ sâu brief');
    expect(tariff.lookup).not.toHaveBeenCalled();
    expect(res).toMatchObject({ depth: 'brief', tariffRef: [] });
    expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
  });

  it('the walkthrough timing out or returning no JSON leaves the sources, never a second compose call', async () => {
    for (const reply of [null, { text: 'xin lỗi', isError: false, durationMs: 1 }, { text: '{}', isError: true, durationMs: 1 }]) {
      const { svc, run, prompts } = setup({ plan: PHOTO_PLAN, sources: [EN3005], hsRows: HS_ROWS });
      run.mockResolvedValueOnce({ text: JSON.stringify(PHOTO_PLAN), isError: false, durationMs: 1 }).mockResolvedValueOnce(reply as never);
      const res = await svc.answer(PHOTO_BODY);
      expect(prompts(SYSTEM)).toHaveLength(0);
      expect(res).toMatchObject({ mode: 'hs', calls: 2, reason: 'compose_failed' });
      expect(res.answerMd).toContain('Mình chưa kịp viết phần lập luận');
      expect(res.answerMd).not.toContain('## II.');
      expect(res.citations.map((c) => c.n)).toEqual([1]);
    }
  });

  it('a list claim or a risk score in the walkthrough is cut by code even with no budget to repair it (R3, R12)', async () => {
    const banned = ['Hàng này không phải kiểm tra chuyên ngành.', 'Đây là trường hợp rủi ro thấp.'];
    for (const sentence of banned) {
      const walk = { ...PHOTO_WALK, sections: [...PHOTO_WALK.sections, { key: 'risk', markdown: sentence }] };
      // 25 s left: enough for the walkthrough, never enough for the repair pass.
      const { svc, prompts } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS });
      const res = await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + 25_000 });
      expect(prompts(undefined)).toHaveLength(0);
      expect(res).toMatchObject({ calls: 2, cut: 1, repaired: false });
      expect(res.answerMd).not.toContain(sentence);
      expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
    }
  });


  it('§4.1: the walkthrough\'s own opening sentence cut, or more than a third of it, leaves the sources only', async () => {
    const rateLine = 'Thuế nhập khẩu của dòng này là 8%.';
    // (a) the first sentence of the first section is the one G1 cuts: firstCut, whatever else survives.
    const opener = { ...PHOTO_WALK, sections: [{ key: 'nature', markdown: rateLine }, ...PHOTO_WALK.sections.slice(1)] };
    // (b) the opener stands and three of the four sentences go: the one-third rule alone, with firstCut false.
    const third = {
      ...PHOTO_WALK,
      sections: [
        PHOTO_WALK.sections[0]!,
        { key: 'nature', markdown: `${rateLine} Thuế suất ưu đãi là 5%. Mức thuế VAT là 10%.` },
      ],
    };
    for (const walk of [opener, third]) {
      // 25 s left: enough for the walkthrough, never enough for the repair pass.
      const { svc, prompts } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS });
      const res = await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + 25_000 });
      expect(prompts(undefined)).toHaveLength(0);
      expect(res).toMatchObject({ mode: 'hs', coverage: 'none', tariffRef: [] });
      // §4.1 doubts the model's prose, not the sections code writes from the planner's own reading.
      expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
      expect(res.answerMd).not.toContain('## II.');
      // And it says the reasoning is gone: without this the reply reads as a finished report with no reasoning in it.
      expect(res.answerMd).toContain(CUT_ALL);
    }
  });

  it('R1: a missing fact stating a rate never reaches the bot; one that only runs long still does (R3, R5)', async () => {
    const long = 'nhãn ghi công dụng gì và lớp ngải cứu có phải là dược chất theo hồ sơ kỹ thuật không';
    const walk = { ...PHOTO_WALK, conclusion: { ...PHOTO_WALK.conclusion, missing_facts: ['thuế nhập khẩu của dòng này là 8%', long] } };
    // 25 s left: enough for the walkthrough, never enough for the repair pass.
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS });
    const res = await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + 25_000 });
    expect(res.missingFacts).toEqual([long]);
  });

  it('a walkthrough that abstains, or returns no conclusion at all, still answers: no candidate, no missing fact, no throw (R5)', async () => {
    const open = { ...PHOTO_WALK, conclusion: { headings: [], needs_advance_ruling: true, missing_facts: ['công dụng ghi trên nhãn'] } };
    const { conclusion: _drop, ...noConclusion } = PHOTO_WALK;
    for (const [walk, missing] of [
      [open, ['công dụng ghi trên nhãn']],
      [noConclusion, []],
    ] as Array<[object, string[]]>) {
      const res = await setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS }).svc.answer(PHOTO_BODY);
      expect(res).toMatchObject({ candidates: [], missingFacts: missing, coverage: 'partial' });
      expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
    }
  });

  it('fewer than two headings with hs_description lines: no walkthrough, the interim compose prompt stands in', async () => {
    const only3005 = HS_ROWS.filter((r) => r.hs_code.startsWith('3005'));
    const { svc, prompts } = setup({ plan: PHOTO_PLAN, drafts: [PHOTO_DRAFT], walks: [PHOTO_WALK], sources: [EN3005], hsRows: only3005, lines: [{ prefix: '3005', heading: HEADING_TEXT }] });
    const res = await svc.answer(PHOTO_BODY);
    expect(prompts(WALKTHROUGH_SYSTEM)).toHaveLength(0);
    expect(prompts(SYSTEM)).toHaveLength(1);
    expect(res).toMatchObject({ answerMd: PHOTO_DRAFT.answerMd, calls: 2, depth: 'brief' });
  });

  it('§4.1 at full depth: the prose dropped means no candidate block for the bot to print (D3(a))', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', '0% nếu có C/O form E hợp lệ'), form: 'E', requiresCo: true }]);
    const walk = {
      ...PHOTO_WALK,
      tariff_ref: ['30051010'],
      sections: [{ key: 'nature', markdown: `Thuế nhập khẩu của dòng này là 8%. ${PHOTO_WALK.sections[0]!.markdown}` }, ...PHOTO_WALK.sections.slice(1)],
    };
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS, tariff: t });
    const res = await svc.answer({ q: 'miếng dán bàn chân ngải cứu thì khai nhóm nào' });
    expect(res).toMatchObject({ depth: 'full', tariffRef: [] });
    expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
    expect(res.answerMd).not.toContain('## II.');
    expect(res.citations.map((c) => c.n)).toEqual([1]);
  });

  it('§4.1: the opener is the first section of the reply, not the first the model happened to emit', async () => {
    // The reply renders in the owner's order, so the sentence §4.1 is about is the FACTS one whatever the model emitted first.
    const flagged = 'Đây là trường hợp rủi ro thấp cho lô hàng này.';
    const walk = { ...PHOTO_WALK, sections: [{ key: 'conclusion', markdown: flagged }, ...PHOTO_WALK.sections.slice(0, 2)] };
    const { svc } = setup({ plan: PHOTO_PLAN, walks: [walk], sources: [EN3005], hsRows: HS_ROWS });
    // 25 s left: the risk-score sentence is cut by code, never repaired.
    const res = await svc.answer({ ...PHOTO_BODY, deadlineAt: Date.now() + 25_000 });
    expect(res.answerMd).toContain(`## ${SECTION_TITLES.facts}`);
    expect(res.answerMd).not.toContain(flagged);
  });

  it('R4: a walkthrough sentence naming the premise code is never sent for repair', async () => {
    const leak = 'Mã 3005.10.10 là mã băng dán đã tráng phủ.';
    const bad = {
      ...PHOTO_WALK,
      sections: [
        PHOTO_WALK.sections[0]!,
        { key: 'levels', markdown: `Nhóm 30.05 gồm "${EN_QUOTE}" [#1] và thuế nhập khẩu của dòng này là 8%. ${leak}` },
        ...PHOTO_WALK.sections.slice(1),
      ],
    };
    const { svc, prompts } = setup({ plan: PHOTO_PLAN, walks: [bad], repairs: [{ sentences: ['x', 'y'] }], sources: [EN3005], hsRows: HS_ROWS });
    await svc.answer(PHOTO_BODY);
    const [repair] = prompts(undefined);
    expect(repair!.prompt).toContain('thuế nhập khẩu của dòng này là 8%');
    expect(repair!.prompt).not.toContain('3005.10.10');
  });

  it('a walkthrough sentence the guards cut is sent for repair once, and the rewrite is put back in its section', async () => {
    const bad = {
      ...PHOTO_WALK,
      sections: [
        PHOTO_WALK.sections[0]!,
        { key: 'levels', markdown: `Nhóm 30.05 gồm "${EN_QUOTE}" [#1] và thuế nhập khẩu của dòng này là 8%.` },
        ...PHOTO_WALK.sections.slice(1),
      ],
    };
    const fixed = `Nhóm 30.05 gồm "${EN_QUOTE}" [1] và loại có lớp dính tách riêng.`;
    const { svc, prompts } = setup({ plan: PHOTO_PLAN, walks: [bad], repairs: [{ sentences: [fixed] }], sources: [EN3005], hsRows: HS_ROWS });
    const res = await svc.answer(PHOTO_BODY);
    const [repair] = prompts(undefined);
    expect(repair!.prompt).toContain('thuế nhập khẩu của dòng này là 8%');
    expect(repair!.prompt).toContain(`TRÍCH DẪN: "${EN_QUOTE}"`);
    expect(repair!.opts).toMatchObject({ model: 'sonnet', effort: 'low' });
    expect(res).toMatchObject({ repaired: true, cut: 0, calls: 3 });
    expect(res.answerMd).toContain(`## ${SECTION_TITLES.levels}\n${fixed}`);
  });

  it('a subject turn gets back only the message\'s own code: a quote or state code the plan folded in never reaches compose or gather (R4)', async () => {
    const q = 'Xe 8703.23.51 đã qua sử dụng có nhập khẩu được không';
    const plan = {
      intent: 'legal',
      question: '[mã 1] đã qua sử dụng có nhập khẩu được không, và [mã 2] có cần kiểm tra không',
      queries: ['[mã 2] thuộc danh mục kiểm tra chuyên ngành'],
    };
    const draft = { ...MFN_DRAFT, answerMd: 'Hàng có C/O mẫu E hợp lệ được áp dụng thuế suất ưu đãi đặc biệt [1].' };
    const { svc, prompts, legal } = setup({ plan, drafts: [draft], sources: [GUIDE] });
    const res = await svc.answer({ q, quote: 'miếng dán mã 3005.10.10 có phù hợp không', context: { state: { tariff: { dotted: '3005.10.10' } } } });
    expect(res.codeRole).toBe('subject');
    const [compose] = prompts(SYSTEM);
    expect(compose!.prompt).toContain('CÂU HỎI THẬT: 8703.23.51 đã qua sử dụng');
    for (const text of [compose!.prompt, ...legal.gather.mock.calls.map(([query]) => query)]) expect(text.replace(/[.\s]/g, '')).not.toContain('3005');
  });

  it('a subject code past the plan\'s 600 characters keeps its place in the question', async () => {
    const q = `${'Mình hỏi thêm về xe. '.repeat(32)}Xe 8703.23.51 đã qua sử dụng có nhập khẩu được không`;
    const draft = { ...MFN_DRAFT, answerMd: 'Hàng có C/O mẫu E hợp lệ được áp dụng thuế suất ưu đãi đặc biệt [1].' };
    const { svc, prompts } = setup({ plan: { intent: 'legal' }, drafts: [draft], sources: [GUIDE] });
    await svc.answer({ q });
    expect(prompts(SYSTEM)[0]!.prompt).toContain('Xe 8703.23.51 đã qua sử dụng');
  });

  it('a client plan: understanding and goods are masked like the question, and a query the latch flags is never run', async () => {
    const draft = { ...MFN_DRAFT, answerMd: 'Hàng có C/O mẫu E hợp lệ được áp dụng thuế suất ưu đãi đặc biệt [1].' };
    const none = setup({ drafts: [draft], sources: [GUIDE] });
    await none.svc.answer({
      q: 'còn hàng này có thuộc danh mục kiểm tra chuyên ngành không',
      quote: 'mã 3005.10.10',
      plan: { intent: 'legal', question: 'Hàng này có thuộc danh mục kiểm tra chuyên ngành không', understanding: 'Bạn hỏi hàng 30.05.10.10 có thuộc danh mục', goods: { missing: ['30.05.10.10 dùng cho y tế không'] } },
    });
    expect(none.prompts(SYSTEM)[0]!.prompt.split('\nNGUỒN:\n')[0]).not.toMatch(/30\.05|\[mã/);

    const queries = setup({ drafts: [PHOTO_DRAFT], sources: [EN3005] });
    await queries.svc.answer({ q: PHOTO, plan: { ...PHOTO_PLAN, question: 'Miếng dán có hợp mã bạn nêu không', queries: ['miếng dán 30.0510.10', 'hàng 3005-10-10'] } });
    const ran = queries.legal.gather.mock.calls.map(([query]) => query);
    expect(ran[0]).toBe('Miếng dán có hợp mã bạn nêu không');
    expect(ran.join(' ').replace(/[.\s-]/g, '')).not.toMatch(/3005|0510/);

    const question = setup({ drafts: [PHOTO_DRAFT], sources: [EN3005] });
    const res = await question.svc.answer({ q: PHOTO, plan: { ...PHOTO_PLAN, question: 'Miếng dán có hợp 30 05 10 10 không' } });
    expect(question.legal.gather).not.toHaveBeenCalled();
    expect(res).toMatchObject({ answerMd: '', calls: 0, reason: 'latch' });
  });

  it('a ten-digit line, a code after "là" or a quote, and a second joined subheading reach no prompt and no query (R4)', async () => {
    for (const [q, code] of [
      ['mã hs 8481809910 dùng cho van được không', '84818099'],
      ['8481.80.9910 dùng cho van được không', '84818099'],
      ['8481 80 9910 dùng cho van được không', '84818099'],
      ['mã hs "848180" dùng cho van được không', '848180'],
      ['mã hs là 848180 dùng cho van được không', '848180'],
      ['mã hs 300510 hay 382490 được không', '382490'],
      ['8481 809910 dùng cho van được không', '84818099'],
      ['8481-80-99-10 dùng cho van được không', '84818099'],
      ["mã hs '848180' dùng cho van được không", '848180'],
      ['mã hs số 848180 dùng cho van được không', '848180'],
      ['mã hs 300510 với 382490 được không', '382490'],
      ['mã hs 300510-382490 được không', '382490'],
      ['mã hs 300510, 200000 và 382490 được không', '382490'],
    ] as const) {
      for (const intent of ['hs', 'legal']) {
        const { svc, run, legal } = setup({ plan: { intent, question: 'Hàng này có dùng được [mã 1] không' }, sources: [GUIDE] });
        expect(await svc.answer({ q })).toMatchObject({ codeRole: 'premise', mode: 'hs', reason: 'compose_failed' });
        for (const text of [...run.mock.calls.map(([prompt]) => prompt), ...legal.gather.mock.calls.map(([query]) => query)]) {
          expect(text.replace(/[.\s"'-]/g, '')).not.toContain(code);
        }
      }
    }
  });

  it('row 19: a plan sent back keeps the document the state cites, and scope reads that document', async () => {
    const { svc, legal } = setup();
    const state = { legal: { citations: [{ label: 'Điều 18', documentNumber: '08/2015/NĐ-CP' }, { label: 'Điều 16', documentNumber: '38/2015/TT-BTC' }] } };
    const q = 'nguyên văn điều đó';
    const res = await svc.answer({ q, plan: { intent: 'legal', scope: { doc: '38/2015/TT-BTC', article: '16' } }, context: { topic: 'legal', state }, planOnly: true });
    expect(res.plan.scope).toEqual({ doc: '38/2015/TT-BTC', article: '16', clause: null });
    expect(legal.scope).toHaveBeenCalledWith(q, '38/2015/TT-BTC');
  });

  it('a premise message writing its heading bare is still answered, the heading never prompted (R4)', async () => {
    const { svc, prompts, legal } = setup({ plan: PHOTO_PLAN, drafts: [PHOTO_DRAFT], sources: [EN3005], lines: [{ prefix: '3005', heading: HEADING_TEXT }] });
    const res = await svc.answer({ q: 'miếng dán thuộc 3005 hay 3824, mã 3005.10.10 có đúng không' });
    expect(res).toMatchObject({ codeRole: 'premise', calls: 2, answerMd: PHOTO_DRAFT.answerMd });
    expect(prompts(PLAN_SYSTEM)[0]!.prompt).not.toMatch(/3005|3824/);
    expect(prompts(SYSTEM)[0]!.prompt.split('\nNGUỒN:\n')[0]).not.toMatch(/3005|3824|30\.05|38\.24/);
    for (const [query] of legal.gather.mock.calls) expect(query).not.toMatch(/3005|3824/);
    // The bare 3005 is the 3005.10.10 line already: one line for the code, none repeating its heading.
    const said = res.userCodes.map((u) => u.code);
    expect(said).toContain('3005.10.10');
    expect(said).not.toContain('30.05');
  });

  it('repair: an item naming the premise code is never sent, and an item carries only quotes found in its source (R4, G2)', async () => {
    const en = source(1, { heading: '30.05', label: EN3005.label, body: `${EN3005.body} Phân nhóm 3005.10.10 gồm băng dán cá nhân.` });
    const draft = {
      ...PHOTO_DRAFT,
      answerMd: `${PHOTO_DRAFT.answerMd} Phân nhóm 3005.10.10 là băng dán cá nhân [1].`,
      citations: [{ n: 1, quotes: [...PHOTO_DRAFT.citations[0]!.quotes, 'Phân nhóm 3005.10.10 gồm băng dán cá nhân'] }],
    };
    const premise = setup({ plan: PHOTO_PLAN, drafts: [draft], repairs: [{ sentences: ['Phân nhóm này là băng dán [1].'] }], sources: [en], lines: [{ prefix: '3005', heading: HEADING_TEXT }] });
    const res = await premise.svc.answer(PHOTO_BODY);
    expect(premise.prompts(undefined)).toHaveLength(0);
    expect(res).toMatchObject({ calls: 2, cut: 1, repaired: false, answerMd: PHOTO_DRAFT.answerMd });

    const madeUp = 'Điều 5 quy định hàng có C/O mẫu E được ưu đãi';
    const verbatim = MFN_DRAFT.citations[0]!.quotes[0]!;
    const legal = setup({
      plan: LEGAL_PLAN,
      drafts: [{ ...MFN_DRAFT, answerMd: 'Theo Điều 5, hàng có C/O mẫu E được ưu đãi đặc biệt [1].', citations: [{ n: 1, quotes: [verbatim, madeUp] }] }],
      repairs: [{ sentences: [''] }],
      sources: [GUIDE],
    });
    await legal.svc.answer({ q: LEGAL_Q });
    const [repair] = legal.prompts(undefined);
    expect(repair!.prompt).toContain(verbatim);
    expect(repair!.prompt).not.toContain(madeUp);
  });

  const ORIGIN = source(4, {
    kind: 'guidance',
    label: 'Hướng dẫn nộp chứng từ chứng nhận xuất xứ',
    body: 'Người khai hải quan nộp bản gốc chứng từ chứng nhận xuất xứ hàng hóa khi làm thủ tục hải quan.',
  });
  const LIST_DRAFT = {
    answerMd: 'Theo Điều 5, hàng có C/O mẫu E được ưu đãi đặc biệt [1, 2]. Bạn chuẩn bị C/O mẫu E [1]. Bản gốc chứng từ xuất xứ nộp khi làm thủ tục [2].',
    citations: [{ n: 1, quotes: MFN_DRAFT.citations[0]!.quotes }, { n: 2, quotes: ['nộp bản gốc chứng từ chứng nhận xuất xứ hàng hóa'] }],
    candidates: [],
    missingFacts: [],
    coverage: 'full',
  };

  it('a draft writing "[1, 2]" is repaired and cut on the sentence verify names (§4.1)', async () => {
    const clean = 'Hàng có C/O mẫu E hợp lệ được ưu đãi đặc biệt [1] [2].';
    const ok = setup({ plan: LEGAL_PLAN, drafts: [LIST_DRAFT], repairs: [{ sentences: [clean] }], sources: [GUIDE, ORIGIN] });
    const res = await ok.svc.answer({ q: LEGAL_Q });
    expect(res).toMatchObject({ cut: 0, repaired: true, calls: 3 });
    expect(res.answerMd).toMatch(/^Hàng có C\/O mẫu E hợp lệ được ưu đãi đặc biệt/);

    // A repair writing "[1, 2]" back into a first sentence still in violation: matched after expanding, so sources only.
    const stubborn = setup({ plan: LEGAL_PLAN, drafts: [LIST_DRAFT], repairs: [{ sentences: ['Theo Điều 5, hàng có C/O mẫu E hợp lệ được ưu đãi đặc biệt [1, 2].'] }], sources: [GUIDE, ORIGIN] });
    expect(await stubborn.svc.answer({ q: LEGAL_Q })).toMatchObject({ answerMd: '', repaired: true, calls: 3 });

    const late = setup({ drafts: [LIST_DRAFT], sources: [GUIDE, ORIGIN] });
    expect(await late.svc.answer({ q: LEGAL_Q, plan: LEGAL_PLAN, deadlineAt: Date.now() + 25_000 })).toMatchObject({ answerMd: '', cut: 1, repaired: false });
  });

  it('a repair giving up on the first sentence ("") cuts it: sources only, counted in cut (§4.1)', async () => {
    const draft = { ...MFN_DRAFT, answerMd: 'MFN là 0% [1]. Hàng có C/O mẫu E hợp lệ được hưởng ưu đãi đặc biệt [1].' };
    const res = await setup({ plan: LEGAL_PLAN, drafts: [draft], repairs: [{ sentences: [''] }], sources: [GUIDE] }).svc.answer({ q: LEGAL_Q });
    expect(res).toMatchObject({ answerMd: '', cut: 1, repaired: true, calls: 3 });
  });

  it('compose skipped or failed: the gathered sources alone, with their end-of-force line from data (§10, G7)', async () => {
    const expired = 'Nghị định 69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo Nghị định 292/2026/NĐ-CP';
    const status = source(3, { kind: 'status', label: 'Tình trạng hiệu lực — 69/2018/NĐ-CP', documentNumber: '69/2018/NĐ-CP', expired, body: 'Nghị định 69/2018/NĐ-CP được thay thế.' });
    const q = 'Nghị định 69/2018/NĐ-CP còn áp dụng không';
    const plan = { intent: 'status', question: q, scope: { doc: '69/2018/NĐ-CP' } };
    for (const [body, reason] of [[{ q, plan }, 'compose_failed'], [{ q, plan, deadlineAt: Date.now() }, 'deadline']] as const) {
      const res = await setup({ sources: [status] }).svc.answer(body);
      expect(res).toMatchObject({ answerMd: '', coverage: 'none', reason });
      expect(res.citations).toHaveLength(1);
      expect(res.citations[0]).toMatchObject({ n: 1, key: 'e:3', expired, quotes: [] });
    }
    // An is_error reply and a reply that is no draft fail compose the same way.
    for (const reply of [{ text: '{"answerMd":"x"}', isError: true, durationMs: 1 }, { text: 'không có JSON', isError: false, durationMs: 1 }]) {
      const failed = setup({ sources: [status] });
      failed.run.mockResolvedValueOnce(reply);
      expect(await failed.svc.answer({ q, plan })).toMatchObject({ answerMd: '', calls: 1, reason: 'compose_failed' });
    }
  });

  it('two candidates and no missing fact from compose: the plan\'s missing facts stand in (G4)', async () => {
    const en3824 = source(6, { heading: '38.24', label: 'Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24', body: 'Nhóm này bao gồm các chế phẩm hóa học chưa được chi tiết hoặc ghi ở nơi khác.' });
    const draft = {
      answerMd: 'Nếu miếng dán có tẩm dược chất và dùng cho y tế thì xét nhóm 30.05 [1]. Nếu không thì xét nhóm 38.24 [2].',
      citations: [PHOTO_DRAFT.citations[0]!, { n: 2, quotes: ['các chế phẩm hóa học chưa được chi tiết hoặc ghi ở nơi khác'] }],
      candidates: [{ hs: '30.05', evidence: [1] }, { hs: '38.24', evidence: [2] }],
      missingFacts: [],
      coverage: 'partial',
    };
    const lines = [{ prefix: '3005', heading: HEADING_TEXT }, { prefix: '3824', heading: 'Chế phẩm hóa học' }];
    const res = await setup({ plan: PHOTO_PLAN, drafts: [draft], sources: [EN3005, en3824], lines }).svc.answer(PHOTO_BODY);
    expect(res.candidates.map((c) => c.hs)).toEqual(['30.05', '38.24']);
    expect(res.missingFacts).toEqual(PHOTO_PLAN.goods.missing);
  });

  it('warns on a cited source of undetermined standing or an old catalogue (§2.4)', async () => {
    const undetermined = source(7, { kind: 'guidance', label: GUIDE.label, body: GUIDE.body, note: AUTHORITY_NOTE.undetermined });
    const old = { ...source(8, { kind: 'ruling', label: 'CV 1483/TCHQ-TXNK', body: GUIDE.body }), meta: { ahtn_2022: { trang_thai: 'thay_the' } } };
    const quotes = MFN_DRAFT.citations[0]!.quotes;
    const draft = { ...MFN_DRAFT, answerMd: 'Hàng có C/O mẫu E hợp lệ được áp dụng thuế suất ưu đãi đặc biệt [1] [2].', citations: [{ n: 1, quotes }, { n: 2, quotes }] };
    const res = await setup({ plan: LEGAL_PLAN, drafts: [draft], sources: [undetermined, old] }).svc.answer({ q: LEGAL_Q });
    expect(res.warnings).toEqual(['undetermined', 'old_catalog']);
    // Compose skipped: the sources listed alone carry the same warnings.
    const alone = await setup({ sources: [undetermined, old] }).svc.answer({ q: LEGAL_Q, plan: LEGAL_PLAN, deadlineAt: Date.now() });
    expect(alone).toMatchObject({ answerMd: '', warnings: ['undetermined', 'old_catalog'] });
  });

  it('a chapter the user named has no heading to compare, so it is no userCodes entry', async () => {
    const res = await setup({ plan: { intent: 'hs' } }).svc.answer({ q: 'miếng dán bàn chân ngải cứu có thuộc chương 30 không', planOnly: true });
    expect(res.userCodes).toEqual([]);
  });

  it('reads the body strictly: planOnly only when true, no impossible date reaches a query, malformed state is ignored', async () => {
    const strict = setup({ plan: LEGAL_PLAN });
    await strict.svc.answer({ q: LEGAL_Q, planOnly: 'false' as never });
    expect(strict.legal.gather).toHaveBeenCalled();

    const dates = setup();
    await dates.svc.answer({ q: LEGAL_Q, plan: LEGAL_PLAN, asOf: '2026-02-31' });
    await dates.svc.answer({ q: 'Hàng nhập ngày 31/02/2026 được hưởng ưu đãi thế nào', plan: LEGAL_PLAN });
    for (const [, opts] of dates.legal.gather.mock.calls) expect(opts.asOf).not.toBe('2026-02-31');

    const state = { tariff: { dotted: '3005.10.10', candidates: '30.05' }, legal: { citations: [null] } };
    await expect(setup({ plan: LEGAL_PLAN }).svc.answer({ q: LEGAL_Q, planOnly: true, context: { state } as never })).resolves.toBeTruthy();
  });

  it('today is Vietnam\'s date, and a client asOf dates the tariff lookup too', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-09-14T17:30:00Z') });
    try {
      const { svc, legal } = setup({ plan: LEGAL_PLAN });
      await svc.answer({ q: LEGAL_Q });
      expect(legal.gather.mock.calls[0]![1].asOf).toBe('2026-09-15');
    } finally {
      jest.useRealTimers();
    }
    const { svc, tariff } = setup({ plan: RATE_PLAN, tariff: tariffOf([]) });
    await svc.answer({ q: RATE_Q, asOf: '2026-09-01' });
    expect(tariff.lookup).toHaveBeenCalledWith('84818099', 'CN', '2026-09-01');
  });

  it('timingMs holds the manifest read, and a failed ruling lookup costs no verified answer', async () => {
    const slow = setup({ plan: LEGAL_PLAN });
    slow.legal.documents.mockImplementation(() => new Promise((done) => setTimeout(() => done([]), 40)));
    expect((await slow.svc.answer({ q: LEGAL_Q })).timingMs.plan).toBeGreaterThanOrEqual(30);

    const ruling = photo();
    ruling.confirmation.matchByProduct.mockRejectedValue(new Error('db down'));
    const res = await ruling.svc.answer(PHOTO_BODY);
    expect([res.ruling, res.answerMd.startsWith(`## ${SECTION_TITLES.facts}`), res.cut]).toEqual([null, true, 0]);
  });

  it('forceIntent without a plan stands on defaultPlan, and a client plan carrying a raw code is masked again', async () => {
    const forced = setup();
    expect((await forced.svc.answer({ q: 'Nghị định 08/2015 quy định gì', forceIntent: 'legal' })).calls).toBe(0);
    expect(forced.run).not.toHaveBeenCalled();

    const { svc } = setup();
    const res = await svc.answer({ q: PHOTO, plan: { ...PHOTO_PLAN, question: 'Miếng dán có hợp mã 3005.10.10 không', queries: ['mã 30051010'] }, planOnly: true });
    expect(res.plan.question).toBe('Miếng dán có hợp mã [mã 1] không');
    expect(res.plan.queries).toEqual(['mã [mã 1]']);
  });
});

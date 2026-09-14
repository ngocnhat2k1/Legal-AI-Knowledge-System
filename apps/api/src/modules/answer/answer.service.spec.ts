import { Logger } from '@nestjs/common';

import type { DocScope, GatherOpts, Source } from '../legal/legal.service';
import type { TariffResponse } from '../tariff/tariff.types';
import { type AnswerRequest, AnswerService } from './answer.service';
import type { ClaudeOpts } from './claude';
import { SYSTEM } from './compose';
import { userCodesIn } from './guards';
import { PLAN_SYSTEM } from './plan';

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
  repairs?: object[];
  sources?: Source[];
  scope?: Partial<DocScope>;
  tariff?: TariffResponse;
  lines?: Array<{ prefix: string; heading: string }>;
}

function setup(f: Fakes = {}) {
  const drafts = [...(f.drafts ?? [])];
  const repairs = [...(f.repairs ?? [])];
  const run = jest.fn(async (_prompt: string, opts: ClaudeOpts) => {
    const reply = opts.systemPrompt === PLAN_SYSTEM ? f.plan : opts.systemPrompt === SYSTEM ? drafts.shift() : repairs.shift();
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
  const confirmation = { matchByProduct: jest.fn(async () => []) };
  const db = { execute: jest.fn(async () => f.lines ?? []) };
  const svc = new AnswerService(legal as never, tariff as never, confirmation as never, db as never, run);
  const prompts = (system: string | undefined) => run.mock.calls.filter(([, o]) => o.systemPrompt === system).map(([p, o]) => ({ prompt: p, opts: o }));
  return { svc, run, legal, tariff, prompts };
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
const photo = () =>
  setup({ plan: PHOTO_PLAN, drafts: [PHOTO_DRAFT], sources: [EN3005], lines: [{ prefix: '3005', heading: HEADING_TEXT }, { prefix: '30051010', heading: HEADING_TEXT }] });
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

  it('(d) premise hs: no prompt holds the user code or an old turn; its heading is pinned unlabelled among the hints; the candidate backs the code', async () => {
    const { svc, prompts, legal } = photo();
    const res = await svc.answer(PHOTO_BODY);
    const [plan] = prompts(PLAN_SYSTEM);
    const [compose] = prompts(SYSTEM);
    expect(userCodesIn([plan!.prompt], ['3005.10.10'])).toEqual([]);
    expect(plan!.prompt).not.toMatch(/3005|30\.05/);
    expect(userCodesIn([compose!.prompt], ['3005.10.10'])).toEqual([]);
    expect(compose!.prompt.split('\nNGUỒN:\n')[0]).not.toMatch(/3005|30\.05|\[mã/);
    for (const t of OLD_TURNS) expect(compose!.prompt).not.toContain(t.body);

    const [first, ...others] = legal.gather.mock.calls.map(([, o]) => o);
    expect(first).toMatchObject({ hsCodes: [], headings: ['30.04', '30.05', '33.07', '38.24'], clauses: 0, cases: true });
    for (const o of others) expect(o).toMatchObject({ hsCodes: [], headings: [], cases: false });

    expect(res.answerMd).toBe(PHOTO_DRAFT.answerMd);
    expect(res.candidates).toEqual([{ hs: '30.05', level: 4, title: HEADING_TEXT, evidence: [1] }]);
    expect(res.userCodes[0]).toMatchObject({ code: '3005.10.10', exists: true, inCandidates: true });
    expect(res.citations[0]).toMatchObject({ n: 1, key: 'e:1', kind: 'en', hsHeading: '30.05', quotes: PHOTO_DRAFT.citations[0]!.quotes });
    expect(res.calls).toBe(2);
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
    expect(await bad.svc.answer({ q: LEGAL_Q })).toMatchObject({ cut: 1, repaired: true, answerMd: '' });
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
    expect(res).toMatchObject({ coverage: 'none', answerMd: '', calls: 1 });
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

  it('(l) the bot\'s partial tariff plan: no plan call, origin kept, a rate line naming the code dropped by the latch', async () => {
    const t = tariffOf([{ ...rate('ACFTA', 'ASEAN–Trung Quốc', 'Theo dòng 10 số: 8481.80.99.10 Van bi: 0%'), form: 'E', requiresCo: true }]);
    const { svc, run, tariff, prompts } = setup({ drafts: [TARIFF_DRAFT], tariff: t });
    const res = await svc.answer({ q: 'thuế nk 8481.80.99 tq', plan: { intent: 'tariff', origin: 'CN', date: null }, forceIntent: 'tariff' });
    expect(prompts(PLAN_SYSTEM)).toHaveLength(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(tariff.lookup).toHaveBeenCalledWith('84818099', 'CN', expect.any(String));
    const [compose] = prompts(SYSTEM);
    expect(userCodesIn([compose!.prompt], ['8481.80.99'])).toEqual([]);
    expect(compose!.prompt).not.toMatch(/8481/);
    expect(res.plan.question).toBe('thuế nk [mã 1] tq');
    expect(res.calls).toBe(1);
    const line = logged.mock.calls.map(([m]) => String(m)).find((m) => m.startsWith('{'))!;
    expect(JSON.parse(line).leakDrops).toEqual(['tariffLines']);
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

import { numberMarkers } from '../legal/legal.grounding';
import { LARGE, SMALL, superLinear } from './growth.probe';
import { type Draft, quoteInBody, ratesInProse, settlementClaims, type Source, splitSentences, verify, type VerifyContext } from './guards';

// The timing fixtures only have to be well formed — guards.spec.ts owns what they mean — so they are kept here rather
// than shared, and this file runs alone under `yarn test:growth`, never beside parallel jest workers.
const source = (over: Partial<Source>): Source => ({ kind: 'en', label: '', body: '', hsHeading: null, hsCodes: [], documentNumber: null, expired: null, ...over });
const ctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({ userText: '', codeRole: 'none', userCodes: [], headings: new Set(['30.04', '30.05', '33.07', '38.24']), ...over });
const draft = (answerMd: string, citations: Draft['citations']): Draft => ({ answerMd, citations, candidates: [], missingFacts: [] });
const en3005 = source({ label: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05', hsHeading: '30.05', hsCodes: ['3005.10.10'], body: 'Nhóm này bao gồm bông, gạc, băng đã thấm tẩm dược chất.' });
const en3824 = source({ label: 'Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24', hsHeading: '38.24', body: 'Nhóm này bao gồm các chế phẩm hóa chất chưa được chi tiết ở nơi khác.' });
const q1 = { n: 1, quotes: ['bông, gạc, băng đã thấm tẩm dược chất'] };
const q2 = { n: 2, quotes: ['các chế phẩm hóa chất chưa được chi tiết ở nơi khác'] };

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

  const [small, large] = [inputsAt(SMALL), inputsAt(LARGE)];
  // growth.probe.ts holds the method, the calibration and the limit; the first super-linear input ends the test.
  it.each(guards)('%s grows linearly with the length of each input', (name, guard) => {
    guard('Nếu chưa rõ công dụng thì phải xét 38.24 [1].');
    for (const [i, input] of small.entries()) expect(superLinear(guard, input, large[i]!, name)).toEqual([]);
  }, 300_000);
});

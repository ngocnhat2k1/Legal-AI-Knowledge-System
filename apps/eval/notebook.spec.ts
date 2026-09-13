import { scoreCase, summarize, visibleText, norm, type NotebookCase } from './notebook';

const base: NotebookCase = { id: 'x', q: 'q', safety: true };

describe('norm', () => {
  it('collapses whitespace and case, keeps diacritics', () => {
    expect(norm('  NĐ  292/2026  ')).toBe('nđ 292/2026');
  });
});

describe('visibleText', () => {
  it('joins the prose with every citation text, both /legal and /answer shapes', () => {
    const t = visibleText({
      answer: 'A',
      citations: [{ verbatimText: 'B' }, { quote: 'C' }],
    });
    expect(t).toContain('A');
    expect(t).toContain('B');
    expect(t).toContain('C');
  });
});

describe('scoreCase', () => {
  it('passes when every mustSay is present and no mustNotSay is', () => {
    const r = scoreCase(
      { ...base, mustSay: ['292/2026', '05/09/2026'], mustNotSay: ['còn hiệu lực'] },
      { answer: 'NĐ 69/2018 đã bị NĐ 292/2026 thay thế từ 05/09/2026.' },
    );
    expect(r.passed).toBe(true);
    expect(r.failed).toEqual([]);
  });

  it('fails a missing mustSay and a present mustNotSay, naming each', () => {
    const r = scoreCase(
      { ...base, mustSay: ['292/2026'], mustNotSay: ['còn hiệu lực'] },
      { answer: 'NĐ 69/2018 còn hiệu lực.' },
    );
    expect(r.passed).toBe(false);
    expect(r.failed).toEqual(['mustSay:292/2026', 'mustNotSay:còn hiệu lực']);
  });

  it('matches expect {doc, dieu} on a citation article label', () => {
    const c = { ...base, expect: { doc: '46/VBHN-BTC', dieu: 18 } };
    expect(scoreCase(c, { citations: [{ documentNumber: '46/VBHN-BTC', articleLabel: 'Điều 18 Nghị định 08/2015/NĐ-CP' }] }).passed).toBe(true);
    expect(scoreCase(c, { citations: [{ documentNumber: '46/VBHN-BTC', articleLabel: 'Điều 180 …' }] }).failed).toEqual(['expect:46/VBHN-BTC Điều 18']);
  });

  it('skips expectEvidence / expectIntent / expectWarnings when the response cannot carry them, leaving the case unscored', () => {
    const r = scoreCase(
      { ...base, expectEvidence: [{ kind: 'status', instrument: '69/2018/NĐ-CP' }], expectIntent: 'hs', expectWarnings: ['upcoming'] },
      { answer: 'x' },
    );
    expect(r.skipped).toEqual(['expectEvidence', 'expectIntent', 'expectWarnings']);
    expect(r.scored).toBe(false);
    expect(r.passed).toBe(false);
  });

  it('scores a case where one check runs and another is skipped', () => {
    const r = scoreCase({ ...base, mustSay: ['292/2026'], expectIntent: 'hs' }, { answer: 'NĐ 292/2026' });
    expect(r.skipped).toEqual(['expectIntent']);
    expect(r.scored).toBe(true);
    expect(r.passed).toBe(true);
  });

  it('scores should_abstain: abstaining passes, answering with citations fails', () => {
    const c = { ...base, should_abstain: true };
    expect(scoreCase(c, { abstained: true }).passed).toBe(true);
    const answered = scoreCase(c, { answer: 'Có.', citations: [{ documentNumber: '46/VBHN-BTC', articleLabel: 'Điều 18' }] });
    expect(answered.passed).toBe(false);
    expect(answered.failed).toEqual(['should_abstain']);
  });

  it('scores expectEvidence by retrieved (kind, instrument|hsHeading|phan)', () => {
    const c = { ...base, expectEvidence: [{ kind: 'en', hsHeading: '84.18' }] };
    expect(scoreCase(c, { citations: [{ kind: 'en', hsHeading: '84.18' }] }).passed).toBe(true);
    expect(scoreCase(c, { citations: [{ kind: 'en', hsHeading: '84.17' }] }).failed).toEqual(['expectEvidence:en 84.18']);
  });

  it('scores expectIntent and expectWarnings when present', () => {
    expect(scoreCase({ ...base, expectIntent: 'tariff' }, { plan: { intent: 'tariff' } }).passed).toBe(true);
    expect(scoreCase({ ...base, expectIntent: 'tariff' }, { plan: { intent: 'legal' } }).failed).toEqual(['expectIntent:tariff']);
    expect(scoreCase({ ...base, expectWarnings: ['upcoming'] }, { warnings: ['upcoming'] }).passed).toBe(true);
    expect(scoreCase({ ...base, expectWarnings: ['upcoming'] }, { warnings: [] }).failed).toEqual(['expectWarnings:upcoming']);
  });

  it('treats a null response as a failure of every applicable check', () => {
    const r = scoreCase({ ...base, mustSay: ['a'] }, null);
    expect(r.scored).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.failed).toEqual(['no-response']);
  });
});

describe('summarize', () => {
  it('keeps an unscored safety case out of passed, safetyPassed and misses, and lists it separately', () => {
    const m = summarize([
      scoreCase({ ...base, id: 'ok', mustSay: ['a'] }, { answer: 'a' }),
      scoreCase({ ...base, id: 'miss', mustSay: ['b'] }, { answer: 'a' }),
      scoreCase({ ...base, id: 'nb-07', expectIntent: 'tariff' }, { answer: 'a' }),
    ]);
    expect(m.passed).toBe(1);
    expect(m.safetyPassed).toBe(1);
    expect(m.safetyTotal).toBe(3);
    expect(m.unscored).toBe(1);
    expect(m.unscoredCases).toEqual(['nb-07 (bỏ qua: expectIntent)']);
    expect(m.misses).toEqual(['miss: mustSay:b']);
  });
});

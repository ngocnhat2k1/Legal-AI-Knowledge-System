import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { foldDocNumber, lookupGazette, parseDocRef, resolveDocuments } from './legal.scope';

/**
 * The 69/2018 bug (spec §5b.8): a number the user wrote in full must match that one document —
 * however Đ and a leading zero are typed — and never another agency's document with the same serial.
 */
const dialect = new PgDialect();

describe('foldDocNumber', () => {
  it('reads Đ/D and a leading zero as the same number, a different issuer as a different one', () => {
    expect(foldDocNumber('08/2015/NĐ-CP')).toBe(foldDocNumber('8/2015/ND-CP'));
    expect(foldDocNumber('08/2015/NĐ-CP')).not.toBe(foldDocNumber('08/2015/TT-BTC'));
  });
});

describe('lookupGazette — a full number is matched exactly, folded in SQL', () => {
  it('sends the folded number to the exact query and reports an exact hit', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      execute: async (q: SQL) => {
        queries.push(dialect.sqlToQuery(q));
        return [{ number: '69/2018/NĐ-CP', docType: 'nghi_dinh', title: 't', sourceUrl: 'u', congbaoId: 1 }];
      },
    };
    const res = await lookupGazette(db as never, parseDocRef('69/2018/ND-CP')!);
    expect(res.exact).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain("translate(upper(number), 'Đđ', 'DD')");
    expect(queries[0]!.params).toContain('69/2018/ND-CP');
  });
});

describe('resolveDocuments — a full number names one document', () => {
  it('returns [] for 69/2018/TT-BTC when the corpus holds only 69/2018/NĐ-CP', async () => {
    const db = { execute: async () => [{ id: 1, number: '69/2018/NĐ-CP', title: 't', docType: 'nghi_dinh', consolidates: null }] };
    expect(await resolveDocuments(db as never, parseDocRef('Thông tư 69/2018/TT-BTC')!)).toEqual([]);
  });

  it('still reaches the VBHN that consolidates the decree asked for', async () => {
    const row = { id: 7, number: '46/VBHN-BTC', title: 't', docType: 'vbhn', consolidates: '08/2015/NĐ-CP' };
    const db = { execute: async () => [row] };
    expect(await resolveDocuments(db as never, parseDocRef('Nghị định 8/2015/ND-CP')!)).toEqual([row]);
  });
});

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import { ConversationService } from './conversation.service';

/** questionFor against a db that records the query it was given (checked on a real Postgres by hand, 2026-09-22). */
function setup(rows: unknown[] = []) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    execute: jest.fn(async (q: SQL) => {
      queries.push(new PgDialect().sqlToQuery(q));
      return rows;
    }),
  };
  return { svc: new ConversationService(db as never), queries };
}

const ERROR = 'Mình tạm thời chưa trả lời được: dịch vụ AI (Claude) báo lỗi "401".\n  Trong lúc chờ, tra thuế';

describe('ConversationService.questionFor — the question a quoted bot reply answered', () => {
  it('matches the whitespace-folded quote against bot turns of the whole thread, and returns the user turn before it', async () => {
    const { svc, queries } = setup([{ question: 'hs code Lưỡi dao răng cưa', staff_name: 'Chi' }]);
    expect(await svc.questionFor('zalo', 'g1', ERROR)).toEqual({ question: 'hs code Lưỡi dao răng cưa', staffName: 'Chi' });
    const [q] = queries;
    expect(q!.sql).toContain(`regexp_replace(b.body, '\\s+', ' ', 'g')`);
    expect(q!.sql).not.toContain('user_id =');
    expect(q!.params).toEqual(expect.arrayContaining(['zalo', 'g1', 'Mình tạm thời chưa trả lời được: dịch vụ AI (Claude) báo lỗi "401". Trong lúc chờ, tra thuế']));
  });

  // The bot's error lines read the same for everyone: without the quoted message's time the newest match is someone else's.
  it('picks the bot turn nearest the quoted message time, read in ms or seconds; without one, the newest', async () => {
    const { svc, queries } = setup();
    await svc.questionFor('zalo', 'g1', ERROR, 1_790_060_052_400);
    await svc.questionFor('zalo', 'g1', ERROR, 1_790_060_052);
    await svc.questionFor('zalo', 'g1', ERROR);
    expect(queries[0]!.sql).toMatch(/ORDER BY abs\(extract\(epoch FROM b\.created_at\) \* 1000 - \$\d+\), b\.id DESC/);
    expect(queries[0]!.params).toContain(1_790_060_052_400);
    expect(queries[1]!.params).toContain(1_790_060_052_000);
    expect(queries[2]!.sql).toMatch(/ORDER BY b\.id DESC\s+LIMIT 1\s*$/);
  });

  it('a short quote ("ok", "Dạ") sits inside any reply: no query, no question', async () => {
    const { svc, queries } = setup([{ question: 'x', staff_name: null }]);
    expect(await svc.questionFor('zalo', 'g1', '  Dạ  ok ')).toBeNull();
    expect(queries).toHaveLength(0);
  });
});

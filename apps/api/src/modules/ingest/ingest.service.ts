import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';

export interface IngestRequestView {
  id: number;
  number: string;
  status: string;
  detail: string | null;
  threadId: string | null;
  userId: string | null;
  requestedBy: string | null;
}

/**
 * The queue between "a chat message asked for a document" and "the corpus has it".
 *
 * It exists because ingest takes minutes — fetch, parse, embed — which is far longer
 * than the message that requested it lives. The row carries the thread to report back
 * to, so the answer can find its way home. The worker that drains it lives in
 * apps/ingest (Python: the parser needs pdfplumber).
 */
@Injectable()
export class IngestService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  /**
   * Queue a document, or return the request already in flight for it. Two people asking
   * for the same circular within the same few minutes must not cause two ingests: the
   * second would race the first into a unique-constraint failure on legal_document.
   */
  async request(input: {
    number: string;
    requestedBy?: string | null;
    threadId?: string | null;
    userId?: string | null;
  }): Promise<{ id: number; status: string; alreadyQueued: boolean }> {
    const number = (input.number ?? '').trim().toUpperCase();
    if (!/^\d+[A-ZĐ]?\/\S+$/.test(number)) throw new BadRequestException('number must be a document number');

    const existing = (await this.db.execute(sql`
      SELECT id, status FROM ingest_request
      WHERE upper(number) = ${number} AND status IN ('queued', 'running')
      ORDER BY id DESC LIMIT 1
    `)) as unknown as Array<{ id: number; status: string }>;
    if (existing[0]) return { ...existing[0], alreadyQueued: true };

    const rows = (await this.db.execute(sql`
      INSERT INTO ingest_request (number, requested_by, thread_id, user_id)
      VALUES (${number}, ${input.requestedBy?.slice(0, 64) ?? null},
              ${input.threadId?.slice(0, 64) ?? null}, ${input.userId?.slice(0, 64) ?? null})
      RETURNING id, status
    `)) as unknown as Array<{ id: number; status: string }>;
    return { ...rows[0]!, alreadyQueued: false };
  }

  /** Finished requests nobody has told the requester about yet. */
  async reports(): Promise<IngestRequestView[]> {
    return (await this.db.execute(sql`
      SELECT id, number, status, detail, thread_id AS "threadId",
             user_id AS "userId", requested_by AS "requestedBy"
      FROM ingest_request
      WHERE status IN ('done', 'failed')
      ORDER BY id
      LIMIT 20
    `)) as unknown as IngestRequestView[];
  }

  /**
   * Mark reports delivered. Acknowledged as a SEPARATE step from finishing, so a bot
   * that crashes between reading and sending re-reports instead of losing the outcome —
   * a duplicate message is a much smaller failure than silence after a promise to follow up.
   */
  async acknowledge(ids: number[]): Promise<{ acknowledged: number }> {
    const clean = (ids ?? []).map(Number).filter(Number.isFinite);
    if (!clean.length) return { acknowledged: 0 };
    const rows = (await this.db.execute(sql`
      UPDATE ingest_request SET status = status || '_reported'
      WHERE id IN (${sql.join(clean.map((i) => sql`${i}`), sql`, `)}) AND status IN ('done', 'failed')
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    return { acknowledged: rows.length };
  }

  /**
   * Promote an auto-ingested document to verified — a human read it and stands behind it.
   * This is the point of the whole three-layer design: the corpus grows by machine, but
   * authority is only ever granted by a person, and the trail says who.
   */
  async verify(numberRaw: string, staffName: string): Promise<{ verified: boolean; number: string }> {
    const number = (numberRaw ?? '').trim().toUpperCase();
    const staff = (staffName ?? '').trim();
    if (!number) throw new BadRequestException('number is required');
    if (!staff) throw new BadRequestException('staffName is required (for the audit trail)');
    const rows = (await this.db.execute(sql`
      UPDATE legal_document
      SET verification = 'verified', note_verified_by = ${staff.slice(0, 64)}
      WHERE upper(number) = ${number} AND verification = 'auto_unverified'
      RETURNING number
    `)) as unknown as Array<{ number: string }>;
    return { verified: rows.length > 0, number };
  }
}

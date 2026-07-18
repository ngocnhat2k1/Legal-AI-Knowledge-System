import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';

const HS8 = /^\d{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERDICTS = ['correct', 'wrong', 'unsure'] as const;
type Verdict = (typeof VERDICTS)[number];

export interface ConfirmInput {
  hs: string;
  origin?: string | null;
  date: string;
  schedule?: string | null;
  verdict: string;
  staffName: string;
  note?: string | null;
  snapshot?: unknown;
}

export interface ConfirmationSummary {
  correct: number;
  wrong: number;
  unsure: number;
  recent: Array<{ verdict: Verdict; staffName: string; note: string | null; schedule: string | null; at: string }>;
}

/**
 * Records and aggregates point-of-use verdicts on looked-up rates (Phase 3
 * verify loop). This is how the golden set's `uncertain` data earns confidence:
 * not by up-front certification, but by staff confirming rates as they use them,
 * building a per-person audit trail.
 */
@Injectable()
export class ConfirmationService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async record(input: ConfirmInput): Promise<{ id: number; createdAt: string }> {
    const hs = (input.hs ?? '').replace(/\./g, '').trim();
    if (!HS8.test(hs)) throw new BadRequestException('hs must be 8 digits');
    if (!ISO_DATE.test(input.date ?? '')) throw new BadRequestException('date must be YYYY-MM-DD');
    if (!VERDICTS.includes(input.verdict as Verdict)) {
      throw new BadRequestException(`verdict must be one of ${VERDICTS.join(', ')}`);
    }
    const staff = (input.staffName ?? '').trim();
    if (!staff) throw new BadRequestException('staffName is required (for the audit trail)');

    const rows = (await this.db.execute(sql`
      INSERT INTO lookup_confirmation (hs_code, origin, as_of_date, schedule, verdict, staff_name, note, response_snapshot)
      VALUES (${hs}, ${input.origin?.trim().toUpperCase() || null}, ${input.date},
              ${input.schedule?.trim() || null}, ${input.verdict}, ${staff.slice(0, 64)},
              ${input.note?.trim().slice(0, 1000) || null},
              ${input.snapshot ? sql`${JSON.stringify(input.snapshot)}::jsonb` : null})
      RETURNING id, created_at::text AS created_at
    `)) as unknown as Array<{ id: number; created_at: string }>;
    return { id: rows[0]!.id, createdAt: rows[0]!.created_at };
  }

  /** Prior verdicts on this HS (+ origin), so the UI can show "confirmed correct N times". */
  async summary(hsRaw: string, originRaw?: string | null): Promise<ConfirmationSummary> {
    const hs = (hsRaw ?? '').replace(/\./g, '').trim();
    if (!HS8.test(hs)) throw new BadRequestException('hs must be 8 digits');
    const origin = originRaw?.trim().toUpperCase() || null;

    const counts = (await this.db.execute(sql`
      SELECT verdict, count(*)::int AS n FROM lookup_confirmation
      WHERE hs_code = ${hs} ${origin ? sql`AND origin = ${origin}` : sql``}
      GROUP BY verdict
    `)) as unknown as Array<{ verdict: Verdict; n: number }>;

    const recent = (await this.db.execute(sql`
      SELECT verdict, staff_name AS "staffName", note, schedule, created_at::text AS at
      FROM lookup_confirmation
      WHERE hs_code = ${hs} ${origin ? sql`AND origin = ${origin}` : sql``}
      ORDER BY created_at DESC LIMIT 8
    `)) as unknown as ConfirmationSummary['recent'];

    const byVerdict = Object.fromEntries(counts.map((c) => [c.verdict, c.n]));
    return {
      correct: byVerdict.correct ?? 0,
      wrong: byVerdict.wrong ?? 0,
      unsure: byVerdict.unsure ?? 0,
      recent,
    };
  }
}

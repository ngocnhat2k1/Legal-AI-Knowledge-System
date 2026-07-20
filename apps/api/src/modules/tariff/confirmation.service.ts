import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';

const HS8 = /^\d{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERDICTS = ['correct', 'wrong', 'unsure'] as const;
// Function words + category words too generic to discriminate a product ("thiết bị điện tử"
// describes almost everything imported), dropped before scoring a note-keyword match.
const CONFIRM_STOP = new Set([
  'và', 'là', 'cho', 'của', 'các', 'một', 'có', 'được', 'trong', 'khi', 'này', 'đó', 'với', 'theo',
  'dùng', 'loại', 'thiết', 'bị', 'điện', 'tử', 'hàng', 'bằng', 'như', 'để', 'kèm', 'gồm',
  'the', 'and', 'for', 'with', 'device',
]);
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

  /**
   * Find HS codes a human already CONFIRMED CORRECT for a product whose note matches the
   * given keywords. This is how a staff ruling (e.g. "beacon định vị → 8531.80.19, CV …")
   * resurfaces on a later lookup of a similar item. Keyword match on the note column only —
   * NO vector, NO LLM (no-llm-on-tariff-numbers ADR: tariff tables never get a vector surface).
   * The returned code is a recorded human decision, cited back verbatim — never a bot guess.
   */
  async matchByProduct(keywordsRaw: string): Promise<
    Array<{ hs: string; origin: string | null; note: string | null; staffName: string; at: string; score: number }>
  > {
    // DISTINCT tokens (dedup) so a repeated word can't inflate the score; drop function/category
    // words that carry no signal in a customs product ("thiết bị điện tử" is nearly everything);
    // keep 2-char Vietnamese syllables (van, thẻ, ốc, vị) that are actually discriminating.
    const tokens = [
      ...new Set(
        String(keywordsRaw ?? '')
          .normalize('NFC')
          .toLowerCase()
          .split(/[,\s]+/)
          .map((k) => k.trim())
          .filter((k) => k.length >= 2 && !CONFIRM_STOP.has(k)),
      ),
    ].slice(0, 12);
    if (!tokens.length) return [];
    // score = number of DISTINCT query tokens present in the note (more overlap = more relevant);
    // the caller requires an adaptive threshold so a single common word can't promote a ruling.
    const scoreExpr = sql.join(
      tokens.map((t) => sql`(CASE WHEN lower(lc.note) LIKE ${'%' + t + '%'} THEN 1 ELSE 0 END)`),
      sql` + `,
    );
    const anyExpr = sql.join(
      tokens.map((t) => sql`lower(lc.note) LIKE ${'%' + t + '%'}`),
      sql` OR `,
    );
    // A 'correct' ruling is retracted by a LATER 'wrong' on the same code (verify-loop is how a
    // mistyped/poisoned ruling gets undone — no manual DB surgery), so anti-join those out.
    return (await this.db.execute(sql`
      SELECT lc.hs_code AS hs, lc.origin, lc.note, lc.staff_name AS "staffName",
             lc.created_at::text AS at, (${scoreExpr})::int AS score
      FROM lookup_confirmation lc
      WHERE lc.verdict = 'correct' AND lc.note IS NOT NULL AND (${anyExpr})
        AND NOT EXISTS (
          SELECT 1 FROM lookup_confirmation w
          WHERE w.hs_code = lc.hs_code AND w.verdict = 'wrong' AND w.created_at > lc.created_at
        )
      ORDER BY score DESC, lc.created_at DESC
      LIMIT 10
    `)) as unknown as Array<{ hs: string; origin: string | null; note: string | null; staffName: string; at: string; score: number }>;
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

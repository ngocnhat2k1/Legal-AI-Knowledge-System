/**
 * Drizzle schema for Customs Assistant — the tariff model (TASK-007).
 *
 * The obvious schema `(hs, origin) -> rate` is a lie. Research 12 verified five
 * ways it breaks, and the timeline breaks a sixth. This schema is built so those
 * six cases are *representable without special-casing*, and so the database —
 * not convention — refuses the shapes that would silently produce a wrong rate:
 *
 *   1. Same HS, different rate in Annex I (export) vs Annex II (import).
 *      -> annex identity is a NOT NULL foreign key; a rate row without an annex
 *         cannot be inserted. 1,329 of 1,520 two-annex HS codes differ.
 *   2. `*` means EXCLUDED, not 0%.               -> rate_type = 'excluded', no number.
 *   3. Absolute USD duty (used cars, Annex III). -> rate_type = 'specific', amount + currency + unit.
 *   4. FTA rate is conditional on a valid C/O.   -> tariff_schedule.requires_co; the API composes
 *                                                   "0% if C/O else <MFN>" from two rows, never a bare 0%.
 *   5. TRQ goods (04.07, 17.01, 24.01, 25.01).   -> rate_type = 'trq', out_of_quota_annex_id points at the
 *                                                   separate annex holding the over-quota rate.
 *   6. A decree expires and the rate silently regresses (ND 72/2026 lapses
 *      2026-04-30 -> reverts to ND 26/2023).      -> validity is an interval [effective_from, effective_to];
 *                                                   a point-in-time read is an interval predicate, never
 *                                                   `ORDER BY date DESC LIMIT 1`. The loader splits the base
 *                                                   interval around the carve-out so the intervals are
 *                                                   disjoint and exactly one row matches any given date.
 *
 * Two time axes (bitemporal — see the bitemporal-validity ADR):
 *   - VALID time    (effective_from / effective_to): when the law is in force. From the decree.
 *   - TRANSACTION time (recorded_at / superseded_at): when *we* learned it. Append-only — corrections
 *     are new rows; the old row is stamped superseded_at, never UPDATEd or DELETEd. TASK-010 reads
 *     recorded_at as the snapshot date to decide whether an answer is stale.
 *
 * DB-enforced integrity that lives in 0002 (SQL Drizzle cannot express):
 *   - btree_gist EXCLUDE constraint: no two live rows for the same
 *     (hs_code, hs_version, annex, schedule) may have overlapping validity intervals.
 *     This is what makes "exactly one row matches a date" a database guarantee, and it is
 *     satisfiable precisely because the loader splits intervals (case 6).
 *   - append-only trigger: DELETE forbidden; UPDATE forbidden except stamping superseded_at once.
 *
 * Anti-dumping duty (CBPG) is a SEPARATE charge, not a tariff line: it stacks on the
 * import duty, is scoped by origin (and sometimes exporter), and comes from a Bộ Công Thương
 * decision, not the tariff decree. Real declarations in the golden set carry it (~35% stacked
 * on NK duty on some lines). Modelling it inside tariff_rate would corrupt the rate; it gets
 * its own table.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

// --- Enumerations -----------------------------------------------------------

/** How a tariff line's rate is expressed. `excluded` = the `*` marker (no number at all). */
export const rateType = pgEnum('rate_type', [
  'ad_valorem', // a percentage of customs value
  'specific', // an absolute amount per unit (USD) — Annex III used cars
  'compound', // both a percentage and an absolute amount
  'excluded', // the `*` marker: good is excluded from the schedule, NOT 0%
  'trq', // tariff-rate quota: in-quota rate here, over-quota rate in out_of_quota_annex_id
]);

/** Annex I is the export schedule; Annex II the (preferential) import schedule. The two-annex trap. */
export const tradeDirection = pgEnum('trade_direction', ['import', 'export']);

/** Anti-dumping duties are either a percentage or an absolute amount per unit. */
export const dutyKind = pgEnum('duty_kind', ['percent', 'specific']);

// --- HS nomenclature version (a dimension, not a hardcoded constant) ---------

/**
 * HS/AHTN nomenclature versions with their own validity. AHTN 2022 is current;
 * HS 2028 takes effect 2028-01-01 and re-maps categories. A rate is meaningless
 * without the version its HS code belongs to — never hardcode "AHTN 2022".
 */
export const hsVersion = pgTable('hs_version', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 16 }).notNull().unique(), // 'AHTN-2022', 'HS-2028'
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'), // null = still current
  note: text('note'),
});

// --- Decree (the authoritative legal source document) ------------------------

/**
 * A source legal document. The four dates diverge and every one of them matters
 * (TASK-010): ND 72/2026 was signed 2026-03-09 (effective the same day), gazetted
 * 2026-03-24 (15 days after it was already binding law), and expired 2026-04-30.
 */
export const decree = pgTable('decree', {
  id: serial('id').primaryKey(),
  number: varchar('number', { length: 32 }).notNull().unique(), // '26/2023/NĐ-CP'
  title: text('title').notNull(),
  signedDate: date('signed_date'), // ngày ký
  gazetteDate: date('gazette_date'), // ngày đăng công báo
  effectiveFrom: date('effective_from').notNull(), // ngày hiệu lực
  effectiveTo: date('effective_to'), // ngày hết hiệu lực (null = open)
  gazetteIssue: varchar('gazette_issue', { length: 32 }), // '743+744'
  sourceUrl: text('source_url'),
  note: text('note'),
});

// --- Annex (phụ lục) — first-class, cannot be defaulted ----------------------

/**
 * A phụ lục within a decree. Annex identity is part of what keys a rate, because
 * the same HS carries a different rate in Annex I (export) than Annex II (import).
 * The naive parser that ignored annexes reported 94% success while returning export
 * rates for import queries.
 */
export const annex = pgTable(
  'annex',
  {
    id: serial('id').primaryKey(),
    decreeId: integer('decree_id')
      .notNull()
      .references(() => decree.id),
    code: varchar('code', { length: 8 }).notNull(), // 'I', 'II', 'III'
    name: text('name').notNull(),
    tradeDirection: tradeDirection('trade_direction').notNull(),
  },
  (t) => [unique('annex_decree_code_uq').on(t.decreeId, t.code)],
);

// --- Tariff schedule (biểu thuế: MFN, or a specific FTA) ---------------------

/**
 * A rate schedule — MFN preferential (NK_uu_dai) or a specific FTA. `requires_co`
 * carries the conditionality: an FTA rate is only "0%" if a valid C/O accompanies
 * the goods; otherwise the MFN rate applies. The lookup API composes this from the
 * two rows and never returns a bare 0%.
 */
export const tariffSchedule = pgTable('tariff_schedule', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 24 }).notNull().unique(), // 'NK_uu_dai', 'ACFTA', 'AANZFTA', 'EVFTA_NK', 'XK'
  name: text('name').notNull(),
  ftaForm: varchar('fta_form', { length: 16 }), // C/O form: 'E', 'D', 'AANZ', 'EUR.1/REX'; null for MFN
  requiresCo: boolean('requires_co').notNull().default(false),
  note: text('note'),
});

// --- Tariff rate (the core line — append-only, bitemporal) -------------------

export const tariffRate = pgTable(
  'tariff_rate',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    hsCode: varchar('hs_code', { length: 8 }).notNull(), // 8 digits, no dots: '84818099'
    hsVersionId: integer('hs_version_id')
      .notNull()
      .references(() => hsVersion.id),
    // NOT NULL: a rate row cannot exist without an annex. This is the DB-enforced
    // "cannot insert a row without an annex" acceptance criterion.
    annexId: integer('annex_id')
      .notNull()
      .references(() => annex.id),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => tariffSchedule.id),
    rateType: rateType('rate_type').notNull(),
    ratePercent: numeric('rate_percent', { precision: 7, scale: 4 }), // ad_valorem / compound / trq in-quota
    amount: numeric('amount', { precision: 14, scale: 2 }), // specific / compound absolute amount
    amountCurrency: varchar('amount_currency', { length: 3 }), // 'USD'
    amountUnit: varchar('amount_unit', { length: 24 }), // 'chiếc', 'kg'
    // Valid time — when the law is in force. effective_to is inclusive; null = open-ended.
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    sourceDecreeId: integer('source_decree_id')
      .notNull()
      .references(() => decree.id),
    gazetteIssue: varchar('gazette_issue', { length: 32 }),
    // For rate_type = 'trq': the annex holding the over-quota rate.
    outOfQuotaAnnexId: integer('out_of_quota_annex_id').references(() => annex.id),
    conditions: jsonb('conditions'), // extra per-line conditions (RCEP Art 6.2 note, direct-import, etc.)
    sourceCellText: text('source_cell_text'), // verbatim source cell from Công báo (TASK-008)
    // Transaction time — when we recorded it. Append-only: superseded_at is stamped, never a hard delete.
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    note: text('note'),
  },
  (t) => [
    index('tariff_rate_lookup_idx').on(t.hsCode, t.scheduleId, t.annexId),
    check('tariff_rate_hs_format', sql`${t.hsCode} ~ '^[0-9]{8}$'`),
    check(
      'tariff_rate_validity_order',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    // The rate SHAPE must match its type — no ad_valorem row carrying a USD amount,
    // no `*` exclusion carrying a number, no specific duty without a currency and unit.
    check(
      'tariff_rate_shape',
      sql`CASE ${t.rateType}
        WHEN 'ad_valorem' THEN ${t.ratePercent} IS NOT NULL AND ${t.amount} IS NULL AND ${t.amountCurrency} IS NULL
        WHEN 'specific'   THEN ${t.amount} IS NOT NULL AND ${t.amountCurrency} IS NOT NULL AND ${t.amountUnit} IS NOT NULL AND ${t.ratePercent} IS NULL
        WHEN 'compound'   THEN ${t.ratePercent} IS NOT NULL AND ${t.amount} IS NOT NULL AND ${t.amountCurrency} IS NOT NULL AND ${t.amountUnit} IS NOT NULL
        WHEN 'excluded'   THEN ${t.ratePercent} IS NULL AND ${t.amount} IS NULL
        WHEN 'trq'        THEN ${t.ratePercent} IS NOT NULL AND ${t.outOfQuotaAnnexId} IS NOT NULL
        ELSE false
      END`,
    ),
  ],
);

// --- Anti-dumping duty (CBPG) — a separate, stacking charge ------------------

/**
 * Anti-dumping / countervailing duty. Legally distinct from the import tariff: it
 * stacks on top, is scoped by origin (and sometimes exporter/manufacturer), and is
 * imposed by a Bộ Công Thương decision rather than the tariff decree. Kept out of
 * tariff_rate so a CBPG figure can never be mistaken for the customs duty.
 */
export const antiDumpingDuty = pgTable(
  'anti_dumping_duty',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    hsCode: varchar('hs_code', { length: 8 }).notNull(),
    productScope: text('product_scope'), // description of the covered goods
    originCountry: varchar('origin_country', { length: 8 }).notNull(), // 'CN', 'MY'
    exporter: text('exporter'), // manufacturer/exporter-specific rate, when applicable
    dutyKind: dutyKind('duty_kind').notNull(),
    ratePercent: numeric('rate_percent', { precision: 7, scale: 4 }),
    amount: numeric('amount', { precision: 14, scale: 2 }),
    amountCurrency: varchar('amount_currency', { length: 3 }),
    amountUnit: varchar('amount_unit', { length: 24 }),
    decisionNumber: varchar('decision_number', { length: 48 }).notNull(), // 'QĐ 1900/QĐ-BCT'
    decisionAuthority: varchar('decision_authority', { length: 64 }).notNull().default('Bộ Công Thương'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    sourceUrl: text('source_url'),
    note: text('note'),
  },
  (t) => [
    index('cbpg_lookup_idx').on(t.hsCode, t.originCountry),
    check('cbpg_hs_format', sql`${t.hsCode} ~ '^[0-9]{8}$'`),
    check(
      'cbpg_validity_order',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    check(
      'cbpg_shape',
      sql`CASE ${t.dutyKind}
        WHEN 'percent'  THEN ${t.ratePercent} IS NOT NULL AND ${t.amount} IS NULL
        WHEN 'specific' THEN ${t.amount} IS NOT NULL AND ${t.amountCurrency} IS NOT NULL AND ${t.amountUnit} IS NOT NULL AND ${t.ratePercent} IS NULL
        ELSE false
      END`,
    ),
  ],
);

-- FTA decrees detail some 8-digit codes into 10-digit national sub-lines, each with its own
-- rate; the 8-digit parent row has no rate cell (ADR 2026-09-13-fta-national-sublines). The
-- lookup unit stays 8-digit: the sub-lines ride on the parent row in conditions.sublines, and
-- when they disagree for an interval the parent carries NO number — rate_type 'by_subline'.
--
-- drizzle's migrator applies every pending migration inside ONE transaction, and a label added
-- by ALTER TYPE ... ADD VALUE cannot be used before that transaction commits ("unsafe use of
-- new enum value"). The CHECK below therefore compares rate_type as text, so it never casts the
-- new label to the enum — it applies on an empty database (0000..0010 in one go) and on one
-- already at 0009.
ALTER TYPE "public"."rate_type" ADD VALUE IF NOT EXISTS 'by_subline';
--> statement-breakpoint
ALTER TABLE "tariff_rate" DROP CONSTRAINT "tariff_rate_shape";
--> statement-breakpoint
ALTER TABLE "tariff_rate" ADD CONSTRAINT "tariff_rate_shape" CHECK (CASE "tariff_rate"."rate_type"::text
        WHEN 'ad_valorem' THEN "tariff_rate"."rate_percent" IS NOT NULL AND "tariff_rate"."amount" IS NULL AND "tariff_rate"."amount_currency" IS NULL
        WHEN 'specific'   THEN "tariff_rate"."amount" IS NOT NULL AND "tariff_rate"."amount_currency" IS NOT NULL AND "tariff_rate"."amount_unit" IS NOT NULL AND "tariff_rate"."rate_percent" IS NULL
        WHEN 'compound'   THEN "tariff_rate"."rate_percent" IS NOT NULL AND "tariff_rate"."amount" IS NOT NULL AND "tariff_rate"."amount_currency" IS NOT NULL AND "tariff_rate"."amount_unit" IS NOT NULL
        WHEN 'excluded'   THEN "tariff_rate"."rate_percent" IS NULL AND "tariff_rate"."amount" IS NULL
        WHEN 'trq'        THEN "tariff_rate"."rate_percent" IS NOT NULL AND "tariff_rate"."out_of_quota_annex_id" IS NOT NULL
        WHEN 'by_subline' THEN "tariff_rate"."rate_percent" IS NULL AND "tariff_rate"."amount" IS NULL
                               AND COALESCE(jsonb_typeof("tariff_rate"."conditions" -> 'sublines') = 'array', false)
        ELSE false
      END);

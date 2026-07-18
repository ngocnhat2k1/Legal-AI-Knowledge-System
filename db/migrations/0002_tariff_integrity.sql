-- Integrity that Drizzle's schema DSL cannot express: an interval-overlap
-- exclusion constraint and an append-only guard. Both are enforced by the
-- database, not by application convention — the whole point of TASK-007.

-- btree_gist lets a GiST index mix scalar equality (=) with range overlap (&&),
-- which the exclusion constraint below needs. Standard contrib, shipped in the
-- pgvector/pgvector:pg17 image. IF NOT EXISTS keeps the migration idempotent.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- No two LIVE rows (superseded_at IS NULL) may hold overlapping validity
-- intervals for the same (hs_code, hs_version, annex, schedule). This is what
-- turns "exactly one rate is in force on a given date" from a hope into a
-- database guarantee. It is satisfiable only because the loader splits a base
-- rate's interval around a superseding decree's window (the ND 72/2026
-- regression case), leaving the intervals disjoint. daterange is built with
-- '[]' so effective_to is the inclusive last day in force; adjacent windows
-- (…-03-08 / 03-09-…) canonicalise to touching-but-not-overlapping ranges.
ALTER TABLE "tariff_rate"
  ADD CONSTRAINT "tariff_rate_no_interval_overlap"
  EXCLUDE USING gist (
    "hs_code" WITH =,
    "hs_version_id" WITH =,
    "annex_id" WITH =,
    "schedule_id" WITH =,
    daterange("effective_from", "effective_to", '[]') WITH &&
  ) WHERE ("superseded_at" IS NULL);
--> statement-breakpoint

-- Append-only guard. tariff_rate and anti_dumping_duty are audit-grade: a rate
-- that was once served must remain readable as it was. Corrections are new rows;
-- the old row is stamped superseded_at (server-clock transaction time) and never
-- otherwise changed. DELETE is forbidden outright. The only permitted UPDATE is
-- setting superseded_at once, on a row that is still live.
CREATE OR REPLACE FUNCTION "append_only_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only: DELETE on % is forbidden; stamp superseded_at instead', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  -- TG_OP = 'UPDATE' from here on.
  IF OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'append-only: row %.% is already superseded and is immutable', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'append-only: the only permitted UPDATE on % is stamping superseded_at', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  -- Force superseded_at equal, then compare whole rows: anything else changed => reject.
  NEW.superseded_at := OLD.superseded_at;
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'append-only: only superseded_at may change on % (row %)', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Server-stamp the transaction time of the supersession.
  NEW.superseded_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "tariff_rate_append_only"
  BEFORE UPDATE OR DELETE ON "tariff_rate"
  FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();
--> statement-breakpoint

CREATE TRIGGER "anti_dumping_duty_append_only"
  BEFORE UPDATE OR DELETE ON "anti_dumping_duty"
  FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();

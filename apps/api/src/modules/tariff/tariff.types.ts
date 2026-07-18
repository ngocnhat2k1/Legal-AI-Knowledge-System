/**
 * Response shape for the tariff lookup (TASK-011).
 *
 * The design rule from research 12: a bare number is a lie where the law is
 * conditional. So a rate is never a scalar — it is a typed view that can say
 * "excluded", "USD amount", "quota-dependent", or "0% only with a valid C/O,
 * else the MFN rate". Every response names its governing decree and its as-of
 * date, and carries the data snapshot date so a stale answer is visible, not
 * silent (TASK-010).
 */

/** How a single rate is expressed. Mirrors the schema's rate_type. */
export interface RateView {
  schedule: string; // 'NK_uu_dai', 'ACFTA', 'XK'…
  scheduleName: string;
  type: 'ad_valorem' | 'specific' | 'compound' | 'excluded' | 'trq';
  /** Percent, as a string to preserve exactness (e.g. "10", "25.4"). */
  percent: string | null;
  /** Absolute component (specific/compound), with unit and currency. */
  amount: string | null;
  currency: string | null;
  unit: string | null;
  decree: string; // governing decree number
  effectiveFrom: string; // as-of interval start (YYYY-MM-DD)
  effectiveTo: string | null; // inclusive end, or null = open
  /** Human-readable statement of what this rate means. Never just a number. */
  statement: string;
}

/** A preferential (FTA / Chapter 98) rate — conditional by construction. */
export interface PreferentialView extends RateView {
  /** The C/O form the preferential rate is conditioned on, if any. */
  form: string | null;
  requiresCo: boolean;
  /** Extra per-line conditions carried in the tariff_rate.conditions column. */
  conditions: Record<string, unknown> | null;
}

/** Anti-dumping duty (CBPG) — a separate charge that STACKS on the import duty. */
export interface AntiDumpingView {
  type: 'percent' | 'specific';
  percent: string | null;
  amount: string | null;
  currency: string | null;
  unit: string | null;
  originCountry: string;
  exporter: string | null;
  decisionNumber: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  statement: string;
}

/** Data-freshness verdict (TASK-010). */
export interface StalenessView {
  snapshotDate: string; // the data is loaded as of this date
  reliableThrough: string; // dates at/after this are within the gazette-lag risk window
  stale: boolean;
  /** Present when stale: why the answer may be incomplete for this query date. */
  warning: string | null;
}

export interface TariffResponse {
  hs: string;
  origin: string | null;
  date: string;
  import: {
    mfn: RateView | null;
    preferential: PreferentialView[];
    outOfQuota: RateView | null;
    chapter98: PreferentialView[];
  };
  export: RateView | null;
  antiDumping: AntiDumpingView[];
  staleness: StalenessView;
  /** Non-fatal advisories the caller must read (conditionality, TRQ, exclusions). */
  notes: string[];
}

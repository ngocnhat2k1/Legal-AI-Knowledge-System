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
  type: 'ad_valorem' | 'specific' | 'compound' | 'excluded' | 'trq' | 'by_subline';
  /** Percent, as a string to preserve exactness (e.g. "10", "25.4"). Null for by_subline: the sub-lines carry the rates. */
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

/**
 * A 10-digit national sub-line of an FTA decree, carried on its 8-digit parent line (the lookup unit
 * stays 8-digit). Its rate is the one in force for the parent row's interval.
 */
export interface SublineView {
  code: string; // '1601001010'
  codeDotted: string; // '1601.00.10.10'
  desc: string;
  /** `excluded` = the decree's `*` on this sub-line: not 0%, no preference. */
  type: 'ad_valorem' | 'excluded';
  percent: number | null;
  /** Origins the decree excludes on this sub-line (ACFTA); [] when none. */
  excludedOrigins: string[];
  /** Whether the queried origin is excluded on this sub-line; null when no origin was given or the sub-line has no exclusion data. */
  originExcluded: boolean | null;
}

/** A preferential (FTA / Chapter 98) rate — conditional by construction. */
export interface PreferentialView extends RateView {
  /** The C/O form the preferential rate is conditioned on, if any. */
  form: string | null;
  requiresCo: boolean;
  /** Extra per-line conditions carried in the tariff_rate.conditions column. */
  conditions: Record<string, unknown> | null;
  /** Origins the decree excludes on this line (ACFTA column "Nước không được hưởng ưu đãi"); [] when none. */
  excludedOrigins: string[];
  /** Whether the queried origin is excluded on this line; null when no origin was given or the line has no exclusion data. */
  originExcluded: boolean | null;
  /** The decree's 10-digit sub-lines of this code, in decree order; [] when the decree details it at 8 digits only. */
  sublines: SublineView[];
  /**
   * The rate alone, without the C/O condition: the base statement ("0%", "Loại trừ khỏi biểu (không phải 0%)",
   * "Theo dòng 10 số (không có một mức chung cho mã 8 số)").
   */
  rate: string;
  /**
   * true: member per the verified table, excluded neither on this line nor on a 10-digit sub-line;
   * false: not a member, or excluded on this line; null: no origin, table unverified, EU/VN,
   * schedule absent from the table, or excluded on a sub-line only.
   */
  originEligible: boolean | null;
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

/** Which loaded tariff instrument the answer stands on, and what is recorded but not loaded (R7). */
export interface StalenessView {
  /** The loaded tariff decree in force on the query date with the latest effective_from; null when none. */
  latestInstrument: { number: string; effectiveFrom: string; effectiveTo: string | null } | null;
  /** Decrees recorded in the decree table, in force on the query date, with no tariff line loaded. */
  unloadedInstruments: string[];
  /** A recorded, unloaded extension of an expired rate on this HS that may cover the query date. */
  pendingExtension: string | null;
  /** Always present: one line naming the latest loaded instrument. */
  warning: string;
}

/** What a code actually is, from the nomenclature (Phase 3 descriptions). */
export interface GoodsView {
  heading: string | null; // tiêu đề nhóm 4 số ("Vòi, van và các thiết bị…")
  path: string; // đường dẫn đầy đủ
}

/** A candidate returned by product-name search: HS + what it is + its MFN rate. */
export interface SearchCandidate {
  hs: string;
  hsDotted: string;
  heading: string | null;
  path: string;
  mfn: string | null; // % MFN hiện hành, để hiển thị nhanh
}

export interface TariffResponse {
  hs: string;
  origin: string | null;
  date: string;
  goods: GoodsView | null;
  import: {
    mfn: RateView | null;
    preferential: PreferentialView[];
    outOfQuota: RateView | null;
    chapter98: PreferentialView[];
  };
  export: RateView | null;
  antiDumping: AntiDumpingView[];
  staleness: StalenessView;
  /** Who verified the FTA membership table (R18); null = unverified, so no origin filtering and no "eligible". */
  ftaMembership: { verifiedBy: string; verifiedAt: string } | null;
  /** Non-fatal advisories the caller must read (conditionality, TRQ, exclusions). */
  notes: string[];
}

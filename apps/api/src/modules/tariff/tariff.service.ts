import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import type {
  AntiDumpingView,
  GoodsView,
  PreferentialView,
  RateView,
  SearchCandidate,
  StalenessView,
  SublineView,
  TariffResponse,
} from './tariff.types';

const HS8 = /^\d{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALPHA2 = /^[A-Z]{2}$/;
/** Non-ISO shorthands users and the bot's LLM router send (TQ = Trung Quốc), as the bot's parser maps them. */
const ORIGIN_ALIASES: Record<string, string> = { TQ: 'CN', UK: 'GB' };

/**
 * Origin names and codes verbatim from ND 118/2022/NĐ-CP (ACFTA) Điều 4 khoản 2 —
 * the codes its per-line column "Nước không được hưởng ưu đãi" uses (Điều 3 khoản 5).
 */
const ND118_ORIGINS: Record<string, string> = {
  BN: 'Bru-nây Đa-rút-xa-lam',
  KH: 'Vương quốc Cam-pu-chia',
  ID: 'Cộng hòa In-đô-nê-xi-a',
  LA: 'Cộng hòa Dân chủ Nhân dân Lào',
  MY: 'Ma-lay-xi-a',
  MM: 'Cộng hòa Liên bang Mi-an-ma',
  PH: 'Cộng hòa Phi-líp-pin',
  SG: 'Cộng hòa Xinh-ga-po',
  TH: 'Vương quốc Thái Lan',
  CN: 'Cộng hòa Nhân dân Trung Hoa',
};
/** jsonb fields read defensively: an unexpected shape yields [] instead of a throw. */
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v : []);
const originNames = (codes: string[]): string =>
  codes.map((c) => (ND118_ORIGINS[c] ? `${ND118_ORIGINS[c]} (${c})` : c)).join(', ');

/** A 10-digit national sub-line carried on its HS8 parent row (conditions.sublines), with that row's interval rate. */
interface SublineCondition {
  code: string;
  code_dotted: string;
  desc: string;
  rate_type: SublineView['type'];
  rate_percent: string | null;
  excluded_origins: string[];
}

/** Row shape of the point-in-time rate query. */
interface RateRow {
  schedule: string;
  schedule_name: string;
  fta_form: string | null;
  requires_co: boolean;
  annex: string;
  trade_direction: 'import' | 'export';
  rate_type: RateView['type'];
  rate_percent: string | null;
  amount: string | null;
  amount_currency: string | null;
  amount_unit: string | null;
  effective_from: string;
  effective_to: string | null;
  out_of_quota_annex_id: number | null;
  conditions: Record<string, unknown> | null;
  decree: string;
}

interface CbpgRow {
  duty_kind: 'percent' | 'specific';
  rate_percent: string | null;
  amount: string | null;
  amount_currency: string | null;
  amount_unit: string | null;
  origin_country: string;
  exporter: string | null;
  decision_number: string;
  effective_from: string;
  effective_to: string | null;
}

interface SearchRow {
  hs_code: string;
  heading: string | null;
  path: string;
  mfn: string | null;
}

function toCandidate(r: SearchRow): SearchCandidate {
  return {
    hs: r.hs_code,
    hsDotted: r.hs_code.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3'),
    heading: r.heading,
    path: r.path,
    mfn: r.mfn,
  };
}

const dmy = (iso: string): string => iso.split('-').reverse().join('/');

export interface FtaMembership {
  verifiedBy: string;
  verifiedAt: string;
  members: Map<string, Set<string>>;
}

/**
 * Membership per schedule code, or null unless the file parses, a named person verified it (R18),
 * AND verifiedHash still matches the schedules they verified. Null means: no origin filtering, no green.
 */
export function ftaMembership(json: unknown): FtaMembership | null {
  const j = (json ?? {}) as { verifiedBy?: unknown; verifiedAt?: unknown; verifiedHash?: unknown; schedules?: unknown };
  if (typeof j.verifiedBy !== 'string' || !j.verifiedBy.trim()) return null;
  if (typeof j.verifiedAt !== 'string' || !ISO_DATE.test(j.verifiedAt)) return null;
  if (!Array.isArray(j.schedules)) return null;
  // The signature covers exactly the content that was read: an edit after signing voids it.
  if (j.verifiedHash !== createHash('sha256').update(JSON.stringify(j.schedules)).digest('hex')) return null;
  const members = new Map<string, Set<string>>();
  for (const s of j.schedules as Array<{ schedule?: unknown; members?: unknown }>) {
    const codes = arr<{ iso2?: unknown }>(s?.members).map((m) => m?.iso2);
    if (typeof s?.schedule !== 'string' || codes.some((c) => typeof c !== 'string' || !ALPHA2.test(c))) return null;
    if (codes.length) members.set(s.schedule, new Set(codes as string[])); // empty list: absent, never "not a member"
  }
  return { verifiedBy: j.verifiedBy, verifiedAt: j.verifiedAt, members };
}

/** EU is a bloc (ND 116 lists member states); VN goods from non-tariff zones are a special origin, not a member row. */
const UNDETERMINED_ORIGINS = new Set(['EU', 'VN']);

export function originEligible(
  m: FtaMembership | null,
  schedule: string,
  origin: string | null,
  originExcluded: boolean | null,
  sublineExcluded: boolean,
): boolean | null {
  if (!m || !origin || UNDETERMINED_ORIGINS.has(origin)) return null;
  const set = m.members.get(schedule);
  if (!set) return null; // schedule absent from the table (Chapter 98, a later FTA load): unknown, never "not a member"
  if (!set.has(origin)) return false;
  if (originExcluded === true) return false; // membership is necessary, not sufficient (ND 118 per-line exclusions)
  return sublineExcluded ? null : true; // excluded on a 10-digit sub-line: depends on the goods, never green
}

function readMembership(): FtaMembership | null {
  let json: unknown = null;
  try {
    json = JSON.parse(readFileSync(join(process.cwd(), 'db/seed/data/fta-members.json'), 'utf8'));
  } catch {
    /* missing or unreadable: stays null (fail closed) */
  }
  const m = ftaMembership(json);
  if (!m) {
    new Logger('TariffService').warn(
      'db/seed/data/fta-members.json is not in effect (unverified, missing, invalid, or edited after verification): FTA rows are not filtered by origin and never marked eligible',
    );
  }
  return m;
}

/** One row of the decree table, with whether any current tariff line cites it. */
export interface DecreeRow {
  number: string;
  effective_from: string;
  effective_to: string | null;
  signed_date: string | null;
  loaded: boolean;
}

/**
 * What the answer stands on, from the decree table — not from when the seed ran.
 * "Latest" = the loaded decree IN FORCE on the query date with the greatest effective_from
 * (ties: signed_date, then number), so a 2023 question never cites a 2026 decree and an
 * expired decree (72/2026 after 30/04/2026) never names the schedule in force.
 */
export function stalenessView(decrees: DecreeRow[], date: string, extendedBy: string[]): StalenessView {
  const inForce = decrees.filter((d) => d.effective_from <= date && (d.effective_to == null || date <= d.effective_to));
  const latest = inForce
    .filter((d) => d.loaded)
    .sort(
      (a, b) =>
        b.effective_from.localeCompare(a.effective_from) ||
        (b.signed_date ?? '').localeCompare(a.signed_date ?? '') ||
        b.number.localeCompare(a.number),
    )[0];
  const unloadedInstruments = inForce
    .filter((d) => !d.loaded)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    .map((d) => d.number);
  let warning: string;
  if (!latest) {
    warning = `Không xác định được văn bản biểu thuế đã nạp cho ngày ${dmy(date)} — đối chiếu nguồn trước khi dùng.`;
  } else {
    const window = `${dmy(latest.effective_from)}${latest.effective_to ? `–${dmy(latest.effective_to)}` : ''}`;
    warning = `Biểu thuế trong kho cập nhật tới NĐ ${latest.number} (hiệu lực ${window}); ${
      unloadedInstruments.length
        ? `chưa nạp dòng thuế của ${unloadedInstruments.length} nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.`
        : 'văn bản ban hành sau mốc này có thể chưa có.'
    }`;
  }
  // The date comes only from the recorded string; an unreadable one is still printed (fail closed).
  const pendingExtension =
    extendedBy
      .map((s) => {
        const m = s.match(/^(.+?) đến (\d{4}-\d{2}-\d{2})/);
        if (!m) return `Mức thuế nhập khẩu ưu đãi của mã này có thể đã được gia hạn (${s}) nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.`;
        return date <= m[2]!
          ? `Mức thuế nhập khẩu ưu đãi của mã này có thể đã được ${m[1]} gia hạn tới ${dmy(m[2]!)} nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.`
          : null;
      })
      .find((x) => x) ?? null;
  return {
    latestInstrument: latest ? { number: latest.number, effectiveFrom: latest.effective_from, effectiveTo: latest.effective_to } : null,
    unloadedInstruments,
    pendingExtension,
    warning,
  };
}

/**
 * Deterministic tariff lookup. No model call anywhere on this path
 * (see the no-LLM-on-tariff-numbers ADR): it is a keyed, point-in-time SQL read
 * whose validity filter is an interval predicate, never `ORDER BY date DESC`.
 */
@Injectable()
export class TariffService {
  /** Read once at start-up; not readonly so a spec can assign a fixture. */
  membership: FtaMembership | null = readMembership();
  /** The decree table changes only with a seed, and a seed ships with a restart. */
  private decrees?: Promise<DecreeRow[]>;

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async lookup(hsRaw: string, originRaw: string | undefined, dateRaw: string): Promise<TariffResponse> {
    const hs = (hsRaw ?? '').replace(/\./g, '').trim();
    if (!HS8.test(hs)) {
      throw new BadRequestException('hs must be 8 digits (e.g. 84818099 or 8481.80.99)');
    }
    if (!ISO_DATE.test(dateRaw ?? '')) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const originCode = originRaw?.trim().toUpperCase() || null;
    const origin = originCode ? (ORIGIN_ALIASES[originCode] ?? originCode) : null;
    if (origin && !ALPHA2.test(origin)) {
      // Fail closed: an unreadable origin would silently skip exclusions and anti-dumping duties.
      throw new BadRequestException('origin must be a 2-letter country code (e.g. CN; TQ is accepted)');
    }
    // Per-line exclusions list ND 118 codes only. Any other origin is answered as if none was
    // given (the excluded origins are named), never as "not excluded".
    const nd118Origin = origin && ND118_ORIGINS[origin] ? origin : null;

    const rows = (await this.db.execute(sql`
      SELECT s.code AS schedule, s.name AS schedule_name, s.fta_form, s.requires_co,
             a.code AS annex, a.trade_direction,
             r.rate_type, r.rate_percent, r.amount, r.amount_currency, r.amount_unit,
             r.effective_from::text AS effective_from, r.effective_to::text AS effective_to,
             r.out_of_quota_annex_id, r.conditions, d.number AS decree
      FROM tariff_rate r
      JOIN tariff_schedule s ON s.id = r.schedule_id
      JOIN annex a ON a.id = r.annex_id
      JOIN decree d ON d.id = r.source_decree_id
      WHERE r.hs_code = ${hs}
        AND r.superseded_at IS NULL
        AND r.effective_from <= ${dateRaw}
        AND (r.effective_to IS NULL OR ${dateRaw} <= r.effective_to)
      ORDER BY a.trade_direction, s.code
    `)) as unknown as RateRow[];

    const staleness = await this.staleness(hs, dateRaw);
    const notes: string[] = [];

    if (rows.length === 0) {
      // The HS may be a structural/heading line with no rate of its own, a
      // special-provision line ("theo hướng dẫn Chương 98"), or simply not in the
      // loaded nomenclature. Never invent a rate; say what we know.
      throw new NotFoundException({
        message: `No tariff rate found for HS ${hs} effective ${dateRaw}. The code may be a heading/structural line, a special-provision line without its own rate, or outside the loaded data.`,
        hs,
        date: dateRaw,
        latestInstrument: staleness.latestInstrument,
      });
    }

    const importRows = rows.filter((r) => r.trade_direction === 'import');
    const exportRow = rows.find((r) => r.trade_direction === 'export');

    const mfnRow = importRows.find((r) => r.schedule === 'NK_uu_dai');
    const outOfQuotaRow = importRows.find((r) => r.schedule === 'NK_ngoai_han_ngach');
    const ch98Rows = importRows.filter((r) => r.schedule === 'NK_uu_dai_98');
    const prefRows = importRows.filter(
      (r) => r.schedule !== 'NK_uu_dai' && r.schedule !== 'NK_ngoai_han_ngach' && r.schedule !== 'NK_uu_dai_98',
    );

    const mfn = mfnRow ? this.toRateView(mfnRow) : null;

    if (mfn?.type === 'trq') {
      notes.push(
        'Hàng thuộc hạn ngạch thuế quan (TRQ): thuế suất phụ thuộc trạng thái hạn ngạch của nhà nhập khẩu; mức ngoài hạn ngạch nằm ở biểu riêng.',
      );
    }
    if (mfn?.type === 'excluded') {
      notes.push('Dòng được đánh dấu loại trừ (*): KHÔNG phải 0% — hàng bị loại khỏi biểu này.');
    }
    if (ch98Rows.length) {
      notes.push(
        'Có mức thuế NK ưu đãi riêng tại Chương 98 (Mục II) áp dụng có điều kiện cho hàng đủ tiêu chí; đây là lựa chọn thay thế cho mức MFN Mục I, không phải mức mặc định.',
      );
    }
    // Every conditional statement already carries "nếu có C/O … hợp lệ, ngược lại … (MFN)".
    const preferential = prefRows.map((r) => this.toPreferentialView(r, mfn, nd118Origin, origin));
    if (origin && preferential.length === 0) {
      notes.push('Mã này không có dòng trong các biểu FTA đã nạp; chỉ trả về MFN.');
    }

    return {
      hs,
      origin,
      date: dateRaw,
      goods: await this.goods(hs),
      import: {
        mfn,
        preferential,
        outOfQuota: outOfQuotaRow ? this.toRateView(outOfQuotaRow) : null,
        chapter98: ch98Rows.map((r) => this.toPreferentialView(r, mfn, nd118Origin, origin)),
      },
      export: exportRow ? this.toRateView(exportRow) : null,
      antiDumping: await this.antiDumping(hs, origin, dateRaw),
      staleness,
      ftaMembership: this.membership ? { verifiedBy: this.membership.verifiedBy, verifiedAt: this.membership.verifiedAt } : null,
      notes,
    };
  }

  private toRateView(r: RateRow): RateView {
    const statement = this.statement(r);
    return {
      schedule: r.schedule,
      scheduleName: r.schedule_name,
      type: r.rate_type,
      percent: r.rate_percent,
      amount: r.amount,
      currency: r.amount_currency,
      unit: r.amount_unit,
      decree: r.decree,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      statement,
    };
  }

  /**
   * `origin`: the queried origin only when it is an ND 118 code, else null (see lookup) — it drives the per-line
   * exclusions. `queried`: the origin as given, for membership.
   */
  private toPreferentialView(r: RateRow, mfn: RateView | null, origin: string | null, queried: string | null): PreferentialView {
    const base = this.toRateView(r);
    const requiresCo = r.requires_co;
    const fallback = mfn ? `${mfn.statement} (MFN)` : 'mức MFN';
    const excludedOrigins = arr<string>(r.conditions?.excluded_origins);
    const originExcluded = origin && excludedOrigins.length ? excludedOrigins.includes(origin) : null;
    const sublines: SublineView[] = arr<SublineCondition>(r.conditions?.sublines).map((s) => {
      const excluded = arr<string>(s?.excluded_origins);
      return {
        code: s.code,
        codeDotted: s.code_dotted,
        desc: s.desc,
        type: s.rate_type,
        percent: s.rate_percent == null ? null : Number(s.rate_percent),
        excludedOrigins: excluded,
        originExcluded: origin && excluded.length ? excluded.includes(origin) : null,
      };
    });
    // A sub-line exclusion is stated for that sub-line only, never applied to the whole 8-digit line;
    // codes the whole line already excludes are not repeated per sub-line.
    const subExclusion = (s: SublineView): string | null => {
      if (origin) return s.originExcluded ? `không áp dụng cho ${originNames([origin])}` : null;
      const extra = s.excludedOrigins.filter((c) => !excludedOrigins.includes(c));
      return extra.length ? `không áp dụng cho hàng xuất xứ ${originNames(extra)}` : null;
    };
    const condition = requiresCo ? `nếu có C/O${r.fta_form ? ` form ${r.fta_form}` : ''} hợp lệ, ngược lại ${fallback}` : null;
    let statement: string;
    if (r.rate_type === 'by_subline') {
      // The sub-lines differ: no single number exists for the 8-digit line, so each one is stated.
      const lines = sublines.map((s) => {
        // pct(null) is '0': a malformed jsonb element must never read as 0%.
        const rate = s.type === 'excluded' ? 'không hưởng (*)' : s.percent == null ? 'không rõ mức — đối chiếu nghị định' : `${this.pct(s.percent)}%`;
        const excluded = subExclusion(s);
        return `${s.codeDotted} ${s.desc}: ${!excluded ? rate : origin ? excluded : `${rate} (${excluded})`}`;
      });
      statement = `Theo dòng 10 số: ${lines.join('; ')}${condition ? ` — ${condition}` : ''}`;
    } else {
      statement = condition ? `${base.statement} ${condition}` : base.statement;
    }
    if (originExcluded) {
      // Never print the preferential number here: for this origin it does not exist.
      statement = `Không áp dụng cho hàng xuất xứ ${originNames([origin!])}: NĐ ${r.decree} loại trừ nước này ở dòng thuế này — áp mức MFN${mfn ? ` ${mfn.statement}` : ''}`;
    } else {
      if (!origin && excludedOrigins.length) {
        statement += `; không áp dụng cho hàng xuất xứ ${originNames(excludedOrigins)} (NĐ ${r.decree} loại trừ theo dòng)`;
      }
      const excludedSubs = r.rate_type === 'by_subline' ? [] : sublines.filter((s) => subExclusion(s));
      if (excludedSubs.length) {
        statement += `; riêng dòng 10 số ${excludedSubs.map((s) => `${s.codeDotted} ${s.desc}: ${subExclusion(s)}`).join('; ')}`;
      }
    }
    return {
      ...base,
      form: r.fta_form,
      requiresCo,
      conditions: r.conditions,
      excludedOrigins,
      originExcluded,
      sublines,
      statement,
      rate: base.statement,
      originEligible: originEligible(this.membership, r.schedule, queried, originExcluded, sublines.some((s) => s.originExcluded === true)),
    };
  }

  /**
   * Display-format a percent: trim trailing zeros from the DB numeric ("10.0000" → "10",
   * "7.5000" → "7.5", "0.0000" → "0"). VALUE-preserving — the authoritative number is
   * unchanged, only its rendering. (no-llm-on-tariff-numbers: this is deterministic.)
   */
  private pct(v: string | number | null | undefined): string {
    if (v == null || v === '') return '0';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(v);
  }

  private statement(r: RateRow): string {
    switch (r.rate_type) {
      case 'ad_valorem':
        return `${this.pct(r.rate_percent)}%`;
      case 'specific':
        return `${r.amount} ${r.amount_currency}/${r.amount_unit}`;
      case 'compound':
        return `${this.pct(r.rate_percent)}% + ${r.amount} ${r.amount_currency}/${r.amount_unit}`;
      case 'excluded':
        return 'Loại trừ khỏi biểu (không phải 0%)';
      case 'trq':
        return `Trong hạn ngạch ${this.pct(r.rate_percent)}%; ngoài hạn ngạch xem biểu ngoài hạn ngạch`;
      case 'by_subline':
        return 'Theo dòng 10 số (không có một mức chung cho mã 8 số)';
      default:
        return '';
    }
  }

  private async antiDumping(hs: string, origin: string | null, date: string): Promise<AntiDumpingView[]> {
    const rows = (await this.db.execute(sql`
      SELECT duty_kind, rate_percent, amount, amount_currency, amount_unit,
             origin_country, exporter, decision_number,
             effective_from::text AS effective_from, effective_to::text AS effective_to
      FROM anti_dumping_duty
      WHERE hs_code = ${hs}
        AND superseded_at IS NULL
        AND effective_from <= ${date}
        AND (effective_to IS NULL OR ${date} <= effective_to)
        ${origin ? sql`AND origin_country = ${origin}` : sql``}
      ORDER BY origin_country
    `)) as unknown as CbpgRow[];

    return rows.map((r) => ({
      type: r.duty_kind,
      percent: r.rate_percent,
      amount: r.amount,
      currency: r.amount_currency,
      unit: r.amount_unit,
      originCountry: r.origin_country,
      exporter: r.exporter,
      decisionNumber: r.decision_number,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      statement:
        r.duty_kind === 'percent'
          ? `Chống bán phá giá ${this.pct(r.rate_percent)}% (cộng thêm thuế NK), xuất xứ ${r.origin_country}`
          : `Chống bán phá giá ${r.amount} ${r.amount_currency}/${r.amount_unit} (cộng thêm thuế NK), xuất xứ ${r.origin_country}`,
    }));
  }

  /** What a code is, from the nomenclature. */
  private async goods(hs: string): Promise<GoodsView | null> {
    const rows = (await this.db.execute(
      sql`SELECT heading, path FROM hs_description WHERE hs_code = ${hs} LIMIT 1`,
    )) as unknown as Array<{ heading: string | null; path: string }>;
    return rows[0] ? { heading: rows[0].heading, path: rows[0].path } : null;
  }

  /**
   * Search by product name — "van" → candidate valve HS codes with their current
   * MFN rate. Candidates whose 4-digit heading matches rank first. This returns a
   * MENU for a human to choose from — never a single auto-picked code, because a
   * wrong HS looks exactly like a right one (research 09).
   */
  async search(qRaw: string, prefixRaw?: string): Promise<SearchCandidate[]> {
    // MFN subquery reused by both branches.
    const mfnSub = sql`(SELECT r.rate_percent FROM tariff_rate r JOIN tariff_schedule s ON s.id = r.schedule_id
        WHERE r.hs_code = d.hs_code AND s.code = 'NK_uu_dai' AND r.superseded_at IS NULL
          AND r.effective_from <= CURRENT_DATE AND (r.effective_to IS NULL OR CURRENT_DATE <= r.effective_to)
        LIMIT 1)`;

    // Prefix branch: an HS heading/subheading (e.g. Claude's classification hint "8523").
    const prefix = (prefixRaw ?? '').replace(/\D/g, '');
    if (prefix.length >= 4 && prefix.length <= 8) {
      const rows = (await this.db.execute(sql`
        SELECT d.hs_code, d.heading, d.path, ${mfnSub} AS mfn
        FROM hs_description d WHERE d.hs_code LIKE ${prefix + '%'}
        ORDER BY d.hs_code LIMIT 25
      `)) as unknown as SearchRow[];
      return rows.map(toCandidate);
    }

    // Keyword branch: WHOLE-WORD match, not substring ("van" ≠ "vani"/"vang"). \y = word boundary.
    const q = (qRaw ?? '').trim();
    if (q.length < 2) throw new BadRequestException('q (từ khoá) cần ít nhất 2 ký tự, hoặc dùng prefix nhóm HS');
    const rx = `\\y${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\y`;
    const rows = (await this.db.execute(sql`
      SELECT d.hs_code, d.heading, d.path, ${mfnSub} AS mfn
      FROM hs_description d
      WHERE d.path ~* ${rx}
      ORDER BY
        (CASE WHEN d.heading ~* ${rx} THEN 0 ELSE 1 END),
        (CASE WHEN d.heading ~* ${rx} THEN position(lower(${q}) in lower(d.heading)) ELSE 9999 END),
        d.hs_code
      LIMIT 25
    `)) as unknown as SearchRow[];
    return rows.map(toCandidate);
  }

  /** R7: name the instrument the answer stands on (see stalenessView). */
  private async staleness(hs: string, date: string): Promise<StalenessView> {
    this.decrees ??= (
      this.db.execute(sql`
        SELECT d.number, d.effective_from::text AS effective_from, d.effective_to::text AS effective_to,
               d.signed_date::text AS signed_date,
               EXISTS (SELECT 1 FROM tariff_rate r WHERE r.source_decree_id = d.id AND r.superseded_at IS NULL) AS loaded
        FROM decree d
      `) as unknown as Promise<DecreeRow[]>
    ).catch((e: unknown) => {
      this.decrees = undefined; // a failed read is retried on the next lookup, not cached
      throw e;
    });
    const extended = (await this.db.execute(sql`
      SELECT r.conditions->>'extended_by' AS extended_by FROM tariff_rate r
      WHERE r.hs_code = ${hs} AND r.superseded_at IS NULL AND r.effective_to < ${date}
        AND r.conditions->>'extended_by' IS NOT NULL
    `)) as unknown as Array<{ extended_by: string }>;
    return stalenessView(await this.decrees, date, extended.map((x) => x.extended_by));
  }
}

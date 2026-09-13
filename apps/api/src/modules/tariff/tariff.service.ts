import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

function subtractDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y!, m! - 1, d!) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Deterministic tariff lookup. No model call anywhere on this path
 * (see the no-LLM-on-tariff-numbers ADR): it is a keyed, point-in-time SQL read
 * whose validity filter is an interval predicate, never `ORDER BY date DESC`.
 */
@Injectable()
export class TariffService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

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

    const staleness = await this.staleness(dateRaw);
    const notes: string[] = [];

    if (rows.length === 0) {
      // The HS may be a structural/heading line with no rate of its own, a
      // special-provision line ("theo hướng dẫn Chương 98"), or simply not in the
      // loaded nomenclature. Never invent a rate; say what we know.
      throw new NotFoundException({
        message: `No tariff rate found for HS ${hs} effective ${dateRaw}. The code may be a heading/structural line, a special-provision line without its own rate, or outside the loaded data.`,
        hs,
        date: dateRaw,
        snapshotDate: staleness.snapshotDate,
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
    const preferential = prefRows.map((r) => this.toPreferentialView(r, mfn, nd118Origin));
    if (preferential.some((p) => p.requiresCo)) {
      notes.push(
        'Mức ưu đãi FTA chỉ áp dụng khi có C/O hợp lệ đúng form; nếu không, áp mức MFN. Không có con số 0% vô điều kiện.',
      );
    }
    if (origin && preferential.length === 0) {
      notes.push(
        `Chưa có biểu FTA nào được nạp khớp với xuất xứ ${origin} cho mã này; chỉ trả về MFN. (Các biểu FTA nạp ở bước sau.)`,
      );
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
        chapter98: ch98Rows.map((r) => this.toPreferentialView(r, mfn, nd118Origin)),
      },
      export: exportRow ? this.toRateView(exportRow) : null,
      antiDumping: await this.antiDumping(hs, origin, dateRaw),
      staleness,
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

  /** `origin`: the queried origin only when it is an ND 118 code, else null (see lookup). */
  private toPreferentialView(r: RateRow, mfn: RateView | null, origin: string | null): PreferentialView {
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

  /**
   * TASK-010. The data is loaded as of a snapshot date. Because a binding decree
   * can be signed and in force weeks before it reaches Công báo (ND 72/2026: 15
   * days; EVFTA: 48), any query date within one gazette-lag of the snapshot — or
   * after it — may be missing a decree we could not yet have seen. Those answers
   * are flagged, not served as confident.
   */
  private async staleness(date: string): Promise<StalenessView> {
    const configured = this.config.get<string>('DATA_SNAPSHOT_DATE');
    let snapshotDate = configured && ISO_DATE.test(configured) ? configured : null;
    if (!snapshotDate) {
      const rows = (await this.db.execute(
        sql`SELECT max(recorded_at)::date::text AS d FROM tariff_rate`,
      )) as unknown as Array<{ d: string | null }>;
      snapshotDate = rows[0]?.d ?? date;
    }
    const lagDays = Number(this.config.get<string>('GAZETTE_LAG_DAYS') ?? '48');
    const reliableThrough = subtractDays(snapshotDate, lagDays);
    const stale = date > reliableThrough;
    return {
      snapshotDate,
      reliableThrough,
      stale,
      warning: stale
        ? `Ngày tra cứu ${date} nằm trong cửa sổ rủi ro độ trễ công báo (dữ liệu chốt ${snapshotDate}, tin cậy đến ${reliableThrough}). Một nghị định đã ký/hiệu lực nhưng chưa lên Công báo tại thời điểm chốt có thể chưa có trong dữ liệu — hãy đối chiếu nguồn gốc trước khi dùng.`
        : null,
    };
  }
}

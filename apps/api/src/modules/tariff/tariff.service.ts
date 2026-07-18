import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import type {
  AntiDumpingView,
  PreferentialView,
  RateView,
  StalenessView,
  TariffResponse,
} from './tariff.types';

const HS8 = /^\d{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    const origin = originRaw?.trim().toUpperCase() || null;

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
    const preferential = prefRows.map((r) => this.toPreferentialView(r, mfn));
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
      import: {
        mfn,
        preferential,
        outOfQuota: outOfQuotaRow ? this.toRateView(outOfQuotaRow) : null,
        chapter98: ch98Rows.map((r) => this.toPreferentialView(r, mfn)),
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

  private toPreferentialView(r: RateRow, mfn: RateView | null): PreferentialView {
    const base = this.toRateView(r);
    const requiresCo = r.requires_co;
    const fallback = mfn ? `${mfn.statement} (MFN)` : 'mức MFN';
    return {
      ...base,
      form: r.fta_form,
      requiresCo,
      conditions: r.conditions,
      statement: requiresCo
        ? `${base.statement} nếu có C/O${r.fta_form ? ` form ${r.fta_form}` : ''} hợp lệ, ngược lại ${fallback}`
        : base.statement,
    };
  }

  private statement(r: RateRow): string {
    switch (r.rate_type) {
      case 'ad_valorem':
        return `${r.rate_percent}%`;
      case 'specific':
        return `${r.amount} ${r.amount_currency}/${r.amount_unit}`;
      case 'compound':
        return `${r.rate_percent}% + ${r.amount} ${r.amount_currency}/${r.amount_unit}`;
      case 'excluded':
        return 'Loại trừ khỏi biểu (không phải 0%)';
      case 'trq':
        return `Trong hạn ngạch ${r.rate_percent}%; ngoài hạn ngạch xem biểu ngoài hạn ngạch`;
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
          ? `Chống bán phá giá ${r.rate_percent}% (cộng thêm thuế NK), xuất xứ ${r.origin_country}`
          : `Chống bán phá giá ${r.amount} ${r.amount_currency}/${r.amount_unit} (cộng thêm thuế NK), xuất xứ ${r.origin_country}`,
    }));
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

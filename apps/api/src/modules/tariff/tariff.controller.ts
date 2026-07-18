import { Controller, Get, Query } from '@nestjs/common';

import { TariffService } from './tariff.service';
import type { TariffResponse } from './tariff.types';

/**
 * GET /tariff?hs=<8-digit>&origin=<country>&date=<YYYY-MM-DD>
 *
 * Deterministic tariff lookup: rate + governing decree + as-of date + conditions
 * + a data-freshness verdict. `origin` selects which FTA schedules apply (once
 * loaded) and scopes anti-dumping duty; it is optional (MFN needs no origin).
 */
@Controller('tariff')
export class TariffController {
  constructor(private readonly tariff: TariffService) {}

  @Get()
  lookup(
    @Query('hs') hs: string,
    @Query('date') date: string,
    @Query('origin') origin?: string,
  ): Promise<TariffResponse> {
    return this.tariff.lookup(hs, origin, date);
  }
}

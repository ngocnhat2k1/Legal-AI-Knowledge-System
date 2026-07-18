import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { ConfirmationService, type ConfirmationSummary } from './confirmation.service';
import { TariffService } from './tariff.service';
import type { SearchCandidate, TariffResponse } from './tariff.types';

/**
 * GET  /tariff?hs=&origin=&date=      — deterministic tariff lookup (rate + decree + as-of + conditions + staleness)
 * POST /tariff/confirm                — record a point-of-use verdict (verify loop)
 * GET  /tariff/confirmations?hs=&origin= — prior verdicts on an HS
 */
@Controller('tariff')
export class TariffController {
  constructor(
    private readonly tariff: TariffService,
    private readonly confirmations: ConfirmationService,
  ) {}

  @Get()
  lookup(
    @Query('hs') hs: string,
    @Query('date') date: string,
    @Query('origin') origin?: string,
  ): Promise<TariffResponse> {
    return this.tariff.lookup(hs, origin, date);
  }

  @Get('search')
  search(@Query('q') q: string): Promise<SearchCandidate[]> {
    return this.tariff.search(q);
  }

  @Get('confirmations')
  confirmationsFor(
    @Query('hs') hs: string,
    @Query('origin') origin?: string,
  ): Promise<ConfirmationSummary> {
    return this.confirmations.summary(hs, origin);
  }

  @Post('confirm')
  confirm(
    @Body()
    body: {
      hs: string;
      origin?: string;
      date: string;
      schedule?: string;
      verdict: string;
      staffName: string;
      note?: string;
      snapshot?: unknown;
    },
  ): Promise<{ id: number; createdAt: string }> {
    return this.confirmations.record(body);
  }
}

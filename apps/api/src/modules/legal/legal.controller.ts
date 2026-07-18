import { Controller, Get, Query } from '@nestjs/common';

import { LegalService } from './legal.service';
import type { LegalAnswer } from './legal.types';

/**
 * GET /legal?q=&asOf=  — grounded legal answer with verbatim, cited provisions.
 *
 * `q`     the natural-language legal question.
 * `asOf`  optional YYYY-MM-DD; otherwise inferred from the question, else today.
 *         Valid-time is a hard filter — the answer reflects the law as of this date.
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  ask(@Query('q') q: string, @Query('asOf') asOf?: string): Promise<LegalAnswer> {
    return this.legal.ask(q, asOf);
  }
}

import { Controller, Get, Query } from '@nestjs/common';

import { LegalService } from './legal.service';
import type { LegalAnswer, LegalDocumentView, LegalProvisionView } from './legal.types';

/**
 * GET /legal?q=&asOf=&doc=&article=   — grounded legal answer with verbatim, cited provisions.
 * GET /legal/documents                — the corpus manifest (what we actually hold).
 * GET /legal/provision?doc=&article=&clause= — verbatim provision by citation, no retrieval.
 *
 * `q`        the natural-language legal question.
 * `asOf`     optional YYYY-MM-DD; otherwise inferred from the question, else today.
 *            Valid-time is a hard filter — the answer reflects the law as of this date.
 * `doc`      optional document number ('38/2015', '46/VBHN-BTC'); scopes retrieval to it,
 *            and answers "we do not hold that document" when the corpus lacks it.
 * `article`  optional Điều number, narrowing further within `doc`.
 *
 * Route order matters: the static `documents`/`provision` paths are declared before `@Get()`.
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('documents')
  documents(): Promise<LegalDocumentView[]> {
    return this.legal.documents();
  }

  @Get('provision')
  provision(
    @Query('doc') doc: string,
    @Query('article') article: string,
    @Query('clause') clause?: string,
  ): Promise<LegalProvisionView[]> {
    return this.legal.provision(doc, article, clause);
  }

  @Get()
  ask(
    @Query('q') q: string,
    @Query('asOf') asOf?: string,
    @Query('doc') doc?: string,
    @Query('article') article?: string,
  ): Promise<LegalAnswer> {
    return this.legal.ask(q, asOf, doc, article);
  }
}

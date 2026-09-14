import { Module } from '@nestjs/common';

import { LegalModule } from '../legal/legal.module';
import { TariffModule } from '../tariff/tariff.module';
import { AnswerController } from './answer.controller';
import { AnswerService, CLAUDE_RUNNER } from './answer.service';
import { runClaude } from './claude';

/** POST /answer (plan 08): plan, retrieve, compose, guards over the legal and tariff modules. */
@Module({
  imports: [LegalModule, TariffModule],
  controllers: [AnswerController],
  providers: [AnswerService, { provide: CLAUDE_RUNNER, useValue: runClaude }],
})
export class AnswerModule {}

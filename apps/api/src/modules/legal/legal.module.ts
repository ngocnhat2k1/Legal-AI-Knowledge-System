import { Module } from '@nestjs/common';

import { EmbeddingService } from './embedding.service';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/**
 * Legal RAG feature (Phase 5): grounded, cited answers over the legal-prose corpus.
 * Depends on the global DatabaseModule for its connection and on the BGE-M3 sidecar
 * client. Distinct from the tariff module — shared infra, separate core
 * (customs-first-law-later ADR).
 */
@Module({
  controllers: [LegalController],
  providers: [LegalService, EmbeddingService],
})
export class LegalModule {}

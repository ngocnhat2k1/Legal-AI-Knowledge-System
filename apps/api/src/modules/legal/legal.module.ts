import { Module } from '@nestjs/common';

import { EmbeddingModule } from '../../shared/adapters/embedding';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/**
 * Legal RAG feature (Phase 5): grounded, cited answers over the legal-prose corpus.
 * Depends on the global DatabaseModule for its connection and on EmbeddingModule
 * for the BGE-M3 sidecar client. Distinct from the tariff module — shared infra,
 * separate core (customs-first-law-later ADR).
 */
@Module({
  imports: [EmbeddingModule],
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}

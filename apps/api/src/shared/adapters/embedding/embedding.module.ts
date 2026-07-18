import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EmbeddingService } from './embedding.service';

/**
 * Provides the embedding sidecar client. Imported by the legal RAG module only —
 * embeddings never touch the tariff path (no-LLM-on-tariff-numbers ADR).
 */
@Module({
  imports: [ConfigModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}

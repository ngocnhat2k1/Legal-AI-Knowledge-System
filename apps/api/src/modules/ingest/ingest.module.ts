import { Module } from '@nestjs/common';

import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

/**
 * On-request corpus growth (Phase 7). The API owns the QUEUE; the fetching and parsing
 * live in apps/ingest, which is Python because the document parser needs pdfplumber.
 */
@Module({
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}

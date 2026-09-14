import { Body, Controller, Get, Post } from '@nestjs/common';

import { IngestService, type IngestRequestView } from './ingest.service';

/**
 * POST /ingest/request       — queue a Công báo document for ingest
 * GET  /ingest/reports       — finished requests not yet told to the requester
 * POST /ingest/reports/ack   — mark reports delivered
 * POST /ingest/verify        — a human promotes an auto-ingested document to verified
 *
 * Internal surface, same trust boundary as /tariff/confirm.
 */
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('request')
  request(
    @Body() body: { number: string; requestedBy?: string; threadId?: string; userId?: string },
  ): Promise<{ id: number; status: string; alreadyQueued: boolean }> {
    return this.ingest.request(body);
  }

  @Get('reports')
  reports(): Promise<IngestRequestView[]> {
    return this.ingest.reports();
  }

  @Post('reports/ack')
  ack(@Body() body: { ids: number[] }): Promise<{ acknowledged: number }> {
    return this.ingest.acknowledge(body?.ids ?? []);
  }

  @Post('verify')
  verify(@Body() body: { number: string; staffName: string }): Promise<{ verified: boolean; number: string }> {
    return this.ingest.verify(body?.number, body?.staffName);
  }
}

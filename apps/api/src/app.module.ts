import { Module } from '@nestjs/common';

import { ConversationModule } from './modules/conversation/conversation.module';
import { HealthModule } from './modules/health/health.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { LegalModule } from './modules/legal/legal.module';
import { TariffModule } from './modules/tariff/tariff.module';
import { DatabaseModule } from './shared/adapters/database';

@Module({
  imports: [DatabaseModule, HealthModule, TariffModule, LegalModule, ConversationModule, IngestModule],
})
export class AppModule {}

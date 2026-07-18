import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';

import { HealthModule } from './modules/health/health.module';
import { LegalModule } from './modules/legal/legal.module';
import { TariffModule } from './modules/tariff/tariff.module';
import { DatabaseModule } from './shared/adapters/database';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Serve the web UI (public/) at '/'. Explicit controller routes (/tariff,
    // /legal, /health) are matched first; everything else falls through to static.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: ['/tariff', '/tariff/{*rest}', '/legal', '/legal/{*rest}', '/health'],
    }),
    DatabaseModule,
    HealthModule,
    TariffModule,
    LegalModule,
  ],
})
export class AppModule {}

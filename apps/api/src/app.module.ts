import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';

import { HealthModule } from './modules/health/health.module';
import { TariffModule } from './modules/tariff/tariff.module';
import { DatabaseModule } from './shared/adapters/database';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Serve the web UI (public/) at '/'. Explicit controller routes (/tariff,
    // /health) are matched first; everything else falls through to the static files.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: ['/tariff', '/tariff/{*rest}', '/health'],
    }),
    DatabaseModule,
    HealthModule,
    TariffModule,
  ],
})
export class AppModule {}

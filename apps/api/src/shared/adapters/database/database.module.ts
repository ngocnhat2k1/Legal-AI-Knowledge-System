import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { DATABASE_CONNECTION, POSTGRES_CLIENT } from './database.tokens';
import type { Database } from './database.types';

/**
 * Provides the single PostgreSQL connection for the application.
 *
 * PostgreSQL is the only stateful service in v1 (see the postgres-only ADR), so
 * this adapter is the one place a connection is opened. The raw postgres.js
 * client is created once and closed on shutdown; the Drizzle instance is layered
 * on top and is what feature modules inject via DATABASE_CONNECTION.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Sql => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return postgres(url, { max: 10 });
      },
    },
    {
      provide: DATABASE_CONNECTION,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: Sql): Database => drizzle(client),
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(POSTGRES_CLIENT) private readonly client: Sql) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

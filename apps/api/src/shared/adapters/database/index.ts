import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

/** The Drizzle handle feature modules inject. Queries are raw `sql`, so it carries no schema type. */
export type Database = PostgresJsDatabase<Record<string, never>> & { $client: Sql };

export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

/**
 * The single PostgreSQL connection for the application — PostgreSQL is the only stateful
 * service in v1 (see the postgres-only ADR). Closed on shutdown.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): Database => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is not set');
        return drizzle(postgres(url, { max: 10 }));
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.$client.end({ timeout: 5 });
  }
}

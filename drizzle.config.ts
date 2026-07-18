import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Migrations are authored as reviewable SQL under db/migrations and applied by
 * db/migrate.ts. `db:generate` diffs db/schema against the last snapshot; DDL that
 * Drizzle cannot express (e.g. CREATE EXTENSION) is added via `--custom` migrations.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres',
  },
});

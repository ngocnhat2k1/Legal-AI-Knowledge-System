import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Applies all pending SQL migrations from db/migrations, then exits.
 *
 * Run as a one-shot step (the `migrate` service in docker-compose) before the API
 * boots. The migrator is idempotent: it records applied migrations in
 * drizzle.__drizzle_migrations and skips anything already run, so repeated
 * `docker compose up` is safe.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  // A single connection is enough for a one-shot run and keeps the migrator's
  // advisory-lock behaviour predictable. `onnotice` is silenced so the expected
  // "already exists, skipping" NOTICE on repeat runs does not look like a failure.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './db/migrations' });
    console.log('Migrations applied.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

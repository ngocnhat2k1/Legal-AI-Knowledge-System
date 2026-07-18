import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';

export interface HealthReport {
  /** `ok` only when the database is reachable AND pgvector is installed. */
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  /** Installed pgvector extension version, or null if it is not present. */
  pgvector: string | null;
}

/**
 * Reports whether the app can reach PostgreSQL and whether pgvector is installed.
 *
 * This is the end-to-end proof for TASK-006: a green /health response means the
 * clone booted, the migration ran, and the extension the roadmap requires "installed
 * but unused in Phase 1" is actually present.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async check(): Promise<HealthReport> {
    try {
      const result = await this.db.execute(
        sql`select extversion from pg_extension where extname = 'vector' limit 1`,
      );
      const rows = result as unknown as ReadonlyArray<{ extversion: string | null }>;
      const pgvector = rows.length > 0 ? rows[0]!.extversion : null;
      return { status: pgvector ? 'ok' : 'degraded', db: 'up', pgvector };
    } catch {
      return { status: 'degraded', db: 'down', pgvector: null };
    }
  }
}

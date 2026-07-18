import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * The Drizzle handle exposed to feature modules.
 *
 * The schema type argument is intentionally empty for now: TASK-006 ships only
 * the repository skeleton and the pgvector-enabling migration. The real tariff
 * schema (bitemporal, annex-in-primary-key, append-only) arrives in TASK-007,
 * at which point this type parameter is widened to the schema module.
 */
export type Database = PostgresJsDatabase<Record<string, never>>;

/**
 * Dependency-injection tokens for the database adapter.
 *
 * `POSTGRES_CLIENT` is the raw postgres.js connection (owned by DatabaseModule,
 * closed on shutdown). `DATABASE_CONNECTION` is the Drizzle instance layered on
 * top of it and is the only handle feature modules should depend on.
 */
export const POSTGRES_CLIENT = Symbol('POSTGRES_CLIENT');
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

/**
 * Drizzle schema for Customs Assistant.
 *
 * Intentionally empty in TASK-006: the repository skeleton ships only the
 * pgvector-enabling migration (db/migrations/0000_enable_pgvector.sql, authored
 * as a custom migration). The real tariff schema — bitemporal, annex-in-the-
 * primary-key, append-only, HS-version as a dimension — is defined here in
 * TASK-007. See the bitemporal-validity ADR.
 */
export {};

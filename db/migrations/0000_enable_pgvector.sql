-- Custom SQL migration file, put your code below! --

-- Enable the pgvector extension.
--
-- Installed but unused in Phase 1: the deterministic tariff lookup is a pure
-- keyed SQL read with no semantic component, so nothing here touches vectors yet.
-- pgvector is provisioned now (Phase 2 needs it for HS-note embeddings) so that a
-- later feature does not require a second infrastructure migration. The tariff
-- tables are never given a vector index — see the no-LLM-on-tariff-numbers ADR.
--
-- IF NOT EXISTS keeps the migration idempotent across repeated `docker compose up`.
CREATE EXTENSION IF NOT EXISTS vector;
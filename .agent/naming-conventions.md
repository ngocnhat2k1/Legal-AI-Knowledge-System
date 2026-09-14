# Quy ước đặt tên

Ngôn ngữ của code và tài liệu: xem [AGENTS.md](AGENTS.md).

## Code (NestJS / TypeScript)

- **File:** `kebab-case` theo hậu tố NestJS — `tariff.controller.ts`, `legal.service.ts`, `legal.module.ts`, `embedding.service.ts`.
- **Class / decorator target:** `PascalCase` — `HealthController`, `DatabaseModule`.
- **Biến / hàm / property:** `camelCase`. **Hằng / DI token:** `SCREAMING_SNAKE_CASE` (`DATABASE_CONNECTION`).

## Cơ sở dữ liệu (PostgreSQL / Drizzle)

- **Bảng và cột:** `snake_case` — `hs_code`, `schedule`, `valid_from`, `valid_to`, `source_decree`, `as_of`. Khóa tra cứu biểu thuế: `(hs_code, hs_version, schedule, valid_from, valid_to, ...)`; danh tính phụ lục là cột **được lưu**, không suy diễn ([bitemporal ADR](architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)).
- **Migration:** đánh số tuần tự theo Drizzle — `NNNN_<mô-tả-ngắn>.sql` (vd `0000_enable_pgvector.sql`). Nội dung là SQL đọc được; ghi chỉ-nối-thêm, không `UPDATE` tại chỗ.

## Repo / hạ tầng

- **Tên package:** `customs-assistant`. **Image Docker:** `customs-assistant:local`. **Service compose:** `db`, `migrate`, `seed`, `seed-legal`, `embedder`, `api`, `ingest`, `zalo-bot`.
- **Biến môi trường:** `SCREAMING_SNAKE_CASE` — `DATABASE_URL`, `PORT`, `EMBEDDER_URL`, `CLAUDE_CODE_OAUTH_TOKEN`.

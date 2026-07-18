# Quy ước đặt tên (Naming Conventions)

File này lưu trữ các quy ước đặt tên riêng của dự án.

## Ngôn ngữ

- **Code, chú thích trong code, định danh, tên file, tên API, thông điệp commit: tiếng Anh.**
- Tài liệu dự án (`.agent/`, README): tiếng Việt (nguồn chân lý: [AGENTS.md](AGENTS.md)). ⚠️ Còn một mâu thuẫn chưa chốt: `project-context.md` và `00-bootstrap.md` ghi "tài liệu tiếng Anh" trong khi AGENTS.md ghi tiếng Việt — chờ chủ dự án quyết rồi thống nhất.

## Code (NestJS / TypeScript)

- **File:** `kebab-case` theo hậu tố NestJS — `health.controller.ts`, `health.service.ts`, `health.module.ts`, `database.module.ts`, `database.tokens.ts`.
- **Class / decorator target:** `PascalCase` — `HealthController`, `DatabaseModule`.
- **Biến / hàm / property:** `camelCase`. **Hằng / DI token:** `SCREAMING_SNAKE_CASE` (`DATABASE_CONNECTION`, `POSTGRES_CLIENT`).
- **API công khai của module:** export qua `index.ts`; module khác import từ `index.ts`, không import file triển khai riêng tư.

## Cơ sở dữ liệu (PostgreSQL / Drizzle)

- **Bảng và cột:** `snake_case` — `hs_code`, `schedule`, `valid_from`, `valid_to`, `source_decree`, `as_of`. Khóa tra cứu biểu thuế: `(hs_code, hs_version, schedule, valid_from, valid_to, ...)`; danh tính phụ lục là cột **được lưu**, không suy diễn ([bitemporal ADR](architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)).
- **Migration:** đánh số tuần tự theo Drizzle — `NNNN_<mô-tả-ngắn>.sql` (vd `0000_enable_pgvector.sql`). Nội dung là SQL đọc được; ghi chỉ-nối-thêm, không `UPDATE` tại chỗ.

## Repo / hạ tầng

- **Tên package:** `customs-assistant`. **Image Docker:** `customs-assistant:local`. **Service compose:** `db`, `migrate`, `api`.
- **Biến môi trường:** `SCREAMING_SNAKE_CASE` — `DATABASE_URL`, `PORT`.

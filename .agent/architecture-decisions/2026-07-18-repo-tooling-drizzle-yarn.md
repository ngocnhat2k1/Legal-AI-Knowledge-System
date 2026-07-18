---
type: architecture-decision
status: approved
updated: 2026-07-18
related:
  - 2026-07-17-postgres-only-for-v1.md
  - 2026-07-17-bitemporal-validity-from-day-one.md
  - 2026-07-17-no-llm-on-tariff-numbers.md
  - ../docs/code-organization.md
  - ../planning/01-task-list.md
---

# Công cụ Repo: Drizzle + Yarn + Docker (Khung sườn TASK-006)

## Trạng thái

Đã phê duyệt — 2026-07-18, bởi chủ dự án (quyết định trực tiếp trong phiên TASK-006).

## Bối cảnh

TASK-006 dựng khung sườn repository: một monorepo NestJS + PostgreSQL/pgvector + Docker mà một lập trình viên thứ hai clone và chạy được. Stack ở mức cao đã bị khóa từ trước ([Chỉ dùng PostgreSQL cho v1](2026-07-17-postgres-only-for-v1.md)), nhưng **mọi lựa chọn ở tầng công cụ vẫn để ngỏ**: lớp truy cập DB, công cụ migration, package manager, phiên bản Node/Postgres, image pgvector, test runner. ADR này ghi lại các lựa chọn đó và lý do.

Ràng buộc định hình quyết định là **ngân sách rà soát, không phải năng lực**: bề mặt code do AI sinh ra phải nằm gọn trong "SQL và NestJS — hai thứ mà chủ dự án thực sự có thể rà soát từng dòng" ([postgres-only ADR §Hệ quả](2026-07-17-postgres-only-for-v1.md)). Ràng buộc lĩnh vực cũng ép lược đồ tương lai (TASK-007): append-only (cấm `UPDATE`), khóa gồm danh tính phụ lục, và truy vấn tại-một-thời-điểm là vị từ khoảng — không phải `ORDER BY date DESC LIMIT 1` ([bitemporal ADR](2026-07-17-bitemporal-validity-from-day-one.md)).

## Quyết định

| Hạng mục | Chọn |
|---|---|
| Lớp truy cập DB + migration | **Drizzle ORM**. Lược đồ định nghĩa bằng TypeScript; migration là các file `.sql` **đọc/sửa được** dưới `db/migrations`, áp dụng bởi `db/migrate.ts`. DDL mà Drizzle không biểu đạt (vd `CREATE EXTENSION`) viết bằng migration `--custom`. |
| Driver | **postgres.js** (`postgres`). Một kết nối duy nhất mở trong `DatabaseModule`, đóng khi shutdown. |
| Layout | **NestJS monorepo workspace**, chỉ `apps/api` bây giờ; `libs/` thêm khi có consumer thứ 2 (quy tắc code-organization). |
| Package manager | **Yarn 4** qua Corepack, `nodeLinker: node-modules`. |
| Node / Postgres | **Node 22 LTS** / **PostgreSQL 17**, image `pgvector/pgvector:pg17` (extension `vector` ship sẵn). |
| Test runner | **Jest** (mặc định NestJS). Golden set mới là câu chuyện test thật (TASK-012). |
| Migration của TASK-006 | **Chỉ một**: `0000_enable_pgvector.sql` bật extension `vector`. Lược đồ biểu thuế là TASK-007. |
| Điều phối local | `docker compose up` theo thứ tự `db` (healthy) → `migrate` (chạy xong) → `api` (boot). |

**Ranh giới bất biến (kế thừa, không mở lại ở đây):** đường tra cứu biểu thuế không có LLM/embedding/retrieval; pgvector không bao giờ chạm bảng thuế ([no-llm ADR](2026-07-17-no-llm-on-tariff-numbers.md)). pgvector bật ngay nhưng **không dùng ở Giai đoạn 1** — Giai đoạn 2 cần cho embedding ghi chú HS; bật bây giờ tránh một migration hạ tầng về sau.

## Các phương án đã cân nhắc

- **Drizzle (chọn).** Lược đồ có type + migration SQL sinh ra đọc được. Giữ SQL hạng nhất, cho phép viết trực tiếp CHECK/FK/loại-trừ mà TASK-007 cần (không thể chèn dòng nếu thiếu phụ lục — DB thực thi), và không giấu vị-từ-khoảng sau ORM magic.
- **TypeORM (mặc định NestJS) — bị bác.** Giấu SQL sau entity/decorator; mô hình khuyến khích `save`/`update` đi ngược quy tắc append-only; migration là dẫn xuất từ diff entity nên CHECK/loại-trừ/khoảng phải dùng escape-hatch thủ công. Bề mặt rà soát khó soi từng dòng hơn — đúng thứ postgres-only ADR muốn tránh.
- **pg trần / Kysely — bị bác (giữ làm đường lui).** Reviewability tối đa nhưng nhiều boilerplate và không có lược đồ khai báo có type. Nếu Drizzle sau này cản trở, hạ xuống SQL trần là thay đổi phạm vi hẹp.
- **NestJS single-app chuẩn (không monorepo) — bị bác.** Đơn giản hơn nhưng đi ngược chữ "monorepo NestJS" trong tài liệu; monorepo-workspace-một-app giữ đúng chữ mà không over-build.
- **Yarn classic 1.x — cân nhắc.** Đơn giản nhưng EOL; Yarn 4 + node-modules linker hiện đại và vẫn tránh rắc rối PnP với NestJS/tsc.

## Hệ quả

- **Một image Docker dùng chung** cho `migrate` và `api`: giữ nguyên toàn bộ `node_modules` từ stage build vì `migrate` chạy migrator TypeScript bằng `tsx` (dev dependency) còn `api` chạy JS đã build. Image lớn hơn bản prune-prod, chấp nhận được cho công cụ nội bộ.
- **db publish ra host cổng 5433** (không phải 5432) để tránh đụng Postgres thường chạy sẵn trên máy dev. Trong mạng compose, api vẫn dùng `db:5432`.
- **Migration idempotent**: `CREATE EXTENSION IF NOT EXISTS` + journal Drizzle (`__drizzle_migrations`) → `docker compose up` lặp lại không lỗi (đã xác minh 2026-07-18: chạy migrate hai lần, count vẫn 1).
- **Bề mặt truy vấn của TASK-007 đã có nhà**: `db/schema/` (Drizzle) + `db/migrations/` (SQL). Lược đồ hôm nay gần rỗng có chủ đích.
- Đã xác minh end-to-end 2026-07-18: clean-clone (không `node_modules`) → `docker compose up --build` → `migrate` exit 0 → `/health` trả `{"status":"ok","db":"up","pgvector":"0.8.5"}`.

## Rủi ro

- **Drizzle vẫn là một lớp trừu tượng.** Nếu một truy vấn bitemporal phức tạp (TASK-011) bị nó cản, hãy viết SQL trần cho truy vấn đó thay vì bẻ cong ORM — đường lui pg/Kysely còn hiệu lực.
- **Yarn 4 + Docker**: dùng `node_modules` linker; nếu ai đó bật PnP, NestJS/tsc build có thể vỡ. Giữ `.yarnrc.yml` là `nodeLinker: node-modules`.
- **Image gồm devDependencies** (vì `migrate` cần `tsx`). Nếu sau này muốn image prod gọn, tách bước migrate thành binary đã compile hoặc chuyển `tsx` sang một stage riêng.

## Chưa xác minh / Không được dựa vào

- Chưa chạy trên máy CI/máy thứ hai thật — chỉ "clean-clone" mô phỏng bằng cách copy cây làm việc trừ file gitignored rồi build sạch. Đủ để bắt lỗi phụ thuộc file untracked, nhưng chưa phải một lần clone Git thật trên phần cứng khác.
- Version pin theo "mới nhất tương thích" tại 2026-07-18 (NestJS 11.1.28, drizzle-orm 0.45.2, drizzle-kit 0.31.10). TypeScript cố ý giữ dòng **5.9.x** (không phải 7.x native mới ra) để tương thích ts-jest/ts-node/NestJS.

## Kiến thức liên quan

- [Chỉ dùng PostgreSQL cho v1](2026-07-17-postgres-only-for-v1.md) — vì sao Postgres là dịch vụ trạng thái duy nhất
- [Hiệu lực bitemporal ngay từ đầu](2026-07-17-bitemporal-validity-from-day-one.md) — ràng buộc lược đồ TASK-007 mà công cụ này phải phục vụ
- [Không dùng LLM cho con số biểu thuế](2026-07-17-no-llm-on-tariff-numbers.md) — pgvector không chạm bảng thuế
- [Tổ chức mã nguồn](../docs/code-organization.md) — ánh xạ thư mục thực tế
- [Danh sách công việc](../planning/01-task-list.md) — TASK-006 và tiêu chí chấp nhận

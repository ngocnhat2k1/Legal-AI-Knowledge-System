# Tổ chức mã nguồn

Monorepo: một app NestJS (`apps/api`) theo quy ước module của NestJS, cộng vài app nhỏ chạy riêng. Lý do chọn
công cụ: [ADR công cụ repo](../architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md).

```text
apps/
  api/src/
    main.ts, app.module.ts          # điểm vào; phục vụ web UI public/ bằng useStaticAssets
    modules/<feature>/              # health, tariff, legal, conversation, ingest
    shared/adapters/database/       # DatabaseModule: kết nối Postgres duy nhất, token DATABASE_CONNECTION
  zalo-bot/                         # bot Zalo (Node ESM, không build): index → dispatch/router → answer → format → render
  eval/                             # `yarn eval`: đo pháp luật, HS, 14 câu notebook qua HTTP
  ingest/                           # worker nạp văn bản theo yêu cầu (Python) + crawl chỉ mục Công báo (TS)
  embedder/                         # sidecar BGE-M3 (FastAPI)
db/
  schema/, migrations/, migrate.ts  # Drizzle schema + SQL migration viết tay, append-only
  seed/                             # `yarn db:seed`, `yarn db:seed:legal`; dữ liệu trích trong data/
research/                           # bộ nạp chạy trên máy dev (legal-, fta-, inbox-, hs-notes-loader) + README các spike đã xong
fixtures/                           # golden set, bộ câu pháp luật / notebook, baseline eval
public/index.html                   # web UI
```

## Quy tắc

- Logic nghiệp vụ nằm trong module của nó. `shared/` chỉ cho hạ tầng mà ít nhất hai module dùng.
- Đường **tra cứu biểu thuế** không phụ thuộc LLM, embedding hay truy hồi
  ([ADR](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)); `EmbeddingService` chỉ nằm trong `modules/legal/`.
- Test đặt cạnh code: `*.spec.ts` (Jest, `yarn test`), `*.test.mjs` (bot, `yarn test:bot`), `test_*.py` (`yarn test:parser`).
- Không tạo `utils`, `helpers`, `common`, `misc`; tìm thứ có sẵn trước khi viết mới.

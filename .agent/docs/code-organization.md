# Tổ chức Mã nguồn

Tài liệu này định nghĩa hướng dẫn tổ chức mã nguồn mặc định cho dự án này.

Hãy dùng nó để giữ cho công việc triển khai có thể dự đoán được giữa các agent và các luồng khác nhau.

## Framework Trước Tiên

Nếu dự án này đã sử dụng một framework, nền tảng, hoặc quy ước kho mã đã được thiết lập, hãy tuân theo quy ước đó trước.

Ví dụ:

- Các dự án Next.js, Remix, hoặc tương tự có thể dùng các quy ước `app/`, `pages/`, `components/`, `lib/`, hoặc quy ước route sẵn có của chúng.
- Các dự án NestJS, Rails, Laravel, Django, Spring, hoặc tương tự có thể dùng các quy ước module, controller, service, model, migration, hoặc package đã được thiết lập của chúng.
- Các monorepo có thể dùng bố cục `apps/`, `packages/`, `services/`, hoặc workspace sẵn có của chúng.

Khi một quy ước framework được sử dụng, hãy ghi lại ánh xạ đặc thù cho dự án trong file này thay vì ép buộc cấu trúc baseline APB.

## Baseline Được Khuyến Nghị

Dùng baseline này khi dự án chưa có một framework hoặc cấu trúc kho mã rõ ràng:

```text
src/
  app/
  modules/
    example-module/
  shared/
    kernel/
    adapters/
  integrations/
  tests/
    helpers/
```

## Trách nhiệm của các Thư mục

Các trách nhiệm này áp dụng khi baseline được khuyến nghị được sử dụng. Đối với các dự án dựa trên framework, hãy ánh xạ cùng các trách nhiệm đó sang các thư mục native của framework.

| Thư mục | Trách nhiệm |
|---|---|
| `src/app/` | Điểm vào ứng dụng, định tuyến, kết hợp phụ thuộc, và đấu nối ở tầng cao nhất. |
| `src/modules/<module-name>/` | Logic nghiệp vụ đặc thù cho tính năng, service, quy tắc, kiểu, và test. |
| `src/shared/kernel/` | Các primitive nhỏ trung lập về lĩnh vực được dùng chung giữa các module. |
| `src/shared/adapters/` | Các adapter hạ tầng dùng chung như logging, cấu hình, hoặc truy cập môi trường. |
| `src/integrations/<integration-name>/` | Client hệ thống bên ngoài, mapper, và các helper đặc thù cho tích hợp. |
| `tests/helpers/` | Các helper chỉ dùng cho test và không được import bởi code production. |

## Ranh giới Module

- Logic đặc thù cho tính năng nên nằm bên trong ranh giới feature/module của framework, hoặc bên trong `src/modules/<module-name>/` khi baseline được khuyến nghị được sử dụng.
- Mỗi module nên phơi bày API công khai của nó qua `index` khi ngôn ngữ và công cụ của dự án hỗ trợ điều đó.
- Các module khác nên import từ một API công khai của module thay vì các file triển khai riêng tư.
- Quy tắc nghiệp vụ thuộc về các file ở cấp feature/module, không phải trong code dùng chung chung chung.
- Việc ánh xạ hoặc chuẩn hóa đặc thù cho tích hợp thuộc về ranh giới tích hợp của framework, hoặc dưới `src/integrations/<integration-name>/` khi baseline được khuyến nghị được sử dụng.

## Quy tắc Code Dùng Chung

- Chỉ thêm code có thể tái sử dụng vào vị trí code-dùng-chung của dự án khi có ít nhất hai module cần nó, hoặc khi chủ dự án phê duyệt nó là hạ tầng dùng chung.
- Giữ code shared kernel trung lập về lĩnh vực.
- Đừng tạo các file hoặc thư mục hứng đủ thứ chung chung như `utils`, `helpers`, `common`, `misc`, `shared.ts`, hay `helpers.ts`.
- Ưu tiên các helper cục bộ trong module cho đến khi việc tái sử dụng được chứng minh.
- Trước khi thêm một helper, tiện ích, trừu tượng, hay module dùng chung, hãy tìm trong codebase hiện có hành vi tương đương.

## Ánh xạ Dự án

Dự án dùng **NestJS ở chế độ monorepo workspace** (quy ước framework — xem [ADR công cụ repo](../architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md)). Chỉ có một app (`apps/api`) trong v1; `libs/` để rỗng cho đến khi có consumer thứ 2. Cấu trúc thực tế (dựng ở TASK-006):

```text
apps/api/src/
  main.ts                          # điểm vào, listen PORT
  app.module.ts                    # composition root
  modules/<feature>/               # module tính năng NestJS (controller/service/module)
  shared/
    kernel/                        # primitive trung lập lĩnh vực (rỗng bây giờ)
    adapters/database/             # DatabaseModule: Drizzle client, đóng kết nối khi shutdown
db/
  schema/                          # lược đồ Drizzle (gần rỗng ở TASK-006; TASK-007 điền)
  migrations/                      # migration SQL đọc được + journal Drizzle
  migrate.ts                       # runner áp dụng migration (service `migrate`)
```

| Trách nhiệm | Vị trí trong Dự án | Ghi chú |
|---|---|---|
| Điểm vào và kết hợp ứng dụng | `apps/api/src/main.ts`, `apps/api/src/app.module.ts` | Composition root; `enableShutdownHooks` để đóng DB sạch. |
| Logic feature/module | `apps/api/src/modules/<feature>/` | Module NestJS. Đường **tra cứu biểu thuế** không được có phụ thuộc LLM/embedding/retrieval ([no-llm ADR](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)). |
| Primitive trung lập về lĩnh vực dùng chung | `apps/api/src/shared/kernel/` | Rỗng bây giờ; giữ nhỏ và trung lập. |
| Adapter hạ tầng dùng chung | `apps/api/src/shared/adapters/database/` | DatabaseModule cấp Drizzle client qua token `DATABASE_CONNECTION`; import từ `index.ts` công khai. |
| Lược đồ + migration DB | `db/schema/`, `db/migrations/`, `db/migrate.ts` | Artifact ops; áp dụng chỉ-nối-thêm (TASK-007). Chạy bằng `tsx`/`drizzle-kit`, không qua nest build. |
| Tích hợp bên ngoài | `apps/api/src/integrations/<name>/` (chưa có) | Tạo khi cần client hệ thống ngoài đầu tiên (vd Công báo). |
| Test helper | `apps/api` cạnh code, `*.spec.ts` (Jest) | Chưa có thư mục `tests/helpers/` dùng chung; thêm khi tái sử dụng được chứng minh. |

## Kiểm tra Tái sử dụng

Trước khi tạo code có thể tái sử dụng mới, hãy ghi lại câu trả lời cho các câu hỏi này trong kế hoạch tác vụ hoặc bản tóm tắt rà soát:

- Những file, helper, module, hay khuôn mẫu hiện có nào đã được tìm kiếm?
- Vì sao code hiện có không đủ?
- Code mới nên ở lại cục bộ trong module hay trở thành dùng chung?
- Tài liệu hoặc ghi chú tổ chức mã nguồn nào phải được cập nhật?

## Danh sách Kiểm tra Rà soát

Rà soát code phải kiểm tra:

- Các helper trùng lặp hoặc logic nghiệp vụ trùng lặp.
- Các file tiện ích chung chung mới.
- Các import chéo module từ các file triển khai riêng tư.
- Các quy tắc nghiệp vụ được đặt trong `src/shared/`.
- Code dùng chung được đưa vào trước khi việc tái sử dụng được chứng minh.

# AI Project Bootstrap

APB là bộ khởi tạo dự án phần mềm dành cho cách làm việc có AI coding agent tham gia. Nó không phải framework ứng dụng, không phải runtime orchestration, và không cố thay thế quy trình phát triển hiện có. APB chỉ tạo sẵn một nền làm việc có kỷ luật để con người và agent cùng hiểu dự án, cùng theo một workflow, và không làm mất ngữ cảnh sau mỗi phiên làm việc.

Nói ngắn gọn: APB giúp bạn bắt đầu một repo mới với sẵn luật làm việc cho agent, nơi lưu tri thức dự án, kế hoạch, review, tài liệu kỹ thuật, ADR, và cấu trúc code baseline.

## APB giải quyết vấn đề gì

Khi dùng AI agent để làm phần mềm, vấn đề thường không nằm ở việc agent có viết code được hay không. Vấn đề là agent dễ thiếu ngữ cảnh, hỏi lại nhiều lần, tạo helper trùng, bỏ qua quyết định cũ, hoặc sửa code trước khi thống nhất yêu cầu.

APB tạo sẵn một lớp "project memory" trong repo để giảm các lỗi đó:

- Agent biết phải đọc gì trước khi sửa code.
- Yêu cầu, giả định, câu hỏi mở, rủi ro, và kế hoạch kiểm chứng có chỗ để ghi lại.
- Quyết định kiến trúc được lưu thành ADR thay vì trôi trong chat.
- Review history được giữ lại để agent sau hiểu vì sao một hướng đã được chọn hoặc bị loại.
- Quy tắc tổ chức code giúp hạn chế việc sinh `utils`, `helpers`, `common` lung tung.
- Root `AGENTS.md` và `CLAUDE.md` đóng vai trò entry point mỏng để nhiều agent cùng đi về một nguồn sự thật trong `.agent/AGENTS.md`.

## Điểm đáng dùng

APB đáng dùng khi bạn muốn AI agent làm việc lâu dài trong repo, không chỉ trả lời một lần trong chat.

Các điểm mạnh chính:

- **Có cấu trúc ngay từ đầu:** dự án mới có sẵn `.agent/`, planning, docs, review history, ADR, và code organization guidance.
- **Giảm mất ngữ cảnh:** project brief nằm ở `.agent/project-context.md`, còn `.agent/index.md` là bản đồ tri thức để agent mới tự định hướng.
- **Review-first:** workflow mặc định đi từ planning, review, design, implementation, code review, rồi mới cập nhật docs và agent knowledge.
- **Không khóa vào framework:** APB trung lập với domain và framework. Nếu dự án đã có convention riêng, agent phải ưu tiên convention đó.
- **Markdown thuần:** agent memory là file Markdown trong repo, không phụ thuộc Obsidian, database, SaaS, hoặc plugin riêng.
- **An toàn với repo đã có file:** bản v0.1 không tự merge vào thư mục không trống để tránh ghi đè nhầm.
- **Có công cụ render tài liệu BA:** `apb-render-project-info` có thể đọc `.md`, `.txt`, `.docx` và tạo project summary ban đầu cho agent.

## APB hiện làm gì

Phiên bản v0.1 cố ý đơn giản:

- Sao chép bộ template vào dự án mới.
- Thay `{{PROJECT_NAME}}` bằng tên thư mục dự án.
- Tạo cấu trúc `.agent/` để agent và chủ dự án làm việc có kỷ luật.
- Tạo root `AGENTS.md` và `CLAUDE.md` làm file cầu nối cho agent.
- Tạo baseline code structure trung lập cho dự án chưa có framework.
- Cung cấp lệnh render tài liệu BA thành `.agent/planning/02-project-summary.md`.

APB chưa có manifest, hook, profile, blueprint, plugin, orchestration, hoặc tự động merge vào dự án đã có sẵn file.

## Khi nào nên dùng

Dùng APB khi:

- Bạn bắt đầu một repo mới và muốn AI agent có quy trình rõ ngay từ đầu.
- Bạn muốn agent ghi nhớ business rules, architecture decisions, review decisions, và task context trong repo.
- Bạn làm việc với nhiều agent hoặc nhiều phiên chat khác nhau và cần một nguồn sự thật chung.
- Bạn muốn hạn chế việc agent tự ý tạo abstraction, helper, hoặc cấu trúc code không thống nhất.
- Bạn có tài liệu mô tả dự án/BA và muốn biến nó thành project summary để agent đọc trước.

Không nên kỳ vọng APB là:

- Framework frontend/backend.
- Công cụ quản lý task thay Jira/Linear.
- AI orchestrator chạy nhiều agent tự động.
- Template engine phức tạp cho mọi loại stack.
- Công cụ migrate tự động cho repo đã có sẵn.

## Yêu cầu

- Node.js 18 trở lên.
- npm.
- Một thư mục đích chưa tồn tại hoặc đang trống.

## Cài để dùng trên máy

Từ thư mục repo này:

```bash
cd apb
npm link
```

Sau khi link, máy sẽ có 2 lệnh:

```text
create-apb
apb-render-project-info
```

Kiểm tra:

```bash
which create-apb
which apb-render-project-info
```

Nếu không muốn dùng `npm link`, có thể chạy trực tiếp từ repo:

```bash
npm run create-apb -- ../my-project
npm run render-project-info -- ../my-project/input/ba-description.md ../my-project
```

## Tạo dự án mới

Dùng lệnh đã link:

```bash
create-apb ../my-project
```

Hoặc chạy trực tiếp:

```bash
node bin/create-apb.js ../my-project
```

Thư mục đích có thể chưa tồn tại hoặc đang trống. Nếu thư mục đã có file, APB sẽ dừng để tránh ghi đè hoặc merge sai.

Sau khi tạo xong, bắt đầu từ các file này:

```text
AGENTS.md
.agent/AGENTS.md
.agent/index.md
.agent/project-context.md
.agent/planning/00-bootstrap.md
.agent/planning/01-task-list.md
.agent/docs/code-organization.md
```

Prompt gợi ý cho coding agent:

```text
Read AGENTS.md and begin the APB bootstrap workflow for this project.
```

## Render tài liệu BA

Render một file BA thành thông tin dự án:

```bash
apb-render-project-info ../my-project/input/ba-description.md ../my-project
```

Hoặc truyền vào một thư mục chứa nhiều tài liệu:

```bash
apb-render-project-info ../my-project/input/docs ../my-project
```

Nếu chạy trực tiếp từ repo:

```bash
node bin/apb-render-project-info.js ../my-project/input/ba-description.md ../my-project
```

Kết quả được tạo ở:

```text
.agent/planning/02-project-summary.md
```

Renderer đọc `.md`, `.txt`, và `.docx`, trích các phần có thể nhận diện, và để lại câu hỏi mở cho phần còn thiếu. File không hỗ trợ sẽ được liệt kê trong summary thay vì làm hỏng toàn bộ quá trình.

APB không ghi đè `.agent/planning/02-project-summary.md` nếu file này đã tồn tại. Hãy review hoặc đổi tên file cũ trước khi render lại.

## Cấu trúc dự án được tạo

```text
README.md
AGENTS.md
CLAUDE.md
.agent/
  AGENTS.md
  index.md
  business-rules.md
  naming-conventions.md
  project-context.md
  artifacts/
  architecture-decisions/
    README.md
    template.md
  docs/
    README.md
    code-organization.md
  planning/
    00-bootstrap.md
    01-task-list.md
  previews/
  review-history/
    README.md
  reviews/
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

Tài liệu dành cho agent nằm trong `.agent/`.

Root `AGENTS.md` và `CLAUDE.md` là file cầu nối mỏng về `.agent/AGENTS.md`. APB giữ `.agent/AGENTS.md` làm nguồn sự thật chung, còn `CLAUDE.md` tồn tại để Claude nhận đúng entry point.

`.agent/index.md` là bản đồ tri thức bền vững cho agent. APB dùng mô hình note-link kiểu Obsidian nhưng giữ toàn bộ nội dung ở Markdown thuần: link chính dùng đường dẫn Markdown tương đối, còn wiki link hoặc tính năng riêng của editor chỉ được xem là phụ trợ.

## Quy trình làm việc

Dự án được tạo bởi APB dùng quy trình review-first:

```text
Planning
Planning Review
Freeze Planning
Implementation Design
Design Review
Freeze Design
Milestone Implementation
Code Review
Fix Feedback
Update Documentation
Update Agent Knowledge
```

`.agent/project-context.md` là project brief bền vững để agent mới hiểu dự án làm gì, phục vụ ai, phạm vi nào được làm, phạm vi nào không làm, workflow chính, thuật ngữ domain, constraint, và câu hỏi mở. Khi bootstrap lần đầu, agent hỏi mô tả dự án một lần để sinh file này; sau khi file đã có nội dung thì các lần sau chỉ đọc lại và cập nhật khi context thật sự thay đổi.

Khi dự án lớn lên, agent có thể thêm các note như `features/`, `modules/`, `concepts/`, hoặc `workflows/` trong `.agent/` và liên kết chúng từ `.agent/index.md`. Các note quan trọng nên có phần `Related Knowledge` để nối feature, rule, ADR, review, và module boundary với nhau.

Template planning tách rõ yêu cầu đã xác nhận, giả định, câu hỏi mở, rủi ro, phạm vi không làm, và kế hoạch kiểm chứng khi task có độ mơ hồ, rủi ro, hoặc ảnh hưởng triển khai đáng kể. Với task known-known nhỏ như sửa typo, đổi text, hoặc thêm config đơn giản, agent chỉ cần nêu assumption, risk, hoặc validation note nếu chúng thật sự tồn tại.

APB cũng tạo sẵn hướng dẫn tổ chức code để giảm khả năng agent ở nhiều thread sinh helper hoặc abstraction trùng nhau. Nếu dự án dùng framework hoặc đã có convention riêng, agent phải ưu tiên convention đó và ghi mapping vào `.agent/docs/code-organization.md`.

Với dự án chưa có cấu trúc rõ, APB cung cấp baseline trung lập:

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

Quy tắc chi tiết nằm trong `.agent/docs/code-organization.md`: logic theo feature nằm trong boundary của framework hoặc module, shared code chỉ dùng khi reuse đã rõ hoặc được owner chấp thuận, và agent không được tạo các file/thư mục catch-all như `utils`, `helpers`, `common`, hoặc `misc`.

## Dự án đã có sẵn

APB v0.1 chưa tự khởi tạo vào thư mục dự án đã có file.

Nếu thư mục đích không trống, `create-apb` sẽ dừng. Hiện tại hãy dùng APB với thư mục mới hoặc thư mục trống.

## Xử lý lỗi thường gặp

Nếu không tìm thấy `create-apb` sau khi `npm link`, kiểm tra npm global bin path:

```bash
npm bin -g
```

Nếu thư mục đích không trống, tạo thư mục mới hoặc chờ command hỗ trợ existing project trong phiên bản sau.

Nếu `apb-render-project-info` báo file output đã tồn tại, review `.agent/planning/02-project-summary.md` trước khi quyết định xoá, đổi tên, hoặc archive.

`create-apb` bỏ qua một số file noise phổ biến như `.DS_Store` và `Thumbs.db` khi copy template.

## README tiếng Anh

Nội dung hướng dẫn tiếng Anh trước đây đã được backup dạng bảng tại `README.en.md`.

## Trạng thái publish

Repo này đã sẵn sàng để public trên GitHub.

Package vẫn giữ `"private": true` vì APB v0.1 chưa chuẩn bị để publish lên npm registry. Public GitHub repo và publish npm package là 2 quyết định khác nhau.

## Giấy phép

MIT. Xem `LICENSE`.

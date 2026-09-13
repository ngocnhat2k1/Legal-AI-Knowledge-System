---
type: index
status: active
updated: 2026-09-13
related:
  - AGENTS.md
  - project-context.md
  - business-rules.md
---

# Chỉ mục bộ nhớ tác nhân (Agent Memory Index)

File này là bản đồ điều hướng cho bộ nhớ tác nhân bền vững trong **Customs Assistant**. Bắt đầu từ đây, rồi theo các ghi chú nguồn-sự-thật được liên kết cần thiết cho công việc hiện tại.

## Đang tiếp tục công việc?

**→ [Nhật ký tiến độ](planning/02-progress.md)** — giai đoạn hiện tại, việc tiếp theo, các điểm nghẽn, và những gì các phiên làm việc trước đã học được một cách vất vả. Hãy đọc nó trước bất cứ điều gì khác, và cập nhật nó trước lần commit cuối cùng của bạn.

## Đọc phần này trước tiên

Customs Assistant là một công cụ nội bộ cho công việc khai báo hải quan tại một công ty logistics Việt Nam. Hai quy tắc chi phối gần như mọi quyết định trong kho mã (repository) này:

1. **Thuế suất được tra cứu theo khóa chính xác, không bao giờ do LLM tạo ra.** Tìm kiếm ngữ nghĩa trên một bảng biểu thuế trả về hàng có vẻ giống nhất, mà trong một bảng biểu thuế thì đó thường là hàng sai. Xem [Quy tắc nghiệp vụ](business-rules.md) và [ADR: Không dùng LLM cho con số biểu thuế](architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md).
2. **Mã HS được đưa ra dưới dạng top-3 ứng viên kèm bằng chứng pháp lý nguyên văn, không bao giờ được khẳng định chắc chắn.** Các benchmark độc lập đặt độ chính xác tự động của LLM ở mức 29–47% ở 10 chữ số so với mốc chuẩn 95% của con người; top-3 có khả năng giải thích kèm bằng chứng đạt 93,9%. Khoảng cách này là hợp đồng đầu ra, không phải năng lực mô hình. Xem [ADR: HS là ứng viên, không phải đáp án](architecture-decisions/2026-07-17-hs-candidates-not-answers.md).

Nếu một thay đổi làm suy yếu bất kỳ điều nào trong hai điều trên, hãy dừng lại và nêu vấn đề với chủ sở hữu (owner).

## Core

- [Quy tắc tác nhân](AGENTS.md)
- [Bối cảnh dự án](project-context.md) — cái này là gì, phục vụ ai, cái gì nằm ngoài phạm vi
- [Quy tắc nghiệp vụ](business-rules.md) — xương sống an toàn; đọc trước khi đụng tới đầu ra biểu thuế hoặc HS
- [Quy tắc dự án](project-rules.md)
- [Quy ước đặt tên](naming-conventions.md)

## Khái niệm nghiệp vụ (Domain Concepts)

Kiến thức nghiệp vụ mà một tác nhân không thể suy ra từ mã nguồn hoặc từ dữ liệu huấn luyện. Mỗi ghi chú đều được ghi ngày và dẫn nguồn, và mỗi ghi chú đều có một phần `Chưa xác minh / Không được dựa vào` cần được tôn trọng thay vì dọn dẹp đi.

- [Phân loại mã HS](concepts/hs-classification.md) — thứ tự GRI, thứ bậc thẩm quyền, vì sao AI thất bại ở đây
- [Hệ thống biểu thuế](concepts/tariff-system.md) — MFN, các biểu thuế FTA, cái bẫy phụ lục, vách đá 2027
- [Văn bản pháp luật Việt Nam](concepts/vietnamese-legal-documents.md) — thứ bậc, hiệu lực, văn bản hợp nhất, cuộc tái cấu trúc các bộ năm 2025
- [Nguồn dữ liệu](concepts/data-sources.md) — dữ liệu đến từ đâu, và cái gì không bao giờ được scrape
- [Tài sản dữ liệu nội bộ của công ty](concepts/company-data-assets.md) — tờ khai lịch sử (golden oracle), SOP nội bộ, biểu thuế thương mại: vai trò + cross-check 249/249
- [Truy xuất RAG pháp lý](concepts/legal-rag-retrieval.md) — giai đoạn tương lai; được ghi lại ngay bây giờ khi bằng chứng còn mới

## Quy trình (Workflows)

- [Quy trình khai báo hải quan](workflows/customs-declaration.md) — vòng lặp công việc hằng ngày thực tế của chủ sở hữu

## Lập kế hoạch (Planning)

- [Nhật ký tiến độ](planning/02-progress.md) — **điểm tiếp tục**; những gì đã thực sự diễn ra
- [Kế hoạch khởi tạo](planning/00-bootstrap.md) — các giai đoạn và cổng kiểm soát (gate)
- [Danh sách công việc](planning/01-task-list.md) — chi tiết công việc và tiêu chí chấp nhận
- [Triển khai lại lên server dev dùng chung của MONA](planning/06-deploy-mona-dev-server.md) — **đang thực thi (2026-09-13)**: API + kho pháp lý chạy, LLM up; bot Zalo đã đăng nhập, còn kiểm thử đầu-cuối (Task 9); chờ domain + mật khẩu basic auth (Task 8), `rclone.conf` (Task 10). Dữ liệu Contabo đã mất (VPS bị xoá) nên seed mới
- [Nâng cấp bot ngang notebook — Mảng 1…4](planning/05-bot-parity-tasks.md) — **kế hoạch đang chạy (2026-09-13)**: mảng 1 chi tiết (nền, baseline), mảng 2–4 phác thảo
- [Đường ống hộp thư đến — Giai đoạn 9](planning/04-inbox-ingest-tasks.md) — **kế hoạch đang chạy**; nạp tài liệu mới + gộp nguồn notebook, không cần máy chủ
- [Kế hoạch mở rộng LLM (M0…M4)](planning/03-llm-expansion-tasks.md) — nền móng, kho rộng ra, truy hồi, bằng chứng HS, phân loại HS

## Tài liệu (Documentation)

- [Chỉ mục tài liệu tác nhân](docs/README.md)
- [Tổ chức mã nguồn](docs/code-organization.md)
- [Bot Zalo: hiểu ảnh + tin quote](docs/zalo-bot-image-and-quote-context.md) — vision → đường thuế tất định; confine Read chống prompt-injection
- [Bot Zalo: bộ nhớ hội thoại + định tuyến theo chủ đề](docs/zalo-bot-conversation-memory.md) — vì sao "không phải" trên luồng pháp luật từng bị ghi thành đính chính mã HS
- [Kho pháp luật tự mở rộng](docs/legal-corpus-self-extension.md) — chỉ mục Công báo → nạp theo yêu cầu có cổng tự kiểm → thăng cấp bởi con người
- [Đường ống hộp thư đến](docs/inbox-ingest-workflow.md) — từ file nhận được qua Zalo/email tới kho tri thức và notebook; phân lớp tài liệu, thang ưu tiên lấy bản văn, đồng bộ Google Docs
- [Runbook: nạp tài liệu mới — lần sau làm thế nào](../research/inbox-loader/README.md) — từng bước, từng lệnh, các cổng phải qua
- [Runbook: vận hành server MONA dev](docs/mona-dev-server-operations.md) — vận hành stack trên server dev dùng chung của MONA sau khi deploy; đích ssh ghi là `<MONA_DEV_HOST>`, giá trị thật nằm ngoài git
- [Bot trả lời ngang notebook](docs/bot-answer-parity-design.md) — **đã duyệt (2026-09-13, bản 2 sau đợt kiểm độc lập)**: bảng bằng chứng chung phủ 32/32 nguồn notebook, đường trả lời 5 bước đọc dài, kiểm trích dẫn neo theo câu, chế độ ứng viên HS, chấm mù với notebook
- [Mở rộng LLM](docs/llm-expansion-design.md) — dùng nhiều LLM hơn mà không nới rào chắn: kho rộng ra, truy hồi đa truy vấn, bằng chứng phân loại HS
- [Đánh giá](docs/evaluation.md) — bộ vàng (golden set) và các cổng ra mắt (ship gates)

## Quyết định (Decisions)

- [Chỉ mục quyết định kiến trúc](architecture-decisions/README.md)
- [Hải quan trước, luật sau](architecture-decisions/2026-07-17-customs-first-law-later.md)
- [Không dùng LLM cho con số biểu thuế](architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- [HS là ứng viên, không phải đáp án](architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- [Chỉ dùng PostgreSQL cho v1](architecture-decisions/2026-07-17-postgres-only-for-v1.md)
- [Web app, không phải Zalo](architecture-decisions/2026-07-17-web-app-not-zalo.md)
- [Dùng VBHN đã công bố, không tự hợp nhất](architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
- [Hiệu lực bitemporal ngay từ đầu](architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)
- [Công cụ repo: Drizzle + Yarn + Docker (khung TASK-006)](architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md)
- [LLM sinh giả thuyết, không bao giờ khẳng định](architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md) — LLM ở chỗ tìm và điều hướng, không ở chỗ khẳng định; ngân sách 2 lần gọi mỗi lượt chat
- [Nạp Chú giải Phần/Chương và 6 quy tắc GRI](architecture-decisions/2026-09-09-load-hs-notes-and-gri.md) — bằng chứng pháp lý cho phân loại HS; trước đó kho dữ liệu có đúng 1 lần xuất hiện chữ "Chú giải"
- [File nhận được là con trỏ, không phải nguồn](architecture-decisions/2026-09-10-received-file-is-a-pointer-not-a-source.md) — bản văn lấy từ Công báo theo số hiệu, không từ file trong tay; 233 trang scan không cần OCR
- [Nguồn notebook là Google Docs trên Drive](architecture-decisions/2026-09-10-notebook-sources-as-google-docs.md) — file upload không bao giờ tự đồng bộ; Drive thì có, vài phút một lần
- [Văn bản chưa xác định tình trạng và công văn nằm ngoài kho pháp lý](architecture-decisions/2026-09-10-drafts-and-cong-van-outside-legal-corpus.md) — ô số hiệu trống là NGHI VẤN, phải dò Công báo; ba lần "dự thảo" hoá ra đã ban hành
- [Nạp bản tiếng Việt của Chú giải chi tiết HS và SEN](architecture-decisions/2026-09-10-load-vietnamese-explanatory-notes.md) — thay thế một phần ADR 2026-09-09; bản tiếng Anh WCO vẫn không nạp
- [Bảng bằng chứng chung và câu trả lời dài có kiểm nguyên văn](architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md) — thay một phần ADR 2026-08-14: ngân sách 4 lần gọi/lượt; `quote ⊂ nguồn` là sàn kiểm căn cứ
- [Host trên server dev dùng chung của MONA](architecture-decisions/2026-09-13-host-on-mona-dev-server.md) — thay VPS Contabo đã bị xoá: một compose project cô lập, nginx có sẵn thay Caddy, cổng 3060/5435, sao lưu lên Drive

## Đánh giá (Reviews)

- [Chỉ mục lịch sử đánh giá](review-history/README.md)

## Xuất xứ và độ cũ (Provenance And Staleness)

Các ghi chú về nghiệp vụ và nguồn dữ liệu được viết vào ngày 2026-07-17 từ mười hai báo cáo nghiên cứu đã truy xuất các nguồn trực tiếp (live), bao gồm ba lượt xác minh đối kháng (adversarial). Ở những nơi hai báo cáo mâu thuẫn với nhau, **cả hai đều được ghi lại và mâu thuẫn được đánh dấu công khai** thay vì âm thầm giải quyết, và nhiều xung đột vẫn còn để ngỏ. Ngoại lệ đáng chú ý: xung đột về việc liệu API biểu thuế customs.gov.vn có thể truy cập và không có captcha hay không **đã được giải quyết ngày 2026-07-18** (TASK-002) — chủ dự án **quan sát trực tiếp trên trình duyệt (tab Network)** thấy cổng thông tin gọi endpoint `bridge` (`POST .../bridge?url=/customs/servletws/bieuthue/APIBieuThue`) và nhận về dữ liệu, xác nhận research 10 và bác giả thuyết "vỏ JS chết chỉ trỏ tới IP-thô đã timeout" của research 12; dự án dùng `bridge`, không theo đuổi backend IP-thô. Đây là quan sát trên tab trình duyệt — **chưa** tái lập bằng `curl` trần, **chưa** bắt mẫu phản hồi, **chưa** thăm dò rate-limit (vẫn còn to-do, không chặn thiết kế). API vẫn chỉ là một lớp kiểm chứng chéo tiện lợi, **không phải nguồn chân lý pháp lý**. Xem `Xung đột đã giải quyết` trong [Nguồn dữ liệu](concepts/data-sources.md).

Luật Việt Nam thay đổi hằng tháng, và kho tư liệu này biến động một cách bất thường: một nghị định có thể được ban hành, có hiệu lực cùng ngày, được đăng Công báo hai tuần sau đó, và hết hiệu lực tám tuần sau nữa. **Mỗi khẳng định thực tế trong các ghi chú này đều kèm theo một ngày xác minh.** Hãy coi bất kỳ khẳng định nào cũ hơn vài tháng là một manh mối, không phải một sự thật, và hãy xác minh lại trước khi dựa vào nó.

## Ghi chú kiến thức tùy chọn (Optional Knowledge Notes)

Chỉ tạo các thư mục này khi dự án có kiến thức bền vững thuộc về đó:

- `features/` cho các ghi chú về tính năng hướng tới người dùng.
- `modules/` cho các ghi chú về ranh giới module, package, hoặc hệ thống con.

Mỗi ghi chú quan trọng nên liên kết ngược lại tới các quy tắc, quyết định, module, khái niệm, quy trình, hoặc lịch sử đánh giá có liên quan.

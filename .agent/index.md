---
type: index
status: active
updated: 2026-09-14
---

# Chỉ mục bộ nhớ tác nhân

Bản đồ điều hướng cho bộ nhớ bền vững của **Customs Assistant**.

## Đang tiếp tục công việc?

**→ [Nhật ký tiến độ](planning/02-progress.md)** — đọc trước tiên, cập nhật trước commit cuối.

## Hai quy tắc chi phối

1. Thuế suất tra theo khóa chính xác, không bao giờ do LLM sinh ra — [R1](business-rules.md) và [ADR](architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md).
2. Mã HS là top-3 ứng viên kèm bằng chứng nguyên văn, không bao giờ khẳng định — [R2](business-rules.md) và [ADR](architecture-decisions/2026-07-17-hs-candidates-not-answers.md).

Thay đổi nào làm yếu một trong hai: dừng lại và hỏi chủ dự án.

## Core

- [Quy tắc tác nhân](AGENTS.md)
- [Bối cảnh dự án](project-context.md) — cái này là gì, phục vụ ai, cái gì nằm ngoài phạm vi
- [Quy tắc nghiệp vụ](business-rules.md) — xương sống an toàn; đọc trước khi đụng tới đầu ra biểu thuế hoặc HS
- [Quy ước đặt tên](naming-conventions.md)

## Khái niệm nghiệp vụ (Domain Concepts)

Kiến thức nghiệp vụ mà một tác nhân không thể suy ra từ mã nguồn hoặc từ dữ liệu huấn luyện. Mỗi ghi chú đều được ghi ngày và dẫn nguồn, và mỗi ghi chú đều có một phần `Chưa xác minh / Không được dựa vào` cần được tôn trọng thay vì dọn dẹp đi.

- [Phân loại mã HS](concepts/hs-classification.md) — thứ tự GRI, thứ bậc thẩm quyền, vì sao AI thất bại ở đây
- [Hệ thống biểu thuế](concepts/tariff-system.md) — MFN, các biểu thuế FTA, cái bẫy phụ lục, vách đá 2027
- [Văn bản pháp luật Việt Nam](concepts/vietnamese-legal-documents.md) — thứ bậc, hiệu lực, văn bản hợp nhất, cuộc tái cấu trúc các bộ năm 2025
- [Nguồn dữ liệu](concepts/data-sources.md) — dữ liệu đến từ đâu, và cái gì không bao giờ được scrape
- [Tài sản dữ liệu nội bộ của công ty](concepts/company-data-assets.md) — tờ khai lịch sử (golden oracle), SOP nội bộ, biểu thuế thương mại: vai trò + cross-check 249/249
- [Truy xuất RAG pháp lý](concepts/legal-rag-retrieval.md) — thiết kế truy hồi của legal RAG đang chạy

## Quy trình (Workflows)

- [Quy trình khai báo hải quan](workflows/customs-declaration.md) — vòng lặp công việc hằng ngày thực tế của chủ sở hữu

## Lập kế hoạch

- [Nhật ký tiến độ](planning/02-progress.md) — **điểm tiếp tục**; trạng thái mọi kế hoạch
- [Bot trả lời ngang notebook — Mảng 2…4](planning/05-bot-parity-tasks.md) — việc tiếp theo
- [Việc còn dở của đợt triển khai lên server MONA](planning/06-deploy-mona-dev-server.md) — domain + basic auth, kiểm thử bot, sao lưu
- [Đường ống hộp thư đến — Giai đoạn 9](planning/04-inbox-ingest-tasks.md)
- Kế hoạch đã xong (00 bootstrap, 01 task list, 03 M0, 07 trình bày trên Zalo) nằm trong git `11275bc`.

## Tài liệu

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

## Quyết định

Mỗi quyết định một file, theo [mẫu](architecture-decisions/template.md).

- [Hải quan trước, luật sau](architecture-decisions/2026-07-17-customs-first-law-later.md)
- [Không dùng LLM cho con số biểu thuế](architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- [HS là ứng viên, không phải đáp án](architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- [Chỉ dùng PostgreSQL cho v1](architecture-decisions/2026-07-17-postgres-only-for-v1.md)
- [Web app, không phải Zalo](architecture-decisions/2026-07-17-web-app-not-zalo.md) — **đã được thay** bởi ADR bot Zalo tự host bên dưới
- [Dùng VBHN đã công bố, không tự hợp nhất](architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
- [Hiệu lực bitemporal ngay từ đầu](architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)
- [Công cụ repo: Drizzle + Yarn + Docker (khung TASK-006)](architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md)
- [Bot Zalo tự host, đóng gói trong app](architecture-decisions/2026-07-18-self-hosted-zalo-bot.md) — bổ sung web app
- [LLM sinh giả thuyết, không bao giờ khẳng định](architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md) — LLM ở chỗ tìm và điều hướng, không ở chỗ khẳng định; ngân sách 2 lần gọi mỗi lượt chat
- [Nạp Chú giải Phần/Chương và 6 quy tắc GRI](architecture-decisions/2026-09-09-load-hs-notes-and-gri.md) — bằng chứng pháp lý cho phân loại HS; trước đó kho dữ liệu có đúng 1 lần xuất hiện chữ "Chú giải"
- [File nhận được là con trỏ, không phải nguồn](architecture-decisions/2026-09-10-received-file-is-a-pointer-not-a-source.md) — bản văn lấy từ Công báo theo số hiệu, không từ file trong tay; 233 trang scan không cần OCR
- [Nguồn notebook là Google Docs trên Drive](architecture-decisions/2026-09-10-notebook-sources-as-google-docs.md) — file upload không bao giờ tự đồng bộ; Drive thì có, vài phút một lần
- [Văn bản chưa xác định tình trạng và công văn nằm ngoài kho pháp lý](architecture-decisions/2026-09-10-drafts-and-cong-van-outside-legal-corpus.md) — ô số hiệu trống là NGHI VẤN, phải dò Công báo; ba lần "dự thảo" hoá ra đã ban hành
- [Nạp bản tiếng Việt của Chú giải chi tiết HS và SEN](architecture-decisions/2026-09-10-load-vietnamese-explanatory-notes.md) — thay thế một phần ADR 2026-09-09; bản tiếng Anh WCO vẫn không nạp
- [Bảng bằng chứng chung và câu trả lời dài có kiểm nguyên văn](architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md) — thay một phần ADR 2026-08-14: ngân sách 4 lần gọi/lượt; `quote ⊂ nguồn` là sàn kiểm căn cứ
- [Host trên server dev dùng chung của MONA](architecture-decisions/2026-09-13-host-on-mona-dev-server.md) — thay VPS Contabo đã bị xoá: một compose project cô lập, nginx có sẵn thay Caddy, cổng 3060/5435, sao lưu lên Drive
- [Dòng 10 số quốc gia của biểu FTA đi kèm mã 8 số; EVFTA chỉ nạp Phụ lục II](architecture-decisions/2026-09-13-fta-national-sublines.md) — dòng con khác mức → `by_subline`, không in một con số; 553 mã EVFTA từng nạp nhầm thuế XK
- [Chữ định dạng Zalo theo giọng notebook, màu do dữ liệu quyết](architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md)

## Đánh giá

- [Phiếu xác minh bảng thành viên FTA](review-history/2026-09-13-fta-members-verification.md)

## Độ cũ

Luật Việt Nam thay đổi hằng tháng, và kho tư liệu này biến động một cách bất thường: một nghị định có thể được ban hành, có hiệu lực cùng ngày, được đăng Công báo hai tuần sau đó, và hết hiệu lực tám tuần sau nữa. **Mỗi khẳng định thực tế trong các ghi chú này đều kèm theo một ngày xác minh.** Hãy coi bất kỳ khẳng định nào cũ hơn vài tháng là một manh mối, không phải một sự thật, và hãy xác minh lại trước khi dựa vào nó.

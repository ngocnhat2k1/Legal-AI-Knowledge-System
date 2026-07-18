---
type: index
status: active
updated: 2026-07-18
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

## Tài liệu (Documentation)

- [Chỉ mục tài liệu tác nhân](docs/README.md)
- [Tổ chức mã nguồn](docs/code-organization.md)
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

# Trợ lý Hải quan

Một công cụ nội bộ cho đội ngũ nhân viên khai báo hải quan của một công ty logistics Việt Nam.

Nó trả lời hai câu hỏi mà một người khai báo đặt ra mỗi ngày:

1. **Thuế của lô hàng này là bao nhiêu?** — được tra cứu theo khóa chính xác `(HS code, schedule, date)`, kèm
   nghị định điều chỉnh, ngày chụp ảnh dữ liệu (data snapshot date), và các điều kiện đi kèm.
2. **Hàng hóa này thuộc mã HS nào?** — được trả lời bằng **ba ứng viên và chú giải chương và
   phần nguyên văn hỗ trợ cho từng ứng viên**, để một con người quyết định. Không bao giờ là một mã trần trụi.

## Trạng thái

**Tiền triển khai (Pre-implementation).** Chưa có mã ứng dụng nào — một cách có chủ đích.

Kho tri thức bền vững đã được viết và kiểm toán. Bước tiếp theo là bộ vàng (golden set), và nó cần
chủ sở hữu chứ không phải một tác nhân. Xem **[`.agent/planning/02-progress.md`](.agent/planning/02-progress.md)**
để biết mọi thứ thực sự đang ở đâu.

## Bắt đầu tại đây

| Bạn là | Đọc |
|---|---|
| Một tác nhân AI | [`.agent/AGENTS.md`](.agent/AGENTS.md), rồi [`.agent/index.md`](.agent/index.md) |
| Đang tiếp tục công việc | [`.agent/planning/02-progress.md`](.agent/planning/02-progress.md) |
| Mới với dự án | [`.agent/project-context.md`](.agent/project-context.md) |
| Sắp đụng tới đầu ra biểu thuế hoặc HS | [`.agent/business-rules.md`](.agent/business-rules.md) — không phải tùy chọn |

## Hai quy tắc chi phối tất cả

**Thuế suất không bao giờ do một LLM tạo ra.** Chúng được tra cứu theo khóa chính xác trong SQL. Tìm kiếm
ngữ nghĩa trên một bảng biểu thuế trả về hàng trông giống nhất, và trong một bảng biểu thuế thì
hàng trông giống nhất thường là hàng sai — danh mục được xây dựng từ các dòng anh em gần như giống hệt
nhau, chỉ khác nhau một định tố (qualifier) và khác nhau hàng chục điểm phần trăm.

**Mã HS được gợi ý, không bao giờ được khẳng định.** Các benchmark độc lập đặt độ chính xác tự động của LLM ở mức
29–47% ở 10 chữ số so với mốc chuẩn 95% của con người. Cùng những mô hình đó đạt 93,9% khi chúng trả về ba
ứng viên kèm bằng chứng đã truy xuất và để một con người quyết định. Khoảng cách này là hợp đồng đầu ra, không phải năng lực
mô hình.

Cả hai tồn tại bởi vì kiểu thất bại ở đây là âm thầm. Một mã HS sai là một mã thật, được định dạng đúng
— không có ngoại lệ, không có lỗi phân tích cú pháp, không có cờ đỏ. Nó thông quan và nổi lên nhiều năm sau như một cuộc
kiểm tra sau thông quan với truy thu, phạt, và lãi tính theo ngày. Người khai báo gánh trách nhiệm pháp lý
đó, không phải công cụ.

Do đó: đây là một **công cụ trợ giúp nghiên cứu hiển thị nguồn của nó và từ chối khi dữ liệu của nó có thể đã
cũ**, không bao giờ là một cỗ máy trả lời phát biểu một mức thuế.

## Vì sao có quá nhiều tài liệu và quá ít mã

Luật hải quan Việt Nam biến động nhiều hơn cả phần mềm. Trong quá trình nghiên cứu, một nghị định được ký và
có hiệu lực pháp lý **cùng ngày**, được công bố dưới dạng máy đọc được **mười lăm ngày
sau đó**, và **hết hiệu lực năm mươi hai ngày sau nữa** với các mức thuế âm thầm trở về như cũ. Một nửa số luật được nêu
trong lộ trình dự án ban đầu đã chết — một luật đã bị thay thế mười bảy ngày trước đó.

Không điều nào trong số đó có thể suy ra từ mã, và không dữ liệu huấn luyện của mô hình nào có nó. Các
ghi chú trong [`.agent/concepts/`](.agent/concepts/) mang nó, với một ngày xác minh và nguồn trên mỗi
khẳng định thực tế, và một phần `Chưa xác minh / Không được dựa vào` rõ ràng trên mỗi ghi chú. Những phần đó
mang tính chịu lực (load-bearing) — đừng dọn dẹp chúng thành văn xuôi đầy tự tin.

## Bố cục kho mã (Repository Layout)

```
.agent/                    durable agent memory (the actual product of the work so far)
  index.md                 navigation map — start here
  project-context.md       what this is, who it serves, what is out of scope
  business-rules.md        12 safety rules, with evidence and consequences
  concepts/                domain knowledge: HS classification, tariffs, VN legal system,
                           data sources, legal RAG
  workflows/               the declarant's real daily loop
  architecture-decisions/  7 ADRs
  planning/                roadmap, task list, progress log
  docs/evaluation.md       the golden set and the ship gates
AGENTS.md, CLAUDE.md       thin bridges to .agent/AGENTS.md — keep them thin
```

`.agent/` **phải nằm ở gốc kho mã (repository root).** Các file cầu nối (bridge files) mã hóa cứng đường dẫn đó; di chuyển nó
sẽ tách rời toàn bộ kho tri thức khỏi mọi tác nhân.

## Xuất xứ (Provenance)

Kho tri thức được xây dựng vào ngày 2026-07-17 từ mười hai tác nhân nghiên cứu đã truy xuất các nguồn trực tiếp,
bao gồm ba lượt xác minh đối kháng. Ở những nơi hai báo cáo mâu thuẫn với nhau, cả hai đều được
ghi lại và mâu thuẫn được đánh dấu là chưa giải quyết thay vì âm thầm dàn xếp.

Các ghi chú sau đó được kiểm toán đối chiếu với chính nguồn của chúng. Cuộc kiểm toán đã bắt được các tác nhân viết ghép một
URL thật vào một khẳng định không có nguồn, bịa ra một cụm từ xuất xứ, và khẳng định một sự hợp nhất nghị định
không xuất hiện trong báo cáo nào — đúng kiểu "rửa" sự bất định mà sản phẩm này tồn tại để ngăn chặn, được thực hiện bởi
chính bộ công cụ đã ghi chép nó. Tất cả đã được sửa. **Hãy kiểm toán lại mỗi khi kho tri thức được mở rộng
đáng kể:** văn xuôi trôi chảy che giấu sự thiếu vắng xuất xứ.

Bộ khung (scaffold) đến từ [APB](https://github.com/truongthuc/apb), được duy trì trong kho mã riêng của nó
và không được vendor hóa (vendored) tại đây.

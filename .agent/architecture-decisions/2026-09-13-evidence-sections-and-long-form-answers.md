# Quyết định Kiến trúc: Bảng bằng chứng chung và câu trả lời dài có kiểm nguyên văn

Ngày: 2026-09-13

Trạng thái: Accepted — **thay thế một phần** [ADR 2026-08-14](2026-08-14-llm-generates-hypotheses-never-assertions.md)
(quy tắc ngân sách "tối đa 2 lần gọi LLM cho một lượt chat") và thay thế `legal.generation.ts`.

Nơi chạy "thuê VPS mới" nêu trong bối cảnh dưới đây đã được thay bằng [ADR 2026-09-13: host trên server dev MONA](2026-09-13-host-on-mona-dev-server.md).

## Bối cảnh

Chủ dự án (2026-09-13) muốn bot Zalo trả lời **ngang hoặc hơn Gemini Notebook** trên cùng kho tài
liệu, và nhận xét bot hiện "rập khuôn, máy móc, không linh hoạt".

Đọc mã nguồn cho thấy hai nguyên nhân độc lập:

1. **Thiếu bằng chứng.** Máy chủ chỉ nạp điều khoản của 15 văn bản. Chú giải Phần/Chương, GRI, Chú
   giải chi tiết HS, SEN, 29 công văn phân loại, 134 bảng phụ lục, tài liệu địa phương/dự thảo/nội
   bộ — tất cả đã có dạng `.ndjson` trong repo và đã lên notebook, nhưng không có bảng nào trong
   Postgres để chứa. Schema có `legal_doc_type` không có `cong_van`, và snapshot drizzle 0007–0009
   thiếu nên không mở enum được.
2. **Đường sinh câu trả lời bị trói.** ≤130 từ, chỉ từ ≤5 điều, 2 lần gọi `claude -p`, 45s. Notebook
   đọc cả nguồn dài và tổng hợp nhiều văn bản; bot không thể.

Cùng lúc, bot có bốn thứ notebook không có và không được mất: thuế suất tất định
([R1](../business-rules.md)), lọc hiệu lực cứng ([R8](../business-rules.md)), kiểm trích dẫn
([R10](../business-rules.md)), từ chối khi thiếu căn cứ ([R5](../business-rules.md)).

Chủ dự án chốt: giữ `claude -p` subscription nhưng nới ngân sách; thuê VPS mới; bot được tổng hợp tự
do **trong kho**, không dùng kiến thức ngoài; chủ dự án tự chấm mù.

## Quyết định

1. **Một bảng `evidence_section` cho mọi bằng chứng ngoài điều khoản**, thay vì mở enum và thêm
   một bảng cho mỗi loại. Cột chung: `kind`, `instrument`, `authority` (binding > authoritative >
   administrative > reference > undetermined), phạm vi HS/văn bản, nguyên văn, embedding, tsv, hiệu
   lực, `verification`. Migration viết tay như 0007–0009; không đụng enum cũ, không cần snapshot.
2. **Đường trả lời năm bước cố định**: kế hoạch (LLM) → truy hồi lai đa truy vấn trên
   `legal_chunk ∪ evidence_section` (code) → mở rộng thành mục đầy đủ, trần 40k token (code) →
   viết tự do có `[n]` (LLM) → kiểm (code). Kiểm gồm `id ∈ tập truy hồi` **và** `quote ⊂ nguyên văn
   nguồn`, cộng mọi con số / mã HS / số hiệu / nhãn điều trong câu trả lời phải xuất hiện trong bằng
   chứng. Vi phạm → một lần sửa (LLM) → còn vi phạm thì cắt câu.
3. **Ngân sách mới: tối đa 4 lần gọi `claude -p` một lượt** (kế hoạch, viết, sửa khi cần, vision khi
   có ảnh), trần tổng 120s. Thay quy tắc "tối đa 2 lần, 45s".
4. **Thuế suất vào câu trả lời tự do bằng cách trở thành một mục bằng chứng** (`kind = tariff`) sinh
   tức thì từ `/tariff`; `quote` của nó phải bằng **nguyên một dòng mức thuế** (biểu + mức + điều kiện
   + nghị định), và **mọi con số trong một câu phải nằm trong `quote` của `[n]` có mặt trong chính
   câu đó** — không phải "đâu đó trong bằng chứng". R1/R6 giữ nguyên ở dạng kiểm được bằng code.
   *(Bản 2, sau đợt kiểm: kiểm theo hợp các thân cho "MFN là 0%" đi qua khi thân có "ATIGA 0% nếu có C/O".)*
5. **Văn bản sắp có hiệu lực** truy hồi ở cửa sổ riêng `upcoming`, nhãn in từ dữ liệu; không bao giờ
   trộn với luật hiện hành.
6. **Bộ trình bày Zalo** in nhãn cảnh báo, thẩm quyền, cửa sổ hiệu lực **từ dữ liệu**, không từ chữ
   của mô hình; bỏ chân trang lặp và emoji trang trí.
7. **Câu hỏi mã HS đi chế độ ứng viên**: compose ra `candidates` 1–3 mục, mỗi mã phải có trích dẫn
   chứa nó và tồn tại trong danh mục; mã người dùng nêu bị gỡ khỏi prompt (R4) và chỉ so sánh sau.
   Câu hỏi thuế suất theo mã 8 số không compose — đường tất định giữ nguyên.
8. **Đủ 32 nguồn notebook**, kể cả ghi chú nghiệp vụ `.agent/` (kind `note`, thẩm quyền `reference`,
   không được là căn cứ duy nhất cho một khẳng định pháp lý) và danh mục biểu thuế theo tiền tố.

## Các phương án đã cân nhắc

- **Bot đọc thẳng 32 nguồn notebook (markdown) — không có bảng, không có id:** nhanh nhất tới
  ngang notebook, nhưng lọc hiệu lực chỉ bằng nhãn trong văn bản và kiểm trích dẫn không có `id` để
  neo. Bác — nó đánh đổi đúng bốn thứ bot đang hơn notebook.
- **Hoàn tất Phase 8 M1–M4 đúng bài (mỗi loại bằng chứng một bảng, mở enum):** chặt chẽ nhất,
  nhưng 3–4 tháng và bị chặn bởi snapshot drizzle. Hoãn — phần M3–M4 (phân loại HS theo GRI) vẫn là
  đích sau; `evidence_section` là bước đệm không cản nó.
- **Chuyển sang Claude API trả phí:** nhanh, song song, context dài. Chủ dự án chọn giữ subscription
  vì chi phí; nới ngân sách gọi là lối thoát rẻ nhất còn lại. Ghi lại làm phương án dự phòng nếu p95
  vượt 120s hoặc rate limit thành vấn đề.
- **Agent tool-calling tự do:** vẫn bác, cùng lý do ADR 2026-08-14 — không test được, và với CLI tuần
  tự thì mỗi vòng là một lần spawn.
- **Kiểm suy diễn ngữ nghĩa (entailment) bằng LLM ở bước kiểm:** đúng hướng cho R10, nhưng thêm một
  lần gọi mỗi lượt và chưa có eval để chứng minh nó bắt được gì. Để sau; kiểm chuỗi `quote ⊂ body`
  là sàn, và chấm mù là nơi đo phần còn lại.

## Hệ quả

**Được:** bot có đủ bằng chứng như notebook; câu trả lời dài, tự nhiên, có `[n]`; mọi trích dẫn
hiển thị được chứng minh bằng nguyên văn; thuế suất và hiệu lực vẫn tất định; eval và chấm mù đo
được toàn bộ đường.

**Chi phí và rủi ro:**

- Độ trễ một lượt lên 60–120s. Bot phải báo ngay khi bắt đầu đọc. Nếu p95 vượt 120s, lối thoát là
  API trả phí, **không phải cắt bước kiểm**.
- Rate limit subscription khi nhiều người hỏi cùng lúc — xếp hàng theo thread; chưa đo ngưỡng thật.
- `quote ⊂ body` là kiểm **chuỗi**: một câu trả lời có thể trích đúng đoạn nhưng suy ra sai. Không
  chặn được bằng code; chấm mù phải nhìn vào đúng chỗ này.
- Dữ liệu `verified` từ các giai đoạn trước có lỗi parser (tiêu đề điều nhận nhầm, khoản ma). Nạp lại
  bắt buộc; giữ `verified` chỉ khi chủ dự án duyệt diff ([R18](../business-rules.md)).
- Nợ snapshot drizzle 0007–0009 **vẫn còn** — bước đi vòng (SQL viết tay) không trả nợ này.

**Việc theo dõi:** đo giới hạn tin Zalo thật; đo rate limit; quyết định về `MAX_DIST` chỉ sau eval;
`decision_log` để truy vết sai ở nút nào.

## Links

- Planning: [Kế hoạch nâng cấp bot](../planning/05-bot-parity-tasks.md)
- Review: đợt kiểm độc lập 2026-09-13 (25 agent, 21 phát hiện đứng vững) — kết quả gộp vào spec bản 2
- Design: [Thiết kế bot trả lời ngang notebook](../docs/bot-answer-parity-design.md)

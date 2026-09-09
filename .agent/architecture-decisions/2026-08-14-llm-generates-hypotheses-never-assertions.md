# Quyết định Kiến trúc: LLM sinh giả thuyết, không bao giờ khẳng định

Ngày: 2026-08-14

Trạng thái: Accepted

## Bối cảnh

Chủ dự án muốn hệ thống **dùng nhiều LLM hơn** để chữa ba triệu chứng: kho quá hẹp, thường xuyên tra
không ra văn bản pháp luật lẫn mã HS, và chưa hiểu đúng mã HS. Đồng thời không được nới bất kỳ rào
chắn nào trong [business-rules.md](../business-rules.md) — chế độ thất bại của sản phẩm vẫn là một
câu trả lời sai nghe hợp lý chảy vào tờ khai có ràng buộc pháp lý.

Hai ADR hiện hành đặt ranh giới nhưng không nói *cách* mở rộng phạm vi LLM:
[không LLM trên con số biểu thuế](2026-07-17-no-llm-on-tariff-numbers.md) và
[HS là ứng viên, không phải đáp án](2026-07-17-hs-candidates-not-answers.md). Câu hỏi còn để ngỏ:
LLM được phép làm thêm những gì, và cái gì chặn nó?

Ràng buộc vận hành do chủ dự án chốt cùng ngày: tầng LLM chạy trên `claude -p` (subscription CLI),
không dùng API trả phí. CLI là tuần tự, timeout 45s, không song song được.

## Quyết định

**LLM được dùng nhiều ở chỗ *tìm và điều hướng*. Không bao giờ ở chỗ *khẳng định*.**

Ba mệnh đề, mỗi mệnh đề phải có một chỗ cưỡng chế bằng code, không phải bằng câu chữ trong prompt:

1. LLM sinh **giả thuyết** — nhiều cách diễn đạt truy vấn, nhiều nhánh HS ứng viên, đề xuất văn bản
   cần đọc, thẻ chủ đề cho chỉ mục. Giả thuyết rẻ và được phép sai.
2. Hệ thống **kiểm chứng tất định** — truy hồi, tra khoá chính xác, đối chiếu với tập đã truy hồi.
3. LLM ở bước cuối chỉ được **chọn và loại trên bằng chứng nguyên văn**: không sinh số, không sinh
   mã HS, không sinh số hiệu điều khoản.

Kèm theo một quy tắc ngân sách sinh ra từ ràng buộc CLI: **tối đa 2 lần gọi LLM cho một lượt chat;
job nền không giới hạn.** Hệ quả thiết kế: mọi việc nặng (biên dịch chú giải thành mệnh đề, sinh thẻ
chủ đề cho ~15.500 văn bản, đối chiếu) phải đẩy sang tầng dữ liệu chạy nền, không nằm trên đường trả lời.

## Các phương án đã cân nhắc

- **Agent tool-calling tự do** (LLM tự tra DB, tự tải Công báo, tự quyết): **bác bỏ**. Đúng vào chế độ
  thất bại đo được ở [R2](../business-rules.md) — agent tự chủ tốt nhất 46,8% ở 10 chữ số, trong khi
  pipeline cố định lấy thứ bậc thuế quan làm luồng điều khiển đạt 91,5% top-3 ở 4 chữ số. Khoảng cách
  là *cấu trúc*, không phải năng lực mô hình. Ngoài ra không viết eval lên trên được, và với CLI tuần
  tự thì mỗi vòng tool-call là một lần spawn tiến trình.
- **Giữ nguyên hiện trạng, chỉ mở rộng dữ liệu**: **bác bỏ một phần**. Nạp thêm văn bản có chữa được
  triệu chứng "tra không ra", nhưng không chữa được "chưa hiểu đúng mã HS" — phần đó thiếu *bằng chứng*
  và *cấu trúc quyết định*, không thiếu dữ liệu thô.
- **Dồn toàn bộ LLM vào job nền, đường chat không đổi**: **nhận một phần**. An toàn nhất và là nguồn
  gốc của quy tắc ngân sách, nhưng một mình nó không xử được câu hỏi lạ ngay tại lượt hỏi.

## Hệ quả

- Mọi đầu ra LLM phải đi qua một cổng kiểu dùng chung (`guards`): id ⊂ tập đã truy hồi, mã HS phải tồn
  tại trong danh mục, mọi con số đến từ DB. `validateCitations`, `sanitizeLead`, `docNumberStatedIn`
  là ba mẫu đã có; chúng trở thành một module.
- Một khẳng định phân loại không trích được mệnh đề chú giải sẽ tự động hạ xuống "ứng viên chưa có căn cứ".
- Phân loại HS sẽ mất 20–40s trên CLI tuần tự. Chấp nhận. Nếu độ trễ thành vấn đề, lối thoát là xem
  lại ràng buộc CLI, **không phải** cắt bước bằng chứng.
- Prompt trở thành bề mặt có hồi quy: mỗi thay đổi prompt phải qua `yarn eval` như một thay đổi phần mềm.
- Cần bảng `decision_log` để khi trả lời sai còn truy được sai ở nút nào.
- Rủi ro còn lại: job nền có thể chạm rate limit của subscription. Giảm bằng chạy đêm + checkpoint.

## Links

- Planning: [03-llm-expansion-tasks.md](../planning/03-llm-expansion-tasks.md)
- Design: [llm-expansion-design.md](../docs/llm-expansion-design.md)
- Review: —

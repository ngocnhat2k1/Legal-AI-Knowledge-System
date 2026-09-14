# Quyết định Kiến trúc: Câu trả lời do mô hình soạn trên bằng chứng, số liệu và mã do code giữ

Ngày: 2026-09-14

Trạng thái: Accepted — **bổ sung** [ADR 2026-09-13 bảng bằng chứng và câu trả lời dài](2026-09-13-evidence-sections-and-long-form-answers.md)
(chặt hơn ở quyết định 4 của ADR đó) và hiện thực phần đường bot của Mảng 3.

## Bối cảnh

Chủ dự án (2026-09-14), sau một ngày sửa định tuyến của bot Zalo:

> "cuối cùng, yêu cầu của tôi vẫn chưa được thực hiện, tôi muốn bot có tính người hơn, có suy nghĩ và phân tích câu
> hỏi, có thể chậm 1 chút cũng được, hiện tại đang quá máy móc, rập khuôn về câu trả lời"

Đọc code cho thấy lý do: mô hình chỉ **phân loại** câu hỏi (`router.mjs`); mọi câu trả lời do code **ghép khuôn**
(`format.mjs`, `answer.mjs`: câu mở cố định, danh sách, khối nguồn dài hơn câu trả lời, chân trang lặp). Sửa đúng nhánh
mà không đổi ai viết câu trả lời không chữa được cảm giác máy móc. Đường `POST /answer` (spec §3) đã được duyệt nhưng
chưa làm.

Ba bản thiết kế độc lập và ba người chấm (workflow 2026-09-14) hội tụ về: bước kế hoạch (LLM) → truy hồi (code) →
soạn (LLM, suy luận cao) → rào chắn (code) → sửa (LLM, chỉ câu vi phạm) → cắt. Chi tiết:
[kế hoạch 08](../planning/08-answer-path-tasks.md).

## Quyết định

1. **Mô hình soạn câu trả lời** cho mọi câu hỏi không đi đường tắt tất định (một từ phán quyết, đính chính tường minh,
   lời chào, nhận lời mời nạp văn bản): giọng đồng nghiệp, câu đầu trả lời đúng điều người hỏi cần, lập luận từ nguồn,
   nói rõ chỗ chưa chắc và dữ kiện sẽ quyết, độ dài theo câu hỏi, không câu mở/kết/chân trang cố định. Suy luận nằm
   trong ngân sách ẩn (`claude -p --effort`), đầu ra chỉ là câu trả lời.
2. **Mức thuế không bao giờ nằm trong văn xuôi** — chặt hơn quyết định 4 của ADR 2026-09-13 (cho mục `tariff` vào văn
   xuôi khi trích nguyên dòng). Câu hỏi thuế suất: văn xuôi giải thích biểu nào áp khi nào, cần C/O gì; con số nằm trong
   khối thuế gọn do code in từ `/tariff` ngay dưới (chủ dự án chọn, 2026-09-14). Câu văn xuôi có %, tiền → vi phạm
   (`guards.ts ratesInProse`).
3. **R4 — mã người dùng nêu là mục tiêu so sánh, không phải tiền đề.** Bước kế hoạch và bước soạn không bao giờ thấy
   chữ số mã 8 số người dùng viết (che bằng code, kiểm `userCodesIn` trước mỗi lần gọi, chốt đóng an toàn). Vai của mã
   (`premise` mặc định / `subject` / `key`) do code quyết từ cue, không do mô hình. Với câu "mã X có hợp không", nhóm 4
   số của X được ghim cùng các nhóm ứng viên tìm mù, **không gắn nhãn, xếp theo số** (chủ dự án chọn, 2026-09-14), để
   lời giải thích nói được vì sao X hợp hay không. Cổng bắt buộc: probe bất biến (cùng hàng, mã đúng và mã sai → tập
   nhóm và đánh giá không đổi quá ngưỡng) trước khi deploy.
4. **Không chốt nhóm từ dữ kiện mỏng (R2, R3, R5) bằng code**: câu ghép mã/nhóm với "phải xét", "chắc chắn thuộc",
   "chốt", "đề xuất", "độ tin cậy" là vi phạm (`settlementClaims`); ≥ 2 ứng viên thì phải nêu dữ kiện còn thiếu.
5. **Không có đường ghi sổ `lookup_confirmation` nào từ bước kế hoạch, soạn hay câu hỏi** (R13): chỉ `handleConfirm`
   (một từ phán quyết trên kết quả tra còn mới) và `handleCorrection` (cue tường minh, không phải câu hỏi).
6. **Độ trễ**: chấp nhận tới khoảng 2 phút cho câu cần phân tích; cổng p95 ≤ 120 s; bot gửi một tin ngắn nói lại cách
   nó hiểu câu hỏi trước khi soạn; tối đa 2 tiến trình `claude` cùng lúc trên server dùng chung.
7. **Chế độ phân loại (`hs`) là một module riêng** (`answer/walkthrough.ts`, phiên c8) cắm vào runner qua hợp đồng
   `answer/types.ts`; rào chắn dùng chung một bộ (`answer/guards.ts`).

## Các phương án đã cân nhắc

- **Giữ khuôn, chỉnh câu chữ và định tuyến** (hiện trạng sau `a37c663`): bác — chính chủ dự án đánh giá là chưa đạt.
- **Để mô hình viết cả con số thuế, kiểm bằng trích nguyên dòng** (ADR 2026-09-13 QĐ 4): hoãn — kiểm chuỗi không chặn
  được câu "được 0%" rơi mất điều kiện C/O (R6); chủ dự án chọn khối thuế gọn.
- **Đọc R4 chặt: không đọc chú giải nhóm của mã người dùng**: bác theo lựa chọn của chủ dự án — câu trả lời không nói
  được vì sao mã họ hỏi đúng hay sai; rủi ro nịnh được đo bằng probe thay vì tránh bằng cách không trả lời.
- **Agent tool-calling tự do**: vẫn bác (ADR 2026-08-14) — số bước cố định, mỗi đầu ra qua cổng code, eval viết được.
- **Chuyển API trả phí để nhanh**: lối thoát nếu p95 vượt 120 s sau khi hạ effort và cỡ prompt (D6 kế hoạch 08).

## Hệ quả

**Được:** câu trả lời tự nhiên, theo câu hỏi; mọi con số thuế, mã HS, số hiệu, hiệu lực vẫn tất định hoặc được kiểm
bằng code; xoá được lớp khuôn và lưới regex định tuyến trong bot.

**Chi phí và rủi ro:** độ trễ 60–120 s cho câu soạn; phụ thuộc hạn mức thuê bao (đọc `is_error`, rơi về chỉ nguồn);
rào chắn là kiểm chuỗi, không kiểm suy diễn — chủ dự án chấm 4 dấu (hiểu đúng, lập luận thấy được, nói chỗ chưa chắc,
không câu mẫu) là nơi bắt phần còn lại; D1 = có mở rủi ro nịnh, được đo bằng probe; cue vai mã thiếu mẫu thì nghiêng
về `premise` (an toàn).

## Links

- Planning: [Kế hoạch 08](../planning/08-answer-path-tasks.md)
- Design: [Thiết kế bot trả lời ngang notebook §3](../docs/bot-answer-parity-design.md#3-đường-trả-lời--một-lượt)
- Review: workflow thiết kế 3 phương án + 3 người chấm (2026-09-14); workflow rà 5 góc (7 phát hiện đã xác nhận, sửa ở `a37c663`)

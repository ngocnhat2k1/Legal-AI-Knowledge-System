# Quyết định Kiến trúc: Trả lời gọn một tin, nguồn chỉ in khi được hỏi

Ngày: 2026-09-22

Trạng thái: Accepted (chủ dự án yêu cầu, duyệt bằng cách thử trên Zalo)

## Bối cảnh

Chủ dự án, 2026-09-22: "câu trả lời quá dài, 1 câu trả lời chia ra thành 4 tin nhắn, lược bỏ những câu từ AI slop,
bỏ phần chú thích, chỉ chú thích khi được yêu cầu; chú thích ghi ngắn và kèm link".

Câu hỏi mã HS đi báo cáo phân loại `full` gần như mọi lượt (độ sâu chọn theo thời gian còn lại, không theo câu hỏi):
tám mục do mô hình viết, mục trống vẫn phải viết "chưa có…", cộng mục THÔNG TIN HÀNG HÓA nhắc lại mô tả của chính
người hỏi, tiêu đề I–IX, hai khối thuế, danh sách ứng viên có `[n]`, khối "Nguồn:" có trích nguyên văn, hai dòng gợi ý
cố định. Thay một phần mục 4 của [ADR giọng notebook](2026-09-13-zalo-rich-text-notebook-style.md) ("`[n]` cùng danh
sách nguồn ở cuối").

## Quyết định

1. **Mã HS mặc định `brief`**: vài đoạn liền, không tiêu đề mục, không mục nhắc lại mô tả hàng, chỉ những mục có điều
   cần nói. Báo cáo `full` (tám mục, tiêu đề của mẫu chủ dự án, khối thuế ứng viên, khối chính sách) chỉ khi tin nhắn
   xin (động từ yêu cầu + "chi tiết/kỹ/đầy đủ", "… hơn", "báo cáo đầy đủ") và còn đủ thời gian (`WANTS_FULL`,
   `answer.service.ts`). Bản gọn vẫn phải nêu lý do cho từng nhóm còn đứng, để danh sách ứng viên không rơi nhóm nào (R2).
2. **Nguồn chỉ in khi được hỏi** (`asksSources`, `dispatch.mjs`): mặc định bỏ `[n]` khỏi văn xuôi và danh sách ứng
   viên, không in khối "Nguồn:". Khi hỏi: mỗi nguồn một dòng `[n] nhãn — link`, không trích, không nhãn thẩm quyền.
   Tin chỉ gồm lời xin nguồn (`onlyAsksSources`) ngay sau một câu soạn — tin bot cuối, hoặc tin đang được quote — in nguồn
   đã nhớ (`state.answer.sources`), không gọi mô hình. Khối thuế vẫn đánh số tiếp sau các nguồn ẩn, để "[1]" không bao
   giờ chỉ hai thứ (R10).
3. **Không nới quy tắc nào.** Kiểm căn cứ (R10) vẫn chạy trên từng câu như cũ, chỉ phần hiển thị đổi. Dòng đỏ hiệu lực
   (R8) và dòng cam "bot tự nạp" vẫn in, bỏ số `[n]`. Chú giải chưa có hiệu lực / sắp hết hiệu lực vẫn nói ngày (trước chỉ
   nằm trên dòng nguồn). Chú giải trích tự động chưa ai đối chiếu (R18) — trước ghi trên dòng nguồn — nay là một dòng nhỏ
   duy nhất kèm cách xem nguồn. Khối tra thuế giữ dòng "Tra theo ngày … · [n] NĐ …" (R7). Gợi ý xác định trước mã số (R5)
   giữ, như cũ chỉ khi ≥ 2 ứng viên và văn xuôi chưa nói.
4. **Bỏ dòng khuôn** "Cần xem thuế của mã nào thì nhắn mã đó kèm xuất xứ" dưới câu hs.

## Các phương án đã cân nhắc

- Giữ chín mục, mỗi mục ngắn lại: bác — vẫn 2 tin, và mục trống vẫn sinh câu độn.
- Bỏ luôn dòng R18 khi ẩn nguồn: bác — chủ dự án chọn giữ (2026-09-22).
- Tự nhận "chi tiết", "đầy đủ", "báo cáo" là xin báo cáo đầy đủ: bác — "chi tiết máy", "đầy đủ phụ kiện", "bao cao su"
  là tên hàng.

## Hệ quả

- Người muốn căn cứ phải hỏi thêm một lượt; lượt đó không tốn thời gian mô hình.
- "nguồn?" quote một câu trả lời cũ hơn câu vừa rồi đi bước kế hoạch và soạn lại (bộ nhớ chỉ giữ nguồn của câu cuối).
- Cần theo dõi trên Zalo: `brief` có còn đủ lập luận cho câu khó không.

## Cập nhật 2026-09-23 (chủ dự án xem câu trả lời thật: "vẫn thấy loãng")

5. **Bản gọn siết thêm**: 130 từ (trước 170), trần ký tự 1.100 (trước 1.500). Prompt: câu đầu nói ngay nhóm nào còn đứng
   và dữ kiện nào quyết định; không mở bài, không kể lại cách mình tra ("hướng dò đầu tiên", "mình đọc chú giải"); mỗi
   nhóm nói một lần, lý do không lặp ở đoạn sau. Câu thật ngày 22/09 mở bài bằng mô tả lại hàng rồi nhắc lại lý do của
   82.08 ở hai đoạn.
6. **Bỏ dòng "Một phần câu trả lời bị lược vì không dẫn được nguồn."**: người đọc không làm gì được với nó; số câu bị cắt
   vẫn ở `cut` trong log của API.
7. **Hướng dẫn sử dụng** (chủ dự án yêu cầu): tin chỉ gồm "help", "hướng dẫn", "cách dùng", "cái này dùng sao", "trợ giúp",
   "menu"… (`isHelp`, cả message phải là lời hỏi — "hướng dẫn sử dụng máy ghép đùn" là hàng) thì in `HELP` trong
   `format.mjs`: ba việc bot làm + các lệnh có thật sau câu trả lời ("nguồn", "phân tích chi tiết", "đúng"/"sai"/"HS đúng
   là …", "nạp", "xác nhận văn bản …") + lưu ý phải tag trong nhóm và mã là ứng viên. Do code viết, không gọi mô hình,
   một tin.

## Links

- Code: `apps/api/src/modules/answer/answer.service.ts` (`WANTS_FULL`), `walkthrough.ts` (`DEPTH`), `apps/zalo-bot/format.mjs` (`formatAnswerMd`, `sourceLines`), `apps/zalo-bot/index.mjs`
- Thay một phần: [2026-09-13-zalo-rich-text-notebook-style.md](2026-09-13-zalo-rich-text-notebook-style.md) mục 4

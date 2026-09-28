# Quyết định Kiến trúc: Dòng 8 số mô hình chọn, in dưới nhóm ứng viên

Ngày: 2026-09-22

Trạng thái: Accepted (chủ dự án yêu cầu, duyệt bằng cách thử trên Zalo)

## Bối cảnh

Chủ dự án, 2026-09-22, về câu "hs code Lưỡi dao răng cưa bằng thép không gỉ…": "hs code 8 số nhưng nó mới trả lời 4 số".
Từ [ADR trả lời gọn](2026-09-22-short-replies-sources-on-request.md), câu mã HS mặc định `brief`, và `brief` dừng ở danh
sách nhóm 4 số.

Đọc lại code cho thấy báo cáo `full` cũng chưa bao giờ đưa ra được một mã 8 số *có lập luận*:
- G5 (`guards.ts`) cắt mọi mã 8 số trong văn xuôi walkthrough, vì mỗi mục được kiểm với `candidates: []`. Gạch đầu dòng
  "mã" của mục levels luôn bị cắt, làm hiện dòng "bị lược" và góp vào ngưỡng §4.1.
- Khối thuế của `full` chỉ tra được **dòng đầu tiên** của mỗi nhóm (`h.lines[0]`). Với lưỡi dao, đó là 8208.10.00 "gia
  công kim loại": sai hàng.

## Quyết định

1. `tariff_ref` là **lựa chọn của mô hình**: mỗi nhóm còn đứng nhiều nhất một dòng trong LINES của nhóm đó, dòng mà dữ
   kiện người hỏi đã viết dẫn tới. Dữ kiện chưa đủ thì không chọn. Ở cả hai độ sâu. Văn xuôi gọi dòng bằng câu chữ của nó,
   không viết mã 8 số (G5 giữ nguyên).
2. Code kiểm: mã phải có trong LINES (`normalizeWalkthrough`), thuộc nhóm được kết luận (`walkthrough-tariff-ref`), đúng
   một lựa chọn cho nhóm (hai lựa chọn = dữ kiện chưa quyết, không in — R5), và câu trả lời không bị bỏ theo §4.1.
3. API trả `candidates[].line = { code, text }`, câu chữ lấy từ hs_description. Bot in dưới dòng nhóm:
   `↳ **8208.90.00** · _Loại khác_`. Câu chữ giữ phần lá (tên của chính dòng), cắt các cấp cha từ bên trái
   (`… › Máy tính xách tay…`): cắt từ bên phải thì 8471.30.20 và "Loại khác" 8471.30.90 in ra y hệt nhau. Không thuế suất
   (D3(a)); dòng mở bằng "↳", không bao giờ giống câu tra thuế (R13).
4. Ở `full`, khối thuế tra theo dòng đã chọn thay cho `h.lines[0]`. Bỏ hẳn bước tra dòng đầu trước khi gọi mô hình (DÒNG
   THUẾ): câu thuế trong văn xuôi nói về dòng đầu còn khối bên dưới là dòng đã chọn (R6). Mô hình không viết câu thuế nữa;
   khối do code dựng đã nêu điều kiện. Dòng đem tra vẫn qua `assertNoUserCodes` như mọi dòng thuế cũ. Câu bị lược (§4.1)
   vẫn giữ khối chính sách do code viết, chỉ ẩn dòng ↳.
5. **Nhóm chứa mã của người hỏi không có dòng ↳, không được tra** (R4, ADR 2026-07-17 mục 4): mã tiền đề của lượt này
   (8 hay 6 số) hoặc mã họ gõ ở lượt trước ("phân tích chi tiết giúp mình" sau "mã X có phù hợp không"). Dòng mô hình chọn
   mù dưới nhóm đó đọc như bot xác nhận hoặc sửa mã của họ ở mức 8 số. Ẩn luôn, dù trùng hay không: chỉ ẩn khi trùng thì
   chính việc ẩn lộ kết quả so. Câu hỏi không kèm mã ("hs code lưỡi dao…") vẫn có dòng 8 số.

**Đọc R2 thế nào:** đơn vị vẫn là nhóm 4 số kèm bằng chứng nguyên văn, do người chốt. Dòng 8 số là câu chữ danh mục đi
kèm, không có bằng chứng riêng, giống khối thuế D3(a). Không bao giờ là một mã trần đứng một mình.

## Các phương án đã cân nhắc

- Bật lại `full` mặc định: bác — 4 tin, và vẫn chỉ ra dòng đầu của nhóm.
- Cho văn xuôi viết mã 8 số có điều kiện, nới G5: bác — nới quy tắc, và mỗi câu bị cắt đẩy câu trả lời tới ngưỡng bỏ §4.1.
- Kèm mức MFN trên dòng: chưa làm — chủ dự án hỏi mã, không hỏi thuế; thêm khoảng 350 ký tự. Làm khi chủ dự án hỏi.
- Đổi `candidates[].hs` thành mã 8 số: bác — R2.

## Cập nhật 2026-09-28 (chủ dự án: "bot trả lời mới 4 số… không phải dừng lại giữa chừng")

Câu "son dưỡng môi nhập khẩu mã HS gì": nhóm 33.04 còn đứng, nhưng dòng 8 số phụ thuộc son có chất tạo màu hay không.
Mô hình nêu cả hai dòng trong văn xuôi ("Chế phẩm trang điểm môi" / "Loại khác › Loại khác › Loại khác"), còn quy tắc
"hai lựa chọn thì không in" giấu sạch cả hai — người hỏi chỉ thấy 33.04.

- `tariff_ref` nay là `[{code, when}]`. Dữ kiện đã quyết: một dòng, `when` rỗng. Chưa quyết: **hai** dòng, mỗi dòng một
  `when` ≤ 10 từ nói dữ kiện phân định. Ba dòng trở lên, hoặc hai dòng không có `when`, thì không in dòng nào — đó là
  danh sách chứ không phải hai cách đọc.
- Bot in: `↳ **3304.10.00** · _Chế phẩm trang điểm môi_ — nếu có chất tạo màu`.
- `when` là chữ của mô hình do code in, nên đi qua đúng các kiểm của deciding_facts (≤ 12 từ, không thuế suất, không số
  người hỏi không viết, không điền mã đã che); vi phạm thì bỏ `when`, dòng vẫn in. Có chuỗi 4 chữ số thì cũng bỏ.
- Ở `full`, cả hai dòng đều được tra thuế (trần 2 khối như cũ).

## Cập nhật 2026-09-28 (b) — mã đứng trước, giải thích đứng sau

Chủ dự án: "chốt trước mã hs code, sau đó giải thích tại sao lại chọn cái đó". Thứ tự mới của câu hs:
câu so mã người hỏi (nếu có) → khối "Ứng viên để chuyên viên chốt:" kèm các dòng ↳ → văn xuôi giải thích →
dòng R5 → khối thuế (ở `full`) → cảnh báo, nguồn.

- **Vẫn là ứng viên, không phải mã chốt.** Nhãn khối giữ nguyên (chủ dự án chọn), điều kiện đi ngay trên dòng của
  từng mã. Đây là chỗ không nhượng: R2/ADR 2026-07-17 dựng trên chênh lệch 47% (một mã top-1) so với 93,9%
  (top-3 kèm căn cứ cho người chốt), và R3 nói mã sai trông y hệt mã đúng.
- Lợi thêm: dấu hiệu nhận tin của bot (`Ứng viên để chuyên viên chốt:`, R13) luôn nằm ở tin thứ nhất, kể cả khi văn
  dài — trước đây văn dài có thể đẩy nó sang tin thứ hai.
- Prompt đổi theo: code đã in danh sách nhóm ngay trên bài, nên câu đầu của mô hình không liệt kê lại nhóm mà nói
  ngay dữ kiện quyết định. Không đổi prompt thì câu trả lời lặp nguyên phần đã in.
- `state.answer.head` (60 ký tự đầu, để nhận ra tin khi người dùng quote) nay che mọi mã ở cả hai phía khi so: dòng
  đầu có thể là câu so mã của người hỏi, mà mã của họ thì không được vào `state` (R4).

## Hệ quả

- Lựa chọn của mô hình vẫn có thể "Error but Valid" (R3), nhất là dòng "Loại khác". Nó nằm dưới "Ứng viên để chuyên viên
  chốt:" và văn xuôi nói vì sao.
- Câu chỉ còn một nhóm đứng đi đường compose (không có LINES), vẫn dừng ở 4 số.
- Câu "mã X có phù hợp không" vẫn so ở mức nhóm (dòng "Mã X bạn nêu thuộc nhóm …"), không có dòng 8 số dưới nhóm của X.
- `buildWalkthroughPrompt` vẫn in được DÒNG THUẾ nếu có `tariffLines`, nhưng runner không đưa dòng nào nữa.
- Mã 8 số không vào bộ nhớ như kết quả tra: "đúng" sau câu hs vẫn không ghi gì; "HS đúng là <mã>" vẫn ghi như trước.

## Links

- Code: `walkthrough.ts` (`lineText`, RULES tariff_ref, `normalizeWalkthrough`), `walkthrough.checks.ts` (tariff-ref),
  `answer.service.ts` (`lineOf`, `tariffRef`), `apps/zalo-bot/format.mjs` (dòng ↳)
- Liên quan: [2026-07-17-hs-candidates-not-answers.md](2026-07-17-hs-candidates-not-answers.md), [2026-09-22-short-replies-sources-on-request.md](2026-09-22-short-replies-sources-on-request.md)

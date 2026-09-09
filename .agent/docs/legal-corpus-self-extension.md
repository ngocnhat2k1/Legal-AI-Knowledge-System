---
type: doc
status: active
updated: 2026-08-14
related:
  - zalo-bot-conversation-memory.md
  - ../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md
  - ../architecture-decisions/2026-07-17-postgres-only-for-v1.md
  - ../business-rules.md
  - ../concepts/vietnamese-legal-documents.md
  - code-organization.md
---

# Thiết kế: kho pháp luật tự mở rộng (chỉ mục → nạp theo yêu cầu → thăng cấp)

## Bối cảnh

Kho chỉ có 7 văn bản. Khi chuyên viên hỏi một văn bản ngoài kho (test 2026-08-14:
`36/2016/TT-BKHCN`), bot trả lời trung thực nhưng **cụt**: nó liệt kê thứ mình có rồi dừng.
Chủ dự án muốn hệ thống tự đi lấy dữ liệu và tự hoàn thiện thay vì đứng yên.

## Vì sao KHÔNG làm "crawl xong trả lời luôn"

Việc tải văn bản là phần dễ. Hai phần khó, và cả hai đều là chỗ dự án này sai âm thầm:

1. **Không tự biết được văn bản còn hiệu lực hay đã bị sửa.** Trang "sơ đồ văn bản" của Công báo
   báo NĐ 134/2016 có **0 văn bản sửa đổi**, trong khi NĐ 18/2021 sửa nó rất nhiều (kiểm chứng
   2026-08-13). Dữ liệu quan hệ của chính Công báo không đầy đủ, nên **không có nguồn máy-đọc-được
   nào đáng tin để tự động trả lời "bản này còn hiệu lực không"**. Nạp bản gốc đã bị sửa rồi trả lời
   bằng giọng chắc chắn là vi phạm [ADR dùng VBHN đã công bố](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md).

2. **Cổng nghiệm thu `expect` là tri thức của con người.** Với văn bản mới, không ai biết trước nó có
   bao nhiêu chương/điều. Và ngày 2026-08-13 đã chứng minh cổng đếm là **chưa đủ**: cả 7 văn bản qua
   cổng trong khi 6 điều bị cướp tiêu đề.

Kết luận: tự nạp thì được, nhưng **không được lặng lẽ nâng dữ liệu tự nạp lên ngang hàng với dữ liệu
đã đối chiếu tay**. Đổi một câu "tôi không biết" trung thực lấy một câu sai không ai phát hiện là đổi xấu.

## Ba lớp

### Lớp 1 — Chỉ mục Công báo (`gazette_document`)

Danh mục **những văn bản TỒN TẠI** trên Công báo, tách khỏi `legal_document` = **những văn bản ta ĐÃ NẠP
toàn văn**. Ranh giới này là trọng tâm: bot phân biệt được "văn bản này không có thật / tôi không tìm
thấy" với "có thật, tôi biết nó là gì, nhưng chưa nạp toàn văn".

Nguồn: trang danh mục theo loại văn bản, `/van-ban-dang-cong-bao/<slug>/trang-N.htm`, 15 mục/trang,
mỗi mục có `congbao_id` + số hiệu đầy đủ trong tiêu đề.

Quy mô đo thật (2026-08-14): Thông tư 940 trang · Nghị định 265 · VBHN 290 · Luật ~570 · cộng Quyết
định/Nghị quyết/Pháp lệnh/TT liên tịch ⇒ **~2.500-3.000 lượt tải, ~40.000 văn bản**. Ở nhịp lịch sự
0,7 s/trang là **~35 phút cho lần crawl đầu**; các lần sau chỉ quét từ trang 1 tới khi gặp id đã biết
(vài giây).

**🔴 Bẫy bắt buộc phải xử lý:** trang vượt phạm vi **KHÔNG rỗng và KHÔNG 404** — Công báo **clamp về
trang cuối** và trả lại đúng nội dung đó. Kiểm chứng: `luat-l13/trang-4000` giống hệt `trang-570`. Điều
kiện dừng của crawler phải là **"danh sách id lặp lại trang trước"**, không phải "trang rỗng"; nếu không
crawler chạy vô tận và nhồi trùng.

Lớp này gần như không rủi ro: nó chỉ chép **siêu dữ liệu Công báo tự công bố**, không diễn giải gì.

### Lớp 2 — Nạp theo yêu cầu, có cổng tự kiểm

Kích hoạt: **bot hỏi, người xác nhận** (chốt với chủ dự án 2026-08-14). Bot thấy thiếu văn bản → tra
`gazette_document` → nêu đúng tên + ngày + link → hỏi "nạp vào kho nhé?". Chặn được số hiệu gõ nhầm và
văn bản ngoài phạm vi hải quan, mà vẫn gần như không tốn công người.

Luồng: tải PDF/doc → `parse_provisions.py` → **cổng tự kiểm cấu trúc** → nạp lẻ.

Cổng tự kiểm (mỗi mục là một lỗi đã từng xảy ra thật, không phải phòng xa):
- điều phải liên tục `1..N`, không hụt số → bắt được kiểu "tham chiếu chéo nuốt điều thật";
- mọi tiêu đề khớp `^Điều \d+\.`, ngoại lệ phải liệt kê ra để người đọc → bắt được kiểu bị cướp tiêu đề;
- **thân điều không được bắt đầu bằng chữ thường** → đúng dấu hiệu đã lộ ra `Điều 18` hỏng;
- chương liên tục, không có chương rỗng;
- tỉ lệ khoản/điều không được ~0 (dấu hiệu parse trượt toàn bộ).

Trượt bất kỳ mục nào → **không nạp**, ghi lý do, báo người. Đây là thứ thay cho cổng `expect` mà con
người không cung cấp được cho văn bản lạ.

Chi phí: một thông tư cỡ TT 33/2023 (23 điều → 84 chunk) mất ~3 phút embed. Quá lâu cho một lượt chat,
nên bot trả lời ngay rồi **nhắn lại khi nạp xong** — dùng chính bộ nhớ hội thoại đã có.

**Đụng chạm code:** `db/seed/legal.ts` hiện TRUNCATE rồi nạp lại toàn bộ; nạp lẻ cần đường ghi thêm
(insert một văn bản, không đụng phần còn lại). Parser là Python còn API là Node, nên bộ nạp nằm ở một
service riêng `apps/ingest/` (ảnh python + pdfplumber), không nhồi python vào ảnh api.

### Lớp 3 — Thăng cấp (vòng học)

`legal_document.verification_status ∈ {verified, auto_unverified}`. Văn bản tự nạp vào ở
`auto_unverified`, và **mọi trích dẫn từ nó hiển thị nhãn cảnh báo** trong câu trả lời. Chuyên viên dùng
thấy đúng → xác nhận → thăng lên `verified`.

Đây chính là [R9 xác minh-tại-điểm-sử-dụng](../business-rules.md) đang chạy cho mã HS, mở rộng sang văn
bản: hệ thống "tự hoàn thiện" theo cách **để lại dấu vết ai chịu trách nhiệm**, chứ không phải tự tin thêm.

## Phạm vi & rủi ro

- **Nguồn DUY NHẤT là Công báo.** [R11](../business-rules.md) cấm scrape thuvienphapluat/luatvietnam.
  Văn bản không đăng Công báo thì không nạp — chấp nhận, vì đó cũng là giới hạn của tính chính danh.
- **Lịch sự với máy chủ Công báo**: 1 request/giây, User-Agent thật, crawl đầy đủ chạy ngoài giờ,
  các lần sau là incremental.
- **Kho phình làm nhiễu truy hồi** (đúng chủ đề, sai văn bản). Bộ lọc theo số hiệu + tiền tố SAC đã dựng
  hôm 2026-08-13 chính là thứ giảm rủi ro này; cần theo dõi lại golden eval sau mỗi đợt nạp.
- **Không tự động khẳng định hiệu lực.** Bot nêu ngày hiệu lực Công báo công bố và **không** tự suy luận
  "còn hiệu lực" cho văn bản tự nạp; nhãn `auto_unverified` nói rõ điều đó.

## Địa hình thật — những thứ chỉ lộ ra khi chạy (2026-08-14)

Năm cái bẫy, cái nào cũng đã làm hỏng thật một lần trước khi được sửa:

1. **Trang vượt phạm vi bị CLAMP, không rỗng, không 404.** `luat-l13/trang-4000` trả về đúng nội dung
   `trang-570`. Crawler dừng theo "trang rỗng" sẽ chạy tới trần và nhồi trùng vô tận. Điều kiện dừng
   đúng là **danh sách id lặp lại trang trước**.
2. **Slug danh mục KHÔNG cho biết loại văn bản.** Trang sâu của `thong-tu-l3` phục vụ cả văn bản loại
   khác — 705 văn bản `…/NĐ-CP` vào chỉ mục mang nhãn `thong_tu`. Suy loại từ **chính số hiệu**
   (`docTypeFromNumber`), coi slug chỉ là đường đi.
3. **Số hiệu có thể rất dài.** Thông tư liên tịch kể tên mọi bộ ký:
   `05/2012/TTLT-VKSNDTC-TANDTC-BCA-BTP-BQP-BTC-BNNPTNT` (51 ký tự). Một tiêu đề rác từng tạo ra chuỗi
   >64 ký tự làm **sập cả lượt crawl** vì tràn cột. Cột nới lên 96, và parser bỏ qua số hiệu >64.
4. **CDN tải file không gửi chứng thư trung gian.** `g7.cdnchinhphu.vn` chỉ gửi leaf; trình duyệt/curl/Node
   tự đi lấy issuer, `ssl` của Python thì không → mọi lần tải đều `CERTIFICATE_VERIFY_FAILED`. Cách sửa
   **không phải tắt verify**: nhúng đúng chứng thư trung gian GlobalSign vào image, **ghim SHA-256** bằng
   `ADD --checksum`. GlobalSign xoay vòng thì **build gãy to tiếng**, chứ không phải ingest hỏng âm thầm.
5. **Tra theo đầu số là NGUY HIỂM trên chỉ mục 15k văn bản.** Hỏi `36/2016/TT-BKHCN` (không tồn tại), tra
   theo đầu `36/2016` trả về `36/2016/NĐ-CP`, `36/2016/TT-BCT`, `36/2016/TT-BGTVT` — văn bản của bộ khác.
   Đưa chúng ra như thể là cái được hỏi chính là dạng sai-mà-tự-tin dự án này sinh ra để chặn. Nay khi
   người dùng gõ đủ đuôi cơ quan thì **khớp CHÍNH XÁC trước**; không khớp thì trình bày rõ là *"số hiệu
   gần giống, KHÁC văn bản bạn hỏi"* và **không mời nạp** cái nào.

Và một luật của cổng tự kiểm đã phải gỡ: *"thân điều bắt đầu bằng chữ thường"* nổ trên **5/23 điều của
bản parse ĐÚNG** — đó chỉ là đuôi tiêu đề dài bị PDF ngắt dòng. Đổi thành ngưỡng >50% mới coi là mất cấu
trúc. Cổng báo động giả trên văn bản lành sẽ bị bỏ qua, và khi đó nó vô dụng đúng lúc cần nhất.

**Hạn chế còn lại (chưa sửa):** tiêu đề dài hơn một dòng PDF bị cắt, phần đuôi rơi vào thân điều —
`Điều 9. Xử lý kết quả xác minh tại cơ quan, tổ chức cấp chứng từ chứng` + thân bắt đầu bằng
`nhận xuất xứ…`. Ảnh hưởng nhãn trích dẫn của **cả kho hiện tại**, không riêng văn bản tự nạp. Sửa là
đụng lại parser vừa ổn định và phải nạp lại toàn bộ (~55 phút embed), nên chờ chủ dự án quyết.

## Test thật lần hai (2026-08-14, cùng ngày) — ba lỗi nữa

Chủ dự án hỏi *"đọc lại thông tư 36 của bộ Khoa học công nghệ"*. Bot trả lời bằng
**Khoản 2 Điều 1 của 36/2016/TT-BCT** — thông tư của Bộ Công Thương — dưới nhãn "điều khoản liên quan nhất".

1. **Lỗi nặng nhất: một lời từ chối ĐÚNG bị tầng trên đè lên.** Mô hình sinh câu trả lời đã abstain và
   nói chính xác lý do: *"các điều khoản đã cung cấp thuộc Thông tư 36/2016/TT-BCT của Bộ Công Thương,
   không phải văn bản của Bộ Khoa học và Công nghệ"*. Nhưng `legal.service` gộp `gen.abstain` chung với
   `gen === null` rồi **in các điều khoản đó ra** như câu trả lời. Nay tách hai nhánh: **không có LLM** thì
   nguyên văn đứng một mình như trước; **mô hình đã đọc và từ chối** thì đó là một CÂU TRẢ LỜI —
   `abstained: true`, không trích dẫn, giữ nguyên lý do của mô hình.
2. **Tham chiếu "nói như người ta nói" không được nhận.** "thông tư 36 của bộ Khoa học công nghệ" không có
   dạng `số/năm` nên parser bỏ qua hoàn toàn → không lọc gì cả. Thêm `parseLooseDocRef`: số thứ tự + tên bộ
   (bảng ánh xạ tên bộ → hậu tố `TT-BKHCN`, `TT-BTC`…) rồi tra chỉ mục `36/%/TT-BKHCN`.
3. **Ba trường hợp cần ba câu trả lời khác nhau**, gộp làm một là sai:
   `exact` (đúng văn bản → mời nạp) · `ambiguous` (đúng bộ, đúng số, **nhiều năm** → hỏi năm nào, đây là
   ứng viên chứ không phải nhầm lẫn) · `similar` (chỉ gần nhau về số, **khác bộ** → "có phải ý bạn là…",
   tuyệt đối không mời nạp thay).

**Và một bài học về dữ liệu thử:** `36/2016/TT-BCT` nằm trong kho vì chính agent nạp nó lúc nghiệm thu.
Nó ngoài phạm vi lúc đó, lại mang số "36/2016" nên thành nam châm hút mọi câu hỏi "thông tư 36". Đã gỡ.
**Đừng để dữ liệu thử ở lại trong kho production** — nó không nằm im, nó cạnh tranh trong truy hồi.

## Phạm vi: KHÔNG còn giới hạn hải quan (chốt 2026-08-14)

Chủ dự án bỏ giới hạn: hỏi pháp luật lĩnh vực nào cũng trả lời, thiếu thì nạp. Đã gỡ phần chặn theo lĩnh
vực khỏi prompt định tuyến (câu hỏi ngoài hải quan **không** còn bị đẩy sang `general`), prompt sinh câu
trả lời, và câu bot tự giới thiệu. Chỉ mục Công báo vốn đã cào cả 8 loại VBQPPL nên không phải đổi.
Vẫn giữ **hỏi-rồi-mới-nạp**: một số hiệu gõ nhầm không nên tự khởi động tải về.

## Kế hoạch kiểm chứng

1. Crawler: chạy lại hai lần → lần hai gần như không thêm dòng nào (incremental thật), và **dừng đúng**
   ở trang cuối chứ không lặp vô tận.
2. Tra `36/2016/TT-BKHCN` (ca trong ảnh) → bot nêu đúng tên, ngày, link Công báo, và mời nạp.
3. Nạp thử một thông tư nhỏ → cổng tự kiểm chạy, văn bản vào kho ở `auto_unverified`, trích dẫn hiện nhãn.
4. Cố tình nạp một văn bản parse hỏng → cổng chặn, không có gì vào kho, lý do được ghi lại.
5. Hồi quy: golden retrieval + `yarn test:bot` vẫn xanh sau khi kho phình.

---
type: doc
status: active
updated: 2026-08-13
related:
  - zalo-bot-image-and-quote-context.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../architecture-decisions/2026-07-17-postgres-only-for-v1.md
  - ../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md
  - ../business-rules.md
  - code-organization.md
---

# Thiết kế: Bộ nhớ hội thoại + định tuyến theo chủ đề (bot Zalo)

## Bối cảnh — một tin nhắn, một phiên độc lập

Test thật 2026-08-13: chuyên viên hỏi về **một Thông tư**, bot trả lời lệch; chuyên viên reply
*"không phải câu trả lời tôi muốn. bạn tìm đúng thông tư mà tôi yêu cầu"* → bot đáp
*"📝 Đã ghi nhận: mã trước chưa đúng… Bạn gửi MÃ HS đúng"*. Bot nhảy từ chủ đề **pháp luật** sang
luồng **đính chính mã HS**.

Nguyên nhân là một vị từ duy nhất trong listener cũ:

```js
const inContext = (prev && Date.now() - prev.ts <= CONFIRM_TTL) || !!msg.data?.quote;
if (!img && inContext && isCorrection(text)) { … handleCorrection … }
```

Chỉ cần người dùng **bấm reply** là `inContext = true`; `CORRECTION_CUE` khớp "không phải" → vào
`handleCorrection`, ghi "mã HS trước SAI" vào sổ verify-on-use, bất kể lượt trước nói về cái gì.

Gốc rễ sâu hơn: trạng thái duy nhất bot giữ là `lastLookup` — một `Map` trong RAM nhớ **mã HS tra
gần nhất**, TTL 30 phút. Không có lịch sử lượt nói, không có chủ đề đang bàn, không có trạng thái
pháp luật. Mỗi tin nhắn là một phiên độc lập, nên `route()` phân loại một câu tinh chỉnh không chủ ngữ
mà không biết nó tinh chỉnh cái gì.

## Nguyên tắc: tín hiệu tiếp nối được đọc THEO CHỦ ĐỀ

Cùng một cụm từ mang nghĩa khác nhau tuỳ hội thoại:

| Người dùng gõ | Sau câu trả lời THUẾ | Sau câu trả lời PHÁP LUẬT |
|---|---|---|
| "không phải" | sai **mã HS** → đính chính | sai **văn bản** → tìm lại |
| "đúng" | xác nhận mức thuế (ghi vào sổ) | chỉ là đồng ý, **không ghi gì** |

Vì vậy: **một tín hiệu không khớp chủ đề không bao giờ được chạm tới handler ghi vào sổ kiểm chứng.**
Quy tắc này áp cho cả regex đường tắt lẫn kết quả của LLM router — mô hình cũng có thể nói "correction"
trên một luồng không có mã HS nào để sửa.

## Kiến trúc

Bot tách từ một file 873 dòng thành các module, để phần ra quyết định là hàm **thuần** và test được:

| File | Vai trò |
|---|---|
| [index.mjs](../../apps/zalo-bot/index.mjs) | kết nối Zalo, listener, điều phối |
| [dispatch.mjs](../../apps/zalo-bot/dispatch.mjs) | **quyết định nhánh** — nơi sửa bug; thuần, không I/O |
| [conversation.mjs](../../apps/zalo-bot/conversation.mjs) | bộ nhớ hội thoại (đọc/ghi qua API), ngưỡng còn hiệu lực |
| [router.mjs](../../apps/zalo-bot/router.mjs) | một bước Claude đọc CẢ hội thoại; vision cho ảnh |
| [answer.mjs](../../apps/zalo-bot/answer.mjs) | tạo câu trả lời (số liệu luôn từ DB) |
| [format.mjs](../../apps/zalo-bot/format.mjs) | ghép lời dẫn LLM lên khối tất định + **guard** |
| [parse.mjs](../../apps/zalo-bot/parse.mjs) | tách mã HS / xuất xứ / số hiệu văn bản |
| [api.mjs](../../apps/zalo-bot/api.mjs) | client API, mọi lời gọi fail-soft |

**Deploy đổi theo:** bot không còn là một file. Copy CẢ thư mục `apps/zalo-bot/`, không phải
`index.mjs` đơn lẻ.

## Bộ nhớ hội thoại (Postgres, không phải RAM)

Bảng `conversation` + `conversation_turn` (migration `0006`). Một hội thoại cho mỗi
(channel, thread, người). Lưu ở Postgres để redeploy bot không cắt cụt mọi hội thoại đang dở —
và không thêm service có trạng thái nào (postgres-only ADR).

- `topic` là **cột thật** (queryable) vì nó là thứ quyết định nhánh.
- `state` là `jsonb` vì hình dạng của nó là việc của bot, không phải của DB: `{tariff:{…}, legal:{…}}`
  — những gì lượt sau được phép trỏ tới.
- API: `GET /conversation`, `POST /conversation/turn`.
  Quy ước vá: **thiếu trường = giữ nguyên, `null` = xoá** — "tôi đã trả lời, nhưng lượt sau không
  còn gì để trỏ tới" là một kết quả thật và phải nói ra được.

**Phạm vi:** bộ nhớ theo TỪNG NGƯỜI trong thread, không phải theo nhóm. Hai người trong một nhóm Zalo
giữ hai hội thoại riêng; ngữ cảnh chéo người vẫn đến qua tin được quote như cũ.

`state.tariff.at` đóng dấu thời điểm tạo ra kết quả thuế, nên "còn hiệu lực" tính theo CHÍNH nó
(2 giờ) chứ không theo độ tươi của cuộc chat.

## Router có ngữ cảnh + viết lại câu hỏi

`route()` nhận thêm: transcript 6 lượt gần nhất, tóm tắt `state`, và **danh mục văn bản trong kho**
(`GET /legal/documents`) để không hứa văn bản không có.

Trường quan trọng nhất là `search_query`: câu hỏi được **viết lại thành độc lập**. *"không phải câu
trả lời tôi muốn, tìm đúng thông tư"* tự nó là rác với retriever; chỉ khi ghép ngữ cảnh nó mới thành
câu tra được. Đây là cách chuẩn để chữa RAG nhiều lượt.

## Lời dẫn tự nhiên — cưỡng chế bằng code, không bằng lời dặn

Mỗi câu trả lời = **LEAD** (1-2 câu LLM viết) + **KHỐI TẤT ĐỊNH** (do code dựng từ giá trị DB).
`sanitizeLead(lead, block)` trong format.mjs:

- lead chứa **phần trăm** → **bỏ** (một con số thuế do LLM sinh ra là thứ hệ thống này không được làm);
- lead trích **Điều/Khoản/mã HS** → chỉ giữ nếu chính chuỗi đó có trong khối tất định sắp in ra,
  tức là nó đang **nhắc lại** thứ DB trả về, không phải nhớ từ dữ liệu huấn luyện.

Footer ("trả lời đúng/sai để xác nhận") và dòng "📌 Trích nguyên văn…" trở thành **có điều kiện** —
lặp dưới mỗi tin là phần lớn cảm giác rập khuôn.

## Nhắm đúng văn bản + trung thực khi ngoài kho

- [legal.scope.ts](../../apps/api/src/modules/legal/legal.scope.ts): đọc số hiệu văn bản từ câu hỏi
  (khớp **từ vựng**, không embedding — số hiệu là định danh, không phải văn xuôi), giải ra
  `document_id`. Nhánh `consolidates` khiến "Nghị định 08/2015" tìm ra đúng VBHN hợp nhất nó.
- Cờ `confident`: một số trần trụi trong câu ("lô hàng 09/2018") **không** được coi là số hiệu văn bản,
  nếu không một câu hỏi thường sẽ bị trả lời "kho không có văn bản đó".
- Scope là **hard filter** trong `hybridRetrieve`, cạnh valid-time — không phải tín hiệu xếp hạng.
  Nêu đích danh Điều thì **bỏ qua ngưỡng `MAX_DIST`**: chỉ đích danh đã là ý định mạnh hơn cosine.
- Kho không có văn bản được hỏi → trả lời **liệt kê những gì kho có**, thay vì đưa đoạn gần nhất của
  một văn bản khác. Đây là hai thất bại KHÁC NHAU và phải nói khác nhau.

## Cạm bẫy đã gặp (đừng phát hiện lại)

**Drizzle không bind mảng JS thành mảng Postgres.** `= ANY(${ids})` biên dịch thành `= ANY($1, $2)`
→ *"malformed array literal"*. `inArray()` của Drizzle cần đối tượng cột, mà SQL thô có alias thì không
có. Dùng `inIds()` trong legal.scope.ts (`col IN ${inIds(ids)}`), mọi giá trị vẫn là tham số bind.

**Parser văn bản dài — hai luật mới trong [parse_provisions.py](../../research/legal-loader/parse_provisions.py):**

1. *Dấu chấm + thứ tự.* Dòng bắt đầu "Điều N" chưa chắc là tiêu đề điều: thông tư thủ tục đầy
   **tham chiếu chéo** bị xuống dòng ("… quy định tại\nĐiều 7 Nghị định số 08/2015…"). Chỉ tin khi
   dòng **có dấu chấm** sau số (tiêu đề thật: "Điều 12. Khai hải quan"), hoặc khi số đúng bằng
   `điều trước + 1`. Dùng riêng thứ tự thì **hỏng**: một tham chiếu số CAO duy nhất nâng mốc và nuốt
   hết các điều thật phía sau — lần thử đầu mất 28/111 điều của 46/VBHN-BTC.
2. *"Phụ lục" viết thường không kết thúc phần nội dung.* Thông tư thủ tục dẫn phụ lục ở gần như mọi
   điều ("theo mẫu số 02/… Phụ lục VI ban hành kèm Thông tư này;") và PDF hay ngắt dòng ngay đó —
   coi nó là ranh giới phụ lục làm 25/VBHN-BTC dừng sau **7/149** điều. Chỉ dòng CHỈ CÓ marker
   (`^Phụ lục\s*[IVX\d]*$`) hoặc `PHỤ LỤC` viết HOA mới là ranh giới.

Cả hai luật đều **cải thiện** văn bản cũ: 46/VBHN-BTC giữ nguyên 9 chương/111 điều nhưng thu thêm
**+39 khoản, +57 điểm** trước đây bị các lần cắt điều giả nuốt mất.

## Kế hoạch kiểm chứng

- `yarn test:bot` — 20 ca thuần cho dispatch + guard lời dẫn + đọc số hiệu văn bản, gồm **đúng ca
  hội thoại trong ảnh chụp**.
- `yarn test` (cần `DATABASE_URL` + `EMBEDDER_URL`) — golden retrieval + 3 ca mới cho scope theo
  văn bản/điều.
- Trên VPS: diễn lại hội thoại trong ảnh; hồi quy `8481.80.99 TQ`, "đúng"/"sai", ảnh sản phẩm,
  "còn từ Nhật thì sao", và **restart bot giữa chừng** (ngữ cảnh phải còn, vì đã ở Postgres).

---
type: doc
status: active
updated: 2026-09-15
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

### Có mã HS trong câu chưa chắc là hỏi thuế (2026-09-14)

*"e có miếng dán bàn chân ngải cứu, e tham khảo mã này không biết được không ạ 30051010"* hỏi **mã có hợp
với hàng không**, và bot đã trả MFN + FTA vì mọi tin có mã 8 số đi thẳng vào tra thuế. Nay:

- Tra thẳng chỉ khi tin **chỉ gồm** mã + xuất xứ + ngày + từ tra thuế (`isBareLookup` trong dispatch.mjs).
  Câu có nội dung khác thì router đọc trước.
- Router thấy mã người dùng dưới dạng `[mã người dùng nêu]` (`maskHs`), cả trong các lượt trước —
  [R4](../business-rules.md): mã ưa thích không bao giờ là tiền đề.
- Intent `check_code` → `answerCodeCheck`: nhóm ứng viên lấy từ **mô tả hàng**, `/legal` đọc chú giải của
  đúng các nhóm đó rồi lập luận, còn so mã người dùng với ứng viên là việc của **code**. Chủ đề ghi là
  `legal`, để một câu "sai" sau đó không ghi mã người dùng là sai vào sổ ([R13](../business-rules.md)).
- Câu hỏi giải nghĩa mã/nhóm, chú giải, GRI thuộc intent `legal`. `/legal` giữ luôn Chú giải chi tiết của
  nhóm được nêu và chú giải chương của nó (`headingSections`), vì "3005.10.10" không khớp tiêu đề
  "nhóm 30.05" theo cả từ khoá lẫn vector — mô hình đã từ chối trong khi chú giải nằm sẵn trong kho.

## Luồng `POST /answer` và bộ nhớ ứng viên (kế hoạch 08, Việc 12)

Từ Việc 12, bot không còn gọi `route()` cho tin chữ. Luồng đầy đủ ở
[kế hoạch 08 §2.1](../planning/08-answer-path-tasks.md); phần liên quan tới bộ nhớ:

- **Bot gửi ngữ cảnh, API che mã.** Bước kế hoạch nhận `context = {topic, state, turns}` thô; API che mọi mã trước
  khi dựng prompt (R4). Kế hoạch bot tự dựng (tra thuế trần, tra thuế theo kế hoạch) chỉ có
  `{intent: 'tariff', origin, date}` — không `question`, không mã. "còn từ Nhật thì sao" (`reuseLastHs`) đi cùng đường văn xuôi +
  khối: kế hoạch `{intent: 'tariff', reuseLastHs: true, origin, date}` kèm `context`, API lấy `state.tariff.dotted` làm khoá;
  khối thuế tra mã đó với xuất xứ mới, `/answer` không trả lời thì khối đi một mình.
- **`state.tariff` sau câu soạn chế độ hs** = `{hs: null, candidates: ['30.05', …], desc, keywords, at}`. `hs: null`
  nên `tariffFresh` là false: một chữ "đúng" không ghi gì, vì không có kết quả tra nào đang chờ xác nhận.
  `desc` = `plan.goods.facts` (API đã lọc số, serial, model). Không có ứng viên nào thì `state.tariff = null`.
- **`candidatesFresh`** (`loadContext`): `hs` null, `candidates` không rỗng, còn trong `TARIFF_TTL_MS`. Khi đó
  `ctx.tariff = state.tariff`, để `handleCorrection` giữ được `desc` cho note của phán quyết.
- **`state.legal` sau câu soạn legal/status/mixed** = `{question, asOf, citations ≤ 5 {label, kind, instrument,
  documentNumber}, missingDoc: null, pendingIngest: null}`. Mỗi citation mang thêm `provisionLabel` = `label`, cầu tạm cho
  tới khi bước kế hoạch của API đọc `label` (hàng 19). Văn bản kho không có vẫn đi `missingDocAnswer` (lưu
  `query` + `pendingIngest`).
- **`state.answer` sau mọi câu soạn** = `{mode, question, goods: {facts}, at}` — lượt trước cho câu tinh chỉnh.
  `question` là câu đã che của kế hoạch, bỏ cả nhãn `[mã n]`, mọi dãy 6 tới 10 chữ số liền ("mã hs 848180", gõ thừa một số)
  và mọi mã 4-2-2 nối gạch ("8481-80-99", trừ ngày ISO) mà mặt nạ API bỏ sót; `goods.facts` và `keywords` lọc y như vậy. **Không mã người dùng nào vào `state`.** Một câu trả lời
  đặt `topic` mà không soạn (tra thuế, văn bản thiếu, đính chính…) xoá `state.answer`: refine chỉ trỏ về câu soạn ngay
  trước. Refine gửi kế hoạch nguyên vẹn, không `forceIntent`: API tự đổi sang `state.answer.mode` và giữ câu hỏi trước.
- `index.mjs` và `dry-run.mjs` ghi state qua `nextState(state, result)`: thiếu khoá `tariff`/`legal`/`answer` =
  giữ nguyên, `null` = xoá.

**Sổ phán quyết trên luồng ứng viên (R13, §6.3).**

| Tin | Kết quả |
|---|---|
| "HS đúng là 8422.90.90" (cả tin, ngay sau câu ứng viên) | `fastPath` → `handleCorrection`: tra mã trước, rồi đúng một dòng `correct`, note = `desc` + số công văn; không dòng `wrong`, không đọc "mã cũ" từ quote. Tra không được hoặc ghi lỗi: không ghi, không nói "Đã ghi nhận", giữ bộ nhớ để gửi lại |
| "sai rồi, không phải nhóm này" | không phải dạng nào của văn phạm → bước kế hoạch; `refine` hoặc `correction` không kèm mã sau ứng viên → soạn lại `hs`, không ghi |
| "63079090 mới đúng" (kế hoạch `correction`) | `codeOffer`: một câu mời nêu các ứng viên và lệnh "HS đúng là …", không ghi; gửi đúng lệnh đó thì ghi |
| "8481.80.99 có sai không ạ" | câu hỏi → `hs`; chưa có mô tả hàng thì hỏi mô tả (hàng 14), không ghi |

Kế hoạch `confirm`/`correction` không bao giờ tự ghi sổ. Sổ chỉ được ghi từ một **văn phạm đóng** ở `fastPath` (`ruling` trong
dispatch.mjs): cả tin phải là một trong ba dạng dưới đây, gộp khoảng trắng, cho phép một tiểu từ lễ phép cuối tin (ạ, a, nhé, nhe,
nha, nhá, bạn, ban) và dấu `.`/`!`. **Đọc đúng như gõ**: tin có một dấu nào thì phải khớp dạng có dấu, chỉ tin không dấu nào ("dung
roi") mới khớp dạng bỏ dấu; bỏ dấu cả tin có dấu từng biến "dùng rồi", "không dùng", "sài rồi", "sai á", "sai
nhẹ" thành phán quyết. Dạng bỏ dấu nhận ít hơn: tiểu từ cuối chỉ "ban" (không "a": "dung a", "sai a" có thể là "đúng à?", "sai à?";
không "nhe"/"nha": "dung nhe" có thể là "dùng nhé"); không có "khong/ko/k/chua dung" (có thể là "không dùng", "chưa dùng") hay "k
chac"; chủ ngữ phải có danh từ ("ma nay sai" ghi, "nay sai", "do sai" trơn thì không); và **không có dạng có mã**: "hs dung la X", "ma
dung la X" có thể là "HS dùng là X", "mã dùng là X" (round 8). Lời mời luôn viết lệnh có dấu ("HS đúng là <mã>"), gửi đúng như lời
mời thì ghi được. Có `?` ở bất cứ đâu, hay gõ "à"/"á"/"hả", thì không ghi. Không đoán ý từ câu
dài hơn: mỗi vòng review heuristic cũ đều tìm ra một cách nói nghi ngờ mới vẫn ghi sổ ("mã đúng là X thì thuế bao nhiêu", "… thì
phải", "… hay sao ấy", "sai rồi, sao lại ra mã này", "đúng?"). Câu khác đi bước kế hoạch, và lời mời ở đó nói đúng lệnh cần gửi.
Bỏ sót một phán quyết tốn một lượt nhắn lại; ghi nhầm một câu nghi ngờ thì nằm lại trong sổ cho người sau đọc (R18).

| Dạng (cả tin) | Ghi | Khi nào |
|---|---|---|
| Một từ: đúng (rồi), chuẩn, chính xác · sai (rồi), không đúng · không chắc ("rồi" gõ "r", "không" gõ "ko"/"k"). Không dấu: dung (roi), chuan, chinh xac · sai (roi) · khong chac, ko chac (không "k chac") | `handleConfirm` | bàn thuế còn mới, mở, chưa ghi phán quyết (câu ngay trước gửi cho chính người này là câu tra); có quote thì quote phải là chính câu tra đó |
| ((mã / mã HS / HS / code / kết quả) (này / đó / vừa tra)? · này · đó)? + sai (rồi) · không đúng · chưa đúng. Không dấu: ((ma / ma hs / hs / code / ket qua) (nay / do / vua tra)?)? + sai (roi); "nay sai", "do sai" trơn không ghi. "nhầm mã (rồi)" và "vừa tra sai" (không chủ ngữ) không ghi: thường là tự nhận gõ nhầm | `handleCorrection`, dòng `wrong` | như dòng trên |
| (sai (rồi),)? + HS / mã / mã HS / code (HS)? + đúng / chuẩn / chính xác (phải)? + là / `:` + **một** mã; sau mã chỉ "xuất xứ <nước>" và "(theo / căn cứ) CV / công văn / QĐ / TB <số>". Chỉ dạng có dấu: "hs dung la X" không ghi | `handleCorrection`: `correct` mã mới trước, rồi `wrong` mã đang nhớ | bàn thuế: không quote thì câu trước là câu tra hoặc lời mời nêu lệnh này; quote thì chỉ câu tra đó (quote lời mời không bao giờ ghi). Xuất xứ nêu trong tin phải là xuất xứ của lượt tra đang nhớ, không thì không ghi và bảo tra xuất xứ đó trước. Luồng ứng viên: chỉ `correct`, chỉ khi không quote và câu trước là câu ứng viên hoặc lời mời |

**Ô "xuất xứ <nước>"** (`COUNTRY`, dispatch.mjs) chỉ nhận đúng các cách viết `detectOrigin` (parse.mjs) đọc được, vì
`handleCorrection` đối chiếu xuất xứ bằng hàm đó: một cách viết nó không đọc ("xuất xứ jp", "xuất xứ my") từng bỏ qua phép đối chiếu
và ghi dưới xuất xứ của lượt tra (round 6). Các cách viết (dạng có mã chỉ nhận tin có dấu): trung quốc, nhật bản, nhật, hàn quốc, thái
lan, mã lai, châu âu, ấn độ, anh quốc, tq, china, japan, korea, australia, new zealand, thailand, malaysia, singapore, indonesia,
philippines, germany, india; mã nước chỉ khi gõ **chữ hoa** (TQ, CN, JP, KR, AU, NZ, TH, MY, SG, ID, PH, DE, EU, GB, UK, US, VN). Một
spec đọc từng cách viết bằng `detectOrigin`, nên hai danh sách không lệch nhau được. Thêm nữa, `ruling` chỉ nhận **một** ô xuất xứ, và
cả tin đúng như gõ (chưa chuẩn hoá: gõ Unicode tổ hợp thì `detectOrigin` không đọc ra) phải đọc ra chính xuất xứ của ô đó, không xuất
xứ nào khác (số công văn "12/tq", hai ô "xuất xứ Nhật Bản, xuất xứ Trung Quốc"): không thì không ghi. **Tin không có ô xuất xứ thì cả
tin không được đọc ra xuất xứ nào**: `handleCorrection` đọc xuất xứ từ cả tin, nên số công văn "CV 12/HQ-CN", "TB 12/TB-TH" (CN, TH)
trên bàn ứng viên hay bàn ảnh, nơi không có xuất xứ lượt tra để đối chiếu, từng thành xuất xứ của dòng `correct` (round 8). Tin như vậy
không ghi: đi bước kế hoạch và ra lời mời.

"ok", "oke", "okay", "okie" không phải phán quyết: ở đâu cũng là "đã xem" (câu `AGREED`, không qua bước kế hoạch). Từ đồng ý thường
("chuẩn rồi", "đúng vậy", "chính xác rồi"; `plainVerdict`, chỉ định tuyến) sau câu không phải kết quả tra cũng là `AGREED`, không soạn
lại câu cũ; trên kết quả tra còn mới, mọi từ phán quyết mà sổ không ghi ("chuẩn rồi", "chưa chắc", "đúng" khi bàn đã đóng) ra lời mời
nêu mã vừa tra và lệnh "đúng"/"sai"/"HS đúng là <mã>".

- **Bàn mở, bàn đóng.** `stampTariff` đặt `state.tariff.open = true` ở câu tra thuế và câu ứng viên; `nextState` đóng lại
  (`open: false`, giữ bộ nhớ) ở mọi câu trả lời không mang khoá `tariff`: NEEDS_CODE, NEEDS_GOODS, NOT_READ, câu soạn không
  ra ứng viên, câu ghi nhận, câu báo lỗi. Câu đính chính vừa ghi in khối thuế của mã mới nhưng cũng đóng bàn: "đúng" sau nó là
  cảm ơn, không thành dòng thứ hai. Lời mời hỏi "đúng"/"sai" về chính mã vừa tra (`codeOffer` cùng mã hoặc không mã) mở lại
  (`open: true`). Lời mời về mã khác, hay trên luồng ứng viên, chỉ mở cho dạng có mã (`open: 'coded'`): gửi đúng lệnh nó nêu
  thì ghi được, còn "đúng"/"ok" (trả lời lời mời) thì không. Ghi sổ lỗi chỉ để ngỏ đúng phán quyết vừa lỗi (`open: 'wrong'`).
- **Bàn đã ghi phán quyết thì đóng hẳn** (`ruled: true`, đặt khi `handleConfirm` hay `handleCorrection` ghi được): không nhận
  phán quyết thứ hai, quote câu tra hay không; lời mời sau đó không mở lại và nói đã ghi rồi. Lượt tra mới (`stampTariff`) mới nhận lại.
  **Lưu bộ nhớ lỗi ở bất cứ câu nào** (`saveContext` trả null) thì bộ nhớ vẫn giữ bàn của câu trước, còn mở, không phải câu trên màn
  hình (một lượt tra khác, một câu pháp luật): `messageHandler` xoá tin cuối của bot khỏi `lastAnswered`, nên đường không quote đóng
  và phán quyết không quote ra lời mời (round 8). Câu `confirm`/`correction` đã ghi sổ (trả `ruled`, hoặc `tariff: null` sau "mã này
  sai" hay đính chính ghi được một nửa) thì bộ nhớ còn thấy bàn chưa ghi: `messageHandler` nhớ thêm trong RAM bàn đó (khoá
  luồng:người:mã hoặc các ứng viên:xuất xứ:ngày), lượt sau nạp bộ nhớ thì đặt `ruled: true` cho bàn ấy, nên không ghi dòng thứ hai và
  lời mời nói đã ghi rồi (bàn ứng viên không có mã: "cho hàng vừa hỏi"). Khởi động lại thì quên. Vì khoá không có giờ tra, tra lại đúng
  mã, xuất xứ, ngày đó trong cùng tiến trình cũng không nhận phán quyết nữa (bỏ sót, không ghi nhầm).
- **Tin cuối của bot trong luồng phải gửi cho chính người này** thì dạng không quote mới ghi. `messageHandler` (index.mjs) nhớ
  trong RAM mỗi luồng tin cuối của bot trả lời ai (câu trả lời, lời báo đã hiểu, "đang xem ảnh", báo lỗi; báo cáo nạp văn bản
  xoá); trong nhóm tin đó có thể trả lời đồng nghiệp, và "chuẩn" khi ấy trả lời tin đó. Khởi động lại thì quên, tức là chỉ đóng:
  "đúng" đầu tiên ra lời mời, gửi lại thì ghi. Quote câu tra của mình vẫn ghi.
- **Tin của một người trong một luồng xử lý lần lượt** (`inTurn`): câu soạn gửi lời báo đã hiểu câu hỏi khoảng một phút trước câu
  trả lời, bộ nhớ chỉ lưu sau câu trả lời, nên "đúng rồi" trả lời lời báo từng được đọc với lượt tra phía trên và ghi sổ.
- **Ảnh không phải câu tra.** Tin có ảnh hay trả lời một ảnh mà cả tin là dạng phán quyết: lời mời nêu kết quả đang nhớ, không ghi,
  không chạy lại vision. Câu trả lời ảnh ranh giới (ba mã ngang nhau) là bàn ứng viên (`hs: null`, `candidates` là ba mã 8 số):
  "đúng" không ghi, "HS đúng là <mã>" chỉ ghi `correct` cho mã đó.
- **Quote là kết quả trên bàn chỉ khi nó cho thấy đúng lượt tra đang nhớ.** Quote phải có dòng dẫn khối thuế ("Hàng hóa có mã
  HS X…", "Đối với hàng hóa có mã HS X…") với X là mã đang nhớ, đọc từ chính dòng đó. Dòng đó nêu đúng xuất xứ đang nhớ, và
  không nêu xuất xứ nào khi bộ nhớ không có. Quote phải có dòng "Tra theo ngày …" khớp ngày bộ nhớ: phần 1 của một câu tra dài không
  có dòng ngày, và phần 1 của lượt tra cũ cùng mã, cùng xuất xứ đọc y như hôm nay. Không có dòng ghi nhận ("Đã ghi nhận…", "Đã xác
  nhận mã…"). Mọi quote khác (câu ghi nhận, câu soạn, câu ứng viên, lời mời, lượt tra cũ hơn hay khác xuất xứ, tin không mã của một
  câu dài, tin của người khác) thì không ghi gì: lời mời không nêu xuất xứ, ngày hay của ai, và hàng tương tự có cùng các nhóm ứng viên.
- Hai dạng không mã cần bàn còn mới (2 giờ), kể cả khi quote đúng câu tra. Dạng có mã quote đúng câu tra thì ghi được cả khi
  bộ nhớ đã cũ: mã cũ đọc từ quote. Tra 404 hay sau ứng viên (không `hs`) thì quote không bao giờ tự đứng làm kết quả.
- `readsAsQuestion` chỉ còn định tuyến (kế hoạch confirm/correction trên một câu hỏi thì soạn hs), không mở hay chặn đường
  ghi nào.
- `tariffReply` chỉ nhận dòng bot tự viết (câu dẫn khối thuế, câu ghi nhận), không nhận "MFN"/"Cảm ơn"/"bạn nêu". Văn xuôi
  soạn có thể chép câu dẫn ("Hàng hóa có mã HS 6506.10.10 thuộc danh mục…" khi mã chủ đề được mở cho bước soạn), kể cả có
  markdown chen giữa ("Hàng hóa có **mã HS X**"), nên `formatAnswerMd` đổi các câu mở đó **trên dòng đã qua `md()`**, giữ
  nghĩa ("Hàng có mã HS", "Có ghi nhận"; dòng bị đổi mất đậm/nghiêng), và đổi ngoặc thẳng của `"HS đúng là …"` thành ngoặc
  cong: không tin nào của câu soạn khớp `tariffReply` hay `offerReply`, ở chế độ nào và tách tin ở đâu cũng vậy. Lời báo đã
  hiểu câu hỏi (`ack`, chữ mô hình) cũng qua `unlikeTariffReply` trước khi gửi. Ở chế độ mixed, tiêu đề "Thuế của mã trong
  câu hỏi:" mở chính dòng câu dẫn khối thuế ("Thuế của mã trong câu hỏi: hàng hóa có mã HS …"): khối dài hơn một tin (một biểu
  by_subline 70 dòng) bị tách từng dòng, và tiêu đề đứng riêng một dòng từng nằm cuối tin này trong khi câu dẫn trần mở tin sau.
- Đính chính kèm mã mới ghi `correct` cho mã mới trước, rồi `wrong` cho mã cũ. `correct` lỗi thì không ghi gì, giữ bộ nhớ để
  gửi lại; `wrong` lỗi sau đó thì nói rõ đã ghi được gì, bỏ bộ nhớ để gửi lại không ghi trùng.
- Lời mời nạp văn bản chỉ nhận "có"/"nạp" khi chủ đề còn là pháp luật.

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

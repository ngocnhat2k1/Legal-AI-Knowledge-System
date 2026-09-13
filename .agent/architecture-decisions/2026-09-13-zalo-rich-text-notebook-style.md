---
type: architecture-decision
status: proposed
updated: 2026-09-13
related:
  - ../docs/bot-answer-parity-design.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - 2026-09-13-evidence-sections-and-long-form-answers.md
  - 2026-09-13-fta-national-sublines.md
  - 2026-07-17-no-llm-on-tariff-numbers.md
---

# Quyết định Kiến trúc: Chữ định dạng Zalo theo giọng notebook, màu do dữ liệu quyết

Ngày: 2026-09-13

Trạng thái: Proposed

## Bối cảnh

Chủ dự án thử bot live (2026-09-13) và thấy câu trả lời "quá cứng nhắc": cùng câu hỏi "Thuế nhập khẩu
mã 8481.80.99 xuất xứ Trung Quốc là bao nhiêu phần trăm?", notebook trả một câu dẫn tự nhiên, hai gạch
đầu dòng (có / không C/O), số liệu in đậm, `[1] [2]` và một gợi ý kết; bot trả một biểu mẫu
`📋 · 📦 · MFN: · Ưu đãi FTA:` liệt kê cả bốn biểu FTA (kể cả biểu Trung Quốc không phải thành viên),
một cảnh báo độ cũ dài hai câu và một chân trang hỏi "đúng/sai". Chủ dự án muốn đồng bộ giọng và bố
cục với notebook và dùng định dạng (đậm, nghiêng, màu theo nghĩa) cho dễ đọc.

Các lực đẩy và ràng buộc đọc được từ mã nguồn và dữ liệu:

- `zca-js` 2.1.2 gửi được `styles: [{ start, len, st }]` (đậm, nghiêng, gạch chân, gạch ngang, 4 màu,
  cỡ chữ, danh sách). Một tin mẫu 465 ký tự, 25 kiểu, offset theo chỉ số chuỗi JavaScript, đã hiện đúng
  trên điện thoại và Zalo PC (chủ dự án xác nhận).
- Bot không có định dạng nào; mọi câu trả lời là một chuỗi ghép emoji. Không có tách tin.
- **Không có dữ liệu thành viên FTA.** `/tariff` trả mọi biểu FTA của một mã bất kể xuất xứ, nên "xanh =
  được hưởng ưu đãi" không tính được một cách trung thực. Sự cố sửa ở commit 19eda99 cho thấy thêm: NĐ
  118/2022 (ACFTA) loại trừ xuất xứ theo từng dòng (446 dòng 0% không áp cho hàng Trung Quốc) — là
  thành viên là điều kiện cần, không đủ. Một bảng thành viên trích từ bốn nghị định lúc đó đang chờ chủ dự án
  duyệt (`db/seed/data/fta-members.json`); chủ dự án duyệt cùng ngày (commit `853a01f`).
- Cảnh báo độ cũ ("dữ liệu chốt 2026-09-13, tin cậy đến 2026-07-27") là sản phẩm phụ của việc seed:
  `DATA_SNAPSHOT_DATE` để trống nên API lấy `max(recorded_at)`. Bảng `decree` đã có ngày hiệu lực thật;
  nhưng 4 nghị định trong bảng (144/2024, 108/2025, 199/2025, 201/2026) không có dòng thuế nào được nạp.
- Lỗi "69/2018": bot gửi số hiệu thiếu đoạn cơ quan ban hành, API không khớp đúng được, bot liệt kê chính
  văn bản được hỏi dưới "cùng số nhưng của cơ quan khác".
- Mảng 3 của kế hoạch nâng cấp đã dự tính một `apps/zalo-bot/render.mjs` cho `POST /answer`, nhưng thiết
  kế cũ bỏ chữ đậm (`**x**` → `x`). Chủ dự án chốt làm phần trình bày trước, Mảng 2 ngay sau; hai việc
  không được chặn hay làm trùng nhau.
- Quy tắc sẵn có: không LLM trên con số thuế ([R1](../business-rules.md)), mức thuế là tuyên bố có điều
  kiện ([R6](../business-rules.md)), mọi câu trả lời viện dẫn nghị định và mốc dữ liệu
  ([R7](../business-rules.md)), thẩm quyền dữ liệu chỉ do người cấp ([R18](../business-rules.md)).

## Quyết định

1. **Chữ định dạng bằng `styles` của `zca-js`**, không bằng emoji. Dùng đậm, nghiêng, chữ nhỏ, danh sách
   và ba màu: xanh (mức ưu đãi khi điều kiện xác định được là đáp ứng), cam (cần chuyên viên chốt / chưa
   chắc), đỏ (cảnh báo pháp lý: không được hưởng, chống bán phá giá, hết/chưa có hiệu lực). Nguồn và ghi
   chú là chữ nhỏ nghiêng. Offset là chỉ số chuỗi JavaScript trên chuỗi đã NFC.
2. **Màu chỉ do code quyết từ dữ liệu.** Builder tất định gắn nhãn ngữ nghĩa lên từng đoạn chữ; văn xuôi
   của LLM chỉ đi qua một bộ đọc Markdown con (`**đậm**`, `*nghiêng*`, danh sách, tiêu đề, `[n]`) mà tập
   nhãn đầu ra theo cấu trúc không chứa màu. Bộ trình bày gộp mọi cảnh báo của một câu trả lời thành
   **một** dòng cam; không cảnh báo nào bị thu nhỏ chỉ vì đứng sau (cảnh báo R18 "bot tự nạp" giữ nguyên
   độ nổi). Cổng văn xuôi LLM (`sanitizeLead`) bác thêm số hiệu, mã HS dạng bất kỳ và "phần trăm", và áp
   cả cho trả lời chung của router, ghi chú ảnh, lý do từ chối.
3. **Một bộ trình bày duy nhất, `apps/zalo-bot/render.mjs`**, dùng ngay cho các đường đang chạy và dùng
   lại nguyên vẹn cho `POST /answer` ở Mảng 3. Nó tách tin ~1.800 ký tự tại ranh giới đoạn, không cắt giữa
   một đoạn có nhãn, tính style riêng cho từng tin, và chỉ tin đầu mang `quote`.
4. **Giọng notebook:** câu dẫn tự nhiên nêu dữ kiện chính (với khối thuế, câu dẫn do code viết), gạch đầu
   dòng chỉ cho lựa chọn thật, `[n]` cùng danh sách nguồn ở cuối, không emoji trang trí, không viết hoa
   để nhấn, gợi ý kết do code chọn và chỉ đề nghị việc bot làm được.
5. **Lọc FTA theo xuất xứ và tô xanh chỉ khi bảng thành viên đã có người đứng tên xác nhận.** API đọc
   `fta-members.json` lúc khởi động; thiếu file, sai dạng, `verifiedBy` rỗng, hoặc `verifiedHash` không
   khớp nội dung `schedules` (bảng bị sửa sau khi ký) → không lọc, không xanh. API trả
   `PreferentialView.originEligible: boolean | null`, kết hợp thành viên đã xác nhận với loại trừ theo
   dòng (`originExcluded` → `false`) và loại trừ ở một dòng 10 số (`sublines[].originExcluded` → `null`,
   mức tô cam kèm lời đối chiếu); bot và web UI cùng đọc trường này. Xanh chỉ ở dòng `true` có một mức
   chung (không phải dòng loại khỏi biểu, hạn ngạch hay `by_subline`), và không bao giờ ở câu trả lời ứng
   viên HS, vì mức ưu đãi khi đó phụ thuộc một phân loại chưa ai chốt. Ký bảng bật xanh ở mọi mã cùng
   lúc, nên chỉ ký khi thay đổi của [ADR dòng 10 số quốc gia](2026-09-13-fta-national-sublines.md) đã chạy
   trên dữ liệu đang phục vụ, hoặc chủ dự án ghi nhận rủi ro trong cùng commit.
6. **Dòng phạm vi kho lấy từ văn bản biểu thuế mới nhất đã nạp còn hiệu lực tại ngày tra**
   (`effective_from ≤ ngày ≤ effective_to`, nghị định có dòng thuế đã nạp) và nêu số nghị định đã ghi nhận
   nhưng chưa nạp dòng thuế; số hiệu của chúng nằm ở dòng nguồn để dòng cam ngắn. Ngày 13/09/2026 văn bản
   đó là 26/2023/NĐ-CP, không phải 72/2026/NĐ-CP (xăng dầu, hết hiệu lực 30/04/2026). Gia hạn đã ghi trong
   dữ liệu mà chưa nạp (`extended_by`, NQ 25/2026) in thành dòng đỏ cho đúng mã và đúng khoảng ngày. Bỏ
   `DATA_SNAPSHOT_DATE` và `GAZETTE_LAG_DAYS`.
7. **Dấu `[n]` của câu trả lời pháp luật được API ánh xạ và kiểm** (vị trí trong tập điều khoản đã truy
   hồi; dấu ngoài tập bị xoá, đánh số lại theo thứ tự xuất hiện), để `[n]` luôn trỏ đúng trích dẫn thứ n.
   Trước khi gắn dấu, mọi `%`, tiền, ngày, thời hạn, số hiệu, mã HS trong một câu phải có trong điều khoản
   được dẫn ở chính câu đó; không có thì câu mất dấu và mất đậm, còn `%` hoặc tiền không có thì cả câu trả
   lời rơi về trích dẫn thuần ([R10](../business-rules.md)).
8. **Bằng chứng không lấy từ bố cục chat.** Mục `tariff` của Mảng 2 do API dựng từ trường của `/tariff`,
   mỗi mức một dòng `biểu: statement (nghị định)`; phần này không đổi `statement` hay `decree`.

Chi tiết: [§5b thiết kế bot trả lời ngang notebook](../docs/bot-answer-parity-design.md#5b-trình-bày-kiểu-notebook-trên-zalo-v3).

## Các phương án đã cân nhắc

- **Chữ thuần + emoji (hiện trạng, chỉnh câu chữ):** bác. Đó chính là thứ chủ dự án chê; emoji không mang
  nghĩa nhất quán, không phân biệt được "ưu đãi áp dụng được" với "cần chốt" hay "cảnh báo pháp lý", và
  chiếm chỗ trên mỗi dòng.
- **Để LLM viết Markdown có màu (thẻ màu trong prompt):** bác. Tô xanh một mức thuế là khẳng định "bạn
  được hưởng"; để mô hình quyết là để LLM đưa ra một kết luận về thuế ([R1](../business-rules.md),
  [R3](../business-rules.md)). Kỷ luật prompt không phải cưỡng chế, và bộ trình bày sẽ phải tin cú pháp
  do mô hình sinh. LLM vẫn được dùng đậm/nghiêng/danh sách trong văn xuôi — những thứ không mang nghĩa
  pháp lý.
- **Thẻ ảnh (vẽ câu trả lời thành PNG):** bác. Không sao chép được số hiệu, mã HS, trích dẫn; bot mất
  ngữ cảnh khi người dùng trả lời vào tin (luồng đính chính đọc chữ của tin được quote); cần thêm hạ
  tầng vẽ; khó đọc trên màn hình nhỏ và với công cụ hỗ trợ tiếp cận.
- **Lọc FTA theo xuất xứ không cần bảng đã duyệt** (suy từ tên hiệp định, danh sách viết tay trong code,
  hay kiến thức của mô hình): bác. Ẩn nhầm một biểu làm mất ưu đãi hợp pháp; tô xanh nhầm làm nộp thiếu
  thuế — cả hai đều là câu trả lời sai trông hợp lệ. Dữ liệu chưa có người đọc không được mang thẩm quyền
  ([R18](../business-rules.md)); loại trừ theo dòng của NĐ 118 cho thấy suy luận "thành viên ⇒ được
  hưởng" đã sai một lần.
- **Seed bảng thành viên vào Postgres:** hoãn. Cần migration viết tay (nợ snapshot drizzle 0007–0009) và
  tạo một trạng thái DB có thể lệch khỏi file đã duyệt; file trong image là đủ. Xem lại khi thành viên cần
  thời gian hiệu lực.
- **Giữ `DATA_SNAPSHOT_DATE` và buộc người vận hành đặt tay:** bác. Dựa vào trí nhớ của người deploy; để
  trống đã in ra ngày sai, và bảng `decree` đã có sẵn dữ kiện.
- **Hai bộ trình bày (một cho luồng hiện tại, một cho `/answer`):** bác. Làm trùng Mảng 3 và để hai cách
  in cảnh báo, nguồn, tách tin lệch nhau.
- **Dùng chữ bot in (`formatAnswer`) làm thân mục bằng chứng `tariff` của Mảng 2:** bác. Bố cục mới tách
  điều kiện C/O vào câu dẫn và nghị định vào dòng nguồn, nên dòng "ACFTA (form E): 0%" sẽ qua kiểm "trích
  nguyên một dòng mức thuế" như một mức vô điều kiện ([R6](../business-rules.md)); `expand.ts` còn là
  TypeScript, không import được mã bot.
- **Hạ các cảnh báo sau dòng cảnh báo đầu thành chữ nhỏ:** bác. Thứ bị hạ phụ thuộc vị trí, nên cảnh báo
  R18 hay dòng phạm vi kho có thể co thành chú thích chỉ vì một cảnh báo khác đứng trước; gộp thành một
  dòng thì giữ được cả giới hạn một dòng lẫn độ nổi.

## Hệ quả

**Được:** câu trả lời đọc như notebook mà giữ nguyên bốn rào chắn bot hơn notebook; màu mang nghĩa và
kiểm được bằng test; bot và web UI dùng chung một nguồn cho lọc FTA và mốc dữ liệu; Mảng 3 nhận sẵn bộ
trình bày, bộ tách tin và bộ kiểm `[n]`.

**Chi phí và rủi ro:**

- Hợp đồng `/tariff` đổi: `StalenessView` bỏ `snapshotDate`, `reliableThrough`, `stale`; web UI phải sửa
  cùng lúc. Chưa biết bên tiêu thụ nào khác.
- Style ở nhánh `quote` của `zca-js` mới được đọc trong code, chưa gửi thử; giới hạn độ dài tin của Zalo
  vẫn chưa đo (1.800 là giả định).
- Tách tin: người dùng trả lời vào tin thứ hai thì phần quote chỉ có tin đó.
- Code không phân biệt được người với agent khi đọc `verifiedBy`; điều kiện "người đứng tên" giữ bằng quy
  tắc và review. Agent không bao giờ ghi hay sửa `verifiedBy`, `verifiedAt` (không bao giờ cấp xác minh);
  `verifiedHash` chỉ do controller ghi khi có phê duyệt rõ của chủ dự án đã ghi trong git (lần đầu: commit
  `853a01f`, Trần Ngọc Nhật, 2026-09-13). `verifiedHash` chỉ bắt được việc sửa bảng sau khi ký (do agent, do
  merge), không bắt được một agent tự tính lại hash — review commit sửa file là rào còn lại.
- Bảng đã ký trước khi bật (2026-09-13, điều kiện (a) §5b.11): lọc và xanh có hiệu lực ngay khi deploy, ở
  mọi mã cùng lúc. Bảng bị sửa sau khi ký (hash lệch) thì câu trả lời quay về liệt kê cả bốn biểu FTA kèm câu
  "mình chưa lọc được theo xuất xứ". Các nghị định sửa đổi sau 30/12/2022 chưa được đối chiếu.
- Bảng thành viên chưa có thời gian hiệu lực (gia nhập, rút khỏi hiệp định) — trái tinh thần
  [R8](../business-rules.md) khi thành viên đổi; khi đó chuyển thành bảng có `effective_from/to`.
- Dòng phạm vi kho (~150 ký tự) có mặt ở mọi câu trả lời thuế cho tới khi 144/2024, 108/2025, 199/2025,
  201/2026 được nạp; số hiệu văn bản chưa nạp nằm ở dòng nguồn. Bảng `decree` đọc một lần mỗi tiến trình,
  nên seed lại mà không khởi động lại API thì dòng này cũ.
- Câu trả lời pháp luật dạng Markdown trong JSON dễ hỏng khi mô hình viết xuống dòng thô, và kiểm số liệu
  theo câu gạt cả câu đúng mà mô hình viết số khác cách điều khoản viết → rơi về trích dẫn thuần; theo dõi
  tỉ lệ.

**Việc theo dõi:** ~~chủ dự án quyết ký `fta-members.json` trước hay sau khi bật~~ — đã ký trước khi bật,
theo điều kiện dòng 10 số (a) ở §5b.11; báo chủ dự án rằng dòng phạm vi kho ngày 13/09/2026 ghi 26/2023/NĐ-CP, không phải
72/2026/NĐ-CP như câu mẫu; cập nhật bảng file và dòng hợp đồng giao diện Mảng 3 trong
[kế hoạch 05](../planning/05-bot-parity-tasks.md); migration 0010 và seed lại cho dữ liệu dòng 10 số đã
chạy trước khi ký bảng (2026-09-13; mã `by_subline` trình bày theo §5b.3); nạp các nghị định biểu thuế còn thiếu dòng thuế
và NQ 25/2026.

**Đề xuất quy tắc nghiệp vụ mới — cần chủ dự án duyệt trước khi ghi vào `business-rules.md`.** Cần, vì
đây là hành vi sản phẩm bền vững có hệ quả pháp lý mà R6 và R18 chỉ phủ một phần: R18 nói *ai* cấp thẩm
quyền, R6 nói mức thuế có điều kiện; chưa quy tắc nào nói khi nào được **ẩn** một biểu hay **khẳng định**
một biểu áp dụng cho một xuất xứ, và rằng thành viên là điều kiện cần, không đủ. Đề xuất nguyên văn (các liên kết neo `#r…` viết theo vị trí của `business-rules.md`):

> ## R19 — Ưu đãi FTA theo xuất xứ chỉ được lọc và tô xanh từ bảng thành viên đã có người xác nhận
>
> **Quy tắc.** Hệ thống chỉ được ẩn một biểu thuế FTA, hoặc trình bày mức ưu đãi của biểu đó như áp dụng
> được cho một xuất xứ (tô xanh), khi đồng thời: (a) xuất xứ nằm trong danh sách nước thành viên của biểu,
> trích nguyên văn từ nghị định ban hành biểu; (b) danh sách đó mang tên người đã đối chiếu (`verifiedBy`)
> — không phải agent, không phải bước tự kiểm — và chưa bị sửa kể từ khi ký; (c) dòng thuế không loại trừ
> xuất xứ đó, kể cả ở một dòng 10 số của mã; (d) để tô xanh: dòng có một mức chung cho cả mã 8 số, không
> phải mức theo dòng 10 số.
> Thiếu bất kỳ điều kiện nào → trình bày mọi biểu kèm điều kiện C/O, không tô xanh, không ẩn. Là thành viên
> là điều kiện cần, không đủ. Xuất xứ là một khối (EU) hoặc hàng từ khu phi thuế quan trong nước không được
> coi là thành viên hay không thành viên. Mã HS còn là ứng viên chưa chốt thì không tô xanh. Việc tô màu và
> ẩn/hiện do code quyết từ dữ liệu; mô hình ngôn ngữ không bao giờ quyết. Ký danh sách khi dữ liệu đang
> phục vụ chưa nạp dòng 10 số chỉ được làm khi chủ dự án ghi nhận rủi ro đó trong cùng thay đổi.
>
> **Vì sao.** Tô xanh là khẳng định "được hưởng": sai theo hướng đó là nộp thiếu thuế, truy thu và phạt
> ([R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng)). Ẩn nhầm một biểu là mất ưu đãi hợp pháp. Cả
> hai trông như một câu trả lời đúng.
>
> **Hậu quả của việc phá vỡ nó.** Suýt xảy ra 2026-09-13: `/tariff` trả "0% nếu có C/O form E" cho hàng
> Trung Quốc ở 446 dòng mà NĐ 118/2022/NĐ-CP loại trừ Trung Quốc — thành viên của ACFTA, nhưng không được
> hưởng ở dòng đó.
>
> **Liên quan.** [R1](#r1--mức-thuế-quan-không-bao-giờ-được-sinh-ra-bởi-một-llm) ·
> [R6](#r6--một-mức-thuế-không-bao-giờ-là-một-scalar-nó-là-một-tuyên-bố-có-điều-kiện-kèm-ngày-as-of) ·
> [R18](#r18--xác-minh-tại-điểm-sử-dụng-không-chứng-nhận-trước) ·
> ADR `architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md`.

Quy tắc "màu do dữ liệu quyết" cho phần trình bày nói chung **không** cần thành quy tắc riêng: R1 và
[ADR 2026-09-13 bảng bằng chứng](2026-09-13-evidence-sections-and-long-form-answers.md) (quyết định 6) đã
phủ, và §5b cưỡng chế bằng code.

## Links

- Planning: [Kế hoạch nâng cấp bot — Mảng 3](../planning/05-bot-parity-tasks.md) (cần cập nhật theo §5b.10)
- Design: [Thiết kế bot trả lời ngang notebook — §5b](../docs/bot-answer-parity-design.md)
- Review: chưa rà soát

## Kiến thức liên quan

- [Quy tắc nghiệp vụ](../business-rules.md) — R1, R2, R6, R7, R8, R10, R18
- [Khái niệm biểu thuế](../concepts/tariff-system.md) — loại trừ theo dòng ACFTA, giới hạn dòng 10 số
- [ADR không LLM trên con số thuế](2026-07-17-no-llm-on-tariff-numbers.md)
- [ADR dòng 10 số quốc gia của biểu FTA](2026-09-13-fta-national-sublines.md) — `by_subline`, `sublines[]`
- [ADR bảng bằng chứng chung và câu trả lời dài](2026-09-13-evidence-sections-and-long-form-answers.md)

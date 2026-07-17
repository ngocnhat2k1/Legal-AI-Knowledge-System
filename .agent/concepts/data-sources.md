---
type: concept
status: active
updated: 2026-07-17
related:
  - tariff-system.md
  - hs-classification.md
  - ../project-context.md
  - ../business-rules.md
---

# Nguồn dữ liệu

Dữ liệu của Customs Assistant đến từ đâu, và — quan trọng không kém — nó **không được** đến từ đâu. Mỗi khẳng định bên dưới đều mang theo một ngày xác minh và một nguồn. Ở những chỗ nghiên cứu còn bất định hoặc tự mâu thuẫn, điều đó được giữ lại, không được làm mượt đi.

**Quy tắc chi phối duy nhất:** nguồn chân lý pháp lý luôn là **văn bản nghị định** (Nghị định / Thông tư), không bao giờ là một API, không bao giờ là một trang tổng hợp, không bao giờ là một bảng được scrape. Mọi thứ khác trên trang này là một lớp tiện lợi phủ trên văn bản đó, và mọi lớp tiện lợi ở đây đều có một cách được ghi nhận để bị sai một cách âm thầm.

---

## ⚠️ XUNG ĐỘT CHƯA GIẢI QUYẾT — API biểu thuế customs.gov.vn

Hai agent nghiên cứu điều tra cùng một cổng thông tin và đi đến các kết luận không tương thích. **Xung đột này chưa được giải quyết.** Cả hai bản tường trình đều được tái hiện; đừng thiết kế dựa trên bên nào cho đến khi Phase 0 kiểm thử cả hai.

### Quan điểm A — research 10: một API JSON hoạt động, không cần xác thực (đã xác minh bằng curl thuần)

```
POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Body (raw JSON despite the header):
{"l_class":"TIM_KIEM","l_action":"GET","l_param":"8703","l_bieu_thue":"NK_uu_dai"}
```

Hành vi đã kiểm chứng (đã xác minh 2026-07-17, nguồn: https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue):

- **Không auth, không JSESSIONID, không captcha, không kiểm tra Referer/Origin.** Captcha hiển thị trên trang tra cứu là **chỉ ở phía client** — API không thực thi nó.
- `l_param` = tiền tố HS, **tối thiểu 4 chữ số**. `"87"` trả về rỗng; `"8703"` trả về **510 dòng**. Cũng chấp nhận từ khóa mô tả tiếng Việt.
- Một dòng cho mỗi dòng HS, **một cột cho mỗi chế độ thuế**. Mẫu trực tiếp cho `87031010`:
  `NK_uu_dai 70 · ATIGA 0 · ACFTA 0 · CPTPP_NK 28 · EVFTA_NK 28.3 · RCEP_JP 38.2 · NK_TT 105`.
  Vì sao điều này quan trọng: EVFTA 28.3 khớp với bước giảm dần theo lộ trình năm 2026 và `NK_TT` = 150% × 70 (mức MFN), nên dữ liệu là **trực tiếp và cập nhật cho 2026**, không phải một hóa thạch 2019.
- `TO_JSON` mang theo `RATE o flag o flag o flag o flag` cho mỗi chế độ (cờ chú thích/hạn ngạch) cộng đơn vị (`kg/con`).

Các lệnh khám phá (tất cả đã xác minh là hoạt động):

- `{"l_class":"BT_SAC_THUE","l_action":"GET","l_param":"All"}` → 5 loại thuế: `NHAP_KHAU, XUAT_KHAU, GTGT, TTDB, BVMT`
- `{"l_class":"BT_LOAI_BIEU_THUE","l_action":"GET","l_param":"NHAP_KHAU"}` → 26 mã biểu thuế nhập khẩu:
  `NK_uu_dai, ATIGA, ACFTA, AJCEP, AKFTA, AHKFTA, AANZFTA, AIFTA, VJEPA, VKFTA, VN-EAEU, EVFTA_NK, UKVFTA_NK, VCFTA, VNL, VNCB, CPTPP_NK, CPTPP_NK_MEX, RCEP_ASEAN, RCEP_AU, RCEP_CN, RCEP_JP, RCEP_KR, RCEP_NZ, NK_TT`
- Cùng dạng cho `XUAT_KHAU` (`XK, EVFTA_XK, …`)

Trích xuất hàng loạt ≈ **1.228 lệnh POST** (một cho mỗi nhóm 4 chữ số), tức là vài giờ crawl một cách lịch sự chứ không phải một dự án parse PDF.

### Quan điểm B — research 12: không thể truy cập được; thay vào đó tìm thấy một backend bị chặn bởi captcha

(đã xác minh 2026-07-17, nguồn: https://www.customs.gov.vn/scripts/main.js)

- `/scripts/main.js` **hardcode** `http://123.30.210.236:8080/hqcustomsapi/` — một IP thô, HTTP thuần, port 8080 — bao gồm `.../hqcustomsapi/captcha/CheckCaptcha`. Vậy **ít nhất một phần của cổng thông tin CÓ bị chặn bởi captcha**.
- **IP đó bị timeout** từ môi trường nghiên cứu. Agent đã dứt khoát **từ chối khẳng định là không thể tiếp cận** — nó không thể phân biệt việc chặn theo địa lý với việc chặn egress của sandbox.
- `www.customs.gov.vn/robots.txt` trả về `User-agent: *` với **không có dòng `Disallow` nào cả** (đã xác minh 2026-07-17, nguồn: https://www.customs.gov.vn/robots.txt). Không có sitemap; `/sitemap.xml` → 404.

### Kết luận: chưa giải quyết

Đây **có lẽ là các endpoint khác nhau** — đường dẫn reverse-proxy `/bridge` (Position A) vs IP backend thô được hardcode trong JS của trang (Position B). Điều đó sẽ khiến cả hai bản tường trình đều đúng cùng lúc. Nhưng đây là một giả thuyết, không phải một sự thật đã xác minh. **Kiểm thử cả hai trong Phase 0 trước khi thiết kế dựa trên bên nào.** Đừng để một kế hoạch giả định rằng API tồn tại, và đừng để một kế hoạch giả định rằng nó không tồn tại.

### Những lưu ý đúng bất kể quan điểm nào thắng

1. **Không có tài liệu, không có phiên bản, không có SLA, không có cấp quyền ToS.** Nó có thể biến mất hoặc bắt đầu thực thi captcha ở bất kỳ lần deploy nào.
2. **Độ phủ FTA cũ** — danh sách biểu thuế **không có VIFTA và không có CEPA (UAE)**; các giá trị `THOI_GIAN_CAP_NHAT` là **2019–2020**. Hai FTA đó phải lấy từ văn bản nghị định.
3. **Chỉ có mức thuế của năm hiện tại.** Các cột phẳng cho mức thuế của hôm nay; **không có chuỗi năm về tương lai**. Mức thuế 2027 phải lấy từ các phụ lục nghị định.
4. `l_bieu_thue` dường như **bị bỏ qua** đối với truy vấn nhập khẩu — bạn luôn nhận lại tất cả các cột.
5. **Nguồn chân lý pháp lý vẫn là văn bản nghị định, không bao giờ là API.** API không có thẩm quyền pháp lý; Nghị định thì có.

---

## ⭐ congbao.chinhphu.vn (Công báo) — nguồn sơ cấp được khuyến nghị

Công báo chính thức. Thân thiện với robots, có thẩm quyền, và — thuộc tính quyết định — **được định dạng Word**.

- `robots.txt` = `User-agent: * / Allow: /`. Không Cloudflare, không cần JS; `curl` thuần trả về HTML render phía server, HTTP 200 (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/robots.txt).
- Mẫu URL: số công báo `/cong-bao/cong-bao-so-406-ngay-17-07-2026-47329.htm`; văn bản `/van-ban/thong-tu-so-33-2026-tt-bct-469965.htm` (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/).
- **Mỗi văn bản đều phơi ra cả PDF đã ký lẫn DOCX**: `congbaocdn.chinhphu.vn/..._signed.pdf` và DOCX qua `g7.cdnchinhphu.vn/api/download/stream?Url=...&file_name=...docx` (link có token).
- Các PDF có một **lớp text thực sự** — nghiên cứu 04 đã xác minh một file 70 trang / 1.07MB có `/Font` hiện diện và **13.919 toán tử hiển thị text**. **Không cần OCR** (đã xác minh 2026-07-17, nguồn: https://congbaocdn.chinhphu.vn/).
- Đây là các phiên bản `_signed`, **có thẩm quyền pháp lý**. Công báo là *ấn phẩm chính thức để ghi nhận*; vbpl là cơ sở dữ liệu. Ở nơi thẩm quyền quan trọng, Công báo là trích dẫn mạnh hơn.

**Vì sao chọn nguồn này chứ không phải các nguồn "hiển nhiên":** nghiên cứu 12 thực sự đã lắp ráp bảng từ nó. Nó đã tải **cả 14 phần `.doc`** của NĐ 26/2023 (số công báo 743+744 → 769+770) và trích xuất **11.874 mã HS 8 chữ số duy nhất** từ 14.101 ô dòng (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm):

| Annex | Content | Unique HS | With rate |
|---|---|---|---|
| Phụ lục I | Biểu thuế **xuất khẩu** | 1,520 | 1,471 (96.8%) |
| Phụ lục II | Biểu thuế **nhập khẩu ưu đãi** (MFN) | 11,874 | **11,160 (94.0%)** |
| Phụ lục III | Absolute/mixed duty (used cars) | — | 0 (USD amounts, not %) |
| Phụ lục IV | Out-of-quota TRQ rates | — | 0 (separate structure) |

Các ô phụ lục là ô bảng Word thực sự, khôi phục được sạch sẽ: `0301.11.10 | - - - Cá bột | 15`.

Các nghị định FTA có cùng hình dạng:

- **RCEP NĐ 129/2022 = 51 phần `.doc`.** Chỉ riêng một phần đã cho ra **1.591 mã HS** với **sáu cột mức thuế hằng năm là các ô riêng biệt** (`0101.21.00 | - - Loại thuần chủng để nhân giống | 0 | 0 | 0 | 0 | 0 | 0`), cộng **sáu phụ lục quốc gia** (A=ASEAN, B=Australia, C=China, D=Japan, E=Korea, F=New Zealand) và **54 ô `*`** trong số công báo đó (`*` = hàng hóa **bị loại trừ**, không phải bằng không).
- **EVFTA NĐ 116/2022 = 16 phần `.doc`.** Phụ lục II ("BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI ĐẶC BIỆT … EVFTA GIAI ĐOẠN 2022-2027"), các cột `Mã hàng | Mô tả hàng hóa | Thuế suất EVFTA (%)`, **774 mã HS** trong một phần duy nhất.

**Điểm yếu.** Được tổ chức theo *số* công báo, không theo định danh văn bản. **Không có trạng thái hiệu lực, không có metadata quan hệ** — theo thiết kế, nó là một ấn phẩm tại một thời điểm. **Hãy ghép nó với vbpl; đừng dùng nó một mình.** Không tìm thấy API hay endpoint hàng loạt. Và giới hạn cơ bản là **độ trễ công báo** — xem [Hệ thống biểu thuế](tariff-system.md).

### ⚠️ Cảnh báo về parser — khoảng trống đầu tiên mà người xây dựng phải khắc phục

Nghiên cứu 12 đã đánh dấu điều này một cách trung thực, ngược lại kết luận của chính nó. `textutil` gộp bảng EVFTA thành một dòng duy nhất, tạo ra:

```
2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9
```

Đó là **sáu mức thuế** (`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) nối liền với **không có dấu phân tách**, trong một **locale dấu phẩy thập phân**. Không thể khôi phục nếu không có heuristic — bạn không thể biết một mức thuế kết thúc ở đâu và mức tiếp theo bắt đầu ở đâu.

Agent đã **SUY DIỄN — và không thể chứng minh** (không có `soffice` / `antiword` / `python-docx` trong môi trường đó) — rằng đây là một hiện vật (artifact) của công cụ, và rằng một parser hiểu-bảng đúng đắn (LibreOffice → `.docx` → duyệt `w:tbl/w:tr/w:tc`) khắc phục nó. Bằng chứng cho suy diễn: RCEP có **cấu trúc 6 cột theo năm giống hệt và trích xuất hoàn hảo**. **Đây là khoảng trống duy nhất mà người xây dựng phải lấp trước khi tin bất cứ thứ gì ở hạ nguồn.**

**Và lý do parser quan trọng hơn vẻ ngoài của nó:** lần parse ngây thơ đầu tiên của nghiên cứu 12 báo cáo **thành công 94% và sai một cách tự tin**. `0301.11.10` phân giải thành `['0', '15']` — `0` từ Phụ lục I (xuất khẩu) và `15` từ Phụ lục II (nhập khẩu). **1.520 mã HS xuất hiện trong cả hai phụ lục; 1.329 mã có mức thuế khác nhau.** Một parser mù về phụ lục trả về mức thuế **xuất khẩu** cho một câu hỏi **nhập khẩu**, một cách âm thầm, không có lỗi, ở mức thành công biểu kiến 94%. Đó là chế độ thất bại của cả loại dự án này: không phải thiếu dữ liệu — mà là **dữ liệu sai trông có vẻ hợp lý**. Bất kỳ code nạp dữ liệu nào cũng phải **nhận biết phụ lục** và phải mang định danh phụ lục vào trong dòng.

---

## 🚫 PDF của chinhphu.vn là bản scan — KHÔNG parse chúng

NĐ 26/2023 trên `datafiles.chinhphu.vn` (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=208020):

- `26-nd.signed.pdf` — 19.0 MB, **560 trang**
- `26-nd-2.pdf` — 15.5 MB, **456 trang**

Nội bộ đã kiểm tra: chuỗi Producer **`Kodak Alaris Inc.`** (một nhà cung cấp máy scan tài liệu). Đúng **một ảnh bilevel `/CCITTFaxDecode` mỗi trang** (560 và 456 tương ứng). Ảnh trang **1666×2329 px ≈ 200 DPI đen trắng**. `26-nd-2.pdf` chứa **không có đối tượng `/Font` nào** — đúng nghĩa không có lớp text nào cả; 11 font trong file đã ký chỉ là lớp phủ dấu chữ ký.

**1.016 trang scan nén kiểu fax, ở một mức DPI dưới 300 vốn thường cần cho các bảng số liệu dày đặc với dấu thanh tiếng Việt.** RCEP NĐ 129/2022 cũng cùng câu chuyện trên chinhphu.vn — 16 PDF, trong đó 3 file được kiểm tra (`129-nd.signed.pdf` 196tr, `129-2.pdf` 152tr, `129-5.pdf` 218tr), tất cả đều là scan CCITT Kodak Alaris với không có font trong các file phụ lục.

**Hãy dùng Công báo thay thế.** Cùng các nghị định đó có sẵn ở đó dưới dạng Word. Nỗi sợ PDF-scan là có thật, nhưng chỉ với chinhphu.vn — nó không phải là thuộc tính của cả corpus.

---

## vbpl.vn — dựng lại 2026-04-23

**⚠️ Hai báo cáo nghiên cứu bất đồng ở đây, và sự dung hòa bên dưới là SUY DIỄN CỦA CHÚNG TA — không báo cáo nào nói ra điều đó.**

- **Nghiên cứu 04** đã fetch site **đã xây lại**: `robots.txt` = `Allow: /` với `Disallow: /api/` và `Disallow: /Pages/`; văn bản nằm ở `/van-ban/chi-tiet/...`, vốn được **cho phép rõ ràng**. Nó đọc bản relaunch như trạng thái hiện tại.
- **Nghiên cứu 12** đã fetch `robots.txt: Disallow: /Pages/` và kết luận **robots loại trừ chính xác corpus**, vì trên site mà nó thấy, mọi URL văn bản *đều là* `/Pages/vbpq-toanvan.aspx?ItemID=...`. Nó cũng nhận một vỏ 404 giống hệt 52.199 byte trên một ItemID được Google index, và gọi vbpl là "không scrape được một cách đáng tin cậy".
- **Cách đọc của chúng ta:** cả hai đều nhất quán nội tại và mô tả **các thế hệ site khác nhau**. `Disallow: /Pages/` là cùng một dòng trong cả hai; cái đã thay đổi là liệu corpus có nằm dưới `/Pages/` hay không. Sau lần relaunch 2026-04-23 thì không, nên cùng một chỉ thị đó nay chỉ loại trừ cây legacy đã chết.

**Sự dung hòa này hợp lý nhưng chưa được xác minh.** Nó là suy diễn của chúng ta, không phải một phát hiện. Không báo cáo nào nói "nghiên cứu 12 bị thay thế". **Hãy kiểm tra lại `vbpl.vn/robots.txt` và một lần fetch văn bản trực tiếp trước khi giai đoạn RAG phụ thuộc vào nó** — và lưu ý rằng mức độ quan trọng đối với v1 là thấp, vì v1 hoàn toàn không đụng đến vbpl. Cùng trạng thái chưa giải quyết này được ghi nhận trong [Quy tắc nghiệp vụ](../business-rules.md#xung-đột-chưa-giải-quyết), [ADR: Dùng VBHN đã công bố](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md), và [Kế hoạch khởi tạo](../planning/00-bootstrap.md). Hãy giữ chúng nhất quán.

Cổng ASP.NET legacy đã chết (đã xác minh 2026-07-17, nguồn: https://vbpl.vn/): `/TW/Pages/vbpq-toanvan.aspx?ItemID=187045` → **404**; `/Pages/portal.aspx` → **308 → https://vbpl.vn/**.

**Mọi crawler trên GitHub đều có trước lần relaunch** — `duyet/vietnamese-legal-documents-dataset` (push cuối 2026-04-10, 13 ngày trước), `mlalab/VNLegalText` (2023), `NguyenNamUET/laws_project_crawler` (2022). **Đừng bắt đầu từ bất kỳ cái nào trong số đó.**

**Mẫu URL:** `https://vbpl.vn/van-ban/chi-tiet/{slug}--{ItemID}`

- Dấu phân tách `--` là **BẮT BUỘC**. `/van-ban/chi-tiet/12898` (không slug) render "Văn bản không tồn tại" — **dù `<link rel="canonical">` quảng cáo đúng dạng không-slug đó. Đó là một bug; đừng dựa vào nó.**
- Các tab có thể deep-link: `?tabs=noi-dung|thuoc-tinh|luoc-do|van-ban-goc|tai-ve`. Đây là điểm nắm để crawl.

**⚠️ Render hoàn toàn phía client — và cái bẫy.** `curl` trả về một vỏ loading 57KB với **KHÔNG có text luật nào** (0 kết quả cho text thân, 10 kết quả cho "Đang tải"). Các chuỗi `Còn hiệu lực` có trong HTML tĩnh là **nhãn i18n, không phải dữ liệu — một cái bẫy âm thầm đầu độc một scraper ngây thơ** khiến nó ghi nhận mọi văn bản là còn hiệu lực. Render qua JS thì bạn nhận được **~32.198 ký tự** HTML sạch (Luật 109/2025/QH15), và **các bảng tồn tại dưới dạng phần tử `<table>` thực sự** — tốt hơn hẳn PDF cho RAG.

**Đường tắt Server Action:** POST tới URL trang, header `next-action: <hash riêng theo build>` (giá trị quan sát được là `0fb12b3561faa05adec51a82efb3e4f4f427f07b`), body `["187045"]`, accept `text/x-component`. **Hash riêng theo build và vỡ ở mỗi lần deploy.** Rẻ hơn ~100× so với một trình duyệt. Hình dạng khuyến nghị: dùng một trình duyệt để khám phá hash hiện tại, rồi replay hàng loạt action, có bảo vệ bằng một kiểm tra hash cũ.

**Hiệu lực là hạng nhất** — các trường JSON `effFrom`, `effTo`, `status`; các giá trị badge `Còn hiệu lực`, `Hết hiệu lực một phần`, `Hết hiệu lực toàn bộ`, `Chưa có hiệu lực`. Cộng một diff phiên bản **Lịch sử** ("Hệ thống chỉ hiển thị các nội dung thay đổi so với phiên bản trước") và **`Điều khoản được sửa đổi, bổ sung`** ở cấp điều. Với các văn bản `Hết hiệu lực một phần`, việc theo dõi sửa đổi ở cấp điều là thứ ngăn hệ thống trích dẫn văn bản đã bãi bỏ.

**Quan hệ — thuộc hàng tốt nhất: 27 quan hệ có kiểu, hai chiều**, đã xác minh render trực tiếp trên `?tabs=luoc-do` với số đếm (`Căn cứ ban hành (3)`, `Văn bản bị bãi bỏ (3)`, `Văn bản được quy định chi tiết, hướng dẫn thi hành (2)`). Enum đầy đủ được trích xuất:

`guided` / `guides` · `detailAndGuided` / `detailAndGuides` · `consolidated` / `consolidates` · `amended` / `amends` · `corrected` / `corrects` · `replaced` / `replaces` · `abrogated` / `abrogates` · `referenced` / `referencedText` · `basis` / `basedText` · `explained` / `explanatoryText` · `suspendedFromExecution` / `suspendExecution` · `suspended` / `temporarilySuspended` · `published` / `publish` · `relatedContent`

JSON của Server Action mang theo `references[]` → `{targetDocument:{id,docType,docNum,title,issueDate,effFrom,effTo,status}, referenceType:int, referenceProvisions}`.

**⚠️ Tham chiếu treo — bộ nạp đồ thị phải chịu được các cạnh bị gãy.** `referenceType` là một **số nguyên** (quan sát được các giá trị `3` và `12`) với **không khôi phục được ánh xạ int→nhãn**. Tệ hơn, đích tham chiếu có thể trỏ tới các văn bản **CHƯA CÔNG BỐ**: Luật Thuế TNCN 2007 (`id=12898`) được tham chiếu bởi 187045 với `status:"Confirm_Step2"` (không phải `"Publish"`), **vắng mặt trong sitemap**, và trang của nó trả về "Văn bản không tồn tại".

**Khả năng crawl: tốt.** `robots.txt` (đã xác minh 2026-07-17, nguồn: https://vbpl.vn/robots.txt):

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /Pages/
Sitemap: https://vbpl.vn/sitemap.xml
```

`/van-ban/` được **cho phép rõ ràng**; `/Pages/` bị chặn là cây legacy đã chết. Không Cloudflare, không trang ToS, không hạn chế bản quyền/tái sử dụng trên `/gioi-thieu` (chính lời của nó: *"dễ khai thác các thông tin và tải về sử dụng"*).

**Kích thước corpus, được liệt kê trực tiếp từ 33 file sitemap** (đã xác minh 2026-07-17, nguồn: https://vbpl.vn/sitemap.xml): Trung ương **54.480** = **43.895 tiếng Việt** + **10.585 bản dịch tiếng Anh chính thức** (`--vbpqta_{id}` — một tài sản song ngữ thực sự có giá trị); địa phương ~**104.346**; **tổng ≈ 158.826**, dải ItemID 1–187.517.

**Cơ sở pháp lý — vì sao text vbpl trích dẫn được.** Đó là **Điều 4 của Nghị định 52/2015/NĐ-CP** — *không phải* Điều 3, vốn là cái mà hầu hết các nguồn thứ cấp trích dẫn sai. Đã xác minh nguyên văn từ chính vbpl (`--67193`, status "Hết hiệu lực một phần"):

> **Điều 4. Sử dụng văn bản trên Cơ sở dữ liệu quốc gia về pháp luật** — "Văn bản trên Cơ sở dữ liệu quốc gia về pháp luật **được sử dụng chính thức** trong việc quản lý nhà nước, phổ biến pháp luật, nghiên cứu, tìm hiểu, áp dụng và thi hành pháp luật của cơ quan, tổ chức, cá nhân."

Đây là nền tảng của sự tin cậy trích dẫn: text vbpl là **được dùng chính thức**, kể cả cho nghiên cứu. **Không có gì khác trên trang này có thuộc tính đó.**

---

## ⭐ Khởi tạo từ HF — `th1nhng0/vietnamese-legal-documents`

Cập nhật 2026-04-27. Đã xác minh dựa trên **datasets-server API**, không phải các tuyên bố trong README (đã xác minh 2026-07-17, nguồn: https://huggingface.co/datasets/th1nhng0/vietnamese-legal-documents):

| config | rows | size | fields |
|---|---|---|---|
| `metadata` | **153,420** | 33 MB | gồm `ngay_co_hieu_luc`, `ngay_het_hieu_luc`, **`tinh_trang_hieu_luc`**, `co_quan_ban_hanh`, `nguoi_ky`, `linh_vuc` |
| `relationships` | **897,890** | 5.4 MB | `doc_id`, `other_doc_id`, `relationship` |
| `content` | 178,665 | 3.2 GB | `id`, `content_html` |
| `legacy` | 518,235 + 518,601 | 10.7 GB | dẫn xuất từ TVPL — **tránh: thừa hưởng các điều khoản của TVPL** |

**Sự thật hữu ích nhất:** **`id` CHÍNH LÀ vbpl ItemID, và cổng mới giữ nguyên không gian ID đó** (các `references` của nó trích dẫn `12898`, `32801`). **Vậy tập dữ liệu này join trực tiếp vào site mới.** Bạn nhận 897k cạnh quan hệ + trạng thái hiệu lực miễn phí, rồi chỉ re-fetch text hiện hành. Các dòng lấy mẫu xác nhận dữ liệu thực: `{'doc_id': 77, 'other_doc_id': '195', 'relationship': 'Văn bản hết hiệu lực'}`.

Cũng dùng được: **`tmquan/vbpl-vn`** — 158.822 văn bản chụp ngày 2026-05-23 (sau relaunch, thu hoạch từ sitemap), CC-BY-4.0. Số đếm của nó **độc lập chứng thực cho phép liệt kê sitemap ~158.826** (Δ=4), đó là lý do con số corpus ở trên đáng tin. Nhưng: **không có hiệu lực, không có quan hệ**, không có cấu trúc điều/khoản, `markdown` **null cho 11.505 văn bản**, 71% thiếu `legal_area`.

Mọi tập dữ liệu hiện có đều **cũ so với lần relaunch tháng Tư** và không cái nào mang cấu trúc cấp điều khoản mới.

---

## 🚫 KHÔNG SCRAPE — thuvienphapluat.vn

**Ba lần từ chối độc lập** (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/robots.txt):

1. **`robots.txt` nêu đích danh ClaudeBot** → `User-agent: ClaudeBot` / `Disallow: /` (cùng với GPTBot, CCBot, Google-Extended, Bytespider, Amazonbot, meta-externalagent).
2. **`Content-Signal: search=yes, ai-train=no, use=reference`**, được đóng khung là *"bảo lưu quyền một cách rõ ràng theo Điều 4 của EU Directive 2019/790"*.
3. **Cloudflare 403 nó bất kể** — "Just a moment" ở mọi lần thử (browser UA, curl UA mặc định, ClaudeBot UA).

**Vì sao đây là một sự từ chối chứ không phải một chướng ngại để đi vòng:** chúng ta là crawler mà họ nêu đích danh; `ai-train=no` bao trùm việc xây dựng một corpus huấn luyện/embedding; không có tín hiệu `ai-input` nào được cấp. Cái TVPL thêm vào so với vbpl — văn bản hợp nhất được biên tập, tóm tắt ngôn ngữ dễ hiểu, bản dịch tiếng Anh, tìm kiếm tốt hơn — là có thật, nhưng đó là **sản phẩm biên tập của họ**, chính là thứ họ đang bảo lưu. **Các luật gốc đều có trong vbpl.** Nếu dự án muốn TVPL cụ thể, **hãy mua giấy phép** — họ bán quyền truy cập API/dữ liệu.

---

## 🚫 KHÔNG SỬ DỤNG — luatvietnam.vn

Thương mại freemium. HTTP 200 với một browser UA, nhưng bị chặn bởi tường đăng nhập nặng nề (11× "Đăng nhập", "Thành viên", "Tải văn bản", các bậc VIP). `robots.txt` chặn `/VL/*` và tất cả URL tìm kiếm `?Keywords=` (đã xác minh 2026-07-17, nguồn: https://luatvietnam.vn/robots.txt).

**Phát hiện loại bỏ:** nó **phân giải theo ID số và BỎ QUA slug**. Trong quá trình nghiên cứu, URL `/thue/luat-thue-thu-nhap-ca-nhan-2007-30759-d1.html` (Luật Thuế TNCN 2007) **âm thầm 301 sang một Công văn về đất đai hoàn toàn không liên quan** tại `-30759-d6.html`. **Phân giải sai văn bản một cách âm thầm là điều loại bỏ đối với một công cụ pháp lý** — thất bại vô hình, và đầu ra trông có vẻ đúng. Dù sao cũng không có ưu điểm nào so với vbpl.

---

## 🚫 data.gov.vn không tồn tại

Các công cụ tìm kiếm tự tin mô tả `data.gov.vn` và `open.data.gov.vn` là còn sống. **Chúng không sống.** DNS có thẩm quyền trả về **NXDOMAIN** từ zone `gov.vn` (SOA `dns-master.vnnic.vn`), qua **cả 8.8.8.8 lẫn 1.1.1.1**. Các đối chứng phân giải tốt (`vbpl.vn` → 124.197.21.218, `dichvucong.gov.vn` → 14.238.3.76), **nên đây không phải là chặn theo địa lý**. `open.data.gov.vn`, `opendata.gov.vn`, `dulieuquocgia.gov.vn` cũng đều là NXDOMAIN (đã xác minh 2026-07-17, nguồn: các truy vấn DNS đối với 8.8.8.8 và 1.1.1.1).

**Không có API dữ liệu mở quốc gia nào cho văn bản pháp luật.** **NĐ 278/2025/NĐ-CP** (có hiệu lực 22/10/2025) bắt buộc kết nối/chia sẻ dữ liệu — nhưng **giữa các cơ quan qua Nền tảng chia sẻ dữ liệu, không phải dữ liệu mở công khai**. Thời hạn chuẩn hóa cho các hệ thống còn lại: 31/12/2026. **Không phải một kênh khả dụng cho dự án này.**

Lưu ý: nghiên cứu 10 gặp cùng lỗi DNS nhưng đánh dấu nó là *chưa xác minh, không phải xác nhận đã chết* (nó không thể loại trừ khả năng bị chặn theo địa lý từ mạng của nó). Nghiên cứu 04 lấp khoảng trống đó bằng các truy vấn nameserver có thẩm quyền cộng các đối chứng phân giải. **Kết luận "không tồn tại" là của nghiên cứu 04 và nó thay thế.**

---

## VNTR / Vietnam Trade Portal / VNSW / eCoSys — không có API

Thứ gần nhất với dữ liệu biện pháp phi thuế quan có cấu trúc, và là lý do dữ liệu quản lý chuyên ngành khó:

- **VNTR (`vntr.moit.gov.vn`)** — kho chính thức của MoIT, bao trùm tất cả FTA + quy tắc xuất xứ. **Không tìm thấy API công khai hay tải hàng loạt.** Chỉ dựa trên biểu mẫu. (đã xác minh 2026-07-17, nguồn: https://vntr.moit.gov.vn/)
- **Vietnam Trade Portal**, **VNSW**, **eCoSys** — **không tìm thấy API hay xuất hàng loạt trên bất kỳ cái nào.** VNSW ngoài ra còn yêu cầu một **chữ ký số** và **thất bại xác thực TLS** trong quá trình nghiên cứu.
- **ASEAN Tariff Finder** — kết nối bị timeout; không xác minh được.
- **VNACCS/VCIS** — không có luồng dữ liệu công khai; nó là một hệ thống xử lý tờ khai, không phải một nguồn dữ liệu. Yêu cầu đăng ký doanh nghiệp + chứng thư số.

---

## Lịch sự khi crawl

Nghiên cứu chỉ thực hiện **~40 yêu cầu** tới vbpl và quan sát thấy **không bị throttle** (đã xác minh 2026-07-17, nguồn: https://vbpl.vn/). **Đó không phải là bằng chứng về việc không throttle ở quy mô 158k.** Hãy tự giới hạn tốc độ; coi một cú 403/429 đột ngột là điều dự kiến, không phải ngoại lệ.

---

## Kiến thức liên quan

- [Hệ thống biểu thuế](tariff-system.md) — cấu trúc nghị định, cái bẫy phụ lục, và khoảng trống thời gian do độ trễ công báo vốn giới hạn mọi nguồn trên trang này.
- [Phân loại mã HS](hs-classification.md) — vì sao hệ danh mục là một chiều có ngày hiệu lực, không phải một hằng số.
- [Bối cảnh dự án](../project-context.md) — Customs Assistant là gì và không là gì.
- [Quy tắc nghiệp vụ](../business-rules.md) — các quy tắc con-người-quyết-định / trích-dẫn-nghị-định mà các nguồn này cung cấp dữ liệu cho.

---

## Chưa xác minh / Không được dựa vào

Tái hiện từ chính các cảnh báo trung thực của các agent nghiên cứu. **Đừng tẩy trắng bất kỳ điều nào trong số này thành một khẳng định chắc chắn.**

- **customs.gov.vn API — bản thân xung đột 10-vs-12 là CHƯA GIẢI QUYẾT.** Giải thích "các endpoint khác nhau" (proxy `/bridge` vs IP backend thô `123.30.210.236:8080`) là một **giả thuyết**, không phải một phát hiện. Kiểm thử cả hai trong Phase 0.
- **Liệu `APIBieuThue` có giới hạn tốc độ hay không** — nghiên cứu 10 không dò một cách quyết liệt.
- **Liệu `123.30.210.236:8080` có thực sự không thể tiếp cận hay không** — nghiên cứu 12 dứt khoát từ chối khẳng định điều này; nó không thể phân biệt chặn theo địa lý với chặn egress của sandbox.
- **Các route gateway của vbpl** — `https://vbpl-bientap-gateway.moj.gov.vn/api` được **tìm thấy và tiếp cận được nhưng CHƯA ĐƯỢC ÁNH XẠ**. Đó là một Spring Cloud Gateway, tiếp cận được công khai và không xác thực ở biên, nhưng mọi đường dẫn được dò đều 404, `/actuator` chỉ phơi ra `health`, và không có Swagger. Frontend gọi nó **phía server qua Next.js Server Actions**, nên các route không bao giờ xuất hiện phía client. Đáng thêm ~30 phút: một API có tài liệu sẽ xóa bỏ toàn bộ bước headless-browser.
- **Ánh xạ `referenceType` int → nhãn** — quan sát được các giá trị `3` và `12`; chúng ta có 27 nhãn nhưng **không có phép join**.
- **Liệu `provisionTree` / `referenceProvisions` có BAO GIỜ được điền hay không** — `null` trên cả hai văn bản được lấy mẫu. **Đây là câu hỏi mở có giá trị cao nhất.** Nếu được điền trên toàn site, nó là một **đồ thị pháp luật ở cấp điều khoản**, đúng là thứ mà thông cáo relaunch tháng Tư tuyên bố ("quản lý chi tiết đến từng điều, khoản, điểm... máy có thể tự động đọc, hiểu") — và nó sẽ định hình lại schema truy xuất. **Kiểm thử 10–20 văn bản gần đây trước khi thiết kế schema.**
- **Các link file `?tabs=tai-ve`** — panel không render link nào trên mẫu; JSON có các cờ `hasOriginalPdf` / `hasContent`. Có thể tùy theo từng văn bản.
- **Tổng kích thước corpus / độ phủ ngày của Công báo** — chưa được liệt kê. Không rõ.
- **Hành vi crawl ở tốc độ duy trì trên vbpl** — ~40 yêu cầu, không thấy throttle; **không phải bằng chứng về việc không có ở quy mô 158k**.
- **Bản vá parser EVFTA là SUY DIỄN, không phải đã chứng minh** — việc LibreOffice → docx → `w:tbl/w:tr/w:tc` khôi phục được các cột mức thuế bị gộp là một suy diễn từ việc cấu trúc giống hệt của RCEP parse đúng. Không có `soffice` / `python-docx` để chứng minh. **Lấp khoảng trống này trước.**
- **Xuất hàng loạt "datafiles" của Bộ Tư pháp** — đã tìm, không thấy. Chỉ là thiếu bằng chứng.

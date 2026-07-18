# TASK-004 — `provisionTree` / `referenceProvisions` của vbpl.vn: đo trên 21 văn bản

**Trạng thái: XONG (2026-07-18). Câu trả lời là MỘT PHẦN — và sắc thái này định hình schema Giai đoạn 5.**

- **Trường `provisionTree` (trong payload quan hệ): `null` trên cả 21/21 văn bản đã công bố.** Đúng như research 04 thấy.
- **`referenceProvisions`: `null` trên MỌI tham chiếu, mọi văn bản.** Tham chiếu chỉ ở **cấp văn bản**, không có liên kết cấp điều khoản.
- **NHƯNG một Server Action *khác* (research 04 không thấy) trả về một cây điều khoản đầy đủ** — Chương → Điều → Khoản → Điểm — cho **21/21** văn bản. Cấu trúc cấp điều khoản **có tồn tại và máy đọc được**; nó chỉ không nằm ở trường `provisionTree`.

> **Hệ quả cho Giai đoạn 5:** có thể dựng index RAG ở cấp điều khoản từ *cây outline + nội dung* của vbpl. **Không** thể dựa vào vbpl cho **cạnh trích dẫn cấp điều khoản** (điều X văn bản này dẫn điều Y văn bản kia) — trường đó null; đồ thị đó phải tự dựng. Xác nhận lại: quyết định [Chỉ dùng PostgreSQL cho v1](../../.agent/architecture-decisions/2026-07-17-postgres-only-for-v1.md) không bị lung lay (v1 không đụng vbpl); nhưng dữ liệu cho Giai đoạn 5 nay rõ hơn.

---

## Câu hỏi

vbpl.vn dựng lại 2026-04-23 (SPA Next.js). Thông cáo relaunch tuyên bố "quản lý chi tiết đến từng điều, khoản, điểm... máy có thể tự động đọc, hiểu". JSON của Server Action mang `references[]` → `{targetDocument, referenceType:int, referenceProvisions}` cùng một trường `provisionTree`. Research 04 lấy mẫu **2 văn bản**, cả `provisionTree` lẫn `referenceProvisions` đều `null`, nhưng **không xác minh được liệu chúng có bao giờ được điền hay không** — và gọi đây là "câu hỏi mở có giá trị cao nhất" cho Giai đoạn 5.

## Phát hiện — research 04 đúng về trường nó thấy, nhưng thiếu một action

Có (ít nhất) **ba** Next.js Server Action khác nhau trên trang chi tiết văn bản (POST tới URL trang, header `next-action: <hash>`, body `["<id>"]`, `accept: text/x-component`):

| Action hash (2026-07-18, vỡ theo build) | Trả về |
|---|---|
| `0fb12b3561faa05adec51a82efb3e4f4f427f07b` | **Payload chi tiết văn bản** — `references[]`, `provisionTree`, hiệu lực. Đây là cái research 04 xem. |
| `94635012466e8fede44782d4237c10fe75501920` | **Cây outline điều khoản** — Chương/Điều/Khoản/Điểm (`ptype` 2/5/6/7, `level` Chapter/Article/Clause/Point). Research 04 **không** thấy cái này. |
| `4a3423ce75290ef83a022333ee187acf4d38d3fb` | Một payload nhỏ khác (không chứa hai trường mục tiêu). |

- Trong payload chi tiết: `"provisionTree":null` và mọi `"referenceProvisions":null`. **Nhất quán tuyệt đối** trên 21 văn bản đã công bố, đủ mọi loại (Luật/Nghị định/Thông tư) và mọi ngày ban hành (2014 → 2026-07-15).
- `referenceType` là số nguyên; quan sát được **8 giá trị: 1, 3, 4, 7, 8, 9, 10, 12** (research 04 chỉ thấy 3 và 12). Vẫn **không** có ánh xạ int→nhãn.
- Cây outline: đầy đủ và sạch, từ 5 node (thông tư sửa đổi ngắn) đến **1.300 node** (TT 200/2014). Ngay cả văn bản cũ đã di trú (TT 200/2014, ItemID số) cũng có cây — nên tính năng **không** giới hạn ở văn bản hậu-relaunch.
- **Tham chiếu treo có thật:** văn bản control `id=12898` (Luật Thuế TNCN 2007, `status:"Confirm_Step2"`, vắng sitemap) trả về **HTTP 500 / không payload** — bộ nạp đồ thị phải chịu được cạnh trỏ tới văn bản không lấy được.

## Kết quả nghiệm thu (đã xác minh 2026-07-18)

21 văn bản đã công bố + 1 control. Cột `outline` = tổng số node (Ch/Đ/Kh/Đi).

| Văn bản | Loại | Ngày BH | provisionTree | refs (referenceProvisions) | outline |
|---|---|---|---|---|---|
| Luật TNCN 109/2025/QH15 | Luật | 2025-12-10 | null | 4 (đều null) | 203 |
| Luật Hộ tịch 03/2026/QH16 | Luật | 2026-04-23 | null | 4 (đều null) | 222 |
| Luật sđ Cơ quan đại diện 8/2026 | Luật | 2026-04-23 | null | 3 (đều null) | 15 |
| Luật sđ Trợ giúp pháp lý 05/2026 | Luật | 2026-04-23 | null | 36 (đều null) | 36 |
| NĐ 280/2026/NĐ-CP | Nghị định | 2026-07-13 | null | 0 | 346 |
| NĐ 278/2026/NĐ-CP | Nghị định | 2026-07-09 | null | 9 (đều null) | 6 |
| NĐ 275/2026/NĐ-CP | Nghị định | 2026-07-08 | null | 10 (đều null) | 995 |
| NĐ 276/2026/NĐ-CP | Nghị định | 2026-07-08 | null | 3 (đều null) | 149 |
| NĐ 272/2026/NĐ-CP | Nghị định | 2026-07-04 | null | 6 (đều null) | 132 |
| VBHN 68/2026/VBHN-NĐ-BCT | Nghị định | 2026-07-09 | null | 4 (đều null) | 75 |
| NĐ 135/2026/NĐ-CP | Nghị định | 2026-04-07 | null | 2 (đều null) | 75 |
| TT 100/2026/TT-BTC | Thông tư | 2026-07-15 | null | 17 (đều null) | 8 |
| TT 98/2026/TT-BTC | Thông tư | 2026-07-10 | null | 5 (đều null) | 12 |
| TT 29/2026/TT-BYT | Thông tư | 2026-07-06 | null | 7 (đều null) | 92 |
| TT 96/2026/TT-BTC | Thông tư | 2026-07-02 | null | 33 (đều null) | 47 |
| TT 08/2026/TT-NHNN | Thông tư | 2026-05-15 | null | 6 (đều null) | 5 |
| TT 24/2026/TT-BCT (AJCEP UAE) | Thông tư | 2026-05-05 | null | 3 (đều null) | 195 |
| TT 05/2026/TT-BTP | Thông tư | 2026-05-15 | null | 12 (đều null) | 126 |
| TT 49/2026/TT-BCA | Thông tư | 2026-05-13 | null | 2 (đều null) | 92 |
| TT 200/2014/TT-BTC | Thông tư | 2014-12-22 | null | 13 (đều null) | 1300 |
| TT 04/2026/TT-NHNN | Thông tư | 2026-03-31 | null | 0 | 110 |
| Luật TNCN 2007 (`12898`, control) | control | — | HTTP 500 | — | 500 |

**Self-check của `sample_vbpl.py`:** `provisionTree` = `{'null': 21}`; `any referenceProvisions populated? False`; `documents with a populated outline tree: 21/22` (chỉ control 12898 = 0). `stale_hash_suspected: false`.

Dữ liệu thô đầy đủ (kể cả `referenceType` từng văn bản) trong [samples.json](samples.json).

## Bonus — gateway MoJ (theo yêu cầu chủ dự án)

- Base URL client hardcode trong bundle `_next/static/chunks/3600-*.js`: một axios instance `baseURL:"https://vbpl-bientap-gateway.moj.gov.vn/api"`, timeout 600s, `ClientApiError`.
- Reachability (2026-07-18): `GET /api` → **HTTP 404** với JSON lỗi kiểu Spring (`{"timestamp":...,"path":"/api","status":404,"error":"Not Found","requestId":...}`); `GET /actuator/health` → **200 `{"status":"UP","groups":["liveness","readiness"]}`**. Gateway còn sống, không xác thực ở biên.
- **Route vẫn KHÔNG ánh xạ được từ client.** Không có literal `/api/...` nào trong 27 bundle (~4 MB JS đã quét); đường dẫn được ghép động và gọi phía server qua Server Action. Đúng như research 04 kết luận: "frontend gọi nó phía server, route không xuất hiện phía client." Chỉ xác nhận thêm được base URL + reachability tại ngày hôm nay.

## Cảnh báo cho Giai đoạn 5

- **`next-action` hash vỡ theo mỗi lần deploy.** Nếu hash cũ, response chi tiết mất marker `references`/`provisionTree` → script **dừng và báo stale**, không âm thầm báo "toàn null". Khám phá lại hash bằng headless browser (mở một văn bản, đọc header `next-action` của request POST) rồi cập nhật `DOC_DETAIL_ACTION` / `OUTLINE_ACTION`.
- **Đừng biến "provisionTree null" thành "vbpl không có cấu trúc điều khoản".** Nó CÓ, qua action outline. Hai tầng phải báo cáo riêng.
- **Cây outline chỉ là *cấu trúc* (tiêu đề điều/khoản/điểm + UUID + orderIndex), không phải *nội dung*.** Nội dung text điều khoản đến từ tab nội dung (một action/luồng khác). Ghép outline + nội dung mới ra được đơn vị RAG cấp điều khoản.
- **Tham chiếu treo:** cạnh có thể trỏ tới văn bản không lấy được (control 12898 → 500). Bộ nạp phải chịu được cạnh gãy.
- **Lịch sự:** script tự giới hạn `DELAY_SECONDS=1.5`; lần chạy này ~44 request. Coi 403/429/500 đột ngột là điều dự kiến.

## Tái hiện

```bash
cd research/task-004-vbpl-provisiontree
python3 sample_vbpl.py            # lấy mẫu danh sách dựng sẵn, ghi samples.json
python3 sample_vbpl.py 187045 <uuid> ...   # lấy mẫu id tùy chọn
```

- **Cần:** Python 3 (chỉ stdlib: `urllib`, `json`, `re`). **Không cần** trình duyệt lúc chạy, **không** thư viện ngoài.
- Mẫu URL: `https://vbpl.vn/van-ban/chi-tiet/--<id>` (dạng không-slug với `--` hoạt động cho cả ItemID số lẫn UUID). `id` = phần sau `--`: **ItemID số** (văn bản di trú) hoặc **UUID** (văn bản tạo sau relaunch 2026-04-23).
- Item ID / UUID trong danh sách mẫu lấy từ danh sách "văn bản mới" ở trang chủ vbpl.vn ngày 2026-07-18.
- Hash được khám phá bằng Playwright: mở một trang văn bản, xem các request POST tới URL trang, đọc header `next-action`.

## Liên quan

- [Văn bản pháp luật Việt Nam](../../.agent/concepts/vietnamese-legal-documents.md) — nơi ghi phát hiện chính (§6).
- [Nguồn dữ liệu](../../.agent/concepts/data-sources.md) — mục vbpl.vn, câu hỏi mở đã giải, và mục gateway.
- [Danh sách công việc](../../.agent/planning/01-task-list.md) — TASK-004.
- research task trước: [TASK-003 EVFTA parser](../task-003-evfta-parser/README.md).

# Quyết định Kiến trúc: Nguồn notebook là Google Docs trên Drive, không phải file upload

Ngày: 2026-09-10

Trạng thái: Accepted

## Bối cảnh

Kho tri thức được xuất ra 30 file markdown và nạp vào NotebookLM (nay là **Gemini Notebook**)
làm công cụ tra cứu hằng ngày. Từ 2026-09-10, khi VPS ngừng hoạt động và dự án **tạm thời**
không dùng máy chủ, notebook trở thành nơi duy nhất còn tra được văn bản.

Nói cho chính xác: notebook là **bề mặt ĐỌC**, không phải bề mặt trả lời có ràng buộc — xem
mục [Phạm vi và ranh giới](#phạm-vi-và-ranh-giới) bên dưới. Đây là trạng thái vận hành tạm
thời, không phải quyết định bỏ bot Zalo hay API tra cứu.

Điều đó nâng một bất tiện thành một vấn đề kiến trúc: **file upload thẳng từ máy không bao giờ
tự cập nhật.** Trợ giúp Google phân biệt rõ hai trạng thái của một nguồn:

> "A source is **a copy or auto-synced version** of the source document you import or upload"

Nguồn upload là *bản sao tĩnh*. Muốn cập nhật phải xoá nguồn cũ rồi thêm lại. Trong khi đó
nguồn nhập từ Google Drive:

> "Sources imported from Google Drive are auto-updated and **will sync every few minutes**.
> Changes to your original document will automatically update when you open your Notebook."

Tự động đồng bộ bật từ **2026-05-26**, áp dụng cho cả tài khoản Google cá nhân, và **không có
thiết lập tắt** ("There is no end user setting for this feature").

Chi phí của việc giữ nguyên cách upload không phải giả định. Dự án đã hai lần sửa parser rồi
phải sinh lại **toàn bộ** kho: bản vá tiêu đề bị PDF ngắt dòng, và luật `DIEU_REFERENCE`. Mỗi
lần như vậy, mọi file markdown đều đổi nội dung — tức 30 nguồn phải xoá và thêm lại bằng tay.

## Quyết định

Nội dung notebook sống trên Google Drive dưới dạng **Google Docs**, được cập nhật bằng
**rclone** (v1.69.0 trở lên) chạy từ máy trạm.

rclone cập nhật một Google Doc đã tồn tại bằng `files.update` trên **đúng `fileId` cũ**, không
xoá tạo lại — xác minh trong `backend/drive/drive.go`, hàm `baseObject.update`. *(Đừng ghim số
dòng: nó khác nhau giữa các bản phát hành. Kiểm bằng hành vi — `rclone lsjson` sau khi đẩy, so
`ID` với lần trước.)* Google xác nhận hành vi:

> "When you upload and convert media during an `update` request to a Docs, Sheets, or Slides
> file, the full contents of the document are replaced."

Giữ `fileId` là điều kiện sống còn, vì **xoá file khỏi Drive thì nguồn tương ứng bị gỡ khỏi
notebook**. Thư mục Drive trở thành hạ tầng chịu tải.

Kèm theo quyết định này là hai ràng buộc bắt buộc:

1. **Markdown phải viết trong tập con an toàn cho Google Docs.** Convert phá `<details>`,
   blockquote, code fence, và bold trong ô bảng. Xem bảng đối chiếu trong
   [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md#markdown-an-toàn-cho-google-docs).
2. **rclone phải chạy với đúng cờ.** Bốn cấu hình sai đều hỏng âm thầm — chi tiết ở cùng tài liệu.
3. **Tên file là khoá nối duy nhất** giữa file cục bộ và Google Doc. Đổi tên ⇒ rclone tạo Doc
   mới với `fileId` mới ⇒ nguồn cũ trong notebook trỏ vào Doc mồ côi, không bao giờ cập nhật
   nữa, và **không có lỗi nào báo**. Tên file là bất biến trong manifest.

## Phạm vi và ranh giới

Quyết định này nói về **cách vận chuyển nội dung**, không nói về **loại câu hỏi được phép hỏi**.

Notebook không chạy được `validateCitations`, không có bộ lọc valid-time cứng, không từ chối
theo độ cũ. Ba ADR sau **vẫn nguyên hiệu lực**, và notebook nằm ngoài phạm vi chúng cho phép
trả lời:

| ADR | Cấm gì trên notebook |
|---|---|
| [Không dùng LLM cho con số biểu thuế](2026-07-17-no-llm-on-tariff-numbers.md) | Không hỏi thuế suất, số tiền thuế |
| [HS là ứng viên, không phải đáp án](2026-07-17-hs-candidates-not-answers.md) | Không chốt mã HS |
| [LLM sinh giả thuyết, không bao giờ khẳng định](2026-08-14-llm-generates-hypotheses-never-assertions.md) | Không coi câu trả lời là khẳng định |

Thuế suất chỉ đi qua đường tra khoá chính xác `(hs_code, schedule, as_of)`. Khi hạ tầng trở lại,
đường trả lời có ràng buộc là API/bot — **không phải notebook**.

Cưỡng chế bằng code: `render_notebook.py` chèn cảnh báo cố định vào đầu **mỗi** file nguồn, và
bảng kiểm chứng có hàng riêng để chứng minh notebook thật sự từ chối con số thuế.

*Nếu sau này chủ dự án quyết định bỏ hẳn bot Zalo và API, đó phải là một ADR riêng thay thế
[ADR bot Zalo tự vận hành](2026-07-18-self-hosted-zalo-bot.md) — không được để quyết định đó
nằm lẫn trong Bối cảnh của một ADR về đồng bộ Google Docs.*

## Các phương án đã cân nhắc

- **Giữ nguyên upload `.md`, chỉ thêm file mới (append-only)**: BÁC. Giải quyết được trường hợp
  *thêm* văn bản, nhưng không giải quyết trường hợp *sửa* — mà sửa parser rồi sinh lại cả kho đã
  xảy ra hai lần và sẽ còn xảy ra. Ưu điểm thật sự của phương án này là giữ nguyên độ trung thực
  markdown (`<details>` song ngữ vẫn chạy), và đó là cái giá phải trả khi bác nó.

- **Đặt file `.md` trên Drive mà không convert sang Google Docs**: BÁC. Giữ được markdown nguyên
  vẹn, nhưng thông báo chính thức của Google chỉ nêu đích danh Docs/Sheets/Slides trong phạm vi
  tính năng đồng bộ. Đặt cả kiến trúc lên một vùng xám không có tài liệu là rủi ro không cần thiết.

- **Dùng kết nối Google Drive của trợ lý để cập nhật Doc**: KHÔNG KHẢ THI. Kết nối tạo được file
  mới nhưng `update_file` chỉ sửa được **tên và thư mục cha**, không ghi được nội dung.

- **Dùng service account để tự động hoá không cần OAuth tương tác**: BÁC. Service account không
  có Drive cá nhân; ghi vào My Drive trả 403. Quyền sở hữu cũng không chuyển được từ service
  account sang tài khoản Google cá nhân. Phải OAuth bằng chính tài khoản chủ dự án.

- **`glotlabs/gdrive` CLI**: BÁC. Cập nhật được theo `fileId` nhưng không gửi được mimeType
  đích, nên không convert sang Google Docs. README của chính nó ghi *"only the most basic
  functionality is implemented"*.

- **Tiện ích Chrome bên thứ ba làm bulk refresh**: BÁC. Extension đọc được toàn bộ nội dung
  notebook; không đánh đổi quyền đó để lấy một nút bấm.

## Hệ quả

**Được:**

- Sau khi dựng xong, cập nhật notebook là **chạy một lệnh**. Kể cả khi sửa parser và sinh lại cả
  30 file, không ai phải mở giao diện notebook.
- Trường hợp đắt nhất trước đây (sinh lại toàn kho) trở thành trường hợp rẻ nhất.

**Chi phí và rủi ro:**

- **Một lần chuyển đổi ban đầu.** 30 nguồn đang là file upload phải bị xoá và thêm lại từ Drive.
  Đây đúng là việc mà quyết định này nhằm loại bỏ — trả một lần để không phải trả nữa.
- **Mất độ trung thực markdown.** 152 khối `<details>` trong bốn file Chú giải/GRI phải chuyển
  thành heading con. Nếu không sửa, nguyên văn tiếng Anh WCO **chảy vào cuối đoạn tiếng Việt
  không còn ranh giới** — dạng hỏng âm thầm mà [ADR nạp Chú giải và
  GRI](2026-09-09-load-hs-notes-and-gri.md) tồn tại để chặn.
- **Thư mục Drive trở thành hạ tầng chịu tải.** Xoá nhầm một file là mất một nguồn trong notebook.
  Mất quyền truy cập thì nguồn thành không dùng được **nhưng vẫn tính vào hạn mức 50**.
  Phòng vệ tối thiểu: **không bao giờ dùng `rclone sync`** trên thư mục này (`sync` xoá phía
  đích — chỉ dùng `copyto`); giữ `--drive-use-trash` mặc định để file xoá nhầm còn 30 ngày trong
  Thùng rác. `.ndjson` trong git là bản gốc thật và dựng lại được — nhưng dựng lại sinh `fileId`
  mới, tức phải thêm lại nguồn bằng tay. Đó là chi phí thật của việc xoá nhầm.
- **OAuth client ở chế độ Testing hết hạn sau 7 ngày.** Nếu tự tạo OAuth client trong Google
  Cloud Console mà để publishing status = *Testing*, refresh token hết hạn sau 7 ngày và toàn bộ
  đường đẩy **chết im lặng**. Phải chuyển sang *In production*, hoặc dùng client ID mặc định của
  rclone.
- **Ngưỡng Google Docs 1,02 triệu ký tự là ngưỡng chặt nhất** trong hệ thống — chặt hơn cả giới
  hạn 500.000 từ mỗi nguồn của notebook. File lớn nhất hiện **637.676 ký tự = 62,5%**. Script
  phải cảnh báo ở mốc 800.000 ký tự, vì **tách một nguồn đã liên kết là thao tác đắt**: Doc cũ
  phải bị gỡ khỏi notebook và hai Doc mới phải thêm bằng tay — đúng việc thủ công mà ADR này tồn
  tại để loại bỏ.
- **Gộp nguồn đòi hỏi mỗi tiêu đề mang số hiệu văn bản.** Bộ hiện tại gom từ 30 xuống 15 nguồn.
  Khi nhiều văn bản nằm chung một nguồn, đoạn được truy hồi ở giữa tài liệu không mang theo tiêu
  đề H1 đầu file — nên `## Điều 5.` phải thành `## NĐ 08/2015/NĐ-CP — Điều 5.`. Đây là điều kiện
  của việc gộp, không phải tuỳ chọn.
- **Phụ thuộc một công cụ ngoài.** rclone chưa từng chạy trong dự án này. Hành vi đã xác minh tới
  mã nguồn nhưng **chưa có lần chạy end-to-end** — mốc triển khai đầu tiên phải chứng minh, không
  được giả định.

**Cần theo dõi:**

- Google có thể mở rộng phạm vi đồng bộ sang file không phải Workspace. Nếu điều đó được tài liệu
  hoá, phương án "để `.md` nguyên trên Drive" trở nên tốt hơn hẳn và ADR này nên được xem lại —
  nó sẽ trả lại độ trung thực markdown mà không mất tự động đồng bộ.

## Links

- Design: [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md)
- Trợ giúp Google: <https://support.google.com/gemininotebook/answer/16215270>
- Thông báo tự động đồng bộ (2026-05-26): <https://workspaceupdates.googleblog.com/2026/05/keep-your-sources-up-to-date-with-automatic-Drive-syncing-in-NotebookLM.html>
- Google Drive — thay thế nội dung khi update: <https://developers.google.com/workspace/drive/api/guides/manage-uploads>
- Liên quan: [Nạp Chú giải Phần/Chương và 6 quy tắc GRI](2026-09-09-load-hs-notes-and-gri.md)

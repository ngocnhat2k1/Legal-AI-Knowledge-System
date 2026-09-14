---
type: planning
status: active
updated: 2026-09-14
related:
  - 02-progress.md
  - ../docs/mona-dev-server-operations.md
  - ../architecture-decisions/2026-09-13-host-on-mona-dev-server.md
---

# Việc còn dở — triển khai lên server dev dùng chung của MONA

> **Giá trị thật** của `<MONA_DEV_HOST>` và chi tiết host nằm trong `.agent/local/mona-dev-server.md` (ngoài git — repo public). Lệnh vận hành: [runbook](../docs/mona-dev-server-operations.md).

Stack chạy từ 2026-09-13 (Task 1–7 và 11 xong; từng bước và kết quả thực thi trong git `11275bc`). Còn ba việc, đều chờ chủ dự án: Task 8 (domain + mật khẩu basic auth), Task 9 Step 5 (kiểm thử bot trong nhóm), Task 10 (`rclone.conf`).

Server dùng chung với dự án khác: chạy tuần tự, dừng ở mỗi checkpoint, chỉ đụng vào compose project `customs-assistant`.

---

### Task 8: nginx, domain, TLS, basic auth (khi có domain)

Các bước dưới dùng `bieuthue.ngocnhat.info` theo khuyến nghị. Nếu chốt domain khác, thay tên trong mọi lệnh.

- [ ] **Step 1: Chủ dự án sửa A record** `bieuthue.ngocnhat.info` → IP public của server (DNS only; IP trong `.agent/local/mona-dev-server.md`)

Run: `dig +short bieuthue.ngocnhat.info`
Expected: đúng IP public của server.

- [ ] **Step 2: Vhost HTTP tạm để lấy cert** — tạo `/opt/nginx/conf/vhosts/bieuthue.ngocnhat.info.conf`

```nginx
server {
    listen       80;
    server_name  bieuthue.ngocnhat.info;
    access_log   /opt/log/nginx/bieuthue.ngocnhat.info-access.log;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://bieuthue.ngocnhat.info$request_uri; }
}
```

Run: `/opt/nginx/sbin/nginx -t && /opt/nginx/sbin/nginx -s reload`

- [ ] **Step 3: Xin cert** (tự gia hạn và tự reload nginx)

Run: `certbot certonly --webroot -w /var/www/html -d bieuthue.ngocnhat.info --deploy-hook "/opt/nginx/sbin/nginx -s reload"`
Expected: `Successfully received certificate`.

- [ ] **Step 4: Tạo mật khẩu basic auth** (`openssl` sẽ hỏi mật khẩu)

Run: `printf 'staff:%s\n' "$(openssl passwd -apr1)" > /opt/nginx/conf/htpasswd-customs-assistant && chmod 640 /opt/nginx/conf/htpasswd-customs-assistant`

- [ ] **Step 5: Thêm khối 443 vào cùng file vhost**

```nginx
server {
    listen       443 ssl;
    server_name  bieuthue.ngocnhat.info;
    ssl_certificate      /etc/letsencrypt/live/bieuthue.ngocnhat.info/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/bieuthue.ngocnhat.info/privkey.pem;
    access_log  /opt/log/nginx/bieuthue.ngocnhat.info-access.log;
    error_log   /opt/log/nginx/bieuthue.ngocnhat.info-error.log error;
    client_max_body_size 20m;

    # The API has no auth of its own and the web UI writes lookup_confirmation.
    auth_basic           "Customs Assistant";
    auth_basic_user_file /opt/nginx/conf/htpasswd-customs-assistant;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Grounded legal answers wait on `claude -p`.
        proxy_read_timeout 300s;
        proxy_pass http://127.0.0.1:3060;
    }
}
```

Run: `/opt/nginx/sbin/nginx -t && /opt/nginx/sbin/nginx -s reload`

- [ ] **Step 6: Kiểm chứng từ máy dev**

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://bieuthue.ngocnhat.info/health`
Expected: `401` (chưa đăng nhập)

Run: `curl -s -u staff https://bieuthue.ngocnhat.info/health`
Expected: `"status":"ok"`

Run: `certbot renew --dry-run --cert-name bieuthue.ngocnhat.info`
Expected: gia hạn thử thành công.

- [ ] **Step 7: Các site khác trên server không bị ảnh hưởng**

So với file baseline mã HTTP các site khác (ngoài git — đường dẫn trong `.agent/local/mona-dev-server.md`), mỗi dòng dạng `<host> <mã HTTP>`:

```bash
BASELINE='<đường dẫn baseline trong .agent/local/mona-dev-server.md>'
while read h code; do n=$(curl -sk -o /dev/null -m 20 -w '%{http_code}' --resolve "$h:443:127.0.0.1" "https://$h/"); [ "$n" = "$code" ] && echo "same $h" || echo "CHANGED $h $code -> $n"; done < "$BASELINE"
```

Expected: tất cả `same`.

---

### Task 9 (còn lại): kiểm chứng đầu-cuối bot

Bot đã bật, đăng nhập QR và đặt `ALLOWED_THREADS` ngày 2026-09-13.

- [ ] **Step 5: Kiểm chứng đầu-cuối** trong nhóm được phép — *chưa kiểm*

Gửi lần lượt: 1 câu tra mã HS · 1 câu hỏi pháp lý · 1 ảnh hàng hoá.
Expected: cả ba được trả lời; câu pháp lý có trích dẫn điều khoản (LLM đang chạy). Nhắn từ một thread ngoài danh sách → bot im lặng.

**Checkpoint 4** — bot sống; báo chủ dự án.

---

### Task 10: Sao lưu hằng đêm lên Google Drive (bài học từ lần mất Contabo)

Dùng đúng `db/backup.sh` của repo theo bước 7 "Sao lưu đêm" trong [README](../../README.md#triển-khai-máy-chủ). **Không** tạo thêm script hay cron thứ hai.

- **Sao lưu gì:** script chỉ sao lưu hai thứ không tái tạo được từ git — bảng `lookup_confirmation` và trạng thái xác minh của `legal_document` — rồi đẩy lên `gdrive:Legal-AI-Backup/`, tức nằm **ngoài server**.
- **Không sao lưu dữ liệu chat** ([R14](../business-rules.md)).
- **Phần còn lại của DB cố ý không sao lưu.** Nếu mất server: seed lại từ git (Task 6, khoảng 20 phút theo số đo 2026-09-13, chưa tính build), crawl lại `gazette_document` (khoảng 1 giờ), và nạp lại `lookup_confirmation` từ Drive.

- [ ] **Step 1: Cài rclone và cấu hình cho root** (cron chạy bằng root; server chưa có rclone — kiểm tra ngày 2026-09-13)

```bash
# Trên server
curl -fsSL https://rclone.org/install.sh | bash   # nếu báo thiếu unzip: apt-get install -y unzip
rclone version | head -1
```

```bash
# Trên máy dev — rclone.conf chứa token Drive: không commit, không dán vào chat
scp ~/.config/rclone/rclone.conf <MONA_DEV_HOST>:/tmp/rclone.conf
ssh <MONA_DEV_HOST> 'sudo install -D -m 600 /tmp/rclone.conf /root/.config/rclone/rclone.conf && rm /tmp/rclone.conf && sudo -H rclone listremotes'
```

Expected: có dòng `gdrive:`.

- [ ] **Step 2: Chạy tay lần đầu** với đúng người dùng mà cron dùng (`sudo -H`, như README)

Run: `cd /opt/docker-projects/customs-assistant && sudo -H ./db/backup.sh`
Expected: `backup <ngày hôm nay> ok`. Nếu báo `Permission denied` thì chạy `sudo -H bash db/backup.sh`.

- [ ] **Step 3: Kiểm chứng bản sao lưu nằm trên Drive và đọc được**

Run: `sudo -H rclone ls gdrive:Legal-AI-Backup/ | tail -3`
Expected: có file `customs-backup-<ngày hôm nay>.tgz`.

Run: `sudo -H rclone cat "gdrive:Legal-AI-Backup/customs-backup-$(date +%F).tgz" | tar tzf -`
Expected: có `./lookup_confirmation.sql` và `./legal_document_verification.csv`. Vừa seed xong thì `lookup_confirmation` còn rỗng, nhưng file vẫn phải có mặt.

- [ ] **Step 4: Cron 02:00** — dùng đúng tên file của README để trên máy chỉ có **một** cron sao lưu

Run: `echo '0 2 * * * root cd /opt/docker-projects/customs-assistant && ./db/backup.sh >> /var/log/customs-backup.log 2>&1' | sudo tee /etc/cron.d/customs-backup && ls /etc/cron.d | grep -i backup`
Expected: chỉ một dòng `customs-backup`. Sáng hôm sau: `tail -3 /var/log/customs-backup.log` ra `backup … ok`.

---

## Kiến thức liên quan

- [Nhật ký tiến độ](02-progress.md) — sự kiện VPS chết ngày 2026-09-10 và danh sách dữ liệu đã mất
- [ADR bot Zalo tự host](../architecture-decisions/2026-07-18-self-hosted-zalo-bot.md)
- [Kho pháp luật tự mở rộng](../docs/legal-corpus-self-extension.md) — `gazette_document`, worker ingest
- [Bộ nhớ hội thoại bot Zalo](../docs/zalo-bot-conversation-memory.md) — bảng `conversation`
- [ADR: host trên server dev dùng chung của MONA](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md) — vì sao chọn server này, ràng buộc dùng chung, sao lưu
- [Runbook vận hành server MONA dev](../docs/mona-dev-server-operations.md) — lệnh vận hành stack sau khi deploy

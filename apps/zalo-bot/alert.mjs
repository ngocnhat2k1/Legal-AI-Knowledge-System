/**
 * Khi nào kêu về lớp mô hình, và khi nào im.
 *
 * Mô hình chạy bằng một token dài hạn của tài khoản cá nhân, và token đó đã bị thu hồi ba lần
 * trong hai tuần (22/9, 28/9, 3/10) mỗi khi tài khoản đổi mật khẩu hoặc đổi chủ. Không chỗ nào
 * trên server kêu lên: tra thuế theo mã HS vẫn chạy bình thường, nên người phát hiện đầu tiên
 * luôn là đồng nghiệp trong nhóm nhận câu "mình tạm thời chưa trả lời được".
 *
 * Quy tắc duy nhất ở đây: chỉ báo khi TRẠNG THÁI ĐỔI. Một dòng mỗi giờ sẽ bị ngó lơ trong một
 * ngày, và lúc hỏng thật thì không ai đọc nữa.
 */

/** Vì sao lớp mô hình không dùng được — theo `llmDeep` của GET /health?llm=deep. */
const BROKEN = {
  no_token: 'thiếu CLAUDE_CODE_OAUTH_TOKEN trong .env',
  no_cli: 'image không có claude CLI',
  error: 'Claude báo lỗi hoặc từ chối — hay gặp nhất là token bị thu hồi, xem log api',
  quota: 'tài khoản hết hạn mức',
  timeout: 'Claude không trả lời trong 30 giây',
};

/**
 * Tin cần gửi khi trạng thái chuyển từ `prev` sang `now`, hoặc null nếu không cần nói gì.
 *
 * `now === null` nghĩa là không gọi được /health (api đang khởi động lại, deploy, mạng trong
 * compose chớp) — đó là chuyện của api, không phải kết luận về mô hình, nên im và giữ nguyên
 * trạng thái cũ. Lần probe đầu tiên mà đã hỏng thì vẫn báo: bot vừa khởi động lại giữa một đợt
 * hỏng là đúng lúc chủ bot cần biết nhất.
 */
export function llmAlert(prev, now) {
  if (!now || now === prev) return null;
  if (now === 'up') return prev ? '✅ Bot gọi được Claude trở lại. Hỏi pháp luật dùng bình thường.' : null;
  return `⚠️ Bot KHÔNG gọi được Claude: ${BROKEN[now] ?? now}. Câu hỏi pháp luật sẽ báo lỗi; tra thuế theo mã HS vẫn chạy.`;
}

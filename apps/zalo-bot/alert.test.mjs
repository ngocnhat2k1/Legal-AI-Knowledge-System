import assert from 'node:assert/strict';
import { test } from 'node:test';

import { llmAlert } from './alert.mjs';

test('chỉ báo khi trạng thái mô hình đổi', () => {
  // Khởi động bình thường thì không nói gì — nếu không, mỗi lần deploy lại có một tin.
  assert.equal(llmAlert(undefined, 'up'), null);

  assert.match(llmAlert('up', 'error') ?? '', /KHÔNG gọi được Claude/);
  assert.equal(llmAlert('error', 'error'), null, 'vẫn hỏng thì im, đã báo một lần rồi');
  assert.match(llmAlert('error', 'up') ?? '', /trở lại/);

  // Không gọi được /health: chuyện của api lúc deploy, không kết luận thay cho mô hình.
  assert.equal(llmAlert('up', null), null);

  // Bot khởi động lại giữa một đợt hỏng vẫn phải báo, kèm lý do.
  assert.match(llmAlert(undefined, 'no_token') ?? '', /CLAUDE_CODE_OAUTH_TOKEN/);
});

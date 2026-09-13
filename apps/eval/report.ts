import type { HsMetrics } from './hs';
import type { LegalMetrics } from './legal';
import type { NotebookMetrics } from './notebook';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * One screen a person can read, then the misses. The misses are the useful part —
 * a percentage tells you the system moved, only the miss list tells you which way to
 * push it next.
 */
export function renderReport(legal: LegalMetrics, hs: HsMetrics, notebook: NotebookMetrics): string {
  const lines = [
    '',
    '  PHÁP LUẬT',
    `    recall@${legal.k} trên điều mong đợi      ${pct(legal.recallAtK)}   (${legal.cases} câu)`,
    `    từ chối đúng khi ngoài kho          ${legal.abstainCorrect}/${legal.abstainTotal}`,
    `    trả lời có trích dẫn hợp lệ         ${pct(legal.citationsValid)}`,
    '',
    '  MÃ HS  (chấm ở nhóm 4 số, đường tra tất định)',
    `    top-1                               ${pct(hs.top1)}   (${hs.cases} tờ khai)`,
    `    top-3                               ${pct(hs.top3)}`,
    `    không ra ứng viên nào               ${hs.empty}/${hs.cases}`,
    '',
    '  NOTEBOOK  (14 câu, chấm theo mustSay/mustNotSay/expect)',
    `    đạt                                 ${notebook.passed}/${notebook.cases}`,
    `    nhóm an toàn đạt                    ${notebook.safetyPassed}/${notebook.safetyTotal}`,
    `    chưa chấm (không kiểm nào chạy)     ${notebook.unscored}`,
    `    kiểm bị bỏ qua (response không mang trường cần chấm)   ${notebook.skippedChecks}`,
    '',
  ];

  const misses = [...legal.misses, ...hs.misses, ...notebook.misses];
  if (misses.length) {
    lines.push(`  TRƯỢT (${misses.length})`, ...misses.map((m) => `    ${m}`), '');
  }
  // Not a miss and not a pass: listed on their own so neither count hides them.
  if (notebook.unscoredCases.length) {
    lines.push(`  CHƯA CHẤM (${notebook.unscoredCases.length})`, ...notebook.unscoredCases.map((u) => `    chưa chấm: ${u}`), '');
  }
  return lines.join('\n');
}

/**
 * Extract the as-of date from a legal question. Valid-time is a HARD FILTER on
 * retrieval (~62% of the VN corpus is dead/partly-dead law), so a question about
 * "năm 2019" must be answered from the law as it stood then — never the latest
 * version (the newness-bias failure mode). Returns null when the query names no
 * date; the caller falls back to today.
 */

const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DMY = /\bng(?:à|a)y\s+(\d{1,2})\s+th(?:á|a)ng\s+(\d{1,2})\s+n(?:ă|a)m\s+(\d{4})\b/i;
const SLASH = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const YEAR = /\bn(?:ă|a)m\s+(\d{4})\b/i;

const pad = (n: string | number): string => String(n).padStart(2, '0');

/** Return YYYY-MM-DD if the query names a date/year, else null. */
export function extractAsOf(query: string): string | null {
  const iso = ISO.exec(query);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = DMY.exec(query);
  if (dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;

  const slash = SLASH.exec(query);
  if (slash) return `${slash[3]}-${pad(slash[2])}-${pad(slash[1])}`;

  // "năm 2019" → the state of the law at the END of that year.
  const year = YEAR.exec(query);
  if (year) return `${year[1]}-12-31`;

  return null;
}

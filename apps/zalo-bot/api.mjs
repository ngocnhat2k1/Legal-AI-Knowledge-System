/**
 * Thin client for the internal API (compose network, no auth — same trust boundary
 * as the web UI). Every function here fails SOFT: the bot must answer something
 * useful even when a sidecar is down, and a thrown error inside the message listener
 * turns into "Xin lỗi, có lỗi khi tra cứu", which tells the user nothing.
 */
const API = process.env.API_URL || 'http://api:3000';

async function getJson(path, timeoutMs) {
  try {
    const res = await fetch(`${API}${path}`, { signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function postJson(path, body, timeoutMs) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    return res.ok ? await res.json().catch(() => ({})) : null;
  } catch {
    return null;
  }
}

// --- Tariff -----------------------------------------------------------------

/** Raw fetch, because callers distinguish 404 (no such rate) from other failures. */
export function tariffResponse(hs, origin, date) {
  const code = String(hs).replace(/\./g, '');
  return fetch(`${API}/tariff?hs=${code}&date=${date}${origin ? `&origin=${origin}` : ''}`);
}

export async function lookupFull(hsDotted, origin, date) {
  try {
    const res = await tariffResponse(hsDotted, origin, date);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const searchGoods = async (kw) => (await getJson(`/tariff/search?q=${encodeURIComponent(kw)}`)) ?? [];
export const searchByPrefix = async (prefix) => (await getJson(`/tariff/search?prefix=${encodeURIComponent(prefix)}`)) ?? [];

export function confirmations(hs, origin) {
  const qs = new URLSearchParams({ hs: String(hs).replace(/\./g, '') });
  if (origin) qs.set('origin', origin);
  return getJson(`/tariff/confirmations?${qs}`);
}

/** HS codes a human already confirmed correct for a product matching these keywords. */
export async function confirmationsMatch(keywords) {
  const q = (keywords || []).filter((k) => k && k.length >= 2).slice(0, 8).join(',');
  if (!q) return [];
  return (await getJson(`/tariff/confirmations/match?q=${encodeURIComponent(q)}`)) ?? [];
}

export const postConfirm = (payload) => postJson('/tariff/confirm', payload).then((r) => r !== null);

// --- Answer path (plan 08) --------------------------------------------------

/** POST /answer (plan 08 §2.4). The API stops at `deadlineAt` (ANSWER_BUDGET_MS after the message); 5 s more leaves its reply room to arrive. */
export const answer = (body, timeoutMs = 155_000) => postJson('/answer', body, timeoutMs);

// --- Legal ------------------------------------------------------------------

export function legalProvision(doc, article, clause) {
  const qs = new URLSearchParams({ doc, article: String(article) });
  if (clause) qs.set('clause', String(clause));
  return getJson(`/legal/provision?${qs}`);
}

// --- Conversation memory ----------------------------------------------------

export async function loadConversation(threadId, userId, limit = 8) {
  const qs = new URLSearchParams({ threadId: String(threadId), userId: String(userId), limit: String(limit) });
  const view = await getJson(`/conversation?${qs}`);
  return view ?? { topic: null, state: {}, turns: [], idleSeconds: Number.POSITIVE_INFINITY, staffName: null };
}

export const recordTurns = (payload) => postJson('/conversation/turn', payload);

/** The question a quoted bot reply answered, anyone's in the thread: `{ question, staffName }` or null. `ts`: the quoted message's. */
export function quotedQuestion(threadId, text, ts) {
  const qs = new URLSearchParams({ threadId: String(threadId), text: String(text).replace(/\s+/g, ' ').trim().slice(0, 200) });
  if (Number(ts) > 0) qs.set('ts', String(ts));
  return getJson(`/conversation/quoted?${qs}`, 3_000);
}

// --- On-request corpus growth ----------------------------------------------

export const requestIngest = (payload) => postJson('/ingest/request', payload);
export const ingestReports = async () => (await getJson('/ingest/reports')) ?? [];
export const ackIngestReports = (ids) => postJson('/ingest/reports/ack', { ids });
export const verifyDocument = (number, staffName) => postJson('/ingest/verify', { number, staffName });

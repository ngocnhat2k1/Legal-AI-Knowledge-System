/**
 * Thin client for the internal API (compose network, no auth — same trust boundary
 * as the web UI). Every function here fails SOFT: the bot must answer something
 * useful even when a sidecar is down, and a thrown error inside the message listener
 * turns into "Xin lỗi, có lỗi khi tra cứu", which tells the user nothing.
 */
const API = process.env.API_URL || 'http://api:3000';

async function getJson(path) {
  try {
    const res = await fetch(`${API}${path}`);
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

/** POST /answer (plan 08 §2.4). The API stops at 120 s after the message; 125 s leaves its last reply room to arrive. */
export const answer = (body) => postJson('/answer', body, 125_000);

// --- Legal ------------------------------------------------------------------

export function legalAnswer(query, { asOf, doc, article } = {}) {
  const qs = new URLSearchParams({ q: query });
  if (asOf) qs.set('asOf', asOf);
  if (doc) qs.set('doc', doc);
  if (article) qs.set('article', article);
  return getJson(`/legal?${qs}`);
}

export function legalProvision(doc, article, clause) {
  const qs = new URLSearchParams({ doc, article: String(article) });
  if (clause) qs.set('clause', String(clause));
  return getJson(`/legal/provision?${qs}`);
}

/**
 * The corpus manifest, cached. The router prompt carries it (so the model does not
 * promise a document we do not hold) and the legal path checks against it (so the
 * bot can say "we don't carry that Thông tư" instead of answering from another one).
 */
let manifest = { docs: [], at: 0 };
const MANIFEST_TTL = 60 * 60 * 1000;

export async function legalDocuments() {
  if (manifest.docs.length && Date.now() - manifest.at < MANIFEST_TTL) return manifest.docs;
  const docs = await getJson('/legal/documents');
  if (Array.isArray(docs) && docs.length) manifest = { docs, at: Date.now() };
  return manifest.docs;
}

// --- Conversation memory ----------------------------------------------------

export async function loadConversation(threadId, userId, limit = 8) {
  const qs = new URLSearchParams({ threadId: String(threadId), userId: String(userId), limit: String(limit) });
  const view = await getJson(`/conversation?${qs}`);
  return view ?? { topic: null, state: {}, turns: [], idleSeconds: Number.POSITIVE_INFINITY, staffName: null };
}

export const recordTurns = (payload) => postJson('/conversation/turn', payload);

// --- On-request corpus growth ----------------------------------------------

export const requestIngest = (payload) => postJson('/ingest/request', payload);
export const ingestReports = async () => (await getJson('/ingest/reports')) ?? [];
export const ackIngestReports = (ids) => postJson('/ingest/reports/ack', { ids });
export const verifyDocument = (number, staffName) => postJson('/ingest/verify', { number, staffName });

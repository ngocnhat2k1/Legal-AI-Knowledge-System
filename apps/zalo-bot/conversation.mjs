/**
 * Conversation memory as the bot sees it: load what we were talking about, decide
 * what is still referable, write back what this turn changed.
 *
 * Storage lives in Postgres (apps/api/src/modules/conversation) so a bot redeploy
 * does not amputate every in-flight conversation. This module owns the MEANING —
 * what counts as "still fresh", what the next turn is allowed to point at.
 */
import { loadConversation, recordTurns } from './api.mjs';

/**
 * How long a tariff result stays referable. A verdict ("đúng"/"sai") or a correction
 * is written to a permanent audit trail against a specific HS code, so pointing at a
 * result the user has half-forgotten would poison it. Was 30 minutes when memory was
 * in RAM; 2 hours now that a redeploy no longer resets the clock.
 */
export const TARIFF_TTL_MS = 2 * 60 * 60 * 1000;

/** Read the conversation and work out what the new message may refer to. */
export async function loadContext(threadId, userId) {
  const view = await loadConversation(threadId, userId);
  const tariff = view.state?.tariff ?? null;
  const at = tariff?.at ? Date.parse(tariff.at) : NaN;
  const fresh = Number.isFinite(at) && Date.now() - at <= TARIFF_TTL_MS;
  const tariffFresh = Boolean(tariff?.hs) && fresh;
  // The headings of a composed hs reply (plan 08 §6.1): no code on the table to confirm, but "HS đúng là …" may record one
  // for the goods described, so the correction keeps `desc` for its note.
  const candidatesFresh = !tariff?.hs && Boolean(tariff?.candidates?.length) && fresh;
  return {
    topic: view.topic ?? null,
    state: view.state ?? {},
    turns: view.turns ?? [],
    tariffFresh,
    candidatesFresh,
    tariff: tariffFresh || candidatesFresh ? tariff : null,
    legal: view.state?.legal ?? null,
  };
}

/** Stamp a tariff result with the time it was produced, so freshness is about IT, not the chat. */
export const stampTariff = (lookup) => (lookup ? { ...lookup, at: new Date().toISOString() } : null);

/** The state a reply leaves: `tariff`/`legal`/`answer` absent from the result = keep that memory, null = clear it. */
export function nextState(state, result) {
  const next = { ...(state || {}) };
  for (const k of ['tariff', 'legal', 'answer']) if (k in result) next[k] = result[k];
  return next;
}

/**
 * Persist the exchange. `topic`/`state` follow the API's convention: leave a field out
 * to keep it, pass null to clear it — "I answered, but nothing here is referable next
 * turn" is a real outcome and has to be expressible.
 */
export function saveContext({ threadId, userId, staffName, userText, botText, intent, topic, state }) {
  const turns = [];
  if (userText?.trim()) turns.push({ role: 'user', body: userText, intent });
  if (botText?.trim()) turns.push({ role: 'bot', body: botText, intent });
  if (!turns.length) return Promise.resolve(null);
  const payload = { channel: 'zalo', threadId: String(threadId), userId: String(userId), staffName, turns };
  if (topic !== undefined) payload.topic = topic;
  if (state !== undefined) payload.state = state;
  return recordTurns(payload);
}

/**
 * Wire shapes for chat conversation memory (Phase 6).
 *
 * The bot owns the MEANING of `state`; the API owns its persistence. Hence the
 * loose `ConversationState` shape: adding a new referent to remember (say, the
 * last legal document discussed) must not require a migration or an API change.
 * The two things the API does interpret are `topic` — because it is a queryable
 * column and the whole point of the feature — and the turn log.
 */

export type ConversationTopic = 'tariff' | 'legal' | 'general';
export type TurnRole = 'user' | 'bot';

/** What the last tariff answer was about, so "đúng"/"sai"/"còn từ Nhật" resolve. */
export interface TariffMemory {
  hs: string;
  dotted: string;
  origin?: string | null;
  date: string;
  snapshot?: unknown;
  desc?: string;
  keywords?: string[];
}

/** What the last legal answer was about, so "khoản 3 của điều đó" resolves. */
export interface LegalMemory {
  query: string;
  asOf?: string | null;
  docNumbers?: string[];
  citations?: Array<{ documentNumber: string; provisionLabel: string }>;
  /** A document number the user asked for that the corpus does not have. */
  missingDoc?: string | null;
}

export interface ConversationState {
  tariff?: TariffMemory | null;
  legal?: LegalMemory | null;
}

export interface ConversationTurnView {
  role: TurnRole;
  body: string;
  intent: string | null;
  at: string;
}

export interface ConversationView {
  topic: ConversationTopic | null;
  state: ConversationState;
  /** Oldest → newest, so it reads as a transcript. */
  turns: ConversationTurnView[];
  /** Seconds since the last activity — the caller decides what counts as stale. */
  idleSeconds: number;
  staffName: string | null;
}

export interface RecordTurnsInput {
  channel?: string;
  threadId: string;
  userId: string;
  staffName?: string | null;
  turns: Array<{ role: TurnRole; body: string; intent?: string | null }>;
  /** Omit to leave unchanged; `null` to clear. */
  topic?: ConversationTopic | null;
  /** Omit to leave unchanged; `null` to clear. */
  state?: ConversationState | null;
}

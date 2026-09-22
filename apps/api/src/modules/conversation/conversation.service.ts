import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import type {
  ConversationState,
  ConversationTopic,
  ConversationTurnView,
  ConversationView,
  RecordTurnsInput,
} from './conversation.types';

const TOPICS = ['tariff', 'legal', 'general'] as const;
const ROLES = ['user', 'bot'] as const;

/** How many turns a conversation keeps. Enough for the router to see the thread of it. */
const MAX_TURNS = 20;
/** Default number of turns handed back to the router (it pays per token). */
const DEFAULT_TURNS = 8;
/** Longest single turn stored. Long enough for a full bot answer, short enough to bound the table. */
const MAX_BODY = 4000;

/**
 * Chat retention. Staff paste customer names, phone numbers and shipment refs into
 * chat, so this is a privacy requirement, not housekeeping — see .agent/business-rules.md.
 * A conversation idle this long is deleted whole (its turns cascade).
 */
const RETENTION_DAYS = 30;
/** questionFor matches a quote this long at most: a prefix is enough to find the reply, and bounds the query string. */
const MAX_QUOTE_MATCH = 200;
const MIN_QUOTE_MATCH = 20;
/** The idle-conversation sweep is throttled to this interval — it is a background chore. */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface ConversationRow {
  id: number;
  topic: ConversationTopic | null;
  state: ConversationState | null;
  staff_name: string | null;
  idle_seconds: number;
}

/**
 * Persists what a person and the bot have been talking about, per (channel, thread,
 * person). Two jobs, and the second is the reason the feature exists:
 *
 *   1. the TURN LOG — the transcript the intent router reads, so a follow-up
 *      ("không phải cái đó") is classified against the conversation instead of
 *      against one orphaned sentence.
 *   2. the TOPIC + STATE — what the pronouns point at. Follow-up cues are ambiguous
 *      ACROSS topics: "không phải" after a tariff answer means "wrong HS code", the
 *      same words after a legal answer mean "wrong document". Without a topic the
 *      bot answered a legal complaint by recording an HS-code correction.
 *
 * Scope note: memory is per PERSON inside a thread, not per group. Two people in one
 * Zalo group hold separate conversations; cross-person context still arrives the way
 * it always did, through the quoted message — and a quoted BOT reply through
 * `questionFor`, since the reply rarely restates the colleague's question.
 */
@Injectable()
export class ConversationService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  private lastSweepAt = 0;

  /** Read the conversation. Returns an empty view (no row created) when there is none. */
  async get(
    channelRaw: string | undefined,
    threadIdRaw: string,
    userIdRaw: string,
    limitRaw?: number,
  ): Promise<ConversationView> {
    const key = this.key(channelRaw, threadIdRaw, userIdRaw);
    const limit = Math.min(Math.max(Number(limitRaw) || DEFAULT_TURNS, 1), MAX_TURNS);

    const rows = (await this.db.execute(sql`
      SELECT id, topic, state, staff_name,
             EXTRACT(EPOCH FROM (now() - last_active_at))::int AS idle_seconds
      FROM conversation
      WHERE channel = ${key.channel} AND thread_id = ${key.threadId} AND user_id = ${key.userId}
    `)) as unknown as ConversationRow[];

    const row = rows[0];
    if (!row) return { topic: null, state: {}, turns: [], idleSeconds: Number.POSITIVE_INFINITY, staffName: null };

    // Newest-first in SQL (that is what the index serves), reversed to chronological
    // here — the router reads it as a transcript, and a transcript runs forwards.
    const turns = (await this.db.execute(sql`
      SELECT role, body, intent, created_at::text AS at
      FROM conversation_turn
      WHERE conversation_id = ${row.id}
      ORDER BY id DESC
      LIMIT ${limit}
    `)) as unknown as ConversationTurnView[];

    return {
      topic: row.topic,
      state: row.state ?? {},
      turns: turns.reverse(),
      idleSeconds: row.idle_seconds,
      staffName: row.staff_name,
    };
  }

  /**
   * Append turns and patch topic/state in one round trip (the bot writes the user
   * turn and its own reply together). `topic`/`state` left absent are unchanged;
   * passing an explicit `null` clears them — that difference is how the bot says
   * "I answered, but nothing here is referable next turn".
   */
  async record(input: RecordTurnsInput): Promise<{ conversationId: number; turns: number }> {
    const key = this.key(input.channel, input.threadId, input.userId);
    const turns = (input.turns ?? [])
      .filter((t) => t && ROLES.includes(t.role) && String(t.body ?? '').trim())
      .map((t) => ({
        role: t.role,
        body: String(t.body).trim().slice(0, MAX_BODY),
        intent: t.intent ? String(t.intent).trim().slice(0, 16) : null,
      }));
    if (!turns.length) throw new BadRequestException('turns must contain at least one non-empty turn');

    if (input.topic !== undefined && input.topic !== null && !TOPICS.includes(input.topic)) {
      throw new BadRequestException(`topic must be one of ${TOPICS.join(', ')}`);
    }
    const staffName = input.staffName?.trim().slice(0, 64) || null;

    // COALESCE keeps an absent field unchanged; an explicit null is passed as the SQL
    // literal NULL by the branches below, which is what clears it.
    const topicPatch =
      input.topic === undefined ? sql`topic = conversation.topic` : sql`topic = ${input.topic}`;
    const statePatch =
      input.state === undefined
        ? sql`state = conversation.state`
        : input.state === null
          ? sql`state = NULL`
          : sql`state = ${JSON.stringify(input.state)}::jsonb`;

    const rows = (await this.db.execute(sql`
      INSERT INTO conversation (channel, thread_id, user_id, staff_name, topic, state, last_active_at)
      VALUES (${key.channel}, ${key.threadId}, ${key.userId}, ${staffName},
              ${input.topic ?? null}, ${input.state ? sql`${JSON.stringify(input.state)}::jsonb` : null}, now())
      ON CONFLICT (channel, thread_id, user_id) DO UPDATE
        SET ${topicPatch}, ${statePatch},
            staff_name = COALESCE(${staffName}, conversation.staff_name),
            last_active_at = now()
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    const conversationId = rows[0]!.id;

    for (const t of turns) {
      await this.db.execute(sql`
        INSERT INTO conversation_turn (conversation_id, role, body, intent)
        VALUES (${conversationId}, ${t.role}, ${t.body}, ${t.intent})
      `);
    }

    // Trim to the window on every write: bounded table, bounded exposure.
    await this.db.execute(sql`
      DELETE FROM conversation_turn
      WHERE conversation_id = ${conversationId}
        AND id NOT IN (
          SELECT id FROM conversation_turn WHERE conversation_id = ${conversationId}
          ORDER BY id DESC LIMIT ${MAX_TURNS}
        )
    `);
    await this.sweepIdle();

    return { conversationId, turns: turns.length };
  }

  /**
   * The question a bot reply in this thread answered, whoever asked it: a quote of the bot's reply carries only the reply,
   * and in a group the question is often a colleague's, outside the replier's own memory (2026-09-22: "trả lời lại đi" on
   * the bot's error under Chi's question answered the replier's older one). Matched on the quoted text, whitespace folded.
   * The bot's error and fallback lines read the same for everyone, so `tsRaw` — when the quoted message was sent, ms (or
   * seconds) since the epoch — picks the reply saved closest to it; without it, the newest.
   */
  async questionFor(
    channelRaw: string | undefined,
    threadIdRaw: string,
    textRaw: string,
    tsRaw?: number,
  ): Promise<{ question: string; staffName: string | null } | null> {
    // No user in the key: the question may be anyone's in the thread.
    const { channel, threadId } = this.key(channelRaw, threadIdRaw, '-');
    const needle = String(textRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_MATCH);
    // A short quote ("ok", "Dạ") sits inside any reply: no match beats the wrong question.
    if (needle.length < MIN_QUOTE_MATCH) return null;
    const ts = Number(tsRaw);
    const at = Number.isFinite(ts) && ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : null;
    const rows = (await this.db.execute(sql`
      SELECT u.body AS question, c.staff_name
      FROM conversation_turn b
      JOIN conversation c ON c.id = b.conversation_id
      JOIN LATERAL (
        SELECT body FROM conversation_turn
        WHERE conversation_id = b.conversation_id AND role = 'user' AND id < b.id
        ORDER BY id DESC LIMIT 1
      ) u ON true
      WHERE c.channel = ${channel} AND c.thread_id = ${threadId} AND b.role = 'bot'
        AND strpos(regexp_replace(b.body, '\\s+', ' ', 'g'), ${needle}) > 0
      ORDER BY ${at === null ? sql`b.id DESC` : sql`abs(extract(epoch FROM b.created_at) * 1000 - ${at}), b.id DESC`}
      LIMIT 1
    `)) as unknown as Array<{ question: string; staff_name: string | null }>;
    const row = rows[0];
    return row ? { question: row.question, staffName: row.staff_name } : null;
  }

  /** Drop conversations nobody has touched inside the retention window. Throttled. */
  private async sweepIdle(): Promise<void> {
    if (Date.now() - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = Date.now();
    await this.db.execute(sql`
      DELETE FROM conversation
      WHERE last_active_at < now() - ${`${RETENTION_DAYS} days`}::interval
    `);
  }

  private key(channelRaw: string | undefined, threadIdRaw: string, userIdRaw: string) {
    const channel = (channelRaw ?? 'zalo').trim().slice(0, 16) || 'zalo';
    const threadId = (threadIdRaw ?? '').trim().slice(0, 64);
    const userId = (userIdRaw ?? '').trim().slice(0, 64);
    if (!threadId || !userId) throw new BadRequestException('threadId and userId are required');
    return { channel, threadId, userId };
  }
}

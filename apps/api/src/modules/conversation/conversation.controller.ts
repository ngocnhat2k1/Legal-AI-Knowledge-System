import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { ConversationService } from './conversation.service';
import type { ConversationView, RecordTurnsInput } from './conversation.types';

/**
 * GET  /conversation?channel=&threadId=&userId=&limit=  — topic, referable state, recent turns
 * GET  /conversation/quoted?threadId=&text=&ts=          — the question a quoted bot reply answered
 * POST /conversation/turn                                — append turns + patch topic/state
 *
 * Internal surface: the Zalo bot calls it over the compose network. Not exposed to
 * the web UI, and not authenticated — same trust boundary as /tariff/confirm.
 */
@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Get()
  get(
    @Query('threadId') threadId: string,
    @Query('userId') userId: string,
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
  ): Promise<ConversationView> {
    return this.conversations.get(channel, threadId, userId, limit ? Number(limit) : undefined);
  }

  /** GET /conversation/quoted?threadId=&text=&ts= — the question the quoted bot reply answered, anyone's in the thread. */
  @Get('quoted')
  quoted(
    @Query('threadId') threadId: string,
    @Query('text') text: string,
    @Query('ts') ts?: string,
    @Query('channel') channel?: string,
  ): Promise<{ question: string; staffName: string | null } | null> {
    return this.conversations.questionFor(channel, threadId, text, ts ? Number(ts) : undefined);
  }

  @Post('turn')
  record(@Body() body: RecordTurnsInput): Promise<{ conversationId: number; turns: number }> {
    return this.conversations.record(body);
  }
}

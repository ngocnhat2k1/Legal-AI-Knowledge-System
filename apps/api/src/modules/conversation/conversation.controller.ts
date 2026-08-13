import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';

import { ConversationService } from './conversation.service';
import type { ConversationView, RecordTurnsInput } from './conversation.types';

/**
 * GET    /conversation?channel=&threadId=&userId=&limit=  — topic, referable state, recent turns
 * POST   /conversation/turn                                — append turns + patch topic/state
 * DELETE /conversation?channel=&threadId=&userId=          — forget this conversation
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

  @Post('turn')
  record(@Body() body: RecordTurnsInput): Promise<{ conversationId: number; turns: number }> {
    return this.conversations.record(body);
  }

  @Delete()
  clear(
    @Query('threadId') threadId: string,
    @Query('userId') userId: string,
    @Query('channel') channel?: string,
  ): Promise<{ cleared: boolean }> {
    return this.conversations.clear(channel, threadId, userId);
  }
}

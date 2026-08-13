import { Module } from '@nestjs/common';

import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

/**
 * Chat conversation memory (Phase 6). Storage only — it holds no opinion about what
 * a conversation MEANS; the bot owns that. Uses the global DatabaseModule connection,
 * adds no new stateful service (postgres-only ADR).
 */
@Module({
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}

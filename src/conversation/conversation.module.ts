import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}

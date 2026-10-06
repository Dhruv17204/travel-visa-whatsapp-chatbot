import { Module, forwardRef } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller.js';
import { MetaService } from './meta.service.js';
import { ConversationModule } from '../conversation/conversation.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';

@Module({
  imports: [ConversationModule, forwardRef(() => DocumentsModule), forwardRef(() => AppointmentsModule)],
  controllers: [WhatsappController],
  providers: [MetaService],
  exports: [MetaService],
})
export class WhatsappModule {}

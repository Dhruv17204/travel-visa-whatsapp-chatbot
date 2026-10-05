import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller.js';
import { MetaService } from './meta.service.js';

@Module({
  controllers: [WhatsappController],
  providers: [MetaService],
  exports: [MetaService],
})
export class WhatsappModule {}

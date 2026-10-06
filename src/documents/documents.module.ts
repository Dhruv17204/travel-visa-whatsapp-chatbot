import { Module, forwardRef } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WhatsappModule } from '../whatsapp/whatsapp.module.js';
import { DriveModule } from '../drive/drive.module.js';
import { SheetsModule } from '../sheets/sheets.module.js';
import { SlackModule } from '../slack/slack.module.js';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappModule), DriveModule, SheetsModule, SlackModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

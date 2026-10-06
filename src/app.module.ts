import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { WhatsappModule } from './whatsapp/whatsapp.module.js';
import { QueueModule } from './queue/queue.module.js';
import { ConversationModule } from './conversation/conversation.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { DriveModule } from './drive/drive.module.js';
import { SheetsModule } from './sheets/sheets.module.js';
import { SlackModule } from './slack/slack.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { CalendarModule } from './calendar/calendar.module.js';

@Module({
  imports: [
    PrismaModule,
    WhatsappModule,
    QueueModule,
    ConversationModule,
    DocumentsModule,
    DriveModule,
    SheetsModule,
    SlackModule,
    AppointmentsModule,
    CalendarModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

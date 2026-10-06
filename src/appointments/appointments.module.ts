import { Module, forwardRef } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { SheetsModule } from '../sheets/sheets.module.js';
import { SlackModule } from '../slack/slack.module.js';
import { WhatsappModule } from '../whatsapp/whatsapp.module.js';

@Module({
  imports: [PrismaModule, CalendarModule, SheetsModule, SlackModule, forwardRef(() => WhatsappModule)],
  providers: [AppointmentsService],
  exports: [AppointmentsService]
})
export class AppointmentsModule {}

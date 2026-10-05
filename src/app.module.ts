import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { WhatsappModule } from './whatsapp/whatsapp.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [
    PrismaModule,
    WhatsappModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

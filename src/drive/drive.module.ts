import { Module } from '@nestjs/common';
import { DriveService } from './drive.service.js';

@Module({
  providers: [DriveService],
  exports: [DriveService]
})
export class DriveModule {}

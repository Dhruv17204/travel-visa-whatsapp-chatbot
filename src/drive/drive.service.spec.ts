import { Test, TestingModule } from '@nestjs/testing';
import { DriveService } from './drive.service.js';
import { vi } from 'vitest';

describe('DriveService', () => {
  let service: DriveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DriveService],
    }).compile();

    service = module.get<DriveService>(DriveService);
    // Explicitly wipe env vars for block test
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Google credentials missing -> BLOCKED (no false success)', async () => {
    const result = await service.uploadDocument('case1', 'app1', 'Passport', 1, Buffer.from('test'), 'image/png');
    expect(result).toBeNull();
  });
});

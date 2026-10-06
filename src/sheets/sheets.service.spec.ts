import { Test, TestingModule } from '@nestjs/testing';
import { SheetsService } from './sheets.service.js';
import { vi } from 'vitest';

describe('SheetsService', () => {
  let service: SheetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SheetsService],
    }).compile();

    service = module.get<SheetsService>(SheetsService);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_SHEET_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Google credentials missing -> BLOCKED (no false success or crash)', async () => {
    // Should not throw, should just log and exit
    await expect(service.syncDocumentRow({ id: '1' } as any)).resolves.toBeUndefined();
  });
});

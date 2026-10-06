import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from './calendar.service.js';
import { vi } from 'vitest';

describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CalendarService],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Google credentials missing -> BLOCKED (throws CALENDAR_UNAVAILABLE)', async () => {
    await expect(service.getAvailableSlots(new Date().toISOString())).rejects.toThrow('CALENDAR_UNAVAILABLE');
    await expect(service.createEvent({} as any)).rejects.toThrow('CALENDAR_UNAVAILABLE');
  });
});

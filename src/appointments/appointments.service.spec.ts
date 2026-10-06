import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';
import { vi } from 'vitest';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: any;
  let calendar: any;

  beforeEach(async () => {
    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      appointment: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
        delete: vi.fn(),
      }
    };

    calendar = {
      getAvailableSlots: vi.fn(),
      createEvent: vi.fn(),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalendarService, useValue: calendar },
        { provide: SheetsService, useValue: { syncDocumentRow: vi.fn(), syncAppointmentRow: vi.fn().mockResolvedValue(undefined) } },
        { provide: SlackService, useValue: { sendReviewNotification: vi.fn(), sendAppointmentNotification: vi.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Slot confirmation - successful Calendar event path using mocked provider', async () => {
    prisma.appointment.findFirst.mockResolvedValueOnce(null);
    prisma.appointment.create.mockResolvedValueOnce({ id: 'appt1', status: 'PENDING' });
    calendar.createEvent.mockResolvedValueOnce('cal_event_123');
    prisma.appointment.update.mockResolvedValueOnce({ id: 'appt1', status: 'CONFIRMED' });

    const result = await service.bookStaffCall('case1', { start: new Date(), end: new Date(), staffCalendarId: 'staff1' });
    
    expect(result.success).toBe(true);
    expect(prisma.appointment.create).toHaveBeenCalled();
    expect(calendar.createEvent).toHaveBeenCalled();
    expect(prisma.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CONFIRMED', calendarEventId: 'cal_event_123' } }));
  });

  it('Duplicate/concurrent slot attempts fail transactionally', async () => {
    // Mock that the slot is already taken in the DB
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'existing', status: 'CONFIRMED' });

    const result = await service.bookStaffCall('case1', { start: new Date(), end: new Date(), staffCalendarId: 'staff1' });
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('taken');
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('Calendar failure - no false confirmation', async () => {
    prisma.appointment.findFirst.mockResolvedValueOnce(null);
    prisma.appointment.create.mockResolvedValueOnce({ id: 'appt1', status: 'PENDING' });
    calendar.createEvent.mockRejectedValueOnce(new Error('CALENDAR_UNAVAILABLE'));

    const result = await service.bookStaffCall('case1', { start: new Date(), end: new Date(), staffCalendarId: 'staff1' });
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('unavailable');
    expect(prisma.appointment.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'appt1' } }));
  });

  it('Official visa appointment never reported as booked without official confirmation', async () => {
    prisma.appointment.create.mockResolvedValueOnce({ id: 'appt_visa', status: 'REQUEST_RECEIVED', type: 'VISA_APPOINTMENT' });
    const result = await service.requestVisaAppointment('case1', 'USA', 'John Doe', 'Next week');
    
    expect(result.success).toBe(true);
    expect(result.message).toContain('request received');
    expect(prisma.appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'REQUEST_RECEIVED', type: 'VISA_APPOINTMENT' })
    }));
  });

  it('Cancel prevents stale booking actions', async () => {
    prisma.appointment.findUnique.mockResolvedValueOnce({ id: 'appt1', status: 'CONFIRMED', calendarEventId: 'cal1', staffCalendarId: 'staff1' });
    
    const result = await service.cancelAppointment('appt1');
    expect(result).toBe(true);
    expect(prisma.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }));
    expect(calendar.deleteEvent).toHaveBeenCalledWith('cal1', 'staff1');
  });

  it('Stale booking action (already cancelled)', async () => {
    prisma.appointment.findUnique.mockResolvedValueOnce({ id: 'appt1', status: 'CANCELLED' });
    
    const result = await service.cancelAppointment('appt1');
    expect(result).toBe(false); // Can't cancel again
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarService, CalendarSlot } from '../calendar/calendar.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
    private readonly sheetsService: SheetsService,
    private readonly slackService: SlackService
  ) {}

  async getAvailableSlots(date: string): Promise<CalendarSlot[]> {
    return this.calendarService.getAvailableSlots(date);
  }

  async bookStaffCall(caseId: string, slot: CalendarSlot): Promise<{ success: boolean; message: string; appointmentId?: string }> {
    try {
      const parsedStart = new Date(slot.start);
      const parsedEnd = new Date(slot.end);

      // 1. Transactional reservation to prevent concurrency double-booking
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Double check if slot is already taken in our DB
        const existing = await tx.appointment.findFirst({
          where: {
            staffCalendarId: slot.staffCalendarId,
            start: parsedStart,
            status: { in: ['CONFIRMED', 'PENDING'] }
          }
        });

        if (existing) {
          throw new Error('SLOT_TAKEN');
        }

        // Cleanup any stale failed/canceled reservations blocking this unique slot
        await tx.appointment.deleteMany({
          where: {
            staffCalendarId: slot.staffCalendarId,
            start: parsedStart,
            status: { in: ['FAILED', 'CANCELED'] }
          }
        });

        return tx.appointment.create({
          data: {
            caseId,
            type: 'INTRO_CALL',
            staffCalendarId: slot.staffCalendarId,
            start: parsedStart,
            end: parsedEnd,
            timezone: 'UTC', // Defaulting for MVP
            status: 'PENDING'
          }
        });
      });

      // 2. Create Calendar event
      let eventId: string;
      try {
        eventId = await this.calendarService.createEvent({
          start: parsedStart,
          end: parsedEnd,
          summary: `Intro Call - Case ${caseId}`,
          description: `Auto-booked via WhatsApp Chatbot`,
          staffCalendarId: slot.staffCalendarId
        });
      } catch (err: any) {
        // If Calendar fails, we MUST fail the booking to prevent false confirmation
        this.logger.error(`Calendar creation failed: ${err.message}`);
        
        // Delete the pending appointment so it doesn't permanently block the slot
        await this.prisma.appointment.delete({
          where: { id: appointment.id }
        });
        
        return { success: false, message: 'Appointment booking is temporarily unavailable. Our team will assist you.' };
      }

      // 3. Confirm and update DB with event ID
      const confirmed = await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CONFIRMED', calendarEventId: eventId }
      });

      // 4. Sync integrations (don't block response on these)
      this.syncIntegrations(confirmed).catch(err => {
        this.logger.error(`Failed to sync integrations for appointment ${confirmed.id}: ${err.message}`);
      });

      return { success: true, message: 'Your intro call is confirmed.', appointmentId: confirmed.id };

    } catch (error: any) {
      if (error.message === 'SLOT_TAKEN') {
        return { success: false, message: 'Sorry, this slot was just taken. Please select another.' };
      }
      this.logger.error(`Booking failed: ${error.message}`);
      return { success: false, message: 'An error occurred while booking. Please try again.' };
    }
  }

  async requestVisaAppointment(caseId: string, destination: string, applicant: string, preferredDates: string): Promise<{ success: boolean; message: string }> {
    // Official visa appointment - just create a task, do NOT book calendar
    const appt = await this.prisma.appointment.create({
      data: {
        caseId,
        type: 'VISA_APPOINTMENT',
        staffCalendarId: null, // No internal calendar for this
        start: new Date(0), // Placeholder for pending request
        end: new Date(0),
        timezone: 'UTC',
        status: 'REQUEST_RECEIVED'
      }
    });

    await this.slackService.sendAppointmentNotification(appt.id, caseId, 'VISA_APPOINTMENT', new Date(), 'UTC').catch(() => {});
    await this.sheetsService.syncAppointmentRow(appt).catch(() => {});

    return { success: true, message: 'Visa appointment request received. Our team will coordinate with the embassy.' };
  }

  async cancelAppointment(appointmentId: string): Promise<boolean> {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt || appt.status === 'CANCELLED') return false;

    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' }
    });

    if (appt.calendarEventId && appt.staffCalendarId) {
      this.calendarService.deleteEvent(appt.calendarEventId, appt.staffCalendarId).catch(err => {
        this.logger.error(`Failed to delete calendar event for cancelled appointment: ${err.message}`);
      });
    }
    
    await this.sheetsService.syncAppointmentRow(cancelled).catch(() => {});

    return true;
  }

  private async syncIntegrations(appointment: any) {
    await this.sheetsService.syncAppointmentRow(appointment);
    await this.slackService.sendAppointmentNotification(appointment.id, appointment.caseId, appointment.type, appointment.start, appointment.timezone);
  }
}

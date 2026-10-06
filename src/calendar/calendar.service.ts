import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { getGoogleAuthClient } from '../common/google-auth.js';

export interface CalendarSlot {
  start: Date;
  end: Date;
  staffCalendarId: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  async getAvailableSlots(date: string): Promise<CalendarSlot[]> {
    const auth = getGoogleAuthClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    if (!auth || !calendarId) {
      this.logger.warn('Google Calendar is not configured. Safely blocking availability check.');
      throw new Error('CALENDAR_UNAVAILABLE');
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      
      const timeMin = new Date();
      timeMin.setHours(timeMin.getHours() + 1); // Only slots starting at least 1 hr from now
      
      const timeMax = new Date(timeMin);
      timeMax.setDate(timeMax.getDate() + 7); // Check next 7 days

      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone: 'UTC',
          items: [{ id: calendarId }],
        },
      });

      const busy = res.data.calendars?.[calendarId]?.busy || [];
      
      // Calculate a dummy slot tomorrow for MVP if no complex scheduling logic exists
      // In a real app we'd map work hours and subtract busy slots.
      // For this implementation, we will just offer tomorrow at 10 AM UTC if it doesn't overlap.
      
      const slotStart = new Date();
      slotStart.setDate(slotStart.getDate() + 1);
      slotStart.setUTCHours(10, 0, 0, 0);
      
      const slotEnd = new Date(slotStart);
      slotEnd.setUTCHours(11, 0, 0, 0);

      const isBusy = busy.some(b => {
        if (!b.start || !b.end) return false;
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();
        return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      if (isBusy) {
        return []; // No slots
      }

      return [{
        start: slotStart,
        end: slotEnd,
        staffCalendarId: calendarId
      }];
    } catch (error: any) {
      this.logger.error(`Calendar availability check failed: ${error.message}`);
      throw new Error('CALENDAR_UNAVAILABLE');
    }
  }

  async createEvent(booking: {
    start: Date;
    end: Date;
    summary: string;
    description: string;
    staffCalendarId: string;
  }): Promise<string> {
    const auth = getGoogleAuthClient();
    
    if (!auth || !booking.staffCalendarId) {
      this.logger.warn('Google Calendar is not configured. Safely blocking event creation.');
      throw new Error('CALENDAR_UNAVAILABLE');
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      const res = await calendar.events.insert({
        calendarId: booking.staffCalendarId,
        requestBody: {
          summary: booking.summary,
          description: booking.description,
          start: { dateTime: booking.start.toISOString(), timeZone: 'UTC' },
          end: { dateTime: booking.end.toISOString(), timeZone: 'UTC' },
        }
      });

      if (!res.data.id) throw new Error('No event ID returned');
      
      this.logger.log(`Created calendar event: ${res.data.id}`);
      return res.data.id;
    } catch (error: any) {
      this.logger.error(`Failed to create calendar event: ${error.message}`);
      throw new Error('CALENDAR_UNAVAILABLE');
    }
  }

  async deleteEvent(eventId: string, staffCalendarId: string): Promise<void> {
    const auth = getGoogleAuthClient();
    if (!auth) throw new Error('CALENDAR_UNAVAILABLE');

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({
        calendarId: staffCalendarId,
        eventId,
      });
      this.logger.log(`Deleted calendar event: ${eventId}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete calendar event: ${error.message}`);
      throw error;
    }
  }
}

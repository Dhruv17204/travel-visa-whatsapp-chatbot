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
          timeZone: 'Asia/Kolkata',
          items: [{ id: calendarId }],
        },
      });

      const busy = res.data.calendars?.[calendarId]?.busy || [];
      const availableSlots: CalendarSlot[] = [];
      const now = new Date();

      // Check the next 7 days for slots
      for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
        // Business hours: 10 AM to 4 PM IST (4:30 AM to 10:30 AM UTC)
        // We'll just generate slots from 5:00 UTC to 12:00 UTC for simplicity
        for (let hour = 5; hour <= 12; hour++) {
          const slotStart = new Date();
          slotStart.setDate(now.getDate() + dayOffset);
          slotStart.setUTCHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setUTCHours(hour + 1, 0, 0, 0);

          const isBusy = busy.some(b => {
            if (!b.start || !b.end) return false;
            const bStart = new Date(b.start).getTime();
            const bEnd = new Date(b.end).getTime();
            return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
          });

          if (!isBusy) {
            availableSlots.push({
              start: slotStart,
              end: slotEnd,
              staffCalendarId: calendarId
            });
            if (availableSlots.length >= 3) break;
          }
        }
        if (availableSlots.length >= 3) break;
      }

      return availableSlots;
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

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@prisma/client';
import { google } from 'googleapis';
import { getGoogleAuthClient } from '../common/google-auth.js';

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);

  async syncDocumentRow(document: Document): Promise<void> {
    const auth = getGoogleAuthClient();
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!auth || !sheetId) {
      this.logger.warn('Google Sheets is not configured (missing auth or sheet ID). Safely blocking sync.');
      return;
    }

    try {
      const sheets = google.sheets({ version: 'v4', auth });
      const values = [
        [
          document.id,
          document.caseId,
          document.applicantId,
          document.type,
          document.version,
          document.state,
          document.fileHash || '',
          document.driveFileId || '',
          document.createdTime.toISOString()
        ]
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Documents!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      this.logger.log(`Synced Document ${document.id} to Sheets.`);
    } catch (error: any) {
      this.logger.error(`Failed to sync to Google Sheets: ${error.message}`);
    }
  }

  async syncAppointmentRow(appointment: any): Promise<void> {
    const auth = getGoogleAuthClient();
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!auth || !sheetId) return;

    try {
      const sheets = google.sheets({ version: 'v4', auth });
      const values = [
        [
          appointment.id,
          appointment.caseId,
          appointment.type,
          appointment.staffCalendarId || '',
          appointment.start.toISOString(),
          appointment.end.toISOString(),
          appointment.timezone,
          appointment.status,
          appointment.calendarEventId || ''
        ]
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Appointments!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      this.logger.log(`Synced Appointment ${appointment.id} to Sheets.`);
    } catch (error: any) {
      this.logger.error(`Failed to sync Appointment to Google Sheets: ${error.message}`);
    }
  }
}

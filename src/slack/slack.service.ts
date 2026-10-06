import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  async sendReviewNotification(documentId: string, caseId: string, type: string): Promise<void> {
    await this.sendSlackMessage(`📄 *New Document Received*\nCase ID: ${caseId}\nDoc Type: ${type}\nStatus: PENDING_REVIEW\nReview required.`);
  }

  async sendAppointmentNotification(bookingId: string, caseId: string, type: string, date: Date, timezone: string): Promise<void> {
    await this.sendSlackMessage(`📅 *New Appointment Booked*\nBooking ID: ${bookingId}\nCase ID: ${caseId}\nType: ${type}\nDate: ${date.toISOString()} (${timezone})`);
  }

  async sendBookingFailureNotification(caseId: string, reason: string): Promise<void> {
    await this.sendSlackMessage(`⚠️ *Booking Failed*\nCase ID: ${caseId}\nReason: ${reason}\nStaff attention required.`);
  }

  private async sendSlackMessage(text: string): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.warn('Slack is not configured (missing SLACK_WEBHOOK_URL). Safely blocking notification.');
      return;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!res.ok) {
        throw new Error(`Slack API responded with ${res.status}`);
      }

      this.logger.log('Slack notification sent successfully.');
    } catch (error: any) {
      this.logger.error(`Failed to send Slack notification: ${error.message}`);
    }
  }
}

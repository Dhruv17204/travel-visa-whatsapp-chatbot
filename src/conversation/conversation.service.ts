import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConversationSession } from '@prisma/client';

export const CONVERSATION_STATES = {
  MAIN_MENU: 'MAIN_MENU',
  VISA_ENQUIRY_DESTINATION: 'VISA_ENQUIRY_DESTINATION',
  VISA_ENQUIRY_PURPOSE: 'VISA_ENQUIRY_PURPOSE',
  VISA_ENQUIRY_NATIONALITY: 'VISA_ENQUIRY_NATIONALITY',
  VISA_ENQUIRY_RESIDENCE: 'VISA_ENQUIRY_RESIDENCE',
  VISA_ENQUIRY_APP_TYPE: 'VISA_ENQUIRY_APP_TYPE',
  VISA_ENQUIRY_DEPARTURE: 'VISA_ENQUIRY_DEPARTURE',
  VISA_ENQUIRY_RETURN: 'VISA_ENQUIRY_RETURN',
  VISA_ENQUIRY_APPLICANTS: 'VISA_ENQUIRY_APPLICANTS',
  VISA_ENQUIRY_CONFIRM: 'VISA_ENQUIRY_CONFIRM',
  SELECT_APPLICANT: 'SELECT_APPLICANT',
  SELECT_DOCUMENT: 'SELECT_DOCUMENT',
  AWAIT_UPLOAD: 'AWAIT_UPLOAD',
  SELECT_APPOINTMENT: 'SELECT_APPOINTMENT',
  APPT_SELECT_SLOT: 'APPT_SELECT_SLOT',
  APPT_CONFIRM_SLOT: 'APPT_CONFIRM_SLOT',
  APPT_VISA_DESTINATION: 'APPT_VISA_DESTINATION',
  APPT_VISA_APPLICANT: 'APPT_VISA_APPLICANT',
  APPT_VISA_DATES: 'APPT_VISA_DATES',
  AWAIT_CONFIRMATION: 'AWAIT_CONFIRMATION',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
};

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateSession(senderId: string): Promise<ConversationSession> {
    let session = await this.prisma.conversationSession.findUnique({
      where: { senderId },
    });

    if (!session || session.expiration < new Date()) {
      // Create new session or override expired one
      const defaultExpiration = new Date();
      defaultExpiration.setHours(defaultExpiration.getHours() + 24); // 24 hour expiry
      
      session = await this.prisma.conversationSession.upsert({
        where: { senderId },
        update: {
          currentState: CONVERSATION_STATES.MAIN_MENU,
          expiration: defaultExpiration,
          caseId: null,
          applicantId: null,
          selectedDoc: null,
          selectedAppt: null,
        },
        create: {
          senderId,
          currentState: CONVERSATION_STATES.MAIN_MENU,
          expiration: defaultExpiration,
        },
      });
      this.logger.log(`Created/Reset session for ${senderId}`);
    }

    return session;
  }

  async updateState(senderId: string, updates: any): Promise<ConversationSession> {
    return this.prisma.conversationSession.update({
      where: { senderId },
      data: updates,
    });
  }

  async ensureCaseExists(senderId: string): Promise<string> {
    const session = await this.prisma.conversationSession.findUnique({ where: { senderId } });
    if (session?.caseId) {
      return session.caseId;
    }
    const newCase = await this.prisma.case.create({
      data: {
        applicantId: `APP-${senderId.slice(-4)}`,
        maskedContact: senderId,
        destination: 'Test Destination',
        currentStage: 'Document Upload',
        nextAction: 'Review'
      }
    });
    await this.updateState(senderId, { caseId: newCase.id });
    return newCase.id;
  }
}

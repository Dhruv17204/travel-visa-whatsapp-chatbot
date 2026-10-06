import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  ForbiddenException,
  UnauthorizedException,
  HttpCode,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { MetaService } from './meta.service.js';
import { ConversationService, CONVERSATION_STATES } from '../conversation/conversation.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { ConversationSession } from '@prisma/client';

@Controller('webhook')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly metaService: MetaService,
    private readonly conversationService: ConversationService,
    private readonly documentsService: DocumentsService,
    private readonly appointmentsService: AppointmentsService
  ) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.META_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }

    throw new ForbiddenException('Verification failed');
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    this.logger.log('WhatsApp webhook POST received');

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing signature header');
    }

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      throw new Error('META_APP_SECRET is not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw body');
    }

    const hmac = crypto.createHmac('sha256', appSecret);
    const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      throw new UnauthorizedException('Invalid signature');
    }

    const body = req.body;
    if (body && body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const senderId = message.from;
        const msgType = message.type;
        const msgText = msgType === 'text' ? message.text?.body : undefined;

        this.logger.log(`Received message type '${msgType}' from sender '${senderId}'`);

        const session = await this.conversationService.getOrCreateSession(senderId);

        const messageId = message.id;
        const draft = (session.draftData as Record<string, any>) || {};
        if (messageId && draft.lastMessageId === messageId) {
          this.logger.log(`Ignoring duplicate message ${messageId}`);
          return 'EVENT_RECEIVED';
        }
        if (messageId) {
          draft.lastMessageId = messageId;
          await this.conversationService.updateState(senderId, { draftData: draft });
        }

        const isResetKeyword = msgType === 'text' && msgText && ['hi', 'hello', 'start', 'mainmenu'].includes(msgText.toLowerCase().replace(/[^\w\s]/gi, '').trim());

        if (session.currentState === CONVERSATION_STATES.HUMAN_HANDOFF && !isResetKeyword) {
          this.logger.log(`Ignoring message from ${senderId} - Handed off to human.`);
          return 'EVENT_RECEIVED';
        }

        if (msgType === 'text' && msgText) {
          this.handleText(senderId, msgText, session).catch(err => {
            this.logger.error(`Error handling text: ${err.message}`);
          });
        } else if (msgType === 'interactive' && message.interactive) {
          const interactive = message.interactive;
          let actionId: string | undefined;

          if (interactive.type === 'button_reply') {
            actionId = interactive.button_reply?.id;
          } else if (interactive.type === 'list_reply') {
            actionId = interactive.list_reply?.id;
          }

          if (actionId) {
            this.logger.log(`Received interactive action '${actionId}' from sender '${senderId}'`);
            this.handleAction(senderId, actionId, session).catch(err => {
              this.logger.error(`Error handling action: ${err.message}`);
            });
          }
        } else if (msgType === 'image' || msgType === 'document') {
          const mediaId = msgType === 'image' ? message.image?.id : message.document?.id;
          if (mediaId) {
            this.handleMedia(senderId, mediaId, session).catch(err => {
              this.logger.error(`Error handling media: ${err.message}`);
            });
          }
        }
      }
    }

    return 'EVENT_RECEIVED';
  }

  private async handleMedia(senderId: string, mediaId: string, session: ConversationSession) {
    if (session.currentState !== CONVERSATION_STATES.AWAIT_UPLOAD) {
      return this.sendMainMenu(senderId);
    }

    const docType = session.selectedDoc || 'Unknown';
    const caseId = await this.conversationService.ensureCaseExists(senderId);
    const applicantId = session.applicantId || `APP-${senderId.slice(-4)}`;

    await this.sendText(senderId, `Received your file for ${docType}. Validating and uploading securely...`);

    const result = await this.documentsService.processIncomingMedia(mediaId, caseId, applicantId, docType);
    
    if (!result.success) {
      if (result.reason === 'unsupported_file') {
        return this.sendText(senderId, 'Unsupported file type. Please upload a valid Image (JPG/PNG) or PDF.');
      }
      return this.sendText(senderId, `Failed to process document: ${result.error || 'Please try again'}`);
    }

    // Return to SELECT_DOCUMENT context so 'doc_select' can be clicked immediately
    await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.SELECT_DOCUMENT, selectedDoc: null });
    return this.sendInteractiveButtons(senderId, `Upload successful! Document version ${result.document?.version || 1} saved safely.`, [
      { id: 'doc_select', title: 'Upload more' },
      { id: 'menu_visa', title: 'Main Menu' }
    ]);
  }

  private async handleText(senderId: string, text: string, session: ConversationSession) {
    const lowerText = text.toLowerCase().replace(/[^\w\s]/gi, '').trim();

    if (['hi', 'hello', 'start', 'mainmenu'].includes(lowerText)) {
      await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.MAIN_MENU, draftData: {} });
      return this.sendMainMenu(senderId);
    }

    const draft = (session.draftData as Record<string, any>) || {};
    const caseId = await this.conversationService.ensureCaseExists(senderId);

    switch (session.currentState) {
      // VISA ENQUIRY TEXT STATES
      case CONVERSATION_STATES.VISA_ENQUIRY_DESTINATION:
        draft.destination = text.trim();
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_PURPOSE, draftData: draft });
        return this.sendInteractiveButtons(senderId, 'What is the purpose of your travel?', [
          { id: 'purpose_tourist', title: 'Tourist visa' },
          { id: 'purpose_business', title: 'Business visa' },
          { id: 'purpose_other', title: 'Other purpose' }
        ]);

      case CONVERSATION_STATES.VISA_ENQUIRY_NATIONALITY:
        draft.nationality = text.trim();
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_RESIDENCE, draftData: draft });
        return this.sendText(senderId, 'What is your country of legal residence?');

      case CONVERSATION_STATES.VISA_ENQUIRY_RESIDENCE:
        draft.residence = text.trim();
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_APP_TYPE, draftData: draft });
        return this.sendInteractiveButtons(senderId, 'Is this your first application or a renewal?', [
          { id: 'app_first', title: 'First application' },
          { id: 'app_renewal', title: 'Renewal' }
        ]);

      case CONVERSATION_STATES.VISA_ENQUIRY_DEPARTURE: {
        const input = text.trim();
        if (!/^20\d{2}-\d{2}-\d{2}$/.test(input) || isNaN(Date.parse(input))) {
          return this.sendText(senderId, 'Please enter a valid future date in YYYY-MM-DD format.');
        }
        if (new Date(input) < new Date()) {
          return this.sendText(senderId, 'Departure date cannot be in the past. Please enter a valid date in YYYY-MM-DD format.');
        }
        draft.departureDate = input;
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_RETURN, draftData: draft });
        return this.sendText(senderId, 'What is your intended return date (YYYY-MM-DD)?');
      }

      case CONVERSATION_STATES.VISA_ENQUIRY_RETURN: {
        const input = text.trim();
        if (!/^20\d{2}-\d{2}-\d{2}$/.test(input) || isNaN(Date.parse(input))) {
          return this.sendText(senderId, 'Please enter a valid date in YYYY-MM-DD format.');
        }
        if (new Date(input) <= new Date(draft.departureDate)) {
          return this.sendText(senderId, 'Return date must be after departure date. Please enter a valid date in YYYY-MM-DD format.');
        }
        draft.returnDate = input;
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_APPLICANTS, draftData: draft });
        return this.sendText(senderId, 'How many applicants are traveling?');
      }

      case CONVERSATION_STATES.VISA_ENQUIRY_APPLICANTS:
        draft.applicantsCount = text.trim();
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_CONFIRM, draftData: draft });
        const summary = `Please confirm your details:\n\nDestination: ${draft.destination}\nPurpose: ${draft.purpose}\nNationality: ${draft.nationality}\nResidence: ${draft.residence}\nType: ${draft.appType}\nDeparture: ${draft.departureDate}\nReturn: ${draft.returnDate}\nApplicants: ${draft.applicantsCount}\n\nWe will confirm the visa category and required documents.`;
        return this.sendInteractiveButtons(senderId, summary, [
          { id: 'confirm_details', title: 'Confirm details' },
          { id: 'edit_details', title: 'Edit details' },
          { id: 'talk_to_team', title: 'Talk to team' }
        ]);

      // VISA APPOINTMENT TEXT STATES
      case CONVERSATION_STATES.APPT_VISA_DESTINATION:
        draft.apptDestination = text.trim();
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.APPT_VISA_APPLICANT, draftData: draft });
        return this.sendText(senderId, 'What is the applicant\'s full name?');
      
      case CONVERSATION_STATES.APPT_VISA_APPLICANT:
        draft.apptApplicant = text.trim();
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.APPT_VISA_DATES, draftData: draft });
        return this.sendText(senderId, 'What are your preferred dates for the visa appointment?');

      case CONVERSATION_STATES.APPT_VISA_DATES:
        draft.apptDates = text.trim();
        const res = await this.appointmentsService.requestVisaAppointment(caseId, draft.apptDestination, draft.apptApplicant, draft.apptDates);
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.MAIN_MENU, draftData: {} });
        return this.sendText(senderId, res.message); // Request received

      default:
        return this.sendMainMenu(senderId);
    }
  }

  private async handleAction(senderId: string, actionId: string, session: ConversationSession) {
    const draft = (session.draftData as Record<string, any>) || {};
    const caseId = await this.conversationService.ensureCaseExists(senderId);

    switch (actionId) {
      // VISA ENQUIRY
      case 'menu_visa':
      case 'edit_details':
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_DESTINATION, draftData: {} });
        return this.sendText(senderId, 'Which country are you planning to visit?');
      
      case 'purpose_tourist':
      case 'purpose_business':
      case 'purpose_other':
        if (session.currentState !== CONVERSATION_STATES.VISA_ENQUIRY_PURPOSE) return this.sendMainMenu(senderId);
        draft.purpose = actionId === 'purpose_tourist' ? 'Tourist visa' : actionId === 'purpose_business' ? 'Business visa' : 'Other';
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_NATIONALITY, draftData: draft });
        return this.sendText(senderId, 'What is your nationality?');

      case 'app_first':
      case 'app_renewal':
        if (session.currentState !== CONVERSATION_STATES.VISA_ENQUIRY_APP_TYPE) return this.sendMainMenu(senderId);
        draft.appType = actionId === 'app_first' ? 'First application' : 'Renewal';
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.VISA_ENQUIRY_DEPARTURE, draftData: draft });
        return this.sendText(senderId, 'What is your intended departure date?');

      case 'confirm_details':
        if (session.currentState !== CONVERSATION_STATES.VISA_ENQUIRY_CONFIRM) return this.sendMainMenu(senderId);
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.MAIN_MENU, draftData: {} });
        return this.sendText(senderId, 'Your visa enquiry draft has been saved. Our team will review and confirm requirements. returning to main menu.');

      // APPOINTMENTS
      case 'menu_appointments':
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.SELECT_APPOINTMENT });
        return this.sendInteractiveButtons(senderId, 'What kind of appointment do you need?', [
          { id: 'intro_call', title: 'Intro call' },
          { id: 'visa_appointment', title: 'Visa appointment' },
          { id: 'talk_to_team', title: 'Talk to team' }
        ]);

      case 'intro_call':
        if (session.currentState !== CONVERSATION_STATES.SELECT_APPOINTMENT) return this.sendMainMenu(senderId);
        try {
          const slots = await this.appointmentsService.getAvailableSlots(new Date().toISOString());
          if (slots.length === 0) {
            return this.sendText(senderId, 'No slots available right now.');
          }
          // Assuming slots are mocked in tests, we take the first available
          draft.selectedSlot = slots[0];
          draft.slotIndex = 0;
          await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.APPT_CONFIRM_SLOT, draftData: draft });
          
          const start = new Date(slots[0].start);
          const timeString = start.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
          
          return this.sendInteractiveButtons(senderId, `Available slot: ${timeString} (IST / Asia/Kolkata). Would you like to confirm?`, [
            { id: 'confirm_booking', title: 'Confirm booking' },
            { id: 'change_slot', title: 'Change slot' },
            { id: 'cancel', title: 'Cancel' }
          ]);
        } catch (error: any) {
          // Handles 'CALENDAR_UNAVAILABLE'
          return this.sendInteractiveButtons(senderId, 'Appointment booking is temporarily unavailable. Please try again later or talk to our team.', [
            { id: 'intro_call', title: 'Retry' },
            { id: 'talk_to_team', title: 'Talk to team' },
            { id: 'cancel', title: 'Cancel' }
          ]);
        }

      case 'confirm_booking':
        if (session.currentState !== CONVERSATION_STATES.APPT_CONFIRM_SLOT) return this.sendMainMenu(senderId);
        if (!draft.selectedSlot) return this.sendMainMenu(senderId);
        
        const bookingResult = await this.appointmentsService.bookStaffCall(caseId, draft.selectedSlot);
        if (!bookingResult.success) {
          // Stay in APPT_CONFIRM_SLOT so they can click Change slot or Cancel
          return this.sendInteractiveButtons(senderId, 'Sorry, we couldn\'t complete that booking. Please choose another slot or try again.', [
            { id: 'change_slot', title: 'Change slot' },
            { id: 'cancel', title: 'Cancel' }
          ]);
        }
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.MAIN_MENU, draftData: {} });
        return this.sendText(senderId, bookingResult.message);
        
      case 'change_slot':
        if (session.currentState !== CONVERSATION_STATES.APPT_CONFIRM_SLOT) return this.sendMainMenu(senderId);
        try {
          const slots = await this.appointmentsService.getAvailableSlots(new Date().toISOString());
          if (slots.length === 0) {
            return this.sendText(senderId, 'No alternative slots available right now.');
          }
          let currentIndex = draft.slotIndex || 0;
          currentIndex++;
          if (currentIndex >= slots.length) currentIndex = 0;
          
          draft.selectedSlot = slots[currentIndex];
          draft.slotIndex = currentIndex;
          await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.APPT_CONFIRM_SLOT, draftData: draft });
          
          const start = new Date(slots[currentIndex].start);
          const timeString = start.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
          
          return this.sendInteractiveButtons(senderId, `Available slot: ${timeString} (IST / Asia/Kolkata). Would you like to confirm?`, [
            { id: 'confirm_booking', title: 'Confirm booking' },
            { id: 'change_slot', title: 'Change slot' },
            { id: 'cancel', title: 'Cancel' }
          ]);
        } catch (error: any) {
          return this.sendInteractiveButtons(senderId, 'Appointment booking is temporarily unavailable. Please try again later or talk to our team.', [
            { id: 'change_slot', title: 'Retry' },
            { id: 'talk_to_team', title: 'Talk to team' },
            { id: 'cancel', title: 'Cancel' }
          ]);
        }

      case 'cancel':
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.MAIN_MENU, draftData: {} });
        return this.sendText(senderId, 'Booking cancelled. Returning to main menu.');

      case 'visa_appointment':
        if (session.currentState !== CONVERSATION_STATES.SELECT_APPOINTMENT) return this.sendMainMenu(senderId);
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.APPT_VISA_DESTINATION, draftData: {} });
        return this.sendText(senderId, 'For which destination do you need a visa appointment?');

      case 'cancel_booking_action':
        // Handle cancel/reschedule from an existing booking
        const cancelResult = await this.appointmentsService.cancelAppointment(draft.activeBookingId);
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.MAIN_MENU, draftData: {} });
        return this.sendText(senderId, cancelResult ? 'Appointment cancelled.' : 'Failed to cancel appointment.');

      // DOCUMENTS
      case 'menu_documents':
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.SELECT_DOCUMENT });
        return this.sendInteractiveButtons(senderId, 'Document Portal. What would you like to do?', [
          { id: 'doc_select', title: 'Select Document' },
          { id: 'doc_status', title: 'Check Status' },
          { id: 'talk_to_team', title: 'Talk to team' }
        ]);

      case 'doc_select':
        if (session.currentState !== CONVERSATION_STATES.SELECT_DOCUMENT) return this.sendMainMenu(senderId);
        return this.sendInteractiveButtons(senderId, 'Select a document to upload for your application:', [
          { id: 'doc_passport', title: 'Passport' },
          { id: 'doc_photo', title: 'Photo' },
          { id: 'doc_itinerary', title: 'Travel Itinerary' }
        ]);

      case 'doc_status':
        if (session.currentState !== CONVERSATION_STATES.SELECT_DOCUMENT) return this.sendMainMenu(senderId);
        const statusMap = await this.documentsService.getDocumentsStatus(caseId);
        return this.sendText(senderId, `Status Report:\nPassport: ${statusMap['Passport']}\nPhoto: ${statusMap['Photo']}\nTravel Itinerary: ${statusMap['Travel Itinerary']}\n\nYour documents are pending review.`);

      case 'doc_passport':
      case 'doc_photo':
      case 'doc_itinerary':
        if (session.currentState !== CONVERSATION_STATES.SELECT_DOCUMENT) return this.sendMainMenu(senderId);
        const docName = actionId === 'doc_passport' ? 'Passport' : actionId === 'doc_photo' ? 'Photo' : 'Travel Itinerary';
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.AWAIT_UPLOAD, selectedDoc: docName });
        return this.sendText(senderId, `Please send the file for: ${docName}. (Accepted formats: Image, PDF)`);

      case 'talk_to_team':
        await this.conversationService.updateState(senderId, { currentState: CONVERSATION_STATES.HUMAN_HANDOFF });
        return this.sendText(senderId, 'I have notified our team. A staff member will assist you shortly.');

      default:
        return this.sendText(senderId, `You selected action: ${actionId}. (Feature under construction)`);
    }
  }

  private async sendText(senderId: string, text: string) {
    try {
      return await this.metaService.sendRequest('messages', 'POST', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: senderId,
        type: 'text',
        text: { body: text }
      });
    } catch (error: any) {
      this.logger.error(`Failed to send text to ${senderId}: ${error.message}`);
      return null;
    }
  }

  private async sendInteractiveButtons(senderId: string, bodyText: string, buttons: {id: string, title: string}[]) {
    try {
      return await this.metaService.sendRequest('messages', 'POST', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: senderId,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: buttons.map(b => ({
              type: 'reply',
              reply: { id: b.id, title: b.title }
            }))
          }
        }
      });
    } catch (error: any) {
      this.logger.error(`Failed to send interactive buttons to ${senderId}: ${error.message}`);
      return null;
    }
  }

  private sendMainMenu(senderId: string) {
    return this.sendInteractiveButtons(senderId, 'Welcome to the Travel Visa Assistant.\nPlease choose an option:', [
      { id: 'menu_visa', title: 'Visa Enquiry' },
      { id: 'menu_appointments', title: 'Book Appointment' },
      { id: 'menu_documents', title: 'Submit Documents' }
    ]);
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller.js';
import { MetaService } from './meta.service.js';
import { ConversationService, CONVERSATION_STATES } from '../conversation/conversation.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { vi } from 'vitest';
import * as crypto from 'crypto';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let metaService: any;
  let conversationService: any;
  let documentsService: any;
  let appointmentsService: any;

  beforeEach(async () => {
    metaService = {
      sendRequest: vi.fn().mockResolvedValue({}),
    };

    conversationService = {
      getOrCreateSession: vi.fn().mockResolvedValue({
        senderId: '123',
        currentState: CONVERSATION_STATES.MAIN_MENU,
        draftData: {},
      }),
      updateState: vi.fn().mockResolvedValue({}),
      ensureCaseExists: vi.fn().mockResolvedValue('case_xyz'),
    };

    documentsService = {
      processIncomingMedia: vi.fn().mockResolvedValue({ success: true, document: { version: 1 } })
    };

    appointmentsService = {
      getAvailableSlots: vi.fn(),
      bookStaffCall: vi.fn(),
      requestVisaAppointment: vi.fn(),
      cancelAppointment: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: MetaService, useValue: metaService },
        { provide: ConversationService, useValue: conversationService },
        { provide: DocumentsService, useValue: documentsService },
        { provide: AppointmentsService, useValue: appointmentsService },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);

    process.env.META_APP_SECRET = 'secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const generateSignature = (bodyBuffer: Buffer) => {
    const hmac = crypto.createHmac('sha256', process.env.META_APP_SECRET as string);
    return `sha256=${hmac.update(bodyBuffer).digest('hex')}`;
  };

  const mockReq = (messages: any[]) => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages
          }
        }]
      }]
    };
    
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = generateSignature(rawBody);

    return {
      headers: { 'x-hub-signature-256': signature },
      rawBody,
      body
    } as any;
  };

  it('MAIN_MENU -> Visa Enquiry (button click)', async () => {
    const req = mockReq([{
      from: '123',
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'menu_visa' } }
    }]);

    await controller.handleWebhook(req);

    expect(conversationService.updateState).toHaveBeenCalledWith('123', {
      currentState: CONVERSATION_STATES.VISA_ENQUIRY_DESTINATION,
      draftData: {}
    });
  });

  const waitTick = () => new Promise(resolve => setTimeout(resolve, 0));

  it('MAIN_MENU -> Submit Documents -> Select Document', async () => {
    const req = mockReq([{
      from: '123',
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'doc_passport' } }
    }]);

    conversationService.getOrCreateSession.mockResolvedValueOnce({
      senderId: '123',
      currentState: CONVERSATION_STATES.SELECT_DOCUMENT,
    });

    await controller.handleWebhook(req);
    await waitTick();

    expect(conversationService.updateState).toHaveBeenCalledWith('123', {
      currentState: CONVERSATION_STATES.AWAIT_UPLOAD,
      selectedDoc: 'Passport'
    });
  });

  it('AWAIT_UPLOAD -> receives valid image', async () => {
    const req = mockReq([{
      from: '123',
      type: 'image',
      image: { id: 'media123' }
    }]);

    conversationService.getOrCreateSession.mockResolvedValueOnce({
      senderId: '123',
      currentState: CONVERSATION_STATES.AWAIT_UPLOAD,
      selectedDoc: 'Passport',
      caseId: 'case_xyz',
      applicantId: 'app_xyz'
    });

    await controller.handleWebhook(req);
    await waitTick();

    expect(documentsService.processIncomingMedia).toHaveBeenCalledWith('media123', 'case_xyz', 'app_xyz', 'Passport');
    expect(conversationService.updateState).toHaveBeenCalledWith('123', {
      currentState: CONVERSATION_STATES.SELECT_DOCUMENT,
      selectedDoc: null
    });
  });

  it('Book Appointment menu', async () => {
    const req = mockReq([{ from: '123', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'menu_appointments' } } }]);
    await controller.handleWebhook(req);
    await waitTick();
    expect(conversationService.updateState).toHaveBeenCalledWith('123', expect.objectContaining({ currentState: CONVERSATION_STATES.SELECT_APPOINTMENT }));
  });

  it('Intro call selection - fails safely if calendar missing', async () => {
    conversationService.getOrCreateSession.mockResolvedValueOnce({ senderId: '123', currentState: CONVERSATION_STATES.SELECT_APPOINTMENT });
    const req = mockReq([{ from: '123', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'intro_call' } } }]);
    
    // Simulate AppointmentsService throwing (blocked calendar)
    appointmentsService.getAvailableSlots.mockRejectedValueOnce(new Error('CALENDAR_UNAVAILABLE'));

    await controller.handleWebhook(req);
    await waitTick();
    expect(metaService.sendRequest).toHaveBeenCalledWith('messages', 'POST', expect.objectContaining({ type: 'interactive' }));
  });

  it('Intro call selection - Slot selection and confirmation', async () => {
    // Mock success returning a slot
    appointmentsService.getAvailableSlots.mockResolvedValueOnce([{ start: new Date(), end: new Date(), staffCalendarId: '1' }]);
    
    conversationService.getOrCreateSession.mockResolvedValueOnce({ senderId: '123', currentState: CONVERSATION_STATES.SELECT_APPOINTMENT });
    const req = mockReq([{ from: '123', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'intro_call' } } }]);

    await controller.handleWebhook(req);
    await waitTick();
    expect(conversationService.updateState).toHaveBeenCalledWith('123', expect.objectContaining({ currentState: CONVERSATION_STATES.APPT_CONFIRM_SLOT }));
  });

  it('Visa appointment request path', async () => {
    conversationService.getOrCreateSession.mockResolvedValueOnce({ senderId: '123', currentState: CONVERSATION_STATES.SELECT_APPOINTMENT });
    const req = mockReq([{ from: '123', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'visa_appointment' } } }]);

    await controller.handleWebhook(req);
    await waitTick();
    expect(conversationService.updateState).toHaveBeenCalledWith('123', expect.objectContaining({ currentState: CONVERSATION_STATES.APPT_VISA_DESTINATION }));
  });

  it('Talk to team', async () => {
    const req = mockReq([{ from: '123', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'talk_to_team' } } }]);
    await controller.handleWebhook(req);
    await waitTick();
    expect(conversationService.updateState).toHaveBeenCalledWith('123', expect.objectContaining({ currentState: CONVERSATION_STATES.HUMAN_HANDOFF }));
  });

  it('Regression: Meta API timeout does NOT crash process on missing await or thrown errors', async () => {
    // Simulate MetaService throwing an error like an unhandled timeout
    metaService.sendRequest.mockRejectedValueOnce(new Error('Meta API Request Failed: Status 504'));
    
    const req = mockReq([{ from: '123', type: 'text', text: { body: 'hi' } }]);
    
    // This should not throw! If the error bubbles up unhandled, the test fails.
    const result = await controller.handleWebhook(req);
    
    expect(result).toBe('EVENT_RECEIVED'); // Controller always returns success to Meta
    expect(conversationService.updateState).toHaveBeenCalledWith('123', expect.objectContaining({ currentState: CONVERSATION_STATES.MAIN_MENU }));
  });
});

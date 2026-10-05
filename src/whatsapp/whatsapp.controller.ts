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

@Controller('webhook')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly metaService: MetaService) {}

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
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
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

        if (msgType === 'text' && msgText) {
          const lowerText = msgText.toLowerCase().trim();
          if (['hi', 'hello', 'start'].includes(lowerText)) {
            // Send main menu response asynchronously
            this.metaService.sendRequest('messages', 'POST', {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: senderId,
              type: 'text',
              text: {
                preview_url: false,
                body: 'Welcome to the Travel Visa Assistant! Please let us know how we can help you today.'
              }
            }).catch(err => {
              this.logger.error(`Failed to send response: ${err.message}`);
            });
          }
        }
      }
    }

    // Safely acknowledge receipt without parsing or storing the payload yet
    return 'EVENT_RECEIVED';
  }
}

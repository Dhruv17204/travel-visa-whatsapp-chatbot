import { Controller, Get, Post, Body, Param, Query, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';
import { MetaService } from '../whatsapp/meta.service.js';

@Controller('reviewer')
export class ReviewerController {
  constructor(
    private prisma: PrismaService,
    private sheetsService: SheetsService,
    private slackService: SlackService,
    private metaService: MetaService,
  ) {}

  private checkAuth(token: string) {
    const expected = process.env.REVIEWER_TOKEN;
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Invalid or missing REVIEWER_TOKEN');
    }
  }

  @Get('documents')
  async getPendingDocuments(@Query('token') token: string) {
    this.checkAuth(token);

    const docs = await this.prisma.document.findMany({
      where: { state: 'RECEIVED' },
      orderBy: { createdTime: 'desc' }
    });

    let html = `<html><body><h1>Pending Document Reviews</h1><ul>`;
    for (const doc of docs) {
      html += `<li>
        <strong>Case:</strong> ${doc.caseId} | <strong>Applicant:</strong> ${doc.applicantId || 'N/A'} <br>
        <strong>Type:</strong> ${doc.type} | <strong>Version:</strong> ${doc.version} <br>
        <strong>Received:</strong> ${doc.createdTime} | <strong>State:</strong> ${doc.state} <br>
        <strong>Link:</strong> <a href="https://drive.google.com/file/d/${doc.driveFileId}/view" target="_blank">View Document</a> <br>
        <form method="POST" action="/reviewer/documents/${doc.id}/approve?token=${token}" style="display:inline; margin-top:5px;">
          <button type="submit">Approve</button>
        </form>
        <form method="POST" action="/reviewer/documents/${doc.id}/reject?token=${token}" style="display:inline; margin-top:5px;">
          <input type="text" name="reason" placeholder="Rejection reason required" required>
          <button type="submit">Reject</button>
        </form>
      </li><hr>`;
    }
    html += `</ul></body></html>`;
    return html;
  }

  @Post('documents/:id/approve')
  async approveDocument(@Param('id') id: string, @Query('token') token: string) {
    this.checkAuth(token);
    return this.handleReviewAction(id, 'APPROVED', null);
  }

  @Post('documents/:id/reject')
  async rejectDocument(@Param('id') id: string, @Query('token') token: string, @Body('reason') reason: string) {
    this.checkAuth(token);
    if (!reason || reason.trim() === '') {
      throw new HttpException('Reject MUST require a reason.', HttpStatus.BAD_REQUEST);
    }
    return this.handleReviewAction(id, 'REJECTED', reason);
  }

  private async handleReviewAction(id: string, newState: 'APPROVED' | 'REJECTED', reason: string | null) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new HttpException('Document not found', HttpStatus.NOT_FOUND);

    if (document.currentFlag !== 'true') {
      throw new HttpException('This document version is no longer current.', HttpStatus.BAD_REQUEST);
    }

    if (document.state !== 'RECEIVED') {
      throw new HttpException('Document is already reviewed.', HttpStatus.BAD_REQUEST);
    }

    const updatedDoc = await this.prisma.document.update({
      where: { id },
      data: {
        state: newState,
        reason,
        reviewer: 'Staff',
        reviewedTime: new Date(),
      }
    });

    await this.sheetsService.syncDocumentRow(updatedDoc).catch(e => console.error(e));

    await this.slackService.sendReviewNotification(updatedDoc.id, updatedDoc.caseId, updatedDoc.type, newState).catch(e => console.error(e));

    const session = await this.prisma.conversationSession.findFirst({
      where: { caseId: document.caseId }
    });

    if (session) {
      if (newState === 'REJECTED') {
        const msg = `Your uploaded document (${document.type}) was rejected.\nReason: ${reason}\nPlease upload a replacement.`;
        await this.metaService.sendRequest('messages', 'POST', {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: session.senderId,
          type: 'text',
          text: { body: msg }
        }).catch(e => console.error(e));
      } else if (newState === 'APPROVED') {
        const msg = `Your uploaded document (${document.type}) has been approved!`;
        await this.metaService.sendRequest('messages', 'POST', {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: session.senderId,
          type: 'text',
          text: { body: msg }
        }).catch(e => console.error(e));
      }
    }

    return `Document ${newState} successfully. <a href="/reviewer/documents?token=${process.env.REVIEWER_TOKEN}">Back to reviews</a>`;
  }
}

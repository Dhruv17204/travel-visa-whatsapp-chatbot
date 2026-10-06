import { Controller, Get, Post, Body, Param, Query, UnauthorizedException, Res, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';
import { MetaService } from '../whatsapp/meta.service.js';
import type { Response } from 'express';

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

  private renderLayout(title: string, body: string, token: string) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: 'Inter', system-ui, sans-serif; background-color: #f4f7f6; color: #333; margin: 0; padding: 0; }
          .header { background-color: #0b1c3c; color: white; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
          .header h1 { margin: 0; font-size: 1.5rem; }
          .header .badge { background: #1a73e8; padding: 5px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
          .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
          .summary-cards { display: flex; gap: 20px; margin-bottom: 30px; }
          .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); flex: 1; text-align: center; }
          .card h3 { margin: 0 0 10px 0; color: #666; font-size: 1rem; }
          .card .number { font-size: 2rem; font-weight: bold; color: #0b1c3c; }
          table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-radius: 8px; overflow: hidden; }
          th, td { padding: 16px; text-align: left; border-bottom: 1px solid #eee; }
          th { background: #fafafa; font-weight: bold; color: #666; text-transform: uppercase; font-size: 0.85rem; }
          tr:hover { background-color: #f9fbfb; }
          .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; font-size: 0.9rem; }
          .btn-primary { background: #1a73e8; color: white; }
          .btn-danger { background: #d93025; color: white; }
          .btn-success { background: #1e8e3e; color: white; }
          .btn-secondary { background: #f1f3f4; color: #3c4043; }
          .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background: white; padding: 30px; border-radius: 8px; max-width: 400px; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
          .modal-content h2 { margin-top: 0; color: #0b1c3c; }
          input[type="text"] { width: 100%; padding: 12px; margin: 15px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-family: inherit; }
          .message-page { text-align: center; padding: 50px; background: white; border-radius: 8px; max-width: 600px; margin: 50px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
          .message-page h2 { color: #0b1c3c; margin-top: 0; }
          .message-page p { color: #666; margin-bottom: 30px; font-size: 1.1rem; }
          .state-badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; }
          .state-RECEIVED { background: #fef7e0; color: #b06000; }
          .state-APPROVED { background: #e6f4ea; color: #1e8e3e; }
          .state-REJECTED { background: #fce8e6; color: #d93025; }
        </style>
        <script>
          function showModal(id) { document.getElementById(id).style.display = 'flex'; }
          function hideModal(id) { document.getElementById(id).style.display = 'none'; }
        </script>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Travel Visa Assistant</h1>
            <div style="font-size: 0.9rem; margin-top: 5px; opacity: 0.8;">Document Review Portal</div>
          </div>
          <span class="badge">Staff Reviewer</span>
        </div>
        <div class="container">
          ${body}
        </div>
      </body>
      </html>
    `;
  }

  @Get('documents')
  async getPendingDocuments(@Query('token') token: string) {
    this.checkAuth(token);

    const docs = await this.prisma.document.findMany({
      orderBy: { createdTime: 'desc' }
    });

    const pending = docs.filter(d => d.state === 'RECEIVED').length;
    const approved = docs.filter(d => d.state === 'APPROVED').length;
    const rejected = docs.filter(d => d.state === 'REJECTED').length;

    let body = `
      <div class="summary-cards">
        <div class="card"><h3>Pending Review</h3><div class="number">${pending}</div></div>
        <div class="card"><h3>Approved</h3><div class="number">${approved}</div></div>
        <div class="card"><h3>Rejected</h3><div class="number">${rejected}</div></div>
        <div class="card"><h3>Total Documents</h3><div class="number">${docs.length}</div></div>
      </div>
      <table>
        <tr>
          <th>Case ID</th>
          <th>Applicant ID</th>
          <th>Document Type</th>
          <th>Version</th>
          <th>Received</th>
          <th>State</th>
          <th>Reviewer</th>
          <th>Actions</th>
        </tr>
    `;

    const pendingDocs = docs.filter(d => d.state === 'RECEIVED' && d.currentFlag === 'true');

    if (pendingDocs.length === 0) {
      body += `<tr><td colspan="8" style="text-align:center; padding: 30px; color:#666;">No pending documents require review.</td></tr>`;
    }

    for (const doc of pendingDocs) {
      body += `
        <tr>
          <td><strong>${doc.caseId}</strong></td>
          <td>${doc.applicantId || 'N/A'}</td>
          <td>${doc.type}</td>
          <td>v${doc.version}</td>
          <td>${doc.createdTime.toLocaleString()}</td>
          <td><span class="state-badge state-${doc.state}">${doc.state}</span></td>
          <td>${doc.reviewer || '-'}</td>
          <td>
            <a href="https://drive.google.com/file/d/${doc.driveFileId}/view" target="_blank" class="btn btn-secondary" style="margin-right: 5px;">View File</a>
            <button class="btn btn-success" onclick="showModal('approve-${doc.id}')" style="margin-right: 5px;">Approve</button>
            <button class="btn btn-danger" onclick="showModal('reject-${doc.id}')">Reject</button>

            <!-- Approve Modal -->
            <div id="approve-${doc.id}" class="modal">
              <div class="modal-content">
                <h2>Approve Document?</h2>
                <p>Are you sure you want to approve this <strong>${doc.type} (v${doc.version})</strong> for Case <strong>${doc.caseId}</strong>?</p>
                <form method="POST" action="/reviewer/documents/${doc.id}/approve?token=${token}">
                  <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button type="button" class="btn btn-secondary" onclick="hideModal('approve-${doc.id}')">Cancel</button>
                    <button type="submit" class="btn btn-success">Confirm Approval</button>
                  </div>
                </form>
              </div>
            </div>

            <!-- Reject Modal -->
            <div id="reject-${doc.id}" class="modal">
              <div class="modal-content">
                <h2>Reject Document</h2>
                <p>Provide a reason for rejecting this <strong>${doc.type} (v${doc.version})</strong>. The applicant will be notified.</p>
                <form method="POST" action="/reviewer/documents/${doc.id}/reject?token=${token}">
                  <input type="text" name="reason" placeholder="Required rejection reason" required>
                  <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="hideModal('reject-${doc.id}')">Cancel</button>
                    <button type="submit" class="btn btn-danger">Reject Document</button>
                  </div>
                </form>
              </div>
            </div>
          </td>
        </tr>
      `;
    }
    body += `</table>`;

    return this.renderLayout('Document Review Dashboard', body, token);
  }

  @Post('documents/:id/approve')
  async approveDocument(@Param('id') id: string, @Query('token') token: string, @Res({ passthrough: true }) res: Response) {
    this.checkAuth(token);
    return this.handleReviewAction(id, 'APPROVED', null, token, res);
  }

  @Post('documents/:id/reject')
  async rejectDocument(@Param('id') id: string, @Query('token') token: string, @Body('reason') reason: string, @Res({ passthrough: true }) res: Response) {
    this.checkAuth(token);
    if (!reason || reason.trim() === '') {
      res.status(HttpStatus.BAD_REQUEST);
      return this.renderLayout('Error', `
        <div class="message-page">
          <h2>Validation Error</h2>
          <p>Reject action requires a reason.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>
      `, token);
    }
    return this.handleReviewAction(id, 'REJECTED', reason, token, res);
  }

  private async handleReviewAction(id: string, newState: 'APPROVED' | 'REJECTED', reason: string | null, token: string, res: Response) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    
    if (!document) {
      res.status(HttpStatus.NOT_FOUND);
      return this.renderLayout('Not Found', `
        <div class="message-page">
          <h2>Document Not Found</h2>
          <p>The requested document does not exist.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>`, token);
    }

    if (document.currentFlag !== 'true') {
      res.status(HttpStatus.BAD_REQUEST);
      return this.renderLayout('Stale Version', `
        <div class="message-page">
          <h2>Document Version No Longer Current</h2>
          <p>This document has been superseded by a newer version.</p>
          <p><strong>Current version: v${document.version + 1}</strong></p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>`, token);
    }

    if (document.state !== 'RECEIVED') {
      res.status(HttpStatus.BAD_REQUEST);
      return this.renderLayout('Already Reviewed', `
        <div class="message-page">
          <h2>Document Already Reviewed</h2>
          <p>This document has already been processed.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>`, token);
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

    // Success response
    if (newState === 'APPROVED') {
      return this.renderLayout('Success', `
        <div class="message-page">
          <h2>Document Approved Successfully</h2>
          <p>${document.type} &mdash; Version ${document.version}</p>
          <p style="color: #1e8e3e; font-weight: bold;">Applicant has been notified.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>`, token);
    } else {
      return this.renderLayout('Success', `
        <div class="message-page">
          <h2>Document Rejected</h2>
          <p>${document.type} &mdash; Version ${document.version}</p>
          <p style="color: #d93025; font-weight: bold;">Rejection reason sent to applicant.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>`, token);
    }
  }
}

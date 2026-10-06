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
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          :root {
            --primary-navy: #0A2853;
            --dark-navy: #051429;
            --corporate-blue: #295B9B;
            --steel-blue: #26466D;
            --light-blue: #B8C7DD;
            --background: #F5F7FA;
            --white: #FFFFFF;
            --success: #1E8E3E;
            --danger: #D93025;
            --warning: #F9AB00;
            --text-dark: #333333;
            --text-muted: #666666;
            --border-light: #E0E4E8;
          }
          body { 
            font-family: 'Inter', system-ui, -apple-system, sans-serif; 
            background-color: var(--background); 
            color: var(--text-dark); 
            margin: 0; 
            padding: 0; 
            line-height: 1.5;
          }
          .header { 
            background-color: var(--primary-navy); 
            color: var(--white); 
            padding: 20px 40px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            box-shadow: 0 2px 6px rgba(0,0,0,0.15); 
          }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .header-icon {
            width: 32px; height: 32px;
            background: var(--corporate-blue);
            border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            font-weight: bold; font-size: 1.2rem;
          }
          .header h1 { margin: 0; font-size: 1.4rem; font-weight: 600; letter-spacing: 0.5px; }
          .header .subtitle { font-size: 0.85rem; margin-top: 4px; color: var(--light-blue); }
          .header-right { text-align: right; }
          .header-right .role { font-weight: 600; font-size: 0.95rem; }
          .header-right .status { font-size: 0.8rem; color: #81C995; display: flex; align-items: center; gap: 5px; margin-top: 4px; justify-content: flex-end; }
          .status-dot { width: 8px; height: 8px; background: #81C995; border-radius: 50%; }
          
          .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
          .page-header { margin-bottom: 30px; }
          .page-header h2 { margin: 0 0 8px 0; color: var(--dark-navy); font-size: 1.8rem; }
          .page-header p { margin: 0; color: var(--text-muted); font-size: 1.05rem; }

          .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
          .card { 
            background: var(--white); 
            padding: 24px; 
            border-radius: 8px; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.06); 
            border-left: 4px solid var(--corporate-blue);
          }
          .card.pending { border-left-color: var(--warning); }
          .card.approved { border-left-color: var(--success); }
          .card.rejected { border-left-color: var(--danger); }
          .card h3 { margin: 0 0 12px 0; color: var(--text-muted); font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px; }
          .card .number { font-size: 2.2rem; font-weight: 700; color: var(--dark-navy); line-height: 1; }
          
          .table-container { background: var(--white); box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-radius: 8px; overflow-x: auto; }
          table { width: 100%; border-collapse: collapse; min-width: 800px; }
          th, td { padding: 16px 20px; text-align: left; border-bottom: 1px solid var(--border-light); }
          th { background: #F8F9FA; font-weight: 600; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; }
          tr:last-child td { border-bottom: none; }
          tr:hover { background-color: #F8F9FA; }
          
          .btn { 
            padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; 
            font-weight: 500; font-size: 0.9rem; font-family: inherit;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            text-decoration: none; transition: background-color 0.2s;
          }
          .btn:focus { outline: 2px solid var(--corporate-blue); outline-offset: 2px; }
          .btn-primary { background: var(--corporate-blue); color: var(--white); }
          .btn-primary:hover { background: var(--steel-blue); }
          .btn-danger { background: var(--danger); color: var(--white); }
          .btn-danger:hover { background: #B3261E; }
          .btn-success { background: var(--success); color: var(--white); }
          .btn-success:hover { background: #188038; }
          .btn-secondary { background: #F1F3F4; color: var(--text-dark); border: 1px solid #DADCE0; }
          .btn-secondary:hover { background: #E8EAED; }

          .state-badge { padding: 6px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; }
          .state-RECEIVED { background: #FEF7E0; color: #B06000; border: 1px solid #F8E7B1; }
          .state-APPROVED { background: #E6F4EA; color: #1E8E3E; border: 1px solid #CEEAD6; }
          .state-REJECTED { background: #FCE8E6; color: #D93025; border: 1px solid #FAD2CF; }
          .state-FLAGGED { background: #FFF0E0; color: #E65100; border: 1px solid #FFD0A1; }
          .state-MISSING { background: #F1F3F4; color: #5F6368; border: 1px solid #DADCE0; }

          .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(5,20,41,0.6); align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
          .modal-content { background: var(--white); padding: 32px; border-radius: 8px; max-width: 450px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
          .modal-content h2 { margin: 0 0 16px 0; color: var(--dark-navy); font-size: 1.4rem; }
          .modal-content p { color: var(--text-muted); margin-bottom: 20px; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; font-weight: 600; font-size: 0.9rem; color: var(--dark-navy); margin-bottom: 8px; }
          input[type="text"], textarea { 
            width: 100%; padding: 12px; border: 1px solid #CCC; border-radius: 4px; 
            font-family: inherit; font-size: 0.95rem; box-sizing: border-box;
          }
          input[type="text"]:focus, textarea:focus { outline: none; border-color: var(--corporate-blue); box-shadow: 0 0 0 3px rgba(41,91,155,0.2); }
          .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

          .message-page { 
            text-align: center; padding: 60px 40px; background: var(--white); 
            border-radius: 8px; max-width: 600px; margin: 60px auto; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 4px solid var(--corporate-blue);
          }
          .message-page.success { border-top-color: var(--success); }
          .message-page.error { border-top-color: var(--danger); }
          .message-page.warning { border-top-color: var(--warning); }
          
          .message-page h2 { color: var(--dark-navy); margin: 0 0 16px 0; font-size: 1.6rem; }
          .message-page p { color: var(--text-muted); margin: 0 0 30px 0; font-size: 1.1rem; }
          
          .version-tag { background: #E8EAED; color: #3C4043; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-left: 6px; }

          .doc-info-panel { background: #F8F9FA; border: 1px solid var(--border-light); border-radius: 6px; padding: 16px; margin-bottom: 20px; text-align: left; }
          .doc-info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; }
          .doc-info-row:last-child { margin-bottom: 0; }
          .doc-info-label { color: var(--text-muted); font-weight: 500; }
          .doc-info-value { color: var(--dark-navy); font-weight: 600; }

          @media (max-width: 768px) {
            .header { flex-direction: column; align-items: flex-start; gap: 15px; padding: 20px; }
            .header-right { text-align: left; }
            .header-right .status { justify-content: flex-start; }
            .summary-cards { grid-template-columns: 1fr 1fr; }
            .table-container { border-radius: 0; }
          }
        </style>
        <script>
          function showModal(id) { 
            document.getElementById(id).style.display = 'flex'; 
            const firstInput = document.getElementById(id).querySelector('input, textarea');
            if(firstInput) firstInput.focus();
          }
          function hideModal(id) { document.getElementById(id).style.display = 'none'; }
          
          // Close modal on escape key
          document.addEventListener('keydown', function(event) {
            if (event.key === "Escape") {
              const modals = document.querySelectorAll('.modal');
              modals.forEach(m => m.style.display = 'none');
            }
          });
        </script>
      </head>
      <body>
        <header class="header">
          <div class="header-left">
            <div class="header-icon">V</div>
            <div>
              <h1>Travel Visa Assistant</h1>
              <div class="subtitle">Document Review & Case Management</div>
            </div>
          </div>
          <div class="header-right">
            <div class="role">Staff Reviewer</div>
            <div class="status"><div class="status-dot"></div> System Status: Operational</div>
          </div>
        </header>
        <main class="container">
          ${body}
        </main>
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

    const pending = docs.filter(d => d.state === 'RECEIVED' && d.currentFlag === 'true').length;
    const approved = docs.filter(d => d.state === 'APPROVED').length;
    const rejected = docs.filter(d => d.state === 'REJECTED').length;

    let body = `
      <div class="page-header">
        <h2>Document Review Dashboard</h2>
        <p>Review submitted applicant documents and manage verification decisions.</p>
      </div>

      <div class="summary-cards">
        <div class="card pending"><h3>Pending Review</h3><div class="number">${pending}</div></div>
        <div class="card approved"><h3>Approved</h3><div class="number">${approved}</div></div>
        <div class="card rejected"><h3>Rejected</h3><div class="number">${rejected}</div></div>
        <div class="card"><h3>Total Documents</h3><div class="number">${docs.length}</div></div>
      </div>
      
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Applicant ID</th>
              <th>Document Type</th>
              <th>Version</th>
              <th>Received</th>
              <th>Status</th>
              <th>Reviewer</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (docs.length === 0) {
      body += `<tr><td colspan="8" style="text-align:center; padding: 40px; color:var(--text-muted);">You're all caught up.<br>No documents are currently awaiting review.</td></tr>`;
    }

    for (const doc of docs) {
      const stateLabel = doc.state === 'RECEIVED' ? 'Pending Review' : (doc.state.charAt(0) + doc.state.slice(1).toLowerCase());
      
      body += `
        <tr>
          <td><strong style="color:var(--dark-navy)">${doc.caseId.split('-')[0]}...</strong></td>
          <td>${doc.applicantId || 'N/A'}</td>
          <td><strong>${doc.type}</strong></td>
          <td><span class="version-tag">v${doc.version}</span></td>
          <td>${doc.createdTime.toLocaleString()}</td>
          <td><span class="state-badge state-${doc.state}">${stateLabel}</span></td>
          <td>${doc.reviewer || '-'}</td>
          <td>
            <div style="display:flex; gap:8px; align-items:center;">
              <a href="https://drive.google.com/file/d/${doc.driveFileId}/view" target="_blank" class="btn btn-secondary" aria-label="View Document">View</a>
            `;

      if (doc.state === 'RECEIVED' && doc.currentFlag === 'true') {
        body += `
              <button class="btn btn-success" onclick="showModal('approve-${doc.id}')">Approve</button>
              <button class="btn btn-danger" onclick="showModal('reject-${doc.id}')">Reject</button>

              <!-- Approve Modal -->
              <div id="approve-${doc.id}" class="modal" role="dialog" aria-labelledby="approve-title-${doc.id}">
                <div class="modal-content">
                  <h2 id="approve-title-${doc.id}">Approve Document</h2>
                  <p>You are about to approve this document submission.</p>
                  
                  <div class="doc-info-panel">
                    <div class="doc-info-row"><span class="doc-info-label">Document:</span> <span class="doc-info-value">${doc.type}</span></div>
                    <div class="doc-info-row"><span class="doc-info-label">Version:</span> <span class="doc-info-value">v${doc.version}</span></div>
                    <div class="doc-info-row"><span class="doc-info-label">Case ID:</span> <span class="doc-info-value">${doc.caseId}</span></div>
                  </div>
                  
                  <form method="POST" action="/reviewer/documents/${doc.id}/approve?token=${token}">
                    <div class="modal-actions">
                      <button type="button" class="btn btn-secondary" onclick="hideModal('approve-${doc.id}')">Cancel</button>
                      <button type="submit" class="btn btn-success">Approve Document</button>
                    </div>
                  </form>
                </div>
              </div>

              <!-- Reject Modal -->
              <div id="reject-${doc.id}" class="modal" role="dialog" aria-labelledby="reject-title-${doc.id}">
                <div class="modal-content">
                  <h2 id="reject-title-${doc.id}">Reject Document</h2>
                  <p>Provide a reason for rejecting this document. The applicant will be notified and asked to resubmit.</p>
                  
                  <div class="doc-info-panel">
                    <div class="doc-info-row"><span class="doc-info-label">Document:</span> <span class="doc-info-value">${doc.type}</span></div>
                    <div class="doc-info-row"><span class="doc-info-label">Version:</span> <span class="doc-info-value">v${doc.version}</span></div>
                    <div class="doc-info-row"><span class="doc-info-label">Case ID:</span> <span class="doc-info-value">${doc.caseId}</span></div>
                  </div>

                  <form method="POST" action="/reviewer/documents/${doc.id}/reject?token=${token}">
                    <div class="form-group">
                      <label for="reason-${doc.id}">Rejection Reason <span style="color:var(--danger)">*</span></label>
                      <textarea id="reason-${doc.id}" name="reason" rows="3" placeholder="Explain why this document cannot be accepted..." required aria-required="true"></textarea>
                    </div>
                    <div class="modal-actions">
                      <button type="button" class="btn btn-secondary" onclick="hideModal('reject-${doc.id}')">Cancel</button>
                      <button type="submit" class="btn btn-danger">Reject Document</button>
                    </div>
                  </form>
                </div>
              </div>
        `;
      }
      
      body += `
            </div>
          </td>
        </tr>
      `;
    }
    body += `
          </tbody>
        </table>
      </div>
    `;

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
      return this.renderLayout('Validation Error', `
        <div class="message-page error">
          <h2>Validation Error</h2>
          <p>Reject action requires a reason.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Dashboard</a>
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
        <div class="message-page error">
          <h2>Document Not Found</h2>
          <p>The requested document does not exist.</p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Dashboard</a>
        </div>`, token);
    }

    if (document.currentFlag !== 'true') {
      res.status(HttpStatus.BAD_REQUEST);
      return this.renderLayout('Document Version No Longer Current', `
        <div class="message-page warning">
          <h2>Document Version No Longer Current</h2>
          <p>This document has been superseded by a newer submission and can no longer be reviewed.</p>
          <p><strong>Current document version: v${document.version + 1}</strong></p>
          <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Review Dashboard</a>
        </div>`, token);
    }

    if (document.state !== 'RECEIVED') {
      res.status(HttpStatus.BAD_REQUEST);
      return this.renderLayout('Already Reviewed', `
        <div class="message-page warning">
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
        reviewer: 'Staff Reviewer',
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
        const rejectionMessage = `Your ${document.type} has been rejected. Reason: ${reason}. Please use the menu below to upload a replacement.`;
        await this.metaService.sendRequest('messages', 'POST', {
          messaging_product: 'whatsapp',
          to: session.senderId,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: rejectionMessage },
            action: {
              buttons: [{ type: 'reply', reply: { id: `doc_replace_${document.type}`, title: 'Upload Replacement' } }]
            }
          }
        }).catch((e: any) => console.error(e));
        
        return this.renderLayout('Document Rejected', `
          <div class="message-page warning">
            <h2>✓ Document Rejected</h2>
            <p><strong>${document.type} — Version ${document.version}</strong></p>
            <p>The applicant has been notified and may submit a replacement.</p>
            <div style="background:#FCE8E6; padding:15px; border-radius:6px; margin:20px 0; color:#D93025; text-align:left;">
              <strong>Reason:</strong> ${reason}
            </div>
            <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Dashboard</a>
          </div>`, token);
      } else {
        const approvalMessage = `Your ${document.type} has been approved successfully!`;
        await this.metaService.sendRequest('messages', 'POST', {
          messaging_product: 'whatsapp',
          to: session.senderId,
          type: 'text',
          text: { body: approvalMessage }
        }).catch((e: any) => console.error(e));
        
        return this.renderLayout('Document Approved', `
          <div class="message-page success">
            <h2>✓ Document Approved</h2>
            <p><strong>${document.type} — Version ${document.version}</strong></p>
            <p>The document has been approved successfully. The applicant has been notified.</p>
            <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Dashboard</a>
          </div>`, token);
      }
    }

    return this.renderLayout('Success', `
      <div class="message-page success">
        <h2>Action Successful</h2>
        <p>Document state updated to ${newState}.</p>
        <a href="/reviewer/documents?token=${token}" class="btn btn-primary">Return to Dashboard</a>
      </div>`, token);
  }
}

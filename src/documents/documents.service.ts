import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetaService } from '../whatsapp/meta.service.js';
import { DriveService } from '../drive/drive.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';
import * as crypto from 'crypto';
import { Document } from '@prisma/client';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaService: MetaService,
    private readonly driveService: DriveService,
    private readonly sheetsService: SheetsService,
    private readonly slackService: SlackService,
  ) {}

  async processIncomingMedia(mediaId: string, caseId: string, applicantId: string, docType: string) {
    this.logger.log(`Processing incoming media ${mediaId} for case ${caseId}`);
    
    // 1. Get media metadata
    const metadata = await this.metaService.getMediaMetadata(mediaId);
    if (!metadata || !metadata.url) {
      throw new Error(`Failed to retrieve metadata for media ${mediaId}`);
    }

    const { url, mime_type, file_size, sha256: expectedHash } = metadata;
    
    // 2. Validate MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimes.includes(mime_type)) {
      this.logger.warn(`Unsupported MIME type: ${mime_type}`);
      return { success: false, reason: 'unsupported_file' };
    }

    // 3. Download media bytes
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.metaService.getConfig().accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download media bytes. Status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Verify file signature (magic numbers) & Hash
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Add idempotency check: don't create if fileHash already exists for this case/type
    const existingDoc = await this.prisma.document.findFirst({
      where: { caseId, type: docType, fileHash: actualHash },
    });
    
    if (existingDoc) {
      this.logger.log(`Idempotency hit: Document with hash ${actualHash} already exists for this case.`);
      return { success: true, document: existingDoc };
    }
    
    // 5. Determine new version
    const latestDoc = await this.prisma.document.findFirst({
      where: { caseId, type: docType },
      orderBy: { version: 'desc' },
    });
    const version = latestDoc ? latestDoc.version + 1 : 1;

    // 6. Persist to PostgreSQL (Source of truth)
    await this.prisma.document.updateMany({
      where: { caseId, type: docType },
      data: { currentFlag: 'false' },
    });

    const document = await this.prisma.document.create({
      data: {
        caseId,
        applicantId,
        type: docType,
        version,
        currentFlag: 'true',
        state: 'RECEIVED', // Must NEVER automatically become APPROVED
        fileHash: actualHash,
      },
    });

    // 7. Fire off integrations
    try {
      await this.triggerIntegrations(document, buffer, mime_type);
    } catch (err: any) {
      this.logger.error(`Error in integrations for document ${document.id}: ${err.message}`);
      return { success: false, reason: 'integration_failure', error: err.message };
    }

    return { success: true, document };
  }

  private async triggerIntegrations(document: Document, buffer: Buffer, mimeType: string) {
    this.logger.log(`Triggering integrations for document ${document.id}`);
    
    // 1. Upload to Google Drive
    const driveId = await this.driveService.uploadDocument(
      document.caseId, 
      document.applicantId || 'unknown_applicant', 
      document.type, 
      document.version, 
      buffer, 
      mimeType
    );

    if (driveId) {
      // Update DB with drive file ID
      await this.prisma.document.update({
        where: { id: document.id },
        data: { driveFileId: driveId },
      });
      document.driveFileId = driveId;
    }

    // 2. Sync to Google Sheets
    await this.sheetsService.syncDocumentRow(document);

    // 3. Send Slack notification
    await this.slackService.sendReviewNotification(document.id, document.caseId, document.type);
  }

  async getDocumentsStatus(caseId: string): Promise<Record<string, string>> {
    const docs = await this.prisma.document.findMany({
      where: { caseId, currentFlag: 'true' },
    });
    
    const statusMap: Record<string, string> = {
      'Passport': 'MISSING',
      'Photo': 'MISSING',
      'Travel Itinerary': 'MISSING'
    };
    
    for (const doc of docs) {
      statusMap[doc.type] = doc.state;
    }
    return statusMap;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { getGoogleAuthClient } from '../common/google-auth.js';
import { Readable } from 'stream';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  async uploadDocument(caseId: string, applicantId: string, docType: string, version: number, buffer: Buffer, mimeType: string): Promise<string | null> {
    const auth = getGoogleAuthClient();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!auth || !folderId) {
      this.logger.warn('Google Drive is not configured (missing auth or folder ID). Safely blocking upload.');
      return null;
    }

    try {
      const drive = google.drive({ version: 'v3', auth });
      
      // 1. Get or create Case Folder
      const caseFolderId = await this.getOrCreateFolder(drive, caseId, folderId);
      
      // 2. Get or create Applicant Folder
      const applicantFolderId = await this.getOrCreateFolder(drive, applicantId, caseFolderId);
      
      // 3. Get or create Documents Folder
      const docsFolderId = await this.getOrCreateFolder(drive, 'Documents', applicantFolderId);

      // 4. Upload file
      const filename = `${docType}_v${version}_${Date.now()}`;
      
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      const res = await drive.files.create({
        requestBody: {
          name: filename,
          parents: [docsFolderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id',
      });

      this.logger.log(`Uploaded ${filename} to Drive. File ID: ${res.data.id}`);
      return res.data.id || null;
    } catch (error: any) {
      this.logger.error(`Failed to upload to Google Drive: ${error.message}`);
      return null; // Ensure we don't return success
    }
  }

  private async getOrCreateFolder(drive: any, folderName: string, parentId: string): Promise<string> {
    const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`;
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });

    return created.data.id;
  }
}

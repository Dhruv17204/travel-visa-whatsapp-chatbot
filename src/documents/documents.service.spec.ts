import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetaService } from '../whatsapp/meta.service.js';
import { DriveService } from '../drive/drive.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';
import { vi } from 'vitest';
import * as crypto from 'crypto';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;
  let meta: any;

  beforeEach(async () => {
    prisma = {
      document: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      }
    };
    meta = {
      getMediaMetadata: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ accessToken: 'fake_token' })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetaService, useValue: meta },
        { provide: DriveService, useValue: { uploadDocument: vi.fn().mockResolvedValue('drive_id') } },
        { provide: SheetsService, useValue: { syncDocumentRow: vi.fn() } },
        { provide: SlackService, useValue: { sendReviewNotification: vi.fn() } },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unsupported file type', async () => {
    meta.getMediaMetadata.mockResolvedValueOnce({
      url: 'http://fake',
      mime_type: 'video/mp4',
      file_size: 100,
      sha256: 'hash'
    });

    const result = await service.processIncomingMedia('1', 'case1', 'app1', 'Passport');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('unsupported_file');
  });

  it('processes valid image and creates version 1 (no automatic approval)', async () => {
    meta.getMediaMetadata.mockResolvedValueOnce({
      url: 'http://fake',
      mime_type: 'image/jpeg',
      file_size: 100,
      sha256: 'hash'
    });

    prisma.document.findFirst
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValueOnce(null); // version check (no latest doc)

    prisma.document.create.mockResolvedValueOnce({
      id: 'doc1', caseId: 'case1', applicantId: 'app1', type: 'Passport', version: 1, state: 'RECEIVED'
    });

    const result = await service.processIncomingMedia('1', 'case1', 'app1', 'Passport');
    expect(result.success).toBe(true);
    expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 1, state: 'RECEIVED' }) // Never APPROVED
    }));
  });

  it('handles duplicate webhook (idempotency)', async () => {
    meta.getMediaMetadata.mockResolvedValueOnce({
      url: 'http://fake',
      mime_type: 'application/pdf',
      file_size: 100,
      sha256: 'hash'
    });

    prisma.document.findFirst.mockResolvedValueOnce({
      id: 'existing_doc', fileHash: 'actualHash'
    }); // Idempotency check returns existing

    const result = await service.processIncomingMedia('1', 'case1', 'app1', 'Passport');
    expect(result.success).toBe(true);
    expect(result.document?.id).toBe('existing_doc');
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('creates version 2 replacement if previous document was rejected', async () => {
    meta.getMediaMetadata.mockResolvedValueOnce({
      url: 'http://fake',
      mime_type: 'application/pdf',
      file_size: 100,
      sha256: 'hash'
    });

    prisma.document.findFirst
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValueOnce({ version: 1, state: 'REJECTED' }); // latest doc check

    prisma.document.create.mockResolvedValueOnce({
      id: 'doc2', version: 2, state: 'RECEIVED'
    });

    const result = await service.processIncomingMedia('2', 'case1', 'app1', 'Passport');
    expect(result.success).toBe(true);
    expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 2 })
    }));
  });
});

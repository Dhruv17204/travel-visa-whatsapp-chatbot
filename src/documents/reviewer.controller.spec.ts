import { Test, TestingModule } from '@nestjs/testing';
import { ReviewerController } from './reviewer.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlackService } from '../slack/slack.service.js';
import { MetaService } from '../whatsapp/meta.service.js';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import { vi } from 'vitest';

describe('ReviewerController', () => {
  let controller: ReviewerController;
  let mockPrismaService: any;
  let mockSheetsService: any;
  let mockSlackService: any;
  let mockMetaService: any;

  beforeEach(async () => {
    mockPrismaService = {
      document: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      conversationSession: {
        findFirst: vi.fn(),
      }
    };

    mockSheetsService = {
      syncDocumentRow: vi.fn().mockResolvedValue(true),
    };

    mockSlackService = {
      sendReviewNotification: vi.fn().mockResolvedValue(true),
    };

    mockMetaService = {
      sendRequest: vi.fn().mockResolvedValue({}),
    };

    process.env.REVIEWER_TOKEN = 'test-token';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewerController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SheetsService, useValue: mockSheetsService },
        { provide: SlackService, useValue: mockSlackService },
        { provide: MetaService, useValue: mockMetaService },
      ],
    }).compile();

    controller = module.get<ReviewerController>(ReviewerController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should require valid token for getPendingDocuments', async () => {
    await expect(controller.getPendingDocuments('invalid')).rejects.toThrow(UnauthorizedException);
  });

  it('should return HTML of pending documents', async () => {
    mockPrismaService.document.findMany.mockResolvedValue([
      { id: 'doc1', caseId: 'case1', type: 'Passport', version: 1, state: 'RECEIVED', createdTime: new Date() }
    ]);
    const html = await controller.getPendingDocuments('test-token');
    expect(html).toContain('doc1');
    expect(html).toContain('Approve');
    expect(html).toContain('Reject');
  });

  it('should approve a document', async () => {
    mockPrismaService.document.findUnique.mockResolvedValue({ id: 'doc1', caseId: 'case1', type: 'Passport', version: 1, state: 'RECEIVED' });
    mockPrismaService.document.findFirst.mockResolvedValue(null); // No newer version
    mockPrismaService.document.update.mockResolvedValue({ id: 'doc1', caseId: 'case1', state: 'APPROVED', type: 'Passport' });
    mockPrismaService.conversationSession.findFirst.mockResolvedValue({ senderId: '123' });

    const result = await controller.approveDocument('doc1', 'test-token');
    
    expect(mockPrismaService.document.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'doc1' },
      data: expect.objectContaining({ state: 'APPROVED' })
    }));
    expect(mockSlackService.sendReviewNotification).toHaveBeenCalled();
    expect(mockMetaService.sendRequest).toHaveBeenCalled();
    expect(result).toContain('Document APPROVED successfully');
  });

  it('should reject a document with reason', async () => {
    mockPrismaService.document.findUnique.mockResolvedValue({ id: 'doc1', caseId: 'case1', type: 'Passport', version: 1, state: 'RECEIVED' });
    mockPrismaService.document.findFirst.mockResolvedValue(null);
    mockPrismaService.document.update.mockResolvedValue({ id: 'doc1', caseId: 'case1', state: 'REJECTED', type: 'Passport' });
    mockPrismaService.conversationSession.findFirst.mockResolvedValue({ senderId: '123' });

    const result = await controller.rejectDocument('doc1', 'test-token', 'Blurred image');
    
    expect(mockPrismaService.document.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'doc1' },
      data: expect.objectContaining({ state: 'REJECTED', reason: 'Blurred image' })
    }));
    expect(result).toContain('Document REJECTED successfully');
  });

  it('should require a reason for rejection', async () => {
    await expect(controller.rejectDocument('doc1', 'test-token', '   ')).rejects.toThrow(HttpException);
  });

  it('should prevent stale reviewer action (version mismatch)', async () => {
    mockPrismaService.document.findUnique.mockResolvedValue({ id: 'doc1', caseId: 'case1', type: 'Passport', version: 1, state: 'RECEIVED' });
    mockPrismaService.document.findFirst.mockResolvedValue({ id: 'doc2', version: 2 }); // Newer version exists

    await expect(controller.approveDocument('doc1', 'test-token')).rejects.toThrow('This document version is no longer current.');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConversationService } from './conversation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { vi } from 'vitest';

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: PrismaService,
          useValue: {
            conversationSession: {
              findUnique: vi.fn(),
              upsert: vi.fn(),
              update: vi.fn(),
            }
          },
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { SlackService } from './slack.service.js';
import { vi } from 'vitest';

describe('SlackService', () => {
  let service: SlackService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlackService],
    }).compile();

    service = module.get<SlackService>(SlackService);
    delete process.env.SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Slack webhook missing -> BLOCKED (no false success or crash)', async () => {
    await expect(service.sendReviewNotification('doc1', 'case1', 'Passport')).resolves.toBeUndefined();
  });
});

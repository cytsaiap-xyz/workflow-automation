import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistantService.maybeCompact', () => {
  let workflowId: string;
  let convId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-cp-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.ASSISTANT_CONTEXT_WINDOW = '500';

    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => ({
        choices: [{ message: { content: 'SUMMARY: discussed lorem.' } }],
      })}}; }
    }));

    vi.resetModules();

    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({ name: 'wf', definition: { stations: [] } }).id;
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    convId = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' }).id;

    for (let i = 0; i < 50; i++) {
      AssistantConversationModel.appendMessage(convId, {
        role: 'user', content: 'lorem ipsum '.repeat(20), timestamp: '',
      });
    }
  });

  it('compacts when estimated tokens exceed 75% of context window', async () => {
    const { maybeCompact } = await import('../services/assistantService');
    await maybeCompact(convId, 'system prompt placeholder');
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    const reloaded = AssistantConversationModel.getById(convId)!;
    expect(reloaded.summary).toContain('SUMMARY');
    expect(reloaded.messages.length).toBeLessThan(50);
  });
});

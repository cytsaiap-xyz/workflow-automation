import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistantService.runTurn', () => {
  let workflowId: string;
  let convId: string;
  const captured: any[] = [];

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rt-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.ASSISTANT_CONTEXT_WINDOW = '8192';

    let calls = 0;
    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async (params: any) => {
        captured.push(params);
        calls++;
        if (calls === 1) {
          return { choices: [{ message: {
            role: 'assistant', content: '',
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_workflow', arguments: JSON.stringify({ workflow_id: workflowId }) } }],
          } }] };
        }
        return { choices: [{ message: { role: 'assistant', content: 'workflow has 0 stations.' } }] };
      }}}; }
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
  });

  it('runs the tool loop and persists the final assistant message', async () => {
    const events: any[] = [];
    const { runTurn } = await import('../services/assistantService');
    await runTurn({
      conversationId: convId,
      userMessage: 'explain this workflow',
      onEvent: (e) => events.push(e),
    });

    const types = events.map(e => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('done');

    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    const conv = AssistantConversationModel.getById(convId)!;
    expect(conv.messages[conv.messages.length - 1].content).toMatch(/0 stations/);
  });
});

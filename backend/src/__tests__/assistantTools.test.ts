import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistantTools', () => {
  let TOOLS: any;
  let dispatch: any;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tools-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'wf', definition: { stations: [
        { id: 's', name: 'x', position: { x: 0, y: 0 }, steps: [
          { id: 'st', name: 'st', type: 'ai-prompt', config: { aiSystemPrompt: 'old' }, position: { x: 0, y: 0 } },
        ]},
      ]},
    });
    workflowId = wf.id;
    const mod = await import('../services/assistantTools');
    TOOLS = mod.ASSISTANT_TOOL_SCHEMAS;
    dispatch = mod.dispatchTool;
  });

  it('exposes the read-only and write tool schemas', () => {
    const names = TOOLS.map((t: any) => t.function.name);
    expect(names).toContain('get_workflow');
    expect(names).toContain('list_node_types');
    expect(names).toContain('get_prompt_library');
    expect(names).toContain('propose_workflow_change');
    expect(names).toContain('set_node_prompt');
    expect(names).not.toContain('search_workflows');
  });

  it('get_workflow returns the workflow definition', async () => {
    const out = await dispatch('get_workflow', { workflow_id: workflowId }, { conversationId: 'c1', workflowId });
    expect(out.definition.stations.length).toBe(1);
  });

  it('set_node_prompt mutates the system prompt directly', async () => {
    await dispatch('set_node_prompt', {
      workflow_id: workflowId, node_id: 'st', role: 'system', prompt: 'new',
    }, { conversationId: 'c1', workflowId });
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getById(workflowId)!.definition.stations[0].steps[0].config.aiSystemPrompt).toBe('new');
  });

  it('propose_workflow_change creates a pending change', async () => {
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    const conv = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' });
    const out = await dispatch('propose_workflow_change', {
      workflow_id: workflowId,
      diff: [{ kind: 'add_station', station: { id: 'new', name: 'n', steps: [], position: { x: 0, y: 1 } } }],
      rationale: 'add a station',
    }, { conversationId: conv.id, workflowId });
    expect(out.change_id).toBeTruthy();
    const { PendingChangeModel } = await import('../models/pendingChangeModel');
    expect(PendingChangeModel.getById(out.change_id)?.status).toBe('pending');
  });
});

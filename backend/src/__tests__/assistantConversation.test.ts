import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AssistantConversationModel', () => {
  let M: typeof import('../models/assistantConversationModel').AssistantConversationModel;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-conv-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'wf', definition: { stations: [] },
    });
    workflowId = wf.id;
    M = (await import('../models/assistantConversationModel')).AssistantConversationModel;
  });

  beforeEach(() => M.deleteAll());

  it('creates and returns a panel conversation', () => {
    const c = M.findOrCreate({ workflowId, surface: 'panel' });
    expect(c.surface).toBe('panel');
    expect(c.messages).toEqual([]);
  });

  it('reuses existing panel conversation', () => {
    const a = M.findOrCreate({ workflowId, surface: 'panel' });
    const b = M.findOrCreate({ workflowId, surface: 'panel' });
    expect(a.id).toBe(b.id);
  });

  it('isolates node-popover conversations per node', () => {
    const a = M.findOrCreate({ workflowId, surface: 'node-popover', nodeId: 'n1' });
    const b = M.findOrCreate({ workflowId, surface: 'node-popover', nodeId: 'n2' });
    expect(a.id).not.toBe(b.id);
  });

  it('appends messages and persists', () => {
    const c = M.findOrCreate({ workflowId, surface: 'panel' });
    M.appendMessage(c.id, { role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00Z' });
    const reloaded = M.getById(c.id)!;
    expect(reloaded.messages.length).toBe(1);
    expect(reloaded.messages[0].content).toBe('hi');
  });

  it('replaces summary and trims oldest N messages', () => {
    const c = M.findOrCreate({ workflowId, surface: 'panel' });
    for (let i = 0; i < 10; i++) {
      M.appendMessage(c.id, { role: 'user', content: `m${i}`, timestamp: '' });
    }
    M.compact(c.id, 'older context summarized', 5);
    const reloaded = M.getById(c.id)!;
    expect(reloaded.messages.length).toBe(5);
    expect(reloaded.messages[0].content).toBe('m5');
    expect(reloaded.summary).toBe('older context summarized');
  });
});

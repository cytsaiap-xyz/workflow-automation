import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PendingChangeModel', () => {
  let M: typeof import('../models/pendingChangeModel').PendingChangeModel;
  let workflowId: string;
  let convId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pc-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({ name: 'wf', definition: { stations: [] } });
    workflowId = wf.id;
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    convId = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' }).id;
    M = (await import('../models/pendingChangeModel')).PendingChangeModel;
  });

  beforeEach(() => M.deleteAll());

  it('creates a pending change', () => {
    const p = M.create({
      conversationId: convId, workflowId,
      diff: [{ kind: 'add_station', station: { id: 's', name: 'x', steps: [], position: { x: 0, y: 0 } } }],
      rationale: 'add a station',
    });
    expect(p.status).toBe('pending');
  });

  it('marks applied', () => {
    const p = M.create({ conversationId: convId, workflowId, diff: [] });
    M.markApplied(p.id);
    expect(M.getById(p.id)!.status).toBe('applied');
  });

  it('rejects', () => {
    const p = M.create({ conversationId: convId, workflowId, diff: [] });
    M.markRejected(p.id);
    expect(M.getById(p.id)!.status).toBe('rejected');
  });
});

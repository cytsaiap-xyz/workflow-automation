import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('Assistant API', () => {
  let app: express.Express;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-api-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');

    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello!' } }],
      })}}; }
    }));
    vi.resetModules();

    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({ name: 'wf', definition: { stations: [] } }).id;

    const router = (await import('../routes/assistant')).default;
    app = express();
    app.use(express.json());
    app.use('/api/assistant', router);
  });

  it('POST /conversations creates a panel conversation', async () => {
    const res = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    expect(res.status).toBe(200);
    expect(res.body.data.surface).toBe('panel');
  });

  it('POST /conversations/:id/messages streams an assistant response', async () => {
    const r1 = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    const convId = r1.body.data.id;
    const res = await request(app)
      .post(`/api/assistant/conversations/${convId}/messages`)
      .send({ content: 'hi' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/event-stream/);
    expect(res.text).toMatch(/"type":"done"/);
    expect(res.text).toMatch(/hello!/);
  });

  it('POST /changes/:id/apply merges the diff into the workflow', async () => {
    const r1 = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    const convId = r1.body.data.id;
    const { PendingChangeModel } = await import('../models/pendingChangeModel');
    const pc = PendingChangeModel.create({
      conversationId: convId, workflowId,
      diff: [{ kind: 'add_node', node: { id: 'new', name: 'n', type: 'script-js', config: {}, position: { x: 0, y: 1 } } }] as any,
      rationale: 'add',
    });
    const apply = await request(app).post(`/api/assistant/changes/${pc.id}/apply`);
    expect(apply.status).toBe(200);
    const { WorkflowModel } = await import('../models/workflow');
    expect((WorkflowModel.getById(workflowId)!.definition as any).nodes.length).toBe(1);
  });
});

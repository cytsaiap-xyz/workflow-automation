import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('Assistant E2E (panel scaffolds workflow)', () => {
  let app: express.Express;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-e2e-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');

    let n = 0;
    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => {
        n++;
        if (n === 1) {
          return { choices: [{ message: {
            role: 'assistant', content: '',
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'list_node_types', arguments: '{}' } }],
          } }] };
        }
        if (n === 2) {
          return { choices: [{ message: {
            role: 'assistant', content: '',
            tool_calls: [{ id: 't2', type: 'function', function: { name: 'propose_workflow_change', arguments: JSON.stringify({
              workflow_id: workflowId,
              diff: [{ kind: 'add_station', station: { id: 's1', name: 'first', steps: [], position: { x: 0, y: 0 } } }],
              rationale: 'add a starter station',
            }) } }],
          } }] };
        }
        return { choices: [{ message: { role: 'assistant', content: 'Done. Click Apply to add the station.' } }] };
      }}}; }
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

  it('runs a multi-step turn and emits a pending_change event', async () => {
    const c = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    const res = await request(app)
      .post(`/api/assistant/conversations/${c.body.data.id}/messages`)
      .send({ content: 'set me up with a starter workflow' });
    expect(res.text).toMatch(/"type":"pending_change"/);
    expect(res.text).toMatch(/Click Apply/);
  });
});

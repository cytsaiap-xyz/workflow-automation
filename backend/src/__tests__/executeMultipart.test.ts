import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { Express } from 'express';

let app: Express;
let workflowId: string;

describe('POST /api/workflows/:id/execute (multipart)', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ex-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'echo-input',
      definition: {
        inputParameters: [
          { name: 'doc', type: 'file', required: true, accept: '.txt' },
          { name: 'note', type: 'string', defaultValue: 'hi' },
        ],
        stations: [{
          id: 's1', name: 'echo', position: { x: 0, y: 0 },
          steps: [{
            id: 'st1', name: 'echo', type: 'script-js',
            position: { x: 0, y: 0 },
            config: { code: 'return { docPath: variables.input.doc, note: variables.input.note };' },
          }],
        }],
      },
    });
    workflowId = wf.id;
    const router = (await import('../routes/workflows')).default;
    app = express();
    app.use(express.json());
    app.use('/api/workflows', router);
  });

  it('accepts a file upload and exposes its path as ${input.doc}', async () => {
    const res = await request(app)
      .post(`/api/workflows/${workflowId}/execute`)
      .field('note', 'hello')
      .attach('doc', Buffer.from('sample content'), 'sample.txt');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const stepOutput = res.body.data.result.stations[0].steps[0].output;
    expect(stepOutput.note).toBe('hello');
    expect(stepOutput.docPath).toMatch(/sample\.txt$/);
    expect(fs.existsSync(stepOutput.docPath)).toBe(true);
  });

  it('does not create an execution row on lookup failure', async () => {
    const { ExecutionModel } = await import('../models/execution');
    const before = ExecutionModel.getAll().length;
    const res = await request(app)
      .post('/api/workflows/nonexistent-workflow-id/execute')
      .attach('doc', Buffer.from('irrelevant'), 'irrelevant.txt');
    expect(res.status).toBe(404);
    const after = ExecutionModel.getAll().length;
    expect(after).toBe(before);
  });
});

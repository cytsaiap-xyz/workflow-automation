import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PUT /workflows/:id rejects invalid DAGs', () => {
  let app: express.Express;
  let id: string;

  beforeAll(async () => {
    vi.resetModules();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-val-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const router = (await import('../routes/workflows')).default;
    app = express();
    app.use(express.json());
    app.use('/api/workflows', router);
    const r = await request(app).post('/api/workflows').send({
      name: 'wf', definition: { schemaVersion: 2, nodes: [], edges: [] },
    });
    id = r.body.data.id;
  });

  it('rejects a cyclic DAG with 400', async () => {
    const res = await request(app).put(`/api/workflows/${id}`).send({
      definition: {
        schemaVersion: 2,
        nodes: [
          { id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
          { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid DAG/i);
  });
});

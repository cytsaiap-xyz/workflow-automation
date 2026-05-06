import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

let app: express.Express;

describe('AI Providers API', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-apr-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const router = (await import('../routes/aiProviders')).default;
    app = express();
    app.use(express.json());
    app.use('/api/ai-providers', router);
  });

  beforeEach(async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.deleteAll();
  });

  it('GET / returns empty list', async () => {
    const res = await request(app).get('/api/ai-providers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('POST / creates a provider', async () => {
    const res = await request(app).post('/api/ai-providers').send({
      name: 'vllm', baseUrl: 'http://localhost:8000/v1', model: 'qwen2-vl-7b',
      supportsVision: true, isDefault: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('vllm');
  });

  it('POST /:id/promote sets default', async () => {
    const a = await request(app).post('/api/ai-providers').send({ name: 'a', baseUrl: 'http://a/v1', model: 'm' });
    const b = await request(app).post('/api/ai-providers').send({ name: 'b', baseUrl: 'http://b/v1', model: 'm' });
    await request(app).post(`/api/ai-providers/${b.body.data.id}/promote`);
    const list = await request(app).get('/api/ai-providers');
    expect(list.body.data.find((p: any) => p.id === b.body.data.id).isDefault).toBe(true);
    expect(list.body.data.find((p: any) => p.id === a.body.data.id).isDefault).toBe(false);
  });
});

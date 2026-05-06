import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

let app: express.Express;

describe('Prompt Templates API', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ptr-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const router = (await import('../routes/promptTemplates')).default;
    app = express();
    app.use(express.json());
    app.use('/api/prompt-templates', router);
  });

  beforeEach(async () => {
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    PromptTemplateModel.deleteAll();
  });

  it('CRUDs templates', async () => {
    const created = await request(app).post('/api/prompt-templates').send({
      name: 'p', role: 'system', content: 'hello', tags: ['x'],
    });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/prompt-templates?tag=x');
    expect(list.body.data.length).toBe(1);
    const updated = await request(app).put(`/api/prompt-templates/${created.body.data.id}`).send({ content: 'hi' });
    expect(updated.body.data.content).toBe('hi');
    const deleted = await request(app).delete(`/api/prompt-templates/${created.body.data.id}`);
    expect(deleted.body.success).toBe(true);
  });
});

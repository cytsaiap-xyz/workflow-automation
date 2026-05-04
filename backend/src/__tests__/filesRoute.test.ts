import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

let app: express.Express;
let allowedFile: string;

describe('GET /api/files', () => {
  beforeAll(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-files-'));
    process.env.UPLOADS_DIR = tmp;
    allowedFile = path.join(tmp, 'exec-1', 'quiz.json');
    fs.mkdirSync(path.dirname(allowedFile), { recursive: true });
    fs.writeFileSync(allowedFile, JSON.stringify({ ok: true }));
    const router = (await import('../routes/files')).default;
    app = express();
    app.use('/api/files', router);
  });

  it('downloads a file inside the uploads root', async () => {
    const res = await request(app).get('/api/files').query({ path: allowedFile });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects a path outside the uploads root', async () => {
    const res = await request(app).get('/api/files').query({ path: '/etc/passwd' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a missing file inside the root', async () => {
    const res = await request(app).get('/api/files').query({
      path: path.join(process.env.UPLOADS_DIR!, 'exec-2', 'missing.json'),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when path is omitted', async () => {
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(400);
  });
});

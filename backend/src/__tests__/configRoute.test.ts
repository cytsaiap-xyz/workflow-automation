import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

let app: express.Express;

describe('GET /api/config', () => {
  let originalOfflineMode: string | undefined;

  beforeAll(async () => {
    originalOfflineMode = process.env.OFFLINE_MODE;
    const router = (await import('../routes/config')).default;
    app = express();
    app.use('/api/config', router);
  });

  afterAll(() => {
    if (originalOfflineMode === undefined) delete process.env.OFFLINE_MODE;
    else process.env.OFFLINE_MODE = originalOfflineMode;
  });

  it('reports offlineMode false by default', async () => {
    delete process.env.OFFLINE_MODE;
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.offlineMode).toBe(false);
  });

  it('reports offlineMode true when env=true', async () => {
    process.env.OFFLINE_MODE = 'true';
    const res = await request(app).get('/api/config');
    expect(res.body.data.offlineMode).toBe(true);
  });

  it('reports offlineMode false when env=false', async () => {
    process.env.OFFLINE_MODE = 'false';
    const res = await request(app).get('/api/config');
    expect(res.body.data.offlineMode).toBe(false);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('DB schema', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-db-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('has ai_providers table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_providers'"
    ).all();
    expect(rows.length).toBe(1);
  });

  it('has prompt_templates table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_templates'"
    ).all();
    expect(rows.length).toBe(1);
  });
});

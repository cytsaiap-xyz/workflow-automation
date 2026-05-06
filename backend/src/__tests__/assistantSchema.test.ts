import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistant schema', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sch-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('has assistant_conversations table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_conversations'").all();
    expect(rows.length).toBe(1);
  });

  it('has pending_changes table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_changes'").all();
    expect(rows.length).toBe(1);
  });
});

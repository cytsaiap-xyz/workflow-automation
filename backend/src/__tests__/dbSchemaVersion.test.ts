import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('workflows.schema_version column', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-sv-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('exists with default 1', async () => {
    const db = (await import('../db/database')).default;
    const cols = db.prepare("PRAGMA table_info(workflows)").all();
    const sv = cols.find((c: any) => c.name === 'schema_version');
    expect(sv).toBeTruthy();
    expect(sv!.dflt_value).toBe('1');
  });
});

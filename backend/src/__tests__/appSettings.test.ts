import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AppSettingsModel', () => {
  let M: typeof import('../models/appSettingsModel').AppSettingsModel;
  let db: typeof import('../db/database').default;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-as-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    db = (await import('../db/database')).default;
    M = (await import('../models/appSettingsModel')).AppSettingsModel;
  });

  beforeEach(() => {
    db.prepare('DELETE FROM app_settings').run();
  });

  it('returns undefined for missing key', () => {
    expect(M.get('missing')).toBeUndefined();
  });

  it('sets a value', () => {
    M.set('foo', 'bar');
    expect(M.get('foo')).toBe('bar');
  });

  it('upserts an existing key', () => {
    M.set('foo', 'one');
    M.set('foo', 'two');
    expect(M.get('foo')).toBe('two');
  });
});

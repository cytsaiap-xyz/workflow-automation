import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AiProviderModel', () => {
  let AiProviderModel: typeof import('../models/aiProviderModel').AiProviderModel;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ap-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    AiProviderModel = (await import('../models/aiProviderModel')).AiProviderModel;
  });

  beforeEach(() => {
    AiProviderModel.deleteAll();
  });

  it('creates a provider', () => {
    const p = AiProviderModel.create({
      name: 'local-vllm',
      baseUrl: 'http://localhost:8000/v1',
      model: 'qwen2-vl-7b',
      supportsVision: true,
      isDefault: true,
    });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('local-vllm');
    expect(p.supportsVision).toBe(true);
    expect(p.isDefault).toBe(true);
  });

  it('demotes other defaults when promoting one', () => {
    const a = AiProviderModel.create({ name: 'a', baseUrl: 'http://a/v1', model: 'm', isDefault: true });
    const b = AiProviderModel.create({ name: 'b', baseUrl: 'http://b/v1', model: 'm', isDefault: true });
    const refreshed = AiProviderModel.getById(a.id);
    expect(refreshed?.isDefault).toBe(false);
    expect(AiProviderModel.getDefault()?.id).toBe(b.id);
  });

  it('returns the default provider', () => {
    AiProviderModel.create({ name: 'x', baseUrl: 'http://x/v1', model: 'm', isDefault: true });
    expect(AiProviderModel.getDefault()?.name).toBe('x');
  });

  it('refuses to delete the default provider', () => {
    const p = AiProviderModel.create({ name: 'x', baseUrl: 'http://x/v1', model: 'm', isDefault: true });
    expect(() => AiProviderModel.delete(p.id)).toThrow(/default/i);
  });
});

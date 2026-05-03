import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedAiProvider', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-seed-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  beforeEach(async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.deleteAll();
  });

  it('creates a default provider when env is set and table empty', async () => {
    process.env.VLLM_BASE_URL = 'http://localhost:8000/v1';
    process.env.VLLM_DEFAULT_MODEL = 'qwen2-vl-7b';
    process.env.VLLM_SUPPORTS_VISION = 'true';
    const { seedAiProvider } = await import('../seeds/seedAiProvider');
    seedAiProvider();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const def = AiProviderModel.getDefault();
    expect(def?.baseUrl).toBe('http://localhost:8000/v1');
    expect(def?.supportsVision).toBe(true);
  });

  it('is a no-op when a default already exists', async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'existing', baseUrl: 'http://x/v1', model: 'm', isDefault: true });
    process.env.VLLM_BASE_URL = 'http://elsewhere:8000/v1';
    const { seedAiProvider } = await import('../seeds/seedAiProvider');
    seedAiProvider();
    expect(AiProviderModel.getDefault()?.name).toBe('existing');
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AiExecutor multimodal', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-mm-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  beforeEach(async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    AiProviderModel.deleteAll();
    PromptTemplateModel.deleteAll();
  });

  it('builds multi-part content when provider supports vision and prompt requires it', async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    AiProviderModel.create({
      name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'qwen2-vl-7b',
      supportsVision: true, isDefault: true,
    });
    PromptTemplateModel.create({
      name: 'sys', role: 'system', content: 'analyze the image', requiresVision: true,
    });
    PromptTemplateModel.create({
      name: 'usr', role: 'user', content: 'page text: ${input.text}', requiresVision: true,
    });

    // Create a tiny 1x1 PNG file
    const tmpImg = path.join(os.tmpdir(), 'tiny.png');
    fs.writeFileSync(tmpImg, Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108020000007E2E5A5A0000000C4944415478DA63F8FFFF3F00050001FE7B0E1E0000000049454E44AE426082',
      'hex'
    ));

    let captured: any;
    vi.doMock('openai', () => ({
      default: class {
        chat = { completions: { create: async (params: any) => {
          captured = params;
          return { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'qwen2-vl-7b' };
        }}};
      }
    }));

    vi.resetModules();
    // Re-initialize the DB after module reset so the fresh db singleton is ready
    const { initDatabase: reinit } = await import('../db/database');
    await reinit();
    const { AiExecutor } = await import('../services/aiExecutor');
    // Re-import models from fresh module registry to get template IDs
    const { PromptTemplateModel: PTM2 } = await import('../models/promptTemplateModel');
    const sysT = PTM2.getByName('sys')!;
    const usrT = PTM2.getByName('usr')!;

    await AiExecutor.executeStructuredOutput({
      aiPromptTemplateSystemId: sysT.id,
      aiPromptTemplateUserId: usrT.id,
    } as any, {
      input: { text: 'Hello', imagePath: tmpImg },
    });

    const userMsg = captured.messages.find((m: any) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[0].type).toBe('text');
    expect(userMsg.content[1].type).toBe('image_url');
    expect(userMsg.content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});

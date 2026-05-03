import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('script-js ai.call helper', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ac-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    PromptTemplateModel.upsertByName({ name: 'gen-sys', role: 'system', content: 'You generate JSON.' });
    PromptTemplateModel.upsertByName({ name: 'gen-usr', role: 'user', content: 'page: ${input.text}' });

    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => ({
        choices: [{ message: { content: '{"questions":[{"q":"x"}]}' } }],
        model: 'm',
      })}}; }
    }));
  });

  it('runs ai.call from inside a script-js sandbox and returns parsed output', async () => {
    vi.resetModules();
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { ScriptRunner } = await import('../services/scriptRunner');
    const result = await ScriptRunner.executeJS(
      `const out = await ai.call({
         systemTemplate: 'gen-sys',
         userTemplate: 'gen-usr',
         context: { input: { text: 'hello' } },
         outputSchema: { type: 'object', properties: { questions: { type: 'array' } } },
       });
       return out.parsed.questions[0].q;`,
      { variables: {}, inputData: {}, steps: {} },
      30000
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('x');
  });
});

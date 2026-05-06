import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PromptTemplateModel', () => {
  let PromptTemplateModel: typeof import('../models/promptTemplateModel').PromptTemplateModel;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-pt-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    PromptTemplateModel = (await import('../models/promptTemplateModel')).PromptTemplateModel;
  });

  beforeEach(() => PromptTemplateModel.deleteAll());

  it('creates and reads a template', () => {
    const t = PromptTemplateModel.create({
      name: 'gen', role: 'system', content: 'You are a quiz generator', requiresVision: true, tags: ['quiz'],
    });
    expect(t.id).toBeTruthy();
    expect(t.requiresVision).toBe(true);
    expect(t.tags).toEqual(['quiz']);
  });

  it('filters by tag', () => {
    PromptTemplateModel.create({ name: 'a', role: 'system', content: '...', tags: ['quiz'] });
    PromptTemplateModel.create({ name: 'b', role: 'system', content: '...', tags: ['email'] });
    const q = PromptTemplateModel.getByTag('quiz');
    expect(q.length).toBe(1);
    expect(q[0].name).toBe('a');
  });

  it('refuses to delete builtin templates', () => {
    const t = PromptTemplateModel.create({ name: 'x', role: 'system', content: '.', builtin: true });
    expect(() => PromptTemplateModel.delete(t.id)).toThrow(/builtin/i);
  });
});

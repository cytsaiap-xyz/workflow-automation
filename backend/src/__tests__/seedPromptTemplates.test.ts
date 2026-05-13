import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedPromptTemplates', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-spt-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedPromptTemplates } = await import('../seeds/seedPromptTemplates');
    seedPromptTemplates();
  });

  it('seeds the five quiz templates as builtin', async () => {
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    const all = PromptTemplateModel.getByTag('quiz');
    expect(all.length).toBe(5);
    expect(all.every(t => t.builtin)).toBe(true);
    expect(all.every(t => t.requiresVision)).toBe(true);
    const names = all.map(t => t.name).sort();
    expect(names).toEqual([
      'quiz-doc-analyzer-system',
      'quiz-fixer-system',
      'quiz-generator-system',
      'quiz-reviewer-system',
      'quiz-verifier-system',
    ]);
  });

  it('is idempotent', async () => {
    const { seedPromptTemplates } = await import('../seeds/seedPromptTemplates');
    seedPromptTemplates();
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    expect(PromptTemplateModel.getByTag('quiz').length).toBe(5);
  });
});

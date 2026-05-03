import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedQuizWorkflow', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-sqw-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedQuizWorkflow();
  });

  it('seeds the quiz workflow with three stations and inputParameters', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator');
    expect(wf).toBeTruthy();
    expect(wf!.definition.stations.length).toBe(3);
    expect(wf!.definition.inputParameters?.find(p => p.name === 'file')?.type).toBe('file');
  });

  it('is idempotent', async () => {
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedQuizWorkflow();
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getAll().filter(w => w.id === 'builtin-quiz-generator').length).toBe(1);
  });
});

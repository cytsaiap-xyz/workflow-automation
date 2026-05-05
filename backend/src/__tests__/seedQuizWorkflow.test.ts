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

  it('seeds the quiz workflow with three nodes (v2) and inputParameters', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator');
    expect(wf).toBeTruthy();
    // After auto-migration on read, the definition is promoted to v2 (nodes/edges).
    // The quiz workflow has 3 stations each with 1 step → 3 nodes after migration.
    expect((wf!.definition as any).schemaVersion).toBe(2);
    expect((wf!.definition as any).nodes.length).toBe(3);
    expect((wf!.definition as any).inputParameters?.find((p: any) => p.name === 'file')?.type).toBe('file');
  });

  it('is idempotent', async () => {
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedQuizWorkflow();
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getAll().filter(w => w.id === 'builtin-quiz-generator').length).toBe(1);
  });
});

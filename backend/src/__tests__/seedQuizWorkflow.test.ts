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

  it('seeds the quiz workflow with eight nodes (v2 DAG) and inputParameters', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator');
    expect(wf).toBeTruthy();
    // The DAG seeder produces an 8-node v2 workflow:
    // load → analyzer → generator → (verifier, reviewer) → fixer → collect → writer
    // with if-else edges (when: ${parsed.all_pass} / ${parsed.has_failures}) routing
    // verifier and reviewer results to either fixer or collect.
    expect((wf!.definition as any).schemaVersion).toBe(2);
    expect((wf!.definition as any).nodes.length).toBe(8);
    expect((wf!.definition as any).inputParameters?.find((p: any) => p.name === 'file')?.type).toBe('file');
  });

  it('is idempotent', async () => {
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedQuizWorkflow();
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getAll().filter(w => w.id === 'builtin-quiz-generator').length).toBe(1);
  });
});

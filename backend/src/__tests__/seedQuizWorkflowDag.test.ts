import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedQuizWorkflowDag', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-q-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedQuizWorkflowDag } = await import('../seeds/seedQuizWorkflowDag');
    seedQuizWorkflowDag();
  });

  it('produces a 7-node DAG with named-port edges into fix-loop', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator')!;
    const def: any = wf.definition;
    expect(def.schemaVersion).toBe(2);
    expect(def.nodes.length).toBe(7);
    const intoFix = def.edges.filter((e: any) => e.target === 'fix-loop');
    expect(intoFix.map((e: any) => e.targetPort).sort()).toEqual(['generator', 'reviewer', 'verifier']);
  });
});

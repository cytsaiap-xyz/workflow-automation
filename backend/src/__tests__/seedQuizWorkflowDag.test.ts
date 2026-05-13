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

  it('produces an 8-node DAG with if-else gates routing through the fixer', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator')!;
    const def: any = wf.definition;
    expect(def.schemaVersion).toBe(2);
    expect(def.nodes.length).toBe(8);

    const nodeIds = new Set(def.nodes.map((n: any) => n.id));
    for (const id of ['load', 'analyzer', 'generator', 'verifier', 'reviewer', 'fixer', 'collect', 'writer']) {
      expect(nodeIds.has(id)).toBe(true);
    }

    // verifier and reviewer each have two outgoing branches gated by ${parsed.all_pass}
    // and ${parsed.has_failures}.
    const verifierEdges = def.edges.filter((e: any) => e.source === 'verifier');
    const reviewerEdges = def.edges.filter((e: any) => e.source === 'reviewer');
    expect(verifierEdges.length).toBe(2);
    expect(reviewerEdges.length).toBe(2);
    const allWhens = [...verifierEdges, ...reviewerEdges].map((e: any) => e.when);
    expect(allWhens.filter(w => /all_pass/.test(w || '')).length).toBe(2);
    expect(allWhens.filter(w => /has_failures/.test(w || '')).length).toBe(2);

    // fixer converges into collect; collect feeds writer.
    expect(def.edges.some((e: any) => e.source === 'fixer' && e.target === 'collect')).toBe(true);
    expect(def.edges.some((e: any) => e.source === 'collect' && e.target === 'writer')).toBe(true);
  });
});

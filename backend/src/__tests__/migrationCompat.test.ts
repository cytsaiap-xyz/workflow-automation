import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('post-migration the scheduler runs old workflows correctly', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-mc-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('runs a 2-station sequential workflow as a linear DAG', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'wf', definition: {
        stations: [
          { id: 's1', name: 'a', position: { x: 0, y: 0 }, steps: [
            { id: 'st1', name: 'a', type: 'script-js', config: { code: 'return { v: 1 };' }, position: { x: 0, y: 0 } },
          ]},
          { id: 's2', name: 'b', position: { x: 0, y: 1 }, steps: [
            { id: 'st2', name: 'b', type: 'script-js', config: {
              code: 'return { sum: (variables.steps?.st1?.output?.v ?? variables.st1?.output?.v ?? 0) + 1 };'
            }, position: { x: 0, y: 0 } },
          ]},
        ],
      } as any,
    });
    const reloaded = WorkflowModel.getById(wf.id);
    expect((reloaded!.definition as any).schemaVersion).toBe(2);

    const { ExecutionEngine } = await import('../services/executionEngine');
    const result: any = await ExecutionEngine.execute(reloaded!, 'manual', {});
    expect(result.status).toBe('completed');
  });
});

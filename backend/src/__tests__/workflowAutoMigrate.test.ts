import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('workflow auto-migration on read', () => {
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-am-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({
      name: 'wf', definition: {
        stations: [{
          id: 's1', name: 'x', position: { x: 0, y: 0 },
          steps: [{ id: 'st', name: 'st', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } }],
        }],
      },
    } as any).id;
  });

  it('returns a v2 definition on read and persists schema_version=2', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById(workflowId);
    expect((wf!.definition as any).schemaVersion).toBe(2);
    expect((wf!.definition as any).nodes.length).toBe(1);

    const db = (await import('../db/database')).default;
    const row = db.prepare('SELECT schema_version FROM workflows WHERE id = ?').get(workflowId);
    expect(row!.schema_version).toBe(2);
  });
});

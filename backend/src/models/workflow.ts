import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import {
  Workflow,
  WorkflowDefinition,
  CreateWorkflowRequest,
  UpdateWorkflowRequest
} from '../types/workflow';
import { migrateToV2 } from '../services/dagMigrator';

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused';
  definition: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export class WorkflowModel {
  static getAll(): Workflow[] {
    const stmt = db.prepare(`
      SELECT id, name, description, status, definition, schema_version, created_at, updated_at
      FROM workflows
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all() as WorkflowRow[];
    return rows.map(row => WorkflowModel.rowToWorkflow(row));
  }

  static getById(id: string): Workflow | null {
    const stmt = db.prepare(`
      SELECT id, name, description, status, definition, schema_version, created_at, updated_at
      FROM workflows
      WHERE id = ?
    `);
    const row = stmt.get(id) as WorkflowRow | undefined;
    return row ? WorkflowModel.rowToWorkflow(row) : null;
  }

  static create(data: CreateWorkflowRequest & { id?: string }): Workflow {
    const id = data.id ?? uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO workflows (id, name, description, status, definition, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.description || null,
      data.status || 'draft',
      JSON.stringify(data.definition),
      now,
      now
    );

    return this.getById(id)!;
  }

  static update(id: string, data: UpdateWorkflowRequest): Workflow | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.definition !== undefined) {
      updates.push('definition = ?');
      values.push(JSON.stringify(data.definition));
    }

    values.push(id);

    const stmt = db.prepare(`
      UPDATE workflows 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `);
    stmt.run(...values);

    return this.getById(id);
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM workflows WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private static rowToWorkflow(row: WorkflowRow): Workflow {
    const def = JSON.parse(row.definition) as WorkflowDefinition;
    const schemaVersion = row.schema_version || 1;
    const finalDef: WorkflowDefinition = schemaVersion >= 2 ? def : (() => {
      const v2 = migrateToV2(def);
      db.prepare(
        'UPDATE workflows SET definition = ?, schema_version = 2, updated_at = ? WHERE id = ?'
      ).run(JSON.stringify(v2), new Date().toISOString(), row.id);
      return v2 as unknown as WorkflowDefinition;
    })();
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status,
      definition: finalDef,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

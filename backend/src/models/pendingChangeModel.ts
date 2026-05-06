import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { PendingChange, WorkflowDiff } from '../types/assistant';

function rowToPending(row: Record<string, unknown>): PendingChange {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    workflowId: row.workflow_id as string,
    diff: JSON.parse(row.diff as string) as WorkflowDiff[],
    rationale: row.rationale ? (row.rationale as string) : undefined,
    status: row.status as 'pending' | 'applied' | 'rejected',
    createdAt: row.created_at as string,
    resolvedAt: row.resolved_at ? (row.resolved_at as string) : undefined,
  };
}

export interface CreatePendingChangeInput {
  conversationId: string;
  workflowId: string;
  diff: WorkflowDiff[];
  rationale?: string;
}

export class PendingChangeModel {
  static getById(id: string): PendingChange | undefined {
    const row = db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(id);
    return row ? rowToPending(row) : undefined;
  }

  static create(input: CreatePendingChangeInput): PendingChange {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO pending_changes (id, conversation_id, workflow_id, diff, rationale, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`
    ).run(id, input.conversationId, input.workflowId, JSON.stringify(input.diff), input.rationale ?? null);
    return this.getById(id)!;
  }

  static markApplied(id: string): void {
    db.prepare(
      `UPDATE pending_changes SET status = 'applied', resolved_at = datetime('now') WHERE id = ?`
    ).run(id);
  }

  static markRejected(id: string): void {
    db.prepare(
      `UPDATE pending_changes SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?`
    ).run(id);
  }

  static deleteAll(): void {
    db.prepare('DELETE FROM pending_changes').run();
  }
}

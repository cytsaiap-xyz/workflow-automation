import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { AssistantConversation, AssistantMessage, AssistantSurface } from '../types/assistant';

function rowToConv(row: Record<string, unknown>): AssistantConversation {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    surface: row.surface as AssistantSurface,
    nodeId: row.node_id ? (row.node_id as string) : undefined,
    messages: row.messages ? JSON.parse(row.messages as string) as AssistantMessage[] : [],
    summary: row.summary ? (row.summary as string) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export interface FindOrCreateInput {
  workflowId: string;
  surface: AssistantSurface;
  nodeId?: string;
}

export class AssistantConversationModel {
  static getById(id: string): AssistantConversation | undefined {
    const row = db.prepare('SELECT * FROM assistant_conversations WHERE id = ?').get(id);
    return row ? rowToConv(row) : undefined;
  }

  static find(input: FindOrCreateInput): AssistantConversation | undefined {
    const row = input.surface === 'node-popover'
      ? db.prepare(
          `SELECT * FROM assistant_conversations
           WHERE workflow_id = ? AND surface = 'node-popover' AND node_id = ?`
        ).get(input.workflowId, input.nodeId ?? null)
      : db.prepare(
          `SELECT * FROM assistant_conversations
           WHERE workflow_id = ? AND surface = 'panel'`
        ).get(input.workflowId);
    return row ? rowToConv(row) : undefined;
  }

  static findOrCreate(input: FindOrCreateInput): AssistantConversation {
    const existing = this.find(input);
    if (existing) return existing;
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO assistant_conversations
       (id, workflow_id, surface, node_id, messages, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', NULL, ?, ?)`
    ).run(id, input.workflowId, input.surface, input.nodeId ?? null, now, now);
    return this.getById(id)!;
  }

  static appendMessage(id: string, message: AssistantMessage): void {
    const conv = this.getById(id);
    if (!conv) throw new Error(`Conversation not found: ${id}`);
    const messages = [...conv.messages, message];
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE assistant_conversations SET messages = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(messages), now, id);
  }

  static replaceMessages(id: string, messages: AssistantMessage[]): void {
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE assistant_conversations SET messages = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(messages), now, id);
  }

  static compact(id: string, newSummary: string, keepLastN: number): void {
    const conv = this.getById(id);
    if (!conv) throw new Error(`Conversation not found: ${id}`);
    const merged = conv.summary
      ? `${conv.summary}\n\n${newSummary}`.slice(-8000)
      : newSummary;
    const trimmed = conv.messages.slice(-keepLastN);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE assistant_conversations SET messages = ?, summary = ?, updated_at = ? WHERE id = ?`
    ).run(JSON.stringify(trimmed), merged, now, id);
  }

  static deleteAll(): void {
    db.prepare('DELETE FROM assistant_conversations').run();
  }
}

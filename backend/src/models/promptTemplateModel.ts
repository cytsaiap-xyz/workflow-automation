import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { PromptTemplate, CreatePromptTemplateInput, UpdatePromptTemplateInput } from '../types/promptTemplate';

function rowToTemplate(row: Record<string, unknown>): PromptTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    role: row.role as 'system' | 'user',
    content: row.content as string,
    description: row.description ? (row.description as string) : undefined,
    requiresVision: !!(row.requires_vision),
    tags: row.tags ? JSON.parse(row.tags as string) as string[] : [],
    builtin: !!(row.builtin),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class PromptTemplateModel {
  static getAll(): PromptTemplate[] {
    return db.prepare('SELECT * FROM prompt_templates ORDER BY name ASC').all().map(rowToTemplate);
  }

  static getById(id: string): PromptTemplate | undefined {
    const row = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id);
    return row ? rowToTemplate(row) : undefined;
  }

  static getByName(name: string): PromptTemplate | undefined {
    const row = db.prepare('SELECT * FROM prompt_templates WHERE name = ?').get(name);
    return row ? rowToTemplate(row) : undefined;
  }

  static getByTag(tag: string): PromptTemplate[] {
    return this.getAll().filter(t => t.tags.includes(tag));
  }

  static create(input: CreatePromptTemplateInput): PromptTemplate {
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO prompt_templates (id, name, role, content, description, requires_vision, tags, builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, input.name, input.role, input.content,
      input.description ?? null,
      input.requiresVision ? 1 : 0,
      input.tags ? JSON.stringify(input.tags) : null,
      input.builtin ? 1 : 0,
      now, now
    );
    return this.getById(id)!;
  }

  static upsertByName(input: CreatePromptTemplateInput): PromptTemplate {
    const existing = this.getByName(input.name);
    if (existing) {
      return this.update(existing.id, input)!;
    }
    return this.create(input);
  }

  static update(id: string, patch: UpdatePromptTemplateInput): PromptTemplate | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE prompt_templates SET
         name = COALESCE(?, name),
         role = COALESCE(?, role),
         content = COALESCE(?, content),
         description = COALESCE(?, description),
         requires_vision = COALESCE(?, requires_vision),
         tags = COALESCE(?, tags),
         builtin = COALESCE(?, builtin),
         updated_at = ?
       WHERE id = ?`
    ).run(
      patch.name ?? null,
      patch.role ?? null,
      patch.content ?? null,
      patch.description ?? null,
      patch.requiresVision === undefined ? null : patch.requiresVision ? 1 : 0,
      patch.tags ? JSON.stringify(patch.tags) : null,
      patch.builtin === undefined ? null : patch.builtin ? 1 : 0,
      now, id
    );
    return this.getById(id);
  }

  static delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    if (existing.builtin) {
      throw new Error('Cannot delete a builtin template; duplicate it first');
    }
    const res = db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
    return res.changes > 0;
  }

  static deleteAll(): void {
    db.prepare('DELETE FROM prompt_templates').run();
  }
}

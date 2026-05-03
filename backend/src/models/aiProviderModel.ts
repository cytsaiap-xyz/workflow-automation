import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { AiProvider, CreateAiProviderInput, UpdateAiProviderInput } from '../types/aiProvider';

function rowToProvider(row: Record<string, unknown>): AiProvider {
  return {
    id: row.id as string,
    name: row.name as string,
    baseUrl: row.base_url as string,
    model: row.model as string,
    apiKey: row.api_key ? (row.api_key as string) : undefined,
    headers: row.headers ? JSON.parse(row.headers as string) as Record<string, string> : undefined,
    supportsVision: !!(row.supports_vision),
    isDefault: !!(row.is_default),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class AiProviderModel {
  static getAll(): AiProvider[] {
    return db.prepare('SELECT * FROM ai_providers ORDER BY is_default DESC, name ASC')
      .all().map(rowToProvider);
  }

  static getById(id: string): AiProvider | undefined {
    const row = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id);
    return row ? rowToProvider(row) : undefined;
  }

  static getDefault(): AiProvider | undefined {
    const row = db.prepare('SELECT * FROM ai_providers WHERE is_default = 1 LIMIT 1').get();
    return row ? rowToProvider(row) : undefined;
  }

  static create(input: CreateAiProviderInput): AiProvider {
    const id = uuidv4();
    const now = new Date().toISOString();
    if (input.isDefault) {
      db.prepare('UPDATE ai_providers SET is_default = 0').run();
    }
    db.prepare(
      `INSERT INTO ai_providers (id, name, base_url, model, api_key, headers, supports_vision, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, input.name, input.baseUrl, input.model,
      input.apiKey ?? null,
      input.headers ? JSON.stringify(input.headers) : null,
      input.supportsVision ? 1 : 0,
      input.isDefault ? 1 : 0,
      now, now
    );
    return this.getById(id)!;
  }

  static update(id: string, patch: UpdateAiProviderInput): AiProvider | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    if (patch.isDefault === true) {
      db.prepare('UPDATE ai_providers SET is_default = 0').run();
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE ai_providers SET
         name = COALESCE(?, name),
         base_url = COALESCE(?, base_url),
         model = COALESCE(?, model),
         api_key = COALESCE(?, api_key),
         headers = COALESCE(?, headers),
         supports_vision = COALESCE(?, supports_vision),
         is_default = COALESCE(?, is_default),
         updated_at = ?
       WHERE id = ?`
    ).run(
      patch.name ?? null,
      patch.baseUrl ?? null,
      patch.model ?? null,
      patch.apiKey ?? null,
      patch.headers ? JSON.stringify(patch.headers) : null,
      patch.supportsVision === undefined ? null : patch.supportsVision ? 1 : 0,
      patch.isDefault === undefined ? null : patch.isDefault ? 1 : 0,
      now, id
    );
    return this.getById(id);
  }

  static delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    if (existing.isDefault) {
      throw new Error('Cannot delete the default provider; promote another first');
    }
    const res = db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);
    return res.changes > 0;
  }

  static deleteAll(): void {
    db.prepare('DELETE FROM ai_providers').run();
  }
}

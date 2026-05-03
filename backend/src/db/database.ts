import initSqlJs, { Database as SqlJsDatabase, QueryExecResult } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../../data/workflow.db');

function toRows(results: QueryExecResult[]): Record<string, any>[] {
  if (!results || results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map(row =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
}

/**
 * Thin adapter around sql.js that exposes the same synchronous API
 * as better-sqlite3 (prepare/all/get/run, exec, pragma, transaction),
 * while persisting the in-memory database to disk after every write.
 */
class SqlJsAdapter {
  private inTransaction = false;

  constructor(private sqlDb: SqlJsDatabase, private dbPath: string) {}

  private save(): void {
    if (this.inTransaction) return;
    const data = this.sqlDb.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
    // sql.js export() resets connection-level PRAGMAs; restore foreign keys
    this.sqlDb.run('PRAGMA foreign_keys = ON');
  }

  exec(sql: string): this {
    this.sqlDb.exec(sql);
    this.save();
    return this;
  }

  pragma(statement: string): void {
    this.sqlDb.run(`PRAGMA ${statement}`);
  }

  prepare(sql: string) {
    return {
      all: (...params: any[]): Record<string, any>[] => {
        const flat = params.flat();
        const results = this.sqlDb.exec(sql, flat.length ? flat : undefined);
        return toRows(results);
      },
      get: (...params: any[]): Record<string, any> | undefined => {
        const flat = params.flat();
        const results = this.sqlDb.exec(sql, flat.length ? flat : undefined);
        return toRows(results)[0];
      },
      run: (...params: any[]): { changes: number } => {
        const flat = params.flat();
        this.sqlDb.run(sql, flat.length ? flat : undefined);
        const changes = this.sqlDb.getRowsModified();
        this.save();
        return { changes };
      },
    };
  }

  transaction<T>(fn: (arg: T) => void): (arg: T) => void {
    return (arg: T) => {
      this.sqlDb.run('BEGIN');
      this.inTransaction = true;
      try {
        fn(arg);
        this.sqlDb.run('COMMIT');
        this.inTransaction = false;
        this.save();
      } catch (e) {
        this.sqlDb.run('ROLLBACK');
        this.inTransaction = false;
        throw e;
      }
    };
  }
}

let _db: SqlJsAdapter | null = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'paused')),
    definition TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    triggered_by TEXT CHECK(triggered_by IN ('manual', 'schedule', 'webhook', 'api')),
    start_time TEXT,
    end_time TEXT,
    success_rate REAL DEFAULT 0,
    result TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    station_id TEXT,
    step_id TEXT,
    level TEXT CHECK(level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    data TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_execution_id ON execution_logs(execution_id);

  CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    definition TEXT NOT NULL,
    change_summary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_versions_workflow_id ON workflow_versions(workflow_id, version DESC);

  CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT,
    headers TEXT,
    supports_vision INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('system','user')),
    content TEXT NOT NULL,
    description TEXT,
    requires_vision INTEGER DEFAULT 0,
    tags TEXT,
    builtin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_prompt_templates_tags ON prompt_templates(tags);
`;

export async function initDatabase(): Promise<void> {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load WASM binary from the installed package so the path is always correct.
  // Cast via unknown because Node.js Buffer is a Uint8Array subtype, not ArrayBuffer,
  // but sql.js accepts it at runtime even though @types/sql.js declares ArrayBuffer.
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath) as unknown as ArrayBuffer;
  const SQL = await initSqlJs({ wasmBinary });

  let sqlDb: SqlJsDatabase;
  if (fs.existsSync(DB_PATH)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    sqlDb = new SQL.Database();
  }

  _db = new SqlJsAdapter(sqlDb, DB_PATH);
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA_SQL);
}

/**
 * Proxy that delegates to the adapter once initialized.
 * Model files import this and use it synchronously — they never call
 * initDatabase() themselves; that is done once in index.ts at startup.
 */
const db = new Proxy({} as SqlJsAdapter, {
  get(_target, prop: string | symbol) {
    if (!_db) {
      throw new Error('Database not initialized. Call initDatabase() first.');
    }
    const value = (_db as any)[prop as string];
    return typeof value === 'function' ? value.bind(_db) : value;
  },
});

export default db;

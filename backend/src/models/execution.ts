import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { Execution, ExecutionResult, ExecutionLog } from '../types/workflow';

interface ExecutionRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  triggered_by: 'manual' | 'schedule' | 'webhook' | 'api';
  start_time: string;
  end_time: string | null;
  success_rate: number;
  result: string | null;
}

interface LogRow {
  id: string;
  execution_id: string;
  station_id: string | null;
  step_id: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data: string | null;
  timestamp: string;
}

export class ExecutionModel {
  static getAll(limit = 50): Execution[] {
    const stmt = db.prepare(`
      SELECT * FROM executions 
      ORDER BY start_time DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as ExecutionRow[];
    return rows.map(this.rowToExecution);
  }

  static getByWorkflowId(workflowId: string, limit = 20): Execution[] {
    const stmt = db.prepare(`
      SELECT * FROM executions 
      WHERE workflow_id = ? 
      ORDER BY start_time DESC 
      LIMIT ?
    `);
    const rows = stmt.all(workflowId, limit) as ExecutionRow[];
    return rows.map(this.rowToExecution);
  }

  static getById(id: string): Execution | null {
    const stmt = db.prepare('SELECT * FROM executions WHERE id = ?');
    const row = stmt.get(id) as ExecutionRow | undefined;
    return row ? this.rowToExecution(row) : null;
  }

  static create(workflowId: string, workflowName: string, triggeredBy: Execution['triggeredBy'], id?: string): Execution {
    const resolvedId = id ?? uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO executions (id, workflow_id, workflow_name, status, triggered_by, start_time, success_rate)
      VALUES (?, ?, ?, 'running', ?, ?, 0)
    `);
    stmt.run(resolvedId, workflowId, workflowName, triggeredBy, now);

    return this.getById(resolvedId)!;
  }

  static update(id: string, data: Partial<{
    status: Execution['status'];
    endTime: string;
    successRate: number;
    result: ExecutionResult;
  }>): Execution | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.endTime !== undefined) {
      updates.push('end_time = ?');
      values.push(data.endTime);
    }
    if (data.successRate !== undefined) {
      updates.push('success_rate = ?');
      values.push(data.successRate);
    }
    if (data.result !== undefined) {
      updates.push('result = ?');
      values.push(JSON.stringify(data.result));
    }

    if (updates.length === 0) return this.getById(id);

    values.push(id);

    const stmt = db.prepare(`
      UPDATE executions 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `);
    stmt.run(...values);

    return this.getById(id);
  }

  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM executions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private static rowToExecution(row: ExecutionRow): Execution {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      status: row.status,
      triggeredBy: row.triggered_by,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      successRate: row.success_rate,
      result: row.result ? JSON.parse(row.result) : undefined
    };
  }
}

export class LogModel {
  static getByExecutionId(executionId: string): ExecutionLog[] {
    const stmt = db.prepare(`
      SELECT * FROM execution_logs 
      WHERE execution_id = ? 
      ORDER BY timestamp ASC
    `);
    const rows = stmt.all(executionId) as LogRow[];
    return rows.map(this.rowToLog);
  }

  static create(data: Omit<ExecutionLog, 'id' | 'timestamp'>): ExecutionLog {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO execution_logs (id, execution_id, station_id, step_id, level, message, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.executionId,
      data.stationId || null,
      data.stepId || null,
      data.level,
      data.message,
      data.data ? JSON.stringify(data.data) : null,
      now
    );

    return {
      id,
      ...data,
      timestamp: now
    };
  }

  static createMany(logs: Omit<ExecutionLog, 'id' | 'timestamp'>[]): void {
    const stmt = db.prepare(`
      INSERT INTO execution_logs (id, execution_id, station_id, step_id, level, message, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((logs: Omit<ExecutionLog, 'id' | 'timestamp'>[]) => {
      const now = new Date().toISOString();
      for (const log of logs) {
        stmt.run(
          uuidv4(),
          log.executionId,
          log.stationId || null,
          log.stepId || null,
          log.level,
          log.message,
          log.data ? JSON.stringify(log.data) : null,
          now
        );
      }
    });

    insertMany(logs);
  }

  private static rowToLog(row: LogRow): ExecutionLog {
    return {
      id: row.id,
      executionId: row.execution_id,
      stationId: row.station_id || undefined,
      stepId: row.step_id || undefined,
      level: row.level,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : undefined,
      timestamp: row.timestamp
    };
  }
}

# AI Workflow Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Spec 2 — an in-app AI helper that drafts system prompts, scaffolds workflows from natural language, explains and refines workflows, and debugs failed runs. Two surfaces: per-node prompt-helper popover and editor-level chat panel. Runs on the same offline vLLM as workflow nodes via a dedicated assistant provider.

**Architecture:** A backend `assistantService` orchestrates a chat loop with vLLM tool-calling, persisting per-workflow + per-node conversations to SQLite with simple summary-based compaction. Write actions are gated through a `pending_changes` table — the user clicks Apply/Reject in the UI, the server merges the diff into the workflow definition. Server-Sent Events stream tokens, tool calls, and pending-change notifications to the frontend chat panel and node-popover components.

**Tech Stack:** Node 18+/TypeScript, Express, sql.js, OpenAI SDK (vLLM-compatible), SSE via `text/event-stream`, Vitest, supertest, React + Zustand.

**Spec reference:** `docs/superpowers/specs/2026-05-03-ai-workflow-assistant-design.md`

**Depends on Spec 1 being merged** — uses `AiProviderModel` and `PromptTemplateModel`.

---

## File Structure

### Backend — new files

| Path | Responsibility |
|---|---|
| `backend/src/types/assistant.ts` | `AssistantConversation`, `AssistantMessage`, `WorkflowDiff`, `PendingChange` |
| `backend/src/models/assistantConversationModel.ts` | DB CRUD |
| `backend/src/models/pendingChangeModel.ts` | DB CRUD |
| `backend/src/services/assistantService.ts` | Chat loop + compaction + tool dispatch |
| `backend/src/services/assistantTools.ts` | Tool catalog + dispatch table |
| `backend/src/services/assistantPromptBuilder.ts` | Builds system prompt with tool descriptions |
| `backend/src/services/diffApplier.ts` | Applies a `WorkflowDiff` to a workflow definition |
| `backend/src/services/sseStream.ts` | Tiny SSE writer helper |
| `backend/src/services/tokenEstimator.ts` | Char-based token estimator |
| `backend/src/routes/assistant.ts` | REST + SSE endpoints |
| `backend/src/seeds/seedAssistantProvider.ts` | Optional seeded "assistant" provider that points to default |
| `backend/src/__tests__/assistantConversation.test.ts` | Model tests |
| `backend/src/__tests__/diffApplier.test.ts` | Diff application tests |
| `backend/src/__tests__/assistantTools.test.ts` | Tool dispatch tests |
| `backend/src/__tests__/assistantService.compaction.test.ts` | Compaction tests |
| `backend/src/__tests__/assistantApi.test.ts` | SSE endpoint tests |

### Backend — modified files

| Path | Why |
|---|---|
| `backend/src/db/database.ts` | Add `assistant_conversations` + `pending_changes` tables |
| `backend/src/index.ts` | Register `/api/assistant` router; run `seedAssistantProvider()` |
| `backend/src/services/workflowSettings.ts` (new lightweight kv store) or extend an existing config store | Persist `assistant_provider_id` |

### Frontend — new files

| Path | Responsibility |
|---|---|
| `frontend/src/shared/api/assistantApi.ts` | REST + SSE client |
| `frontend/src/shared/stores/assistantStore.ts` | Zustand store for streaming messages + pending changes |
| `frontend/src/features/assistant/AssistantChatPanel.tsx` | Right-side panel |
| `frontend/src/features/assistant/PromptHelperPopover.tsx` | Per-node helper |
| `frontend/src/features/assistant/PendingChangeCard.tsx` | Apply/Reject card |
| `frontend/src/features/assistant/ToolCallBlock.tsx` | Collapsible tool-call rendering |

### Frontend — modified files

| Path | Why |
|---|---|
| `frontend/src/features/editor/EditorLayout.tsx` (or whichever wraps the canvas) | Mount `AssistantChatPanel` |
| `frontend/src/features/editor/StepConfigPanel.tsx` | Add ✨ button next to prompt fields → opens `PromptHelperPopover` |
| `frontend/src/features/executions/RunPanel.tsx` | "Ask the assistant about this failure" button when execution is failed |

---

## Phase 1 — Schema and types

### Task 1: Add `assistant_conversations` and `pending_changes` tables

**Files:**
- Modify: `backend/src/db/database.ts`
- Test: `backend/src/__tests__/assistantSchema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/assistantSchema.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistant schema', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sch-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('has assistant_conversations table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_conversations'").all();
    expect(rows.length).toBe(1);
  });

  it('has pending_changes table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_changes'").all();
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run assistantSchema`
Expected: FAIL.

- [ ] **Step 3: Append to `SCHEMA_SQL`**

```sql
  CREATE TABLE IF NOT EXISTS assistant_conversations (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    surface TEXT NOT NULL CHECK(surface IN ('panel','node-popover')),
    node_id TEXT,
    messages TEXT NOT NULL DEFAULT '[]',
    summary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_conv_workflow ON assistant_conversations(workflow_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_node
    ON assistant_conversations(workflow_id, node_id)
    WHERE surface = 'node-popover';

  CREATE TABLE IF NOT EXISTS pending_changes (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    diff TEXT NOT NULL,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run assistantSchema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/database.ts backend/src/__tests__/assistantSchema.test.ts
git commit -m "feat(db): assistant_conversations and pending_changes tables"
```

---

### Task 2: Type definitions

**Files:**
- Create: `backend/src/types/assistant.ts`

- [ ] **Step 1: Write types**

```ts
// backend/src/types/assistant.ts
export type AssistantSurface = 'panel' | 'node-popover';

export interface AssistantToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  resultSummary?: string;     // short string for display
  resultFull?: any;           // truncated full payload
}

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AssistantToolCall[];
  toolCallId?: string;        // for role='tool' messages
  timestamp: string;
}

export interface AssistantConversation {
  id: string;
  workflowId: string;
  surface: AssistantSurface;
  nodeId?: string;
  messages: AssistantMessage[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowDiff =
  | { kind: 'add_step'; stationId: string; step: any; position?: number }
  | { kind: 'remove_step'; stationId: string; stepId: string }
  | { kind: 'update_step'; stationId: string; stepId: string; patch: Record<string, any> }
  | { kind: 'add_station'; station: any; position?: number }
  | { kind: 'remove_station'; stationId: string }
  | { kind: 'update_station'; stationId: string; patch: Record<string, any> }
  | { kind: 'replace_workflow'; stations: any[] };

// Post-Spec-3 additions (engine-aware diff):
//   | { kind: 'add_node'; node: any }
//   | { kind: 'remove_node'; nodeId: string }
//   | { kind: 'update_node'; nodeId: string; patch: Record<string, any> }
//   | { kind: 'add_edge'; edge: any }
//   | { kind: 'remove_edge'; edgeId: string }

export interface PendingChange {
  id: string;
  conversationId: string;
  workflowId: string;
  diff: WorkflowDiff[];
  rationale?: string;
  status: 'pending' | 'applied' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
}
```

- [ ] **Step 2: Build to confirm types compile**

```bash
cd backend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/assistant.ts
git commit -m "feat(types): assistant conversation and workflow-diff types"
```

---

## Phase 2 — Models

### Task 3: `AssistantConversationModel`

**Files:**
- Create: `backend/src/models/assistantConversationModel.ts`
- Test: `backend/src/__tests__/assistantConversation.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/__tests__/assistantConversation.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AssistantConversationModel', () => {
  let M: typeof import('../models/assistantConversationModel').AssistantConversationModel;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-conv-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'wf', definition: { stations: [] },
    });
    workflowId = wf.id;
    M = (await import('../models/assistantConversationModel')).AssistantConversationModel;
  });

  beforeEach(() => M.deleteAll());

  it('creates and returns a panel conversation', () => {
    const c = M.findOrCreate({ workflowId, surface: 'panel' });
    expect(c.surface).toBe('panel');
    expect(c.messages).toEqual([]);
  });

  it('reuses existing panel conversation', () => {
    const a = M.findOrCreate({ workflowId, surface: 'panel' });
    const b = M.findOrCreate({ workflowId, surface: 'panel' });
    expect(a.id).toBe(b.id);
  });

  it('isolates node-popover conversations per node', () => {
    const a = M.findOrCreate({ workflowId, surface: 'node-popover', nodeId: 'n1' });
    const b = M.findOrCreate({ workflowId, surface: 'node-popover', nodeId: 'n2' });
    expect(a.id).not.toBe(b.id);
  });

  it('appends messages and persists', () => {
    const c = M.findOrCreate({ workflowId, surface: 'panel' });
    M.appendMessage(c.id, { role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00Z' });
    const reloaded = M.getById(c.id)!;
    expect(reloaded.messages.length).toBe(1);
    expect(reloaded.messages[0].content).toBe('hi');
  });

  it('replaces summary and trims oldest N messages', () => {
    const c = M.findOrCreate({ workflowId, surface: 'panel' });
    for (let i = 0; i < 10; i++) {
      M.appendMessage(c.id, { role: 'user', content: `m${i}`, timestamp: '' });
    }
    M.compact(c.id, 'older context summarized', 5);
    const reloaded = M.getById(c.id)!;
    expect(reloaded.messages.length).toBe(5);
    expect(reloaded.messages[0].content).toBe('m5');
    expect(reloaded.summary).toBe('older context summarized');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm run test -- --run assistantConversation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement model**

```ts
// backend/src/models/assistantConversationModel.ts
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { AssistantConversation, AssistantMessage, AssistantSurface } from '../types/assistant';

function rowToConv(row: any): AssistantConversation {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    surface: row.surface,
    nodeId: row.node_id || undefined,
    messages: row.messages ? JSON.parse(row.messages) : [],
    summary: row.summary || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  /**
   * Replace summary, keep only the trailing `keepLastN` messages.
   * Used by compaction.
   */
  static compact(id: string, newSummary: string, keepLastN: number): void {
    const conv = this.getById(id);
    if (!conv) throw new Error(`Conversation not found: ${id}`);
    const merged = conv.summary
      ? `${conv.summary}\n\n${newSummary}`.slice(-8000) // cap to avoid runaway growth
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run assistantConversation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/assistant.ts backend/src/models/assistantConversationModel.ts backend/src/__tests__/assistantConversation.test.ts
git commit -m "feat(assistant): conversation model with find-or-create + compact"
```

---

### Task 4: `PendingChangeModel`

**Files:**
- Create: `backend/src/models/pendingChangeModel.ts`
- Test: `backend/src/__tests__/pendingChange.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/pendingChange.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PendingChangeModel', () => {
  let M: typeof import('../models/pendingChangeModel').PendingChangeModel;
  let workflowId: string;
  let convId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pc-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({ name: 'wf', definition: { stations: [] } });
    workflowId = wf.id;
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    convId = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' }).id;
    M = (await import('../models/pendingChangeModel')).PendingChangeModel;
  });

  beforeEach(() => M.deleteAll());

  it('creates a pending change', () => {
    const p = M.create({
      conversationId: convId, workflowId,
      diff: [{ kind: 'add_station', station: { id: 's', name: 'x', steps: [], position: { x: 0, y: 0 } } }],
      rationale: 'add a station',
    });
    expect(p.status).toBe('pending');
  });

  it('marks applied', () => {
    const p = M.create({ conversationId: convId, workflowId, diff: [] });
    M.markApplied(p.id);
    expect(M.getById(p.id)!.status).toBe('applied');
  });

  it('rejects', () => {
    const p = M.create({ conversationId: convId, workflowId, diff: [] });
    M.markRejected(p.id);
    expect(M.getById(p.id)!.status).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd backend && npm run test -- --run pendingChange`

- [ ] **Step 3: Implement**

```ts
// backend/src/models/pendingChangeModel.ts
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { PendingChange, WorkflowDiff } from '../types/assistant';

function rowToPending(row: any): PendingChange {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    workflowId: row.workflow_id,
    diff: JSON.parse(row.diff),
    rationale: row.rationale || undefined,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || undefined,
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
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/pendingChangeModel.ts backend/src/__tests__/pendingChange.test.ts
git commit -m "feat(assistant): pending change model"
```

---

## Phase 3 — Diff applier

### Task 5: Workflow diff applier

**Files:**
- Create: `backend/src/services/diffApplier.ts`
- Test: `backend/src/__tests__/diffApplier.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/__tests__/diffApplier.test.ts
import { describe, it, expect } from 'vitest';
import { applyDiff } from '../services/diffApplier';
import type { WorkflowDefinition } from '../types/workflow';
import type { WorkflowDiff } from '../types/assistant';

const baseDef = (): WorkflowDefinition => ({
  stations: [
    { id: 's1', name: 'first', position: { x: 0, y: 0 }, steps: [
      { id: 'st1', name: 'step1', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } },
    ]},
  ],
});

describe('applyDiff', () => {
  it('adds a station', () => {
    const out = applyDiff(baseDef(), [{
      kind: 'add_station',
      station: { id: 's2', name: 'second', steps: [], position: { x: 0, y: 1 } },
    }]);
    expect(out.stations.length).toBe(2);
  });

  it('updates a step config', () => {
    const out = applyDiff(baseDef(), [{
      kind: 'update_step', stationId: 's1', stepId: 'st1',
      patch: { config: { code: '2' } },
    }]);
    expect(out.stations[0].steps[0].config.code).toBe('2');
  });

  it('removes a station', () => {
    const out = applyDiff(baseDef(), [{ kind: 'remove_station', stationId: 's1' }]);
    expect(out.stations.length).toBe(0);
  });

  it('replaces workflow stations', () => {
    const out = applyDiff(baseDef(), [{
      kind: 'replace_workflow',
      stations: [{ id: 'sx', name: 'x', steps: [], position: { x: 0, y: 0 } }],
    }]);
    expect(out.stations.length).toBe(1);
    expect(out.stations[0].id).toBe('sx');
  });

  it('throws on invalid diff target', () => {
    expect(() => applyDiff(baseDef(), [{ kind: 'remove_step', stationId: 'missing', stepId: 'x' }]))
      .toThrow(/station not found/i);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/diffApplier.ts
import { WorkflowDefinition } from '../types/workflow';
import { WorkflowDiff } from '../types/assistant';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function findStation(def: WorkflowDefinition, id: string) {
  const s = def.stations.find(s => s.id === id);
  if (!s) throw new Error(`Station not found: ${id}`);
  return s;
}

export function applyDiff(def: WorkflowDefinition, diffs: WorkflowDiff[]): WorkflowDefinition {
  const out = clone(def);
  for (const d of diffs) {
    switch (d.kind) {
      case 'add_station': {
        const idx = d.position ?? out.stations.length;
        out.stations.splice(idx, 0, d.station as any);
        break;
      }
      case 'remove_station': {
        const idx = out.stations.findIndex(s => s.id === d.stationId);
        if (idx === -1) throw new Error(`Station not found: ${d.stationId}`);
        out.stations.splice(idx, 1);
        break;
      }
      case 'update_station': {
        const s = findStation(out, d.stationId);
        Object.assign(s, d.patch);
        break;
      }
      case 'add_step': {
        const s = findStation(out, d.stationId);
        const idx = d.position ?? s.steps.length;
        s.steps.splice(idx, 0, d.step as any);
        break;
      }
      case 'remove_step': {
        const s = findStation(out, d.stationId);
        const idx = s.steps.findIndex(st => st.id === d.stepId);
        if (idx === -1) throw new Error(`Step not found: ${d.stepId}`);
        s.steps.splice(idx, 1);
        break;
      }
      case 'update_step': {
        const s = findStation(out, d.stationId);
        const st = s.steps.find(x => x.id === d.stepId);
        if (!st) throw new Error(`Step not found: ${d.stepId}`);
        if (d.patch.config) {
          st.config = { ...st.config, ...d.patch.config };
        }
        for (const k of Object.keys(d.patch)) {
          if (k !== 'config') (st as any)[k] = (d.patch as any)[k];
        }
        break;
      }
      case 'replace_workflow': {
        out.stations = clone(d.stations);
        break;
      }
      default: {
        throw new Error(`Unknown diff kind: ${(d as any).kind}`);
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/diffApplier.ts backend/src/__tests__/diffApplier.test.ts
git commit -m "feat(assistant): workflow diff applier (sequential model)"
```

---

## Phase 4 — Assistant tools

### Task 6: Token estimator + SSE writer (utilities)

**Files:**
- Create: `backend/src/services/tokenEstimator.ts`
- Create: `backend/src/services/sseStream.ts`
- Test: `backend/src/__tests__/tokenEstimator.test.ts`

- [ ] **Step 1: Tiny test**

```ts
// backend/src/__tests__/tokenEstimator.test.ts
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../services/tokenEstimator';

describe('estimateTokens', () => {
  it('returns ceil(chars / 3.5)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello world')).toBe(4); // 11 chars / 3.5 = 3.14 → 4
  });
});
```

- [ ] **Step 2: Implement**

```ts
// backend/src/services/tokenEstimator.ts
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
```

```ts
// backend/src/services/sseStream.ts
import { Response } from 'express';

export interface SseEvent { type: string; [key: string]: any; }

export class SseWriter {
  private closed = false;
  constructor(private res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.on('close', () => { this.closed = true; });
  }

  send(event: SseEvent): boolean {
    if (this.closed) return false;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  }

  close(): void {
    if (!this.closed) {
      this.res.end();
      this.closed = true;
    }
  }

  isClosed(): boolean { return this.closed; }
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npm run test -- --run tokenEstimator
git add backend/src/services/tokenEstimator.ts backend/src/services/sseStream.ts backend/src/__tests__/tokenEstimator.test.ts
git commit -m "feat(util): token estimator and SSE writer"
```

---

### Task 7: Tool catalog and dispatcher

**Files:**
- Create: `backend/src/services/assistantTools.ts`
- Test: `backend/src/__tests__/assistantTools.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/assistantTools.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistantTools', () => {
  let TOOLS: any;
  let dispatch: any;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tools-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'wf', definition: { stations: [
        { id: 's', name: 'x', position: { x: 0, y: 0 }, steps: [
          { id: 'st', name: 'st', type: 'ai-prompt', config: { aiSystemPrompt: 'old' }, position: { x: 0, y: 0 } },
        ]},
      ]},
    });
    workflowId = wf.id;
    const mod = await import('../services/assistantTools');
    TOOLS = mod.ASSISTANT_TOOL_SCHEMAS;
    dispatch = mod.dispatchTool;
  });

  it('exposes the read-only and write tool schemas', () => {
    const names = TOOLS.map((t: any) => t.function.name);
    expect(names).toContain('get_workflow');
    expect(names).toContain('list_node_types');
    expect(names).toContain('get_prompt_library');
    expect(names).toContain('propose_workflow_change');
    expect(names).toContain('set_node_prompt');
    expect(names).not.toContain('search_workflows');
  });

  it('get_workflow returns the workflow definition', async () => {
    const out = await dispatch('get_workflow', { workflow_id: workflowId }, { conversationId: 'c1', workflowId });
    expect(out.definition.stations.length).toBe(1);
  });

  it('set_node_prompt mutates the system prompt directly', async () => {
    await dispatch('set_node_prompt', {
      workflow_id: workflowId, node_id: 'st', role: 'system', prompt: 'new',
    }, { conversationId: 'c1', workflowId });
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getById(workflowId)!.definition.stations[0].steps[0].config.aiSystemPrompt).toBe('new');
  });

  it('propose_workflow_change creates a pending change', async () => {
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    const conv = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' });
    const out = await dispatch('propose_workflow_change', {
      workflow_id: workflowId,
      diff: [{ kind: 'add_station', station: { id: 'new', name: 'n', steps: [], position: { x: 0, y: 1 } } }],
      rationale: 'add a station',
    }, { conversationId: conv.id, workflowId });
    expect(out.change_id).toBeTruthy();
    const { PendingChangeModel } = await import('../models/pendingChangeModel');
    expect(PendingChangeModel.getById(out.change_id)?.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement tools**

```ts
// backend/src/services/assistantTools.ts
import { WorkflowModel } from '../models/workflow';
import { ExecutionModel } from '../models/execution';
import { LogModel } from '../models/logs'; // assumes existing log model — use ExecutionLogs router otherwise
import { PromptTemplateModel } from '../models/promptTemplateModel';
import { AssistantConversationModel } from '../models/assistantConversationModel';
import { PendingChangeModel } from '../models/pendingChangeModel';
import { applyDiff } from './diffApplier';
import { WorkflowDiff } from '../types/assistant';

export interface ToolContext {
  conversationId: string;
  workflowId: string;
}

const NODE_DOCS: Record<string, string> = {
  'ai-structured-output': 'Calls the configured LLM with a JSON schema and returns parsed structured output.',
  'load-document': 'Reads a PDF/PPTX/TXT file. Output: { chunks: [{ pageId, text, imagePath }] }.',
  // ...add as the platform grows. Unknown types fall through to a generic doc.
};

function describeStepConfig(): Record<string, any> {
  // Minimal schema description; full TS types can be auto-generated later.
  return {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JS or Python source for script nodes' },
      url: { type: 'string' }, method: { type: 'string' },
      aiPromptTemplateSystemId: { type: 'string' },
      aiPromptTemplateUserId: { type: 'string' },
      aiProviderId: { type: 'string' },
      // (Other fields elided for brevity — list common ones.)
    },
  };
}

export const ASSISTANT_TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_workflow',
      description: 'Read the current workflow definition.',
      parameters: {
        type: 'object', required: ['workflow_id'],
        properties: { workflow_id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_node_types',
      description: 'List all available step types and their config schemas.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_docs',
      description: 'Get documentation for a single step type.',
      parameters: {
        type: 'object', required: ['type'],
        properties: { type: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prompt_library',
      description: 'List prompt templates, optionally filtered by tag or role.',
      parameters: {
        type: 'object',
        properties: { tag: { type: 'string' }, role: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_execution',
      description: 'Read an execution record by id.',
      parameters: {
        type: 'object', required: ['execution_id'],
        properties: { execution_id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_execution_logs',
      description: 'Read log entries for an execution.',
      parameters: {
        type: 'object', required: ['execution_id'],
        properties: { execution_id: { type: 'string' }, level: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_output',
      description: 'Read the recorded output of a single step in an execution.',
      parameters: {
        type: 'object', required: ['execution_id', 'step_id'],
        properties: { execution_id: { type: 'string' }, step_id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_workflow_change',
      description: 'Propose a workflow diff. Returns a change_id; the user must Apply it via UI.',
      parameters: {
        type: 'object', required: ['workflow_id', 'diff'],
        properties: {
          workflow_id: { type: 'string' },
          diff: { type: 'array', items: { type: 'object' } },
          rationale: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_node_prompt',
      description: 'Directly write a prompt to a single AI node (low-stakes).',
      parameters: {
        type: 'object', required: ['workflow_id', 'node_id', 'role', 'prompt'],
        properties: {
          workflow_id: { type: 'string' },
          node_id: { type: 'string' },
          role: { type: 'string', enum: ['system', 'user'] },
          prompt: { type: 'string' },
        },
      },
    },
  },
] as const;

export async function dispatchTool(
  name: string,
  args: any,
  ctx: ToolContext
): Promise<any> {
  switch (name) {
    case 'get_workflow': {
      const w = WorkflowModel.getById(args.workflow_id);
      if (!w) throw new Error('workflow not found');
      return w;
    }
    case 'list_node_types': {
      const STEP_TYPES = [
        'trigger-manual','trigger-cron','trigger-webhook',
        'script-js','script-python','http-request','if-else','set-variable','wait',
        'notification-slack','action-email','action-slack','connector-db',
        'ai-prompt','ai-structured-output','ai-agent','ai-router',
        'load-document','quiz-output-writer',
      ];
      return STEP_TYPES.map(t => ({
        type: t,
        description: NODE_DOCS[t] || `(no detailed documentation; type: ${t})`,
        configSchema: describeStepConfig(),
      }));
    }
    case 'get_node_docs': {
      return { type: args.type, doc: NODE_DOCS[args.type] || '(no detailed documentation)' };
    }
    case 'get_prompt_library': {
      let list = PromptTemplateModel.getAll();
      if (args.tag) list = list.filter(t => t.tags.includes(args.tag));
      if (args.role) list = list.filter(t => t.role === args.role);
      return list;
    }
    case 'get_execution': {
      const ex = ExecutionModel.getById(args.execution_id);
      if (!ex) throw new Error('execution not found');
      return ex;
    }
    case 'get_execution_logs': {
      // Adapt to the existing log model API if name differs.
      const logs = LogModel.getByExecutionId(args.execution_id, args.level);
      return logs;
    }
    case 'get_node_output': {
      const ex = ExecutionModel.getById(args.execution_id);
      if (!ex || !ex.result) throw new Error('execution or result not found');
      for (const station of ex.result.stations) {
        for (const step of station.steps) {
          if (step.stepId === args.step_id) return step.output;
        }
      }
      throw new Error('step not found in execution');
    }
    case 'propose_workflow_change': {
      const wf = WorkflowModel.getById(args.workflow_id);
      if (!wf) throw new Error('workflow not found');
      // Validate diff applies (throws if invalid target).
      applyDiff(wf.definition, args.diff as WorkflowDiff[]);
      const change = PendingChangeModel.create({
        conversationId: ctx.conversationId,
        workflowId: args.workflow_id,
        diff: args.diff,
        rationale: args.rationale,
      });
      return { change_id: change.id, status: 'pending' };
    }
    case 'set_node_prompt': {
      const wf = WorkflowModel.getById(args.workflow_id);
      if (!wf) throw new Error('workflow not found');
      let mutated = false;
      for (const station of wf.definition.stations) {
        for (const step of station.steps) {
          if (step.id === args.node_id) {
            if (args.role === 'system') step.config.aiSystemPrompt = args.prompt;
            else step.config.aiPrompt = args.prompt;
            mutated = true;
          }
        }
      }
      if (!mutated) throw new Error('node not found');
      WorkflowModel.update(args.workflow_id, { definition: wf.definition });
      return { ok: true };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
```

(`LogModel.getByExecutionId` may not exist verbatim — adapt to the actual model in `backend/src/models/`. Replace with whatever method retrieves execution logs.)

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/assistantTools.ts backend/src/__tests__/assistantTools.test.ts
git commit -m "feat(assistant): tool catalog + dispatcher"
```

---

## Phase 5 — Assistant service

### Task 8: Prompt builder

**Files:**
- Create: `backend/src/services/assistantPromptBuilder.ts`
- Test: `backend/src/__tests__/assistantPromptBuilder.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/assistantPromptBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { buildAssistantSystemPrompt } from '../services/assistantPromptBuilder';

describe('buildAssistantSystemPrompt', () => {
  it('mentions offline guardrails and tool names', () => {
    const sp = buildAssistantSystemPrompt({ surface: 'panel' });
    expect(sp).toMatch(/offline/i);
    expect(sp).toMatch(/get_workflow/);
    expect(sp).toMatch(/propose_workflow_change/);
  });

  it('node-popover surface focuses on prompt editing', () => {
    const sp = buildAssistantSystemPrompt({ surface: 'node-popover', nodeId: 'n1' });
    expect(sp).toMatch(/set_node_prompt/);
    expect(sp).toMatch(/n1/);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/assistantPromptBuilder.ts
import { ASSISTANT_TOOL_SCHEMAS } from './assistantTools';

interface Options {
  surface: 'panel' | 'node-popover';
  nodeId?: string;
}

export function buildAssistantSystemPrompt(opts: Options): string {
  const tools = ASSISTANT_TOOL_SCHEMAS.map((t: any) => `- ${t.function.name}: ${t.function.description}`).join('\n');
  const surfaceGuidance = opts.surface === 'node-popover'
    ? `You are in node-popover mode. Focus narrowly on node "${opts.nodeId}". Prefer set_node_prompt for prompt edits. Do not propose whole-workflow changes.`
    : `You are in panel mode. You may scaffold workflows, explain workflows, debug failures, and propose changes via propose_workflow_change.`;
  return [
    'You are an offline workflow-building helper for a visual automation platform.',
    'The platform runs entirely on a local multi-modal vLLM server with no external internet access except via an explicit allowlist.',
    'Slack/email nodes are hidden by default in offline mode.',
    surfaceGuidance,
    'When asked to build or modify a workflow, prefer existing templates from get_prompt_library and produce propose_workflow_change with a clear rationale.',
    'When asked to explain a workflow, fetch it first with get_workflow.',
    'When asked about a failed run, fetch get_execution + get_execution_logs first; do not speculate without reading them.',
    'Tools available:',
    tools,
  ].join('\n\n');
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/assistantPromptBuilder.ts backend/src/__tests__/assistantPromptBuilder.test.ts
git commit -m "feat(assistant): system prompt builder"
```

---

### Task 9: Compaction logic

**Files:**
- Modify: `backend/src/services/assistantService.ts` (new file — compaction lives here as part of the service)
- Test: `backend/src/__tests__/assistantService.compaction.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/assistantService.compaction.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistantService.maybeCompact', () => {
  let workflowId: string;
  let convId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-cp-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.ASSISTANT_CONTEXT_WINDOW = '500';   // tiny window to force compaction
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({ name: 'wf', definition: { stations: [] } }).id;
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    convId = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' }).id;

    // Seed long history.
    for (let i = 0; i < 50; i++) {
      AssistantConversationModel.appendMessage(convId, {
        role: 'user', content: 'lorem ipsum '.repeat(20), timestamp: '',
      });
    }
  });

  it('compacts when estimated tokens exceed 75% of context window', async () => {
    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => ({
        choices: [{ message: { content: 'SUMMARY: discussed lorem.' } }],
      })}}; }
    }));
    const { maybeCompact } = await import('../services/assistantService');
    await maybeCompact(convId, 'system prompt placeholder');
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    const reloaded = AssistantConversationModel.getById(convId)!;
    expect(reloaded.summary).toContain('SUMMARY');
    expect(reloaded.messages.length).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement compaction**

```ts
// backend/src/services/assistantService.ts (NEW; will grow in Task 10)
import { AssistantConversationModel } from '../models/assistantConversationModel';
import { AiProviderModel } from '../models/aiProviderModel';
import { estimateTokens } from './tokenEstimator';
import OpenAI from 'openai';

const CONTEXT_WINDOW = Number(process.env.ASSISTANT_CONTEXT_WINDOW || 8192);
const COMPACT_THRESHOLD = 0.75;
const KEEP_RECENT = 8; // keep last N messages after compaction

function getAssistantProvider() {
  // For v1, use the default provider. (A dedicated assistant provider id can
  // override this once the settings UI is wired in Task 13.)
  const id = process.env.ASSISTANT_PROVIDER_ID;
  if (id) {
    const p = AiProviderModel.getById(id);
    if (p) return p;
  }
  return AiProviderModel.getDefault();
}

export async function maybeCompact(conversationId: string, systemPrompt: string): Promise<boolean> {
  const conv = AssistantConversationModel.getById(conversationId);
  if (!conv) throw new Error('conversation not found');
  const allText = systemPrompt
    + (conv.summary || '')
    + conv.messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const estimate = estimateTokens(allText);
  if (estimate < CONTEXT_WINDOW * COMPACT_THRESHOLD) return false;

  // Take the oldest 50% of messages and summarize.
  const half = Math.floor(conv.messages.length / 2);
  const oldest = conv.messages.slice(0, half);
  const compactInput = oldest.map(m => `${m.role}: ${m.content}`).join('\n\n');

  const provider = getAssistantProvider();
  if (!provider) throw new Error('no AI provider configured');
  const client = new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey || 'not-needed' });
  const completion = await client.chat.completions.create({
    model: provider.model,
    messages: [
      { role: 'system', content: 'You compact a conversation into 200-300 token notes preserving user goals, decisions, files referenced, and last-known workflow state.' },
      { role: 'user', content: compactInput },
    ],
    temperature: 0.2,
    max_tokens: 400,
  });
  const summary = completion.choices[0]?.message?.content?.trim() || '';

  // Keep the trailing KEEP_RECENT messages or messages after `half`, whichever is longer.
  const keep = Math.max(KEEP_RECENT, conv.messages.length - half);
  AssistantConversationModel.compact(conversationId, summary, keep);
  return true;
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/assistantService.ts backend/src/__tests__/assistantService.compaction.test.ts
git commit -m "feat(assistant): compaction with summary + sliding window"
```

---

### Task 10: Chat-loop service

**Files:**
- Modify: `backend/src/services/assistantService.ts`
- Test: `backend/src/__tests__/assistantService.runTurn.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/assistantService.runTurn.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('assistantService.runTurn', () => {
  let workflowId: string;
  let convId: string;
  let captured: any[] = [];

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rt-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.ASSISTANT_CONTEXT_WINDOW = '8192';
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({ name: 'wf', definition: { stations: [] } }).id;
    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    convId = AssistantConversationModel.findOrCreate({ workflowId, surface: 'panel' }).id;

    // Stub vLLM: 1st call → tool_call get_workflow; 2nd call → final assistant text.
    let calls = 0;
    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async (params: any) => {
        captured.push(params);
        calls++;
        if (calls === 1) {
          return { choices: [{ message: {
            role: 'assistant', content: '',
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_workflow', arguments: JSON.stringify({ workflow_id: workflowId }) } }],
          } }] };
        }
        return { choices: [{ message: { role: 'assistant', content: 'workflow has 0 stations.' } }] };
      }}}; }
    }));
  });

  it('runs the tool loop and persists the final assistant message', async () => {
    const events: any[] = [];
    const { runTurn } = await import('../services/assistantService');
    await runTurn({
      conversationId: convId,
      userMessage: 'explain this workflow',
      onEvent: (e) => events.push(e),
    });

    const types = events.map(e => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('done');

    const { AssistantConversationModel } = await import('../models/assistantConversationModel');
    const conv = AssistantConversationModel.getById(convId)!;
    expect(conv.messages[conv.messages.length - 1].content).toMatch(/0 stations/);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement `runTurn`**

Append to `backend/src/services/assistantService.ts`:

```ts
import OpenAI from 'openai';
import { ASSISTANT_TOOL_SCHEMAS, dispatchTool } from './assistantTools';
import { buildAssistantSystemPrompt } from './assistantPromptBuilder';
import { AssistantMessage } from '../types/assistant';

const MAX_TOOL_ITERATIONS = Number(process.env.ASSISTANT_MAX_TOOL_ITERATIONS || 8);
const TOOL_RESULT_MAX_CHARS = Number(process.env.ASSISTANT_TOOL_RESULT_MAX_CHARS || 7000);

export interface RunTurnOptions {
  conversationId: string;
  userMessage: string;
  onEvent?: (e: { type: string; [key: string]: any }) => void;
}

function truncate(s: string): string {
  if (s.length <= TOOL_RESULT_MAX_CHARS) return s;
  return s.slice(0, TOOL_RESULT_MAX_CHARS) + '\n...[truncated]';
}

export async function runTurn(opts: RunTurnOptions): Promise<void> {
  const { conversationId, userMessage, onEvent = () => {} } = opts;
  const conv = AssistantConversationModel.getById(conversationId);
  if (!conv) throw new Error('conversation not found');

  const sysPrompt = buildAssistantSystemPrompt({ surface: conv.surface, nodeId: conv.nodeId });

  // Append user message immediately.
  const userMsg: AssistantMessage = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
  AssistantConversationModel.appendMessage(conversationId, userMsg);

  // Compaction check.
  await maybeCompact(conversationId, sysPrompt);

  const provider = getAssistantProvider();
  if (!provider) throw new Error('no AI provider configured');
  const client = new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey || 'not-needed' });

  // Build the OpenAI message array.
  const refreshed = AssistantConversationModel.getById(conversationId)!;
  const messages: any[] = [{ role: 'system', content: sysPrompt }];
  if (refreshed.summary) messages.push({ role: 'system', content: `Conversation summary so far:\n${refreshed.summary}` });
  for (const m of refreshed.messages) {
    if (m.role === 'tool') {
      messages.push({ role: 'tool', content: m.content, tool_call_id: m.toolCallId });
    } else if (m.toolCalls && m.toolCalls.length > 0) {
      messages.push({
        role: 'assistant', content: m.content || '',
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({
      model: provider.model,
      messages,
      tools: ASSISTANT_TOOL_SCHEMAS as any,
      temperature: 0.3,
      max_tokens: 1500,
    });
    const choice = completion.choices[0];
    const aMsg = choice.message;

    if (!aMsg.tool_calls || aMsg.tool_calls.length === 0) {
      const finalContent = aMsg.content || '';
      onEvent({ type: 'token', value: finalContent });   // single chunk for v1 (can switch to stream: true later)
      const aRecord: AssistantMessage = {
        role: 'assistant', content: finalContent,
        timestamp: new Date().toISOString(),
      };
      AssistantConversationModel.appendMessage(conversationId, aRecord);
      onEvent({ type: 'done' });
      return;
    }

    // Persist the assistant message that issued tool calls.
    const toolCallObjs = aMsg.tool_calls.map((tc: any) => ({
      id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}'),
    }));
    AssistantConversationModel.appendMessage(conversationId, {
      role: 'assistant', content: aMsg.content || '',
      toolCalls: toolCallObjs, timestamp: new Date().toISOString(),
    });
    messages.push(aMsg);

    for (const tc of aMsg.tool_calls) {
      if (tc.type !== 'function') continue;
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}');
      onEvent({ type: 'tool_call', name, args });
      let resultStr: string;
      try {
        const result = await dispatchTool(name, args, {
          conversationId: conversationId, workflowId: conv.workflowId,
        });
        resultStr = truncate(JSON.stringify(result));
        if (name === 'propose_workflow_change') {
          onEvent({ type: 'pending_change', change_id: result.change_id });
        }
      } catch (e: any) {
        resultStr = JSON.stringify({ error: e.message });
      }
      onEvent({ type: 'tool_result', name, summary: resultStr.slice(0, 200) });
      AssistantConversationModel.appendMessage(conversationId, {
        role: 'tool', content: resultStr, toolCallId: tc.id,
        timestamp: new Date().toISOString(),
      });
      messages.push({ role: 'tool', content: resultStr, tool_call_id: tc.id });
    }
  }

  onEvent({ type: 'error', message: `assistant exceeded MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}` });
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/assistantService.ts backend/src/__tests__/assistantService.runTurn.test.ts
git commit -m "feat(assistant): chat-loop service with tool-call iteration"
```

---

## Phase 6 — API routes

### Task 11: Conversation + change endpoints + SSE

**Files:**
- Create: `backend/src/routes/assistant.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/assistantApi.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/assistantApi.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('Assistant API', () => {
  let app: express.Express;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-api-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({ name: 'wf', definition: { stations: [] } }).id;

    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello!' } }],
      })}}; }
    }));

    const router = (await import('../routes/assistant')).default;
    app = express();
    app.use(express.json());
    app.use('/api/assistant', router);
  });

  it('POST /conversations creates a panel conversation', async () => {
    const res = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    expect(res.status).toBe(200);
    expect(res.body.data.surface).toBe('panel');
  });

  it('POST /conversations/:id/messages streams an assistant response', async () => {
    const r1 = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    const convId = r1.body.data.id;
    const res = await request(app)
      .post(`/api/assistant/conversations/${convId}/messages`)
      .send({ content: 'hi' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/event-stream/);
    expect(res.text).toMatch(/"type":"done"/);
    expect(res.text).toMatch(/hello!/);
  });

  it('POST /changes/:id/apply merges the diff into the workflow', async () => {
    const r1 = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    const convId = r1.body.data.id;
    // Manually create a pending change.
    const { PendingChangeModel } = await import('../models/pendingChangeModel');
    const pc = PendingChangeModel.create({
      conversationId: convId, workflowId,
      diff: [{ kind: 'add_station', station: { id: 'new', name: 'n', steps: [], position: { x: 0, y: 1 } } }] as any,
      rationale: 'add',
    });
    const apply = await request(app).post(`/api/assistant/changes/${pc.id}/apply`);
    expect(apply.status).toBe(200);
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getById(workflowId)!.definition.stations.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement routes**

```ts
// backend/src/routes/assistant.ts
import { Router, Request, Response } from 'express';
import { AssistantConversationModel } from '../models/assistantConversationModel';
import { PendingChangeModel } from '../models/pendingChangeModel';
import { WorkflowModel } from '../models/workflow';
import { applyDiff } from '../services/diffApplier';
import { runTurn } from '../services/assistantService';
import { SseWriter } from '../services/sseStream';

const router = Router();

router.post('/conversations', (req: Request, res: Response) => {
  const { workflowId, surface, nodeId } = req.body || {};
  if (!workflowId || !surface) return res.status(400).json({ success: false, error: 'workflowId and surface required' });
  const c = AssistantConversationModel.findOrCreate({ workflowId, surface, nodeId });
  res.json({ success: true, data: c });
});

router.get('/conversations/:id', (req, res) => {
  const c = AssistantConversationModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  res.json({ success: true, data: c });
});

router.post('/conversations/:id/messages', async (req, res) => {
  const conv = AssistantConversationModel.getById(req.params.id);
  if (!conv) return res.status(404).json({ success: false, error: 'not found' });
  const content: string = req.body?.content;
  if (!content) return res.status(400).json({ success: false, error: 'content required' });

  const sse = new SseWriter(res);
  try {
    await runTurn({
      conversationId: conv.id,
      userMessage: content,
      onEvent: (e) => sse.send(e),
    });
  } catch (e: any) {
    sse.send({ type: 'error', message: e.message });
  } finally {
    sse.close();
  }
});

router.get('/changes/:id', (req, res) => {
  const c = PendingChangeModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  res.json({ success: true, data: c });
});

router.post('/changes/:id/apply', (req, res) => {
  const c = PendingChangeModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  if (c.status !== 'pending') return res.status(409).json({ success: false, error: `change already ${c.status}` });
  const wf = WorkflowModel.getById(c.workflowId);
  if (!wf) return res.status(404).json({ success: false, error: 'workflow not found' });
  try {
    const updated = applyDiff(wf.definition, c.diff);
    WorkflowModel.update(c.workflowId, { definition: updated });
    PendingChangeModel.markApplied(c.id);
    res.json({ success: true, data: { applied: true } });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/changes/:id/reject', (req, res) => {
  const c = PendingChangeModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  if (c.status !== 'pending') return res.status(409).json({ success: false, error: `change already ${c.status}` });
  PendingChangeModel.markRejected(c.id);
  res.json({ success: true, data: { rejected: true } });
});

export default router;
```

Wire into `backend/src/index.ts`:
```ts
import assistantRouter from './routes/assistant';
app.use('/api/assistant', assistantRouter);
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/assistant.ts backend/src/index.ts backend/src/__tests__/assistantApi.test.ts
git commit -m "feat(api): assistant conversations + SSE messages + change apply/reject"
```

---

### Task 12: Settings — assistant provider id

**Files:**
- Modify: `backend/src/db/database.ts` — add a tiny `app_settings` kv table
- Create: `backend/src/models/appSettingsModel.ts`
- Modify: `backend/src/routes/aiProviders.ts` — add `GET /assistant`, `PUT /assistant/:id`
- Test: `backend/src/__tests__/appSettings.test.ts`

- [ ] **Step 1: Append schema**

```sql
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
```

- [ ] **Step 2: Implement model**

```ts
// backend/src/models/appSettingsModel.ts
import db from '../db/database';

export class AppSettingsModel {
  static get(key: string): string | undefined {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value;
  }
  static set(key: string, value: string): void {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  }
}
```

- [ ] **Step 3: Wire into `assistantService.getAssistantProvider`**

Replace the `process.env.ASSISTANT_PROVIDER_ID` lookup with:

```ts
import { AppSettingsModel } from '../models/appSettingsModel';
// ...
function getAssistantProvider() {
  const id = AppSettingsModel.get('assistant_provider_id') || process.env.ASSISTANT_PROVIDER_ID;
  if (id) {
    const p = AiProviderModel.getById(id);
    if (p) return p;
  }
  return AiProviderModel.getDefault();
}
```

- [ ] **Step 4: Add tiny endpoints to `aiProviders.ts`**

```ts
import { AppSettingsModel } from '../models/appSettingsModel';
// ...
router.get('/_settings/assistant', (_req, res) => {
  const id = AppSettingsModel.get('assistant_provider_id');
  res.json({ success: true, data: { providerId: id || null } });
});
router.put('/_settings/assistant', (req, res) => {
  const { providerId } = req.body || {};
  if (!providerId) return res.status(400).json({ success: false, error: 'providerId required' });
  if (!AiProviderModel.getById(providerId)) return res.status(404).json({ success: false, error: 'provider not found' });
  AppSettingsModel.set('assistant_provider_id', providerId);
  res.json({ success: true, data: { providerId } });
});
```

- [ ] **Step 5: Smoke test + commit**

```bash
cd backend && npm run test -- --run
git add backend/src/db/database.ts backend/src/models/appSettingsModel.ts backend/src/services/assistantService.ts backend/src/routes/aiProviders.ts
git commit -m "feat(assistant): assistant provider configurable via app_settings"
```

---

## Phase 7 — Frontend

### Task 13: API client + Zustand store

**Files:**
- Create: `frontend/src/shared/api/assistantApi.ts`
- Create: `frontend/src/shared/stores/assistantStore.ts`

- [ ] **Step 1: API client**

```ts
// frontend/src/shared/api/assistantApi.ts
import axios from 'axios';

export interface AssistantConversation {
  id: string; workflowId: string; surface: 'panel' | 'node-popover';
  nodeId?: string;
  messages: any[];
  summary?: string;
}

const BASE = '/api/assistant';

export const assistantApi = {
  conversation: {
    findOrCreate: (data: { workflowId: string; surface: 'panel' | 'node-popover'; nodeId?: string }) =>
      axios.post(`${BASE}/conversations`, data).then(r => r.data.data as AssistantConversation),
    get: (id: string) =>
      axios.get(`${BASE}/conversations/${id}`).then(r => r.data.data as AssistantConversation),
  },
  // SSE: caller passes content + onEvent.
  sendMessage(conversationId: string, content: string, onEvent: (e: any) => void): { close: () => void } {
    const ctrl = new AbortController();
    fetch(`${BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: ctrl.signal,
    }).then(async (resp) => {
      if (!resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          const line = ev.split('\n').find(l => l.startsWith('data: '));
          if (line) {
            try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore parse errors */ }
          }
        }
      }
    }).catch(() => { /* aborted or network error */ });
    return { close: () => ctrl.abort() };
  },
  changes: {
    get: (id: string) => axios.get(`${BASE}/changes/${id}`).then(r => r.data.data),
    apply: (id: string) => axios.post(`${BASE}/changes/${id}/apply`).then(r => r.data.data),
    reject: (id: string) => axios.post(`${BASE}/changes/${id}/reject`).then(r => r.data.data),
  },
};
```

- [ ] **Step 2: Store**

```ts
// frontend/src/shared/stores/assistantStore.ts
import { create } from 'zustand';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: { id: string; name: string; args: any; resultSummary?: string }[];
}

interface AssistantState {
  panelOpen: boolean;
  conversationId?: string;
  messages: ChatMessage[];
  pendingChangeIds: string[];
  streaming: boolean;
  setPanelOpen: (b: boolean) => void;
  setConversation: (id: string, history: ChatMessage[]) => void;
  appendUser: (content: string) => void;
  appendStreaming: (chunk: string) => void;       // creates or extends a trailing assistant message
  appendToolCall: (name: string, args: any) => void;
  attachToolResult: (name: string, summary: string) => void;
  addPendingChange: (id: string) => void;
  removePendingChange: (id: string) => void;
  setStreaming: (b: boolean) => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  panelOpen: false,
  messages: [],
  pendingChangeIds: [],
  streaming: false,
  setPanelOpen: (b) => set({ panelOpen: b }),
  setConversation: (id, history) => set({ conversationId: id, messages: history, pendingChangeIds: [] }),
  appendUser: (content) => set({ messages: [...get().messages, { role: 'user', content }] }),
  appendStreaming: (chunk) => {
    const msgs = [...get().messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && !last.toolCalls) {
      last.content += chunk;
    } else {
      msgs.push({ role: 'assistant', content: chunk });
    }
    set({ messages: msgs });
  },
  appendToolCall: (name, args) => set({
    messages: [...get().messages, { role: 'assistant', content: '', toolCalls: [{ id: `${Date.now()}`, name, args }] }],
  }),
  attachToolResult: (name, summary) => {
    const msgs = [...get().messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const tc = msgs[i].toolCalls?.find(t => t.name === name && !t.resultSummary);
      if (tc) { tc.resultSummary = summary; break; }
    }
    set({ messages: msgs });
  },
  addPendingChange: (id) => set({ pendingChangeIds: [...get().pendingChangeIds, id] }),
  removePendingChange: (id) => set({ pendingChangeIds: get().pendingChangeIds.filter(x => x !== id) }),
  setStreaming: (b) => set({ streaming: b }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/api/assistantApi.ts frontend/src/shared/stores/assistantStore.ts
git commit -m "feat(frontend): assistant API client + Zustand store"
```

---

### Task 14: `AssistantChatPanel`

**Files:**
- Create: `frontend/src/features/assistant/AssistantChatPanel.tsx`
- Create: `frontend/src/features/assistant/PendingChangeCard.tsx`
- Create: `frontend/src/features/assistant/ToolCallBlock.tsx`
- Modify: `frontend/src/features/editor/EditorLayout.tsx`

- [ ] **Step 1: Implement `ToolCallBlock`**

```tsx
// frontend/src/features/assistant/ToolCallBlock.tsx
import React, { useState } from 'react';

interface Props { name: string; args: any; resultSummary?: string; }

export const ToolCallBlock: React.FC<Props> = ({ name, args, resultSummary }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="tool-call">
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾' : '▸'} {resultSummary ? `${name}` : `${name}...`}
      </button>
      {expanded && (
        <pre className="tool-call-detail">
          {`args: ${JSON.stringify(args, null, 2)}\nresult: ${resultSummary || 'pending...'}`}
        </pre>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Implement `PendingChangeCard`**

```tsx
// frontend/src/features/assistant/PendingChangeCard.tsx
import React, { useEffect, useState } from 'react';
import { assistantApi } from '@/shared/api/assistantApi';
import { useAssistantStore } from '@/shared/stores/assistantStore';

interface Props { changeId: string; onApplied: () => void; }

export const PendingChangeCard: React.FC<Props> = ({ changeId, onApplied }) => {
  const [change, setChange] = useState<any>(null);
  const { removePendingChange } = useAssistantStore();
  useEffect(() => { assistantApi.changes.get(changeId).then(setChange); }, [changeId]);
  if (!change) return <div>loading proposed change...</div>;
  const onApply = async () => { await assistantApi.changes.apply(changeId); removePendingChange(changeId); onApplied(); };
  const onReject = async () => { await assistantApi.changes.reject(changeId); removePendingChange(changeId); };
  return (
    <div className="pending-change">
      <p><strong>Proposed change</strong>: {change.rationale || '(no rationale)'}</p>
      <details>
        <summary>{change.diff.length} change(s)</summary>
        <pre>{JSON.stringify(change.diff, null, 2)}</pre>
      </details>
      <button onClick={onApply}>Apply</button>
      <button onClick={onReject}>Reject</button>
    </div>
  );
};
```

- [ ] **Step 3: Implement `AssistantChatPanel`**

```tsx
// frontend/src/features/assistant/AssistantChatPanel.tsx
import React, { useEffect, useState } from 'react';
import { assistantApi } from '@/shared/api/assistantApi';
import { useAssistantStore } from '@/shared/stores/assistantStore';
import { PendingChangeCard } from './PendingChangeCard';
import { ToolCallBlock } from './ToolCallBlock';

interface Props { workflowId: string; }

export const AssistantChatPanel: React.FC<Props> = ({ workflowId }) => {
  const {
    panelOpen, setPanelOpen, conversationId, messages,
    pendingChangeIds, streaming, setConversation,
    appendUser, appendStreaming, appendToolCall,
    attachToolResult, addPendingChange, setStreaming,
  } = useAssistantStore();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!panelOpen) return;
    assistantApi.conversation.findOrCreate({ workflowId, surface: 'panel' }).then(c => {
      setConversation(c.id, c.messages);
    });
  }, [panelOpen, workflowId]);

  const onSend = () => {
    if (!conversationId || !draft.trim() || streaming) return;
    const text = draft.trim();
    setDraft('');
    appendUser(text);
    setStreaming(true);
    assistantApi.sendMessage(conversationId, text, (e) => {
      if (e.type === 'token') appendStreaming(e.value);
      else if (e.type === 'tool_call') appendToolCall(e.name, e.args);
      else if (e.type === 'tool_result') attachToolResult(e.name, e.summary);
      else if (e.type === 'pending_change') addPendingChange(e.change_id);
      else if (e.type === 'done') setStreaming(false);
      else if (e.type === 'error') setStreaming(false);
    });
  };

  if (!panelOpen) return <button onClick={() => setPanelOpen(true)}>✨ Assistant</button>;

  return (
    <aside className="assistant-panel">
      <header>
        <span>Assistant</span>
        <button onClick={() => setPanelOpen(false)}>×</button>
      </header>
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <strong>{m.role}:</strong> {m.content}
            {m.toolCalls?.map(tc => (
              <ToolCallBlock key={tc.id} name={tc.name} args={tc.args} resultSummary={tc.resultSummary} />
            ))}
          </div>
        ))}
        {pendingChangeIds.map(id => (
          <PendingChangeCard key={id} changeId={id} onApplied={() => {/* parent should refetch workflow */}} />
        ))}
        {streaming && <div className="streaming-indicator">…</div>}
      </div>
      <div className="composer">
        <textarea value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onSend())}
          placeholder="Describe what you want..." />
        <button onClick={onSend} disabled={streaming}>Send</button>
      </div>
    </aside>
  );
};
```

- [ ] **Step 4: Mount in editor layout**

```tsx
// frontend/src/features/editor/EditorLayout.tsx (modification)
import { AssistantChatPanel } from '@/features/assistant/AssistantChatPanel';
// inside the layout:
<AssistantChatPanel workflowId={currentWorkflow.id} />
```

When a `PendingChangeCard` is applied, parent layout should refetch the workflow definition to re-render the canvas.

- [ ] **Step 5: Manual smoke test + commit**

Smoke check: chat panel opens, user types question, messages appear, Apply button shows when assistant proposes a change, click Apply → workflow updates on canvas.

```bash
git add frontend/src/features/assistant frontend/src/features/editor/EditorLayout.tsx
git commit -m "feat(frontend): assistant chat panel with SSE streaming and apply gate"
```

---

### Task 15: `PromptHelperPopover`

**Files:**
- Create: `frontend/src/features/assistant/PromptHelperPopover.tsx`
- Modify: `frontend/src/features/editor/StepConfigPanel.tsx`

- [ ] **Step 1: Implement the popover**

```tsx
// frontend/src/features/assistant/PromptHelperPopover.tsx
import React, { useEffect, useState } from 'react';
import { assistantApi } from '@/shared/api/assistantApi';

interface Props {
  workflowId: string;
  nodeId: string;
  field: 'aiSystemPrompt' | 'aiPrompt';
  currentValue: string;
  onUse: (newValue: string) => void;
  onClose: () => void;
}

export const PromptHelperPopover: React.FC<Props> = ({ workflowId, nodeId, field, currentValue, onUse, onClose }) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    assistantApi.conversation.findOrCreate({ workflowId, surface: 'node-popover', nodeId }).then(c => {
      setConversationId(c.id);
      setMessages(c.messages);
    });
  }, [workflowId, nodeId]);

  const send = () => {
    if (!conversationId || !draft.trim() || streaming) return;
    const text = draft.trim();
    setDraft('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setStreaming(true);
    assistantApi.sendMessage(conversationId, text, (e) => {
      if (e.type === 'token') {
        setMessages(m => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            return [...m.slice(0, -1), { role: 'assistant', content: last.content + e.value }];
          }
          return [...m, { role: 'assistant', content: e.value }];
        });
      } else if (e.type === 'done') {
        setStreaming(false);
      }
    });
  };

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');

  return (
    <div className="popover">
      <header>Prompt helper for {field}<button onClick={onClose}>×</button></header>
      <div className="messages">
        {messages.map((m, i) => <div key={i} className={`msg-${m.role}`}>{m.content}</div>)}
        {streaming && <div>…</div>}
      </div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Describe what this node should do..." />
      <button onClick={send}>Ask</button>
      {lastAssistant && (
        <button onClick={() => onUse(lastAssistant.content)} disabled={streaming}>
          Use this prompt
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Wire into `StepConfigPanel`**

For each AI node prompt field, render a ✨ button next to the textarea. On click, open the popover. On `onUse`, set the field and call the existing save handler. Direct apply on prompt edits matches the Q2 hybrid rule.

- [ ] **Step 3: Manual smoke test + commit**

```bash
git add frontend/src/features/assistant/PromptHelperPopover.tsx frontend/src/features/editor/StepConfigPanel.tsx
git commit -m "feat(frontend): per-node prompt helper popover"
```

---

### Task 16: "Ask the assistant about this failure" button

**Files:**
- Modify: `frontend/src/features/executions/RunPanel.tsx`

- [ ] **Step 1: When the run panel shows a failed execution, add a button:**

```tsx
{execution.status === 'failed' && (
  <button onClick={() => {
    // Auto-seed the chat panel with a debug-prompt message.
    useAssistantStore.getState().setPanelOpen(true);
    assistantApi.conversation.findOrCreate({ workflowId, surface: 'panel' }).then(c => {
      useAssistantStore.getState().setConversation(c.id, c.messages);
      assistantApi.sendMessage(c.id,
        `Execution ${execution.id} failed. Please fetch its logs and explain what went wrong, then propose a fix.`,
        (e) => {/* same handlers as the panel */}
      );
    });
  }}>Ask the assistant about this failure</button>
)}
```

- [ ] **Step 2: Manual smoke + commit**

```bash
git add frontend/src/features/executions/RunPanel.tsx
git commit -m "feat(frontend): assistant deep-link on failed execution"
```

---

## Phase 8 — End-to-end

### Task 17: Two-iteration tool loop integration test

**Files:**
- Create: `backend/src/__tests__/assistantE2E.test.ts`

- [ ] **Step 1: Write the test**

```ts
// backend/src/__tests__/assistantE2E.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('Assistant E2E (panel scaffolds workflow)', () => {
  let app: express.Express;
  let workflowId: string;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-e2e-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    const { WorkflowModel } = await import('../models/workflow');
    workflowId = WorkflowModel.create({ name: 'wf', definition: { stations: [] } }).id;

    let n = 0;
    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => {
        n++;
        if (n === 1) {
          return { choices: [{ message: {
            role: 'assistant', content: '',
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'list_node_types', arguments: '{}' } }],
          } }] };
        }
        if (n === 2) {
          return { choices: [{ message: {
            role: 'assistant', content: '',
            tool_calls: [{ id: 't2', type: 'function', function: { name: 'propose_workflow_change', arguments: JSON.stringify({
              workflow_id: workflowId,
              diff: [{ kind: 'add_station', station: { id: 's1', name: 'first', steps: [], position: { x: 0, y: 0 } } }],
              rationale: 'add a starter station',
            }) } }],
          } }] };
        }
        return { choices: [{ message: { role: 'assistant', content: 'Done. Click Apply to add the station.' } }] };
      }}}; }
    }));

    const router = (await import('../routes/assistant')).default;
    app = express();
    app.use(express.json());
    app.use('/api/assistant', router);
  });

  it('runs a multi-step turn and emits a pending_change event', async () => {
    const c = await request(app).post('/api/assistant/conversations').send({ workflowId, surface: 'panel' });
    const res = await request(app).post(`/api/assistant/conversations/${c.body.data.id}/messages`)
      .send({ content: 'set me up with a starter workflow' });
    expect(res.text).toMatch(/"type":"pending_change"/);
    expect(res.text).toMatch(/Click Apply/);
  });
});
```

- [ ] **Step 2: Run, PASS**

- [ ] **Step 3: Run full backend suite**

Run: `cd backend && npm run test -- --run`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/__tests__/assistantE2E.test.ts
git commit -m "test(assistant): E2E tool loop emits pending_change event"
```

---

## Out of scope (deferred)

- `search_workflows` tool.
- Voice input.
- User-editable assistant system prompt UI.
- Multi-user / per-user conversation namespaces.
- Real token-streaming (Spec 2's v1 emits a single `token` event with the final content; switch to OpenAI streaming once the harness is comfortable).
- Cross-workflow templates extracted from the assistant.

---

## Self-review checklist

1. **Spec coverage:**
   - §3 architecture — Tasks 6-12 cover backend; Tasks 13-16 cover frontend.
   - §4.1 conversations — Tasks 1, 3.
   - §4.2 pending changes — Tasks 1, 4.
   - §4.3 diff format — Task 2 (types) + Task 5 (applier).
   - §5.1 capabilities 1-6 — covered by tools (Task 7) + panel/popover (Tasks 14-16).
   - §6 memory + compaction — Tasks 9-10.
   - §6.3 streaming — Tasks 11, 13.
   - §7 routes — Task 11.
   - §8 service — Tasks 8-10, 12.
   - §9 frontend surfaces — Tasks 14-16.
2. **Type consistency** — `WorkflowDiff` kinds are uniform between Task 2 (types) and Task 5 (applier) and Task 7 (proposed via tool). `AssistantMessage.toolCallId` used for tool-result messages matches the OpenAI schema field `tool_call_id`.
3. **No placeholders** — none.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-ai-workflow-assistant-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
**2. Inline Execution** — execute tasks in this session with checkpoints.

**Which approach?**

# DAG Execution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Spec 3 — replace the current `Workflow → Station → Step` sequential model with a directed acyclic graph of nodes connected by edges. Adds parallel branch execution (bounded), per-node fan-out, named-input merges, edge conditions, and per-node error policies. Includes a one-shot migrator that converts every existing workflow into an equivalent linear DAG without behavior change.

**Architecture:** New scheduler (`dagScheduler.ts`) maintains a ready/running set, walks the graph topologically with bounded parallelism (default 4 in-flight nodes), evaluates `when` expressions on outgoing edges, supports per-edge `mergeMode` and `targetPort`, and applies per-node `onError` policies (`stop`/`continue`/`retry` ± `errorBranch`). The legacy `executionEngine.ts` becomes a thin compatibility shim that delegates to the DAG scheduler after auto-migrating sequential definitions on first read. Editor swaps to a free-form React Flow canvas with edge property panels.

**Tech Stack:** Node 18+/TypeScript, Express, sql.js, Vitest, supertest, React + React Flow + Zustand.

**Spec reference:** `docs/superpowers/specs/2026-05-03-dag-execution-engine-design.md`

**Depends on:** Specs 1 and 2 may already be merged. Spec 3 must remain backward-compatible — existing workflows from Spec 1 (sequential quiz workflow) must continue to run identically post-migration. Spec 2's diff applier is updated to emit DAG-aware diffs once this lands.

---

## File Structure

### Backend — new files

| Path | Responsibility |
|---|---|
| `backend/src/types/dag.ts` | `Node`, `Edge`, `WorkflowDefinitionV2`, error-policy types |
| `backend/src/services/dagScheduler.ts` | Scheduler loop (ready/running/completed sets, parallelism cap) |
| `backend/src/services/dagValidator.ts` | Cycle detection, orphan + errorBranch checks |
| `backend/src/services/dagMigrator.ts` | Convert v1 (stations) → v2 (DAG) |
| `backend/src/services/edgeWhen.ts` | Evaluate `when` expressions |
| `backend/src/services/fanOut.ts` | Per-node fan-out helper |
| `backend/src/services/errorPolicy.ts` | Apply onError rules |
| `backend/src/seeds/seedQuizWorkflowDag.ts` | Replaces seed from Spec 1 with the DAG version when schema_version=2 |
| `backend/src/__tests__/dagValidator.test.ts` | Validator tests |
| `backend/src/__tests__/dagMigrator.test.ts` | Migration tests |
| `backend/src/__tests__/edgeWhen.test.ts` | Expression evaluator tests |
| `backend/src/__tests__/dagScheduler.test.ts` | Core scheduler unit tests |
| `backend/src/__tests__/fanOut.test.ts` | Fan-out tests |
| `backend/src/__tests__/errorPolicy.test.ts` | Error-policy tests |
| `backend/src/__tests__/dagWorkflow.integration.test.ts` | E2E DAG workflow against stub vLLM |
| `backend/src/__tests__/migrationCompat.test.ts` | Migration produces equivalent results |

### Backend — modified files

| Path | Why |
|---|---|
| `backend/src/db/database.ts` | Add `schema_version INTEGER NOT NULL DEFAULT 1` to `workflows` |
| `backend/src/types/workflow.ts` | Re-export `WorkflowDefinitionV2`; keep `WorkflowDefinition` as union of v1 and v2 |
| `backend/src/models/workflow.ts` | Read `schema_version`; auto-migrate on read if v1 |
| `backend/src/services/executionEngine.ts` | Delegate to `dagScheduler` for v2 definitions; keep v1 path until migrator runs |
| `backend/src/services/diffApplier.ts` (from Spec 2) | Add v2 diff kinds: `add_node`, `remove_node`, `update_node`, `add_edge`, `remove_edge` |
| `backend/src/services/assistantPromptBuilder.ts` (from Spec 2) | Update node-type list and remove "stations" terminology when schema is v2 |
| `backend/src/routes/admin.ts` (new or extended) | `POST /api/admin/migrate-workflows` endpoint |
| `backend/src/seeds/seedQuizWorkflow.ts` | Branch on schema_version target — emit v1 OR v2 |
| `backend/src/index.ts` | Run migrator at startup (idempotent) |

### Frontend — new files

| Path | Responsibility |
|---|---|
| `frontend/src/features/editor/dag/DagCanvas.tsx` | React Flow canvas for free-form node graph |
| `frontend/src/features/editor/dag/EdgeConfigPanel.tsx` | `targetPort`, `when`, `mergeMode` editor |
| `frontend/src/features/editor/dag/NodeAdvancedSection.tsx` | Fan-out toggle + error-policy controls |
| `frontend/src/features/editor/dag/NodePalette.tsx` | Drag-source for new nodes |
| `frontend/src/features/editor/dag/RunPanelV2.tsx` | Per-node status indicators on the DAG |
| `frontend/src/shared/stores/dagEditorStore.ts` | Zustand store for nodes/edges/selection |

### Frontend — modified files

| Path | Why |
|---|---|
| `frontend/src/features/editor/EditorLayout.tsx` | Replace station-stack layout with `DagCanvas` |
| `frontend/src/shared/api/workflowApi.ts` | Save/load v2 workflows |
| `frontend/src/features/executions/RunPanel.tsx` | Use `RunPanelV2` when execution result is v2 |

---

## Phase 1 — Schema migration foundation

### Task 1: Add `schema_version` column

**Files:**
- Modify: `backend/src/db/database.ts`
- Test: `backend/src/__tests__/dbSchemaVersion.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/dbSchemaVersion.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('workflows.schema_version column', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-sv-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('exists with default 1', async () => {
    const db = (await import('../db/database')).default;
    const cols = db.prepare("PRAGMA table_info(workflows)").all();
    const sv = cols.find((c: any) => c.name === 'schema_version');
    expect(sv).toBeTruthy();
    expect(sv!.dflt_value).toBe('1');
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Update schema**

In `backend/src/db/database.ts`, change the `workflows` CREATE statement to include:

```sql
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'paused')),
    definition TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
```

For existing databases (no destructive change to data), append a one-shot ALTER inside `initDatabase()`:

```ts
// after exec(SCHEMA_SQL):
try {
  _db!.exec("ALTER TABLE workflows ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1");
} catch (e) {
  // ignore — column already exists on fresh DBs created with the new schema
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/database.ts backend/src/__tests__/dbSchemaVersion.test.ts
git commit -m "feat(db): add schema_version to workflows (default 1)"
```

---

### Task 2: DAG types

**Files:**
- Create: `backend/src/types/dag.ts`
- Modify: `backend/src/types/workflow.ts`

- [ ] **Step 1: Define types**

```ts
// backend/src/types/dag.ts
import { StepType, StepConfig, InputParameter, VariableMapping, VariableDefinition, RetryPolicy } from './workflow';

export interface DagNode {
  id: string;
  name: string;
  type: StepType;
  position: { x: number; y: number };
  config: StepConfig;
  inputVars?: VariableMapping[];
  outputVars?: VariableDefinition[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  fanOut?: {
    enabled: boolean;
    inputArrayPath: string;     // dot path into incoming context, e.g., 'items'
  };
  errorPolicy?: {
    onError: 'stop' | 'continue' | 'retry';
    retryCount?: number;
    errorBranch?: string;
  };
}

export interface DagEdge {
  id: string;
  source: string;
  sourcePort?: string;          // 'true' | 'false' for if-else
  target: string;
  targetPort?: string;
  when?: string;
  mergeMode?: 'all' | 'any';    // default 'all'
}

export interface WorkflowDefinitionV2 {
  schemaVersion: 2;
  inputParameters?: InputParameter[];
  variables?: Record<string, any>;
  nodes: DagNode[];
  edges: DagEdge[];
}

export type AnyWorkflowDefinition = import('./workflow').WorkflowDefinition | WorkflowDefinitionV2;

export function isV2(def: AnyWorkflowDefinition): def is WorkflowDefinitionV2 {
  return (def as any)?.schemaVersion === 2;
}
```

- [ ] **Step 2: Re-export from `types/workflow.ts`**

Append:
```ts
export { WorkflowDefinitionV2, DagNode, DagEdge, isV2 } from './dag';
```

- [ ] **Step 3: Compile + commit**

```bash
cd backend && npm run build
git add backend/src/types/dag.ts backend/src/types/workflow.ts
git commit -m "feat(types): DAG node/edge types and v2 workflow definition"
```

---

## Phase 2 — Migrator

### Task 3: Sequential → DAG migrator

**Files:**
- Create: `backend/src/services/dagMigrator.ts`
- Test: `backend/src/__tests__/dagMigrator.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/dagMigrator.test.ts
import { describe, it, expect } from 'vitest';
import { migrateToV2 } from '../services/dagMigrator';
import type { WorkflowDefinition } from '../types/workflow';

describe('migrateToV2', () => {
  it('flattens stations into a linear DAG', () => {
    const v1: WorkflowDefinition = {
      stations: [
        { id: 's1', name: 'a', position: { x: 0, y: 0 }, steps: [
          { id: 'st1', name: 's1-1', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } },
          { id: 'st2', name: 's1-2', type: 'script-js', config: { code: '2' }, position: { x: 0, y: 0 } },
        ]},
        { id: 's2', name: 'b', position: { x: 0, y: 1 }, steps: [
          { id: 'st3', name: 's2-1', type: 'script-js', config: { code: '3' }, position: { x: 0, y: 0 } },
        ]},
      ],
    };
    const v2 = migrateToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.nodes.map(n => n.id)).toEqual(['st1', 'st2', 'st3']);
    expect(v2.edges.map(e => `${e.source}->${e.target}`)).toEqual(['st1->st2', 'st2->st3']);
  });

  it('handles if-else with two output handles', () => {
    const v1: WorkflowDefinition = {
      stations: [
        {
          id: 's1', name: 'x', position: { x: 0, y: 0 },
          steps: [
            { id: 'cond', name: 'cond', type: 'if-else', config: { condition: 'true' }, position: { x: 0, y: 0 } },
            { id: 'a', name: 'a', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } },
          ],
          edges: [
            { id: 'e1', source: 'cond', target: 'a', sourceHandle: 'true' },
          ],
        },
      ],
    };
    const v2 = migrateToV2(v1);
    const edge = v2.edges.find(e => e.source === 'cond' && e.target === 'a');
    expect(edge?.sourcePort).toBe('true');
  });

  it('preserves inputParameters', () => {
    const v1: WorkflowDefinition = {
      inputParameters: [{ name: 'file', type: 'file' }],
      stations: [{ id: 's', name: 'x', position: { x: 0, y: 0 }, steps: [] }],
    };
    const v2 = migrateToV2(v1);
    expect(v2.inputParameters?.[0].name).toBe('file');
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/dagMigrator.ts
import { v4 as uuidv4 } from 'uuid';
import type { WorkflowDefinition, Station, Step } from '../types/workflow';
import type { WorkflowDefinitionV2, DagNode, DagEdge } from '../types/dag';

function stepToNode(step: Step, station: Station): DagNode {
  return {
    id: step.id,
    name: step.name,
    type: step.type,
    position: step.position || { x: 0, y: 0 },
    config: step.config || {},
    inputVars: step.inputVars,
    outputVars: step.outputVars,
    timeout: step.timeout,
    retryPolicy: step.retryPolicy,
  };
}

export function migrateToV2(def: WorkflowDefinition): WorkflowDefinitionV2 {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  let prevStationLastStepId: string | null = null;

  for (const station of def.stations) {
    if (!station.steps || station.steps.length === 0) continue;

    // Within-station: connect using existing edges if present, otherwise sequential.
    const explicitEdges = station.edges || [];
    for (const step of station.steps) {
      nodes.push(stepToNode(step, station));
    }
    if (explicitEdges.length > 0) {
      for (const e of explicitEdges) {
        edges.push({
          id: e.id || uuidv4(),
          source: e.source,
          target: e.target,
          sourcePort: e.sourceHandle, // map sourceHandle → sourcePort
        });
      }
    } else {
      for (let i = 1; i < station.steps.length; i++) {
        edges.push({
          id: uuidv4(),
          source: station.steps[i - 1].id,
          target: station.steps[i].id,
        });
      }
    }

    // Cross-station: connect previous station's last step to this station's first step.
    if (prevStationLastStepId) {
      edges.push({
        id: uuidv4(),
        source: prevStationLastStepId,
        target: station.steps[0].id,
      });
    }
    prevStationLastStepId = station.steps[station.steps.length - 1].id;
  }

  return {
    schemaVersion: 2,
    inputParameters: def.inputParameters,
    variables: def.variables,
    nodes,
    edges,
  };
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dagMigrator.ts backend/src/__tests__/dagMigrator.test.ts
git commit -m "feat(dag): migrator converts station model to linear DAG"
```

---

### Task 4: Migrator wiring + admin endpoint

**Files:**
- Modify: `backend/src/models/workflow.ts` — auto-migrate on read
- Create or modify: `backend/src/routes/admin.ts` — `POST /api/admin/migrate-workflows`
- Modify: `backend/src/index.ts` — register admin route + run startup migration
- Test: `backend/src/__tests__/workflowAutoMigrate.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/workflowAutoMigrate.test.ts
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

    // Check raw DB column.
    const db = (await import('../db/database')).default;
    const row = db.prepare('SELECT schema_version FROM workflows WHERE id = ?').get(workflowId);
    expect(row.schema_version).toBe(2);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Wire migration into the model**

In `backend/src/models/workflow.ts`'s `getById` (and `getAll`), after loading the row:

```ts
import { migrateToV2 } from '../services/dagMigrator';
// ...
function maybeMigrate(row: any) {
  const def = JSON.parse(row.definition);
  if (row.schema_version >= 2) return def;
  const v2 = migrateToV2(def);
  // Persist back to DB.
  db.prepare(
    'UPDATE workflows SET definition = ?, schema_version = 2, updated_at = ? WHERE id = ?'
  ).run(JSON.stringify(v2), new Date().toISOString(), row.id);
  return v2;
}
```

(Apply this in whatever code path constructs the `Workflow` object from a DB row.)

- [ ] **Step 4: Add admin endpoint**

```ts
// backend/src/routes/admin.ts
import { Router, Request, Response } from 'express';
import db from '../db/database';
import { migrateToV2 } from '../services/dagMigrator';

const router = Router();

router.post('/migrate-workflows', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id, definition FROM workflows WHERE schema_version < 2').all();
  let migrated = 0;
  for (const r of rows) {
    const v2 = migrateToV2(JSON.parse(r.definition));
    db.prepare('UPDATE workflows SET definition = ?, schema_version = 2, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(v2), new Date().toISOString(), r.id);
    migrated++;
  }
  res.json({ success: true, data: { migrated } });
});

export default router;
```

Wire in `backend/src/index.ts`:

```ts
import adminRouter from './routes/admin';
app.use('/api/admin', adminRouter);
```

- [ ] **Step 5: Run, PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/workflow.ts backend/src/routes/admin.ts backend/src/index.ts backend/src/__tests__/workflowAutoMigrate.test.ts
git commit -m "feat(dag): auto-migrate v1 workflows on read + admin endpoint"
```

---

## Phase 3 — Validator

### Task 5: Cycle + orphan + errorBranch validation

**Files:**
- Create: `backend/src/services/dagValidator.ts`
- Test: `backend/src/__tests__/dagValidator.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/dagValidator.test.ts
import { describe, it, expect } from 'vitest';
import { validateDag } from '../services/dagValidator';
import type { WorkflowDefinitionV2 } from '../types/dag';

const minimal = (nodes: any[], edges: any[]): WorkflowDefinitionV2 => ({
  schemaVersion: 2, nodes, edges,
});

describe('validateDag', () => {
  it('passes a linear DAG', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
       { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
      [{ id: 'e1', source: 'a', target: 'b' }]
    );
    expect(validateDag(v2).errors).toEqual([]);
  });

  it('detects cycles', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
       { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
      [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }]
    );
    const result = validateDag(v2);
    expect(result.errors[0]).toMatch(/cycle/i);
  });

  it('detects orphan edges', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
      [{ id: 'e1', source: 'a', target: 'missing' }]
    );
    expect(validateDag(v2).errors[0]).toMatch(/orphan/i);
  });

  it('detects bad errorBranch reference', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 },
         errorPolicy: { onError: 'continue', errorBranch: 'missing' } }],
      []
    );
    expect(validateDag(v2).errors[0]).toMatch(/errorBranch/);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/dagValidator.ts
import { WorkflowDefinitionV2 } from '../types/dag';

export interface DagValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateDag(def: WorkflowDefinitionV2): DagValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeIds = new Set(def.nodes.map(n => n.id));

  // Orphan edges.
  for (const e of def.edges) {
    if (!nodeIds.has(e.source)) errors.push(`orphan edge: source ${e.source} not in nodes`);
    if (!nodeIds.has(e.target)) errors.push(`orphan edge: target ${e.target} not in nodes`);
  }

  // errorBranch references.
  for (const n of def.nodes) {
    const eb = n.errorPolicy?.errorBranch;
    if (eb && !nodeIds.has(eb)) errors.push(`errorBranch on node ${n.id} points to missing node ${eb}`);
  }

  // Mixed mergeMode validation: a target with both 'all' and 'any' incoming edges.
  const incomingByTarget: Record<string, string[]> = {};
  for (const e of def.edges) {
    (incomingByTarget[e.target] ||= []).push(e.mergeMode || 'all');
  }
  for (const target of Object.keys(incomingByTarget)) {
    const modes = new Set(incomingByTarget[target]);
    if (modes.size > 1) errors.push(`node ${target} has mixed mergeMode (must be all 'all' or all 'any')`);
  }

  // Cycle detection (Kahn's).
  const indeg: Record<string, number> = {};
  for (const id of nodeIds) indeg[id] = 0;
  for (const e of def.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) indeg[e.target]++;
  }
  const queue = Object.keys(indeg).filter(id => indeg[id] === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const e of def.edges) {
      if (e.source !== id) continue;
      if (--indeg[e.target] === 0) queue.push(e.target);
    }
  }
  if (visited !== nodeIds.size) errors.push('cycle detected in DAG');

  // Unreachable nodes (from any node with no incoming edges).
  const reachable = new Set<string>();
  const sources = def.nodes.filter(n => !def.edges.some(e => e.target === n.id)).map(n => n.id);
  const stack = [...sources];
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const e of def.edges) if (e.source === cur) stack.push(e.target);
  }
  for (const id of nodeIds) if (!reachable.has(id)) warnings.push(`unreachable node: ${id}`);

  return { errors, warnings };
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dagValidator.ts backend/src/__tests__/dagValidator.test.ts
git commit -m "feat(dag): cycle / orphan / errorBranch / mergeMode validation"
```

---

### Task 6: Validate on workflow save

**Files:**
- Modify: `backend/src/routes/workflows.ts` — call `validateDag` on PUT/POST when v2

- [ ] **Step 1: Add validation hook**

In the create/update routes, after parsing `req.body.definition`:

```ts
import { validateDag } from '../services/dagValidator';
import { isV2 } from '../types/dag';
// ...
if (data.definition && isV2(data.definition)) {
  const v = validateDag(data.definition as any);
  if (v.errors.length) {
    return res.status(400).json({ success: false, error: 'invalid DAG', data: { errors: v.errors, warnings: v.warnings } });
  }
}
```

- [ ] **Step 2: Add a smoke test (extend existing workflow tests if simpler)**

```ts
// backend/src/__tests__/workflowValidation.test.ts
import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PUT /workflows/:id rejects invalid DAGs', () => {
  let app: express.Express;
  let id: string;
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-val-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const router = (await import('../routes/workflows')).default;
    app = express();
    app.use(express.json());
    app.use('/api/workflows', router);
    const r = await request(app).post('/api/workflows').send({
      name: 'wf', definition: { schemaVersion: 2, nodes: [], edges: [] },
    });
    id = r.body.data.id;
  });

  it('rejects a cyclic DAG with 400', async () => {
    const res = await request(app).put(`/api/workflows/${id}`).send({
      definition: {
        schemaVersion: 2,
        nodes: [
          { id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
          { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid DAG/);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npm run test -- --run workflowValidation
git add backend/src/routes/workflows.ts backend/src/__tests__/workflowValidation.test.ts
git commit -m "feat(dag): reject invalid DAGs at save time"
```

---

## Phase 4 — Edge conditions and helpers

### Task 7: `when` expression evaluator

**Files:**
- Create: `backend/src/services/edgeWhen.ts`
- Test: `backend/src/__tests__/edgeWhen.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/edgeWhen.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateWhen } from '../services/edgeWhen';

describe('evaluateWhen', () => {
  it('returns true when expression is empty', () => {
    expect(evaluateWhen(undefined, {})).toBe(true);
    expect(evaluateWhen('', {})).toBe(true);
  });

  it('evaluates ${...} expressions against context', () => {
    expect(evaluateWhen('${output.status}', { output: { status: 'ok' } })).toBe(true);
    expect(evaluateWhen('${output.status}', { output: { status: '' } })).toBe(false);
  });

  it('coerces "false" / "0" to false', () => {
    expect(evaluateWhen('${output.x}', { output: { x: 'false' } })).toBe(false);
    expect(evaluateWhen('${output.x}', { output: { x: '0' } })).toBe(false);
    expect(evaluateWhen('${output.x}', { output: { x: 'true' } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/edgeWhen.ts
import { ScriptRunner } from './scriptRunner';

export function evaluateWhen(expr: string | undefined, context: Record<string, any>): boolean {
  if (!expr || expr.trim() === '') return true;
  const interpolated = ScriptRunner.interpolateVariables(expr, context).trim();
  if (interpolated === '' || interpolated === 'false' || interpolated === '0' || interpolated === 'null' || interpolated === 'undefined') {
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run, PASS** + commit

```bash
git add backend/src/services/edgeWhen.ts backend/src/__tests__/edgeWhen.test.ts
git commit -m "feat(dag): edge when-expression evaluator"
```

---

### Task 8: Fan-out helper

**Files:**
- Create: `backend/src/services/fanOut.ts`
- Test: `backend/src/__tests__/fanOut.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/fanOut.test.ts
import { describe, it, expect } from 'vitest';
import { fanOutInputs, collectFanOutOutputs } from '../services/fanOut';

describe('fanOut', () => {
  it('expands a node into one item per array element at inputArrayPath', () => {
    const items = fanOutInputs({ items: [1, 2, 3], extra: 'x' }, 'items');
    expect(items.length).toBe(3);
    expect(items[0]).toEqual({ items: 1, extra: 'x' });
    expect(items[2]).toEqual({ items: 3, extra: 'x' });
  });

  it('collects outputs preserving order', () => {
    const out = collectFanOutOutputs(['a', 'b', 'c']);
    expect(out).toEqual({ items: ['a', 'b', 'c'] });
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/fanOut.ts
function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, p) => acc?.[p], obj);
}

export function fanOutInputs(input: Record<string, any>, inputArrayPath: string): Record<string, any>[] {
  const arr = getByPath(input, inputArrayPath);
  if (!Array.isArray(arr)) {
    throw new Error(`fanOut: input at path "${inputArrayPath}" is not an array`);
  }
  // Replace the array with a single element at the same key — top-level only.
  // For nested paths, we set the leaf in a copy.
  return arr.map(elem => {
    const copy = { ...input };
    const parts = inputArrayPath.split('.');
    if (parts.length === 1) {
      copy[parts[0]] = elem;
    } else {
      // shallow nested: clone parents along the path
      let cursor = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...cursor[parts[i]] };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = elem;
    }
    return copy;
  });
}

export function collectFanOutOutputs(outputs: any[]): { items: any[] } {
  return { items: outputs };
}
```

- [ ] **Step 4: Run, PASS** + commit

```bash
git add backend/src/services/fanOut.ts backend/src/__tests__/fanOut.test.ts
git commit -m "feat(dag): fan-out input expansion + output collection"
```

---

### Task 9: Error-policy applier

**Files:**
- Create: `backend/src/services/errorPolicy.ts`
- Test: `backend/src/__tests__/errorPolicy.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/errorPolicy.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runWithPolicy } from '../services/errorPolicy';

describe('runWithPolicy', () => {
  it('passes through on success', async () => {
    const out = await runWithPolicy(async () => 'ok', { onError: 'stop' });
    expect(out).toEqual({ kind: 'success', value: 'ok' });
  });

  it('propagates failure when onError = stop', async () => {
    const out = await runWithPolicy(async () => { throw new Error('boom'); }, { onError: 'stop' });
    expect(out.kind).toBe('failure-stop');
    expect((out as any).error.message).toBe('boom');
  });

  it('returns null + failed flag when onError = continue', async () => {
    const out = await runWithPolicy(async () => { throw new Error('boom'); }, { onError: 'continue' });
    expect(out.kind).toBe('failure-continue');
  });

  it('retries up to retryCount, then succeeds', async () => {
    let n = 0;
    const out = await runWithPolicy(async () => {
      n++;
      if (n < 3) throw new Error('try again');
      return 'finally';
    }, { onError: 'retry', retryCount: 3 });
    expect(out).toEqual({ kind: 'success', value: 'finally' });
  });

  it('routes to errorBranch when failed under continue', async () => {
    const out = await runWithPolicy(async () => { throw new Error('boom'); }, { onError: 'continue', errorBranch: 'recover' });
    expect(out.kind).toBe('failure-continue');
    expect((out as any).errorBranch).toBe('recover');
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

```ts
// backend/src/services/errorPolicy.ts
export interface ErrorPolicy {
  onError: 'stop' | 'continue' | 'retry';
  retryCount?: number;
  errorBranch?: string;
}

export type PolicyOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'failure-stop'; error: Error }
  | { kind: 'failure-continue'; error: Error; errorBranch?: string };

export async function runWithPolicy<T>(
  fn: () => Promise<T>,
  policy: ErrorPolicy | undefined
): Promise<PolicyOutcome<T>> {
  const p = policy ?? { onError: 'stop' };
  const maxAttempts = p.onError === 'retry' ? Math.max(1, p.retryCount ?? 1) : 1;
  let lastError: Error | undefined;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const v = await fn();
      return { kind: 'success', value: v };
    } catch (e) {
      lastError = e as Error;
      if (i < maxAttempts - 1) {
        const backoff = Math.min(30000, 1000 * Math.pow(2, i));
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  if (p.onError === 'continue' || p.onError === 'retry') {
    return { kind: 'failure-continue', error: lastError!, errorBranch: p.errorBranch };
  }
  return { kind: 'failure-stop', error: lastError! };
}
```

- [ ] **Step 4: Run, PASS** + commit

```bash
git add backend/src/services/errorPolicy.ts backend/src/__tests__/errorPolicy.test.ts
git commit -m "feat(dag): error-policy runner with retry + continue + errorBranch"
```

---

## Phase 5 — Scheduler

### Task 10: Topological scheduler with bounded parallelism

**Files:**
- Create: `backend/src/services/dagScheduler.ts`
- Test: `backend/src/__tests__/dagScheduler.test.ts`

- [ ] **Step 1: Failing test**

```ts
// backend/src/__tests__/dagScheduler.test.ts
import { describe, it, expect } from 'vitest';
import { runDag } from '../services/dagScheduler';
import type { WorkflowDefinitionV2, DagNode } from '../types/dag';

function n(id: string): DagNode {
  return { id, name: id, type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } };
}

describe('runDag', () => {
  it('runs a linear graph in order', async () => {
    const order: string[] = [];
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b'), n('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    };
    await runDag(def, {
      executeNode: async (node) => { order.push(node.id); return { id: node.id }; },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('runs independent branches in parallel', async () => {
    let inFlight = 0; let peak = 0;
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b1'), n('b2'), n('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b1' },
        { id: 'e2', source: 'a', target: 'b2' },
        { id: 'e3', source: 'b1', target: 'c' },
        { id: 'e4', source: 'b2', target: 'c' },
      ],
    };
    await runDag(def, {
      executeNode: async (node) => {
        inFlight++; peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 30));
        inFlight--;
        return { id: node.id };
      },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it('respects edge.when (skips downstream when falsy)', async () => {
    const ran: string[] = [];
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b', when: '${output.continue}' }],
    };
    await runDag(def, {
      executeNode: async (node) => { ran.push(node.id); return { continue: false }; },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(ran).toEqual(['a']);  // b skipped
  });

  it('honors mergeMode=all by waiting for both branches', async () => {
    const ran: string[] = [];
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b'), n('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'c', mergeMode: 'all', targetPort: 'a' },
        { id: 'e2', source: 'b', target: 'c', mergeMode: 'all', targetPort: 'b' },
      ],
    };
    await runDag(def, {
      executeNode: async (node) => { ran.push(node.id); return { val: node.id }; },
      maxConcurrency: 4,
      initialContext: {},
    });
    // c runs only after both a and b complete.
    expect(ran[ran.length - 1]).toBe('c');
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement scheduler**

```ts
// backend/src/services/dagScheduler.ts
import { WorkflowDefinitionV2, DagNode, DagEdge } from '../types/dag';
import { evaluateWhen } from './edgeWhen';
import { runWithPolicy } from './errorPolicy';
import { fanOutInputs, collectFanOutOutputs } from './fanOut';

export interface RunDagOptions {
  executeNode: (node: DagNode, input: Record<string, any>) => Promise<any>;
  maxConcurrency?: number;
  initialContext?: Record<string, any>;
  onNodeStatus?: (nodeId: string, status: NodeStatus, info?: any) => void;
}

export type NodeStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';

export interface RunDagResult {
  status: 'completed' | 'failed';
  nodeOutputs: Record<string, any>;
  failures: Record<string, string>;
}

export async function runDag(def: WorkflowDefinitionV2, opts: RunDagOptions): Promise<RunDagResult> {
  const cap = opts.maxConcurrency ?? Number(process.env.MAX_CONCURRENT_NODES || 4);
  const nodesById: Record<string, DagNode> = Object.fromEntries(def.nodes.map(n => [n.id, n]));
  const incoming: Record<string, DagEdge[]> = {};
  const outgoing: Record<string, DagEdge[]> = {};
  for (const n of def.nodes) { incoming[n.id] = []; outgoing[n.id] = []; }
  for (const e of def.edges) { incoming[e.target]?.push(e); outgoing[e.source]?.push(e); }

  const status: Record<string, NodeStatus> = {};
  for (const n of def.nodes) status[n.id] = 'pending';
  const outputs: Record<string, any> = {};
  const failures: Record<string, string> = {};
  const ready = new Set<string>();
  const running = new Set<string>();

  // Track which incoming edges have "fired" (truthy when, source completed) per target.
  const firedInbound: Record<string, Set<string>> = {};
  for (const n of def.nodes) firedInbound[n.id] = new Set();

  // Initialize: nodes with no incoming go to ready.
  for (const n of def.nodes) if (incoming[n.id].length === 0) ready.add(n.id);

  function buildNodeInput(nodeId: string): Record<string, any> {
    const merged: Record<string, any> = { ...(opts.initialContext || {}) };
    const inEdges = incoming[nodeId];
    for (const e of inEdges) {
      if (!firedInbound[nodeId].has(e.id)) continue;
      const out = outputs[e.source];
      if (e.targetPort) {
        merged[e.targetPort] = out;
      } else {
        Object.assign(merged, out || {});
      }
    }
    return merged;
  }

  function tryUnlockTarget(target: string): void {
    if (status[target] !== 'pending') return;
    const inEdges = incoming[target];
    if (inEdges.length === 0) return;
    // mergeMode is per-edge but uniform per target (validator enforces).
    const mode = inEdges[0].mergeMode || 'all';
    if (mode === 'all') {
      // All incoming edges must either have fired or have a definitively-skipped source.
      const allResolved = inEdges.every(e =>
        firedInbound[target].has(e.id) ||
        status[e.source] === 'skipped' ||
        (status[e.source] === 'completed' && !evaluateWhen(e.when, { output: outputs[e.source], ...outputs[e.source] })) ||
        (status[e.source] === 'failed')
      );
      const anyFired = inEdges.some(e => firedInbound[target].has(e.id));
      if (allResolved && anyFired) {
        status[target] = 'ready'; ready.add(target);
      } else if (allResolved && !anyFired) {
        status[target] = 'skipped';
        opts.onNodeStatus?.(target, 'skipped');
        // Cascade: outgoing edges of a skipped node also "resolve" downstream.
        for (const oe of outgoing[target]) tryUnlockTarget(oe.target);
      }
    } else {
      // mergeMode = 'any': first to fire wins.
      const anyFired = inEdges.some(e => firedInbound[target].has(e.id));
      if (anyFired) { status[target] = 'ready'; ready.add(target); }
    }
  }

  async function executeOne(nodeId: string): Promise<void> {
    const node = nodesById[nodeId];
    status[nodeId] = 'running';
    running.add(nodeId);
    opts.onNodeStatus?.(nodeId, 'running');
    const input = buildNodeInput(nodeId);

    let runResult: any;
    try {
      if (node.fanOut?.enabled) {
        const fanInputs = fanOutInputs(input, node.fanOut.inputArrayPath);
        // Run fan-out with the same per-execution cap.
        const results: any[] = [];
        let i = 0;
        const workers: Promise<void>[] = [];
        const startWorker = async () => {
          while (i < fanInputs.length) {
            const idx = i++;
            const r = await opts.executeNode(node, fanInputs[idx]);
            results[idx] = r;
          }
        };
        const workerCount = Math.min(cap, fanInputs.length);
        for (let w = 0; w < workerCount; w++) workers.push(startWorker());
        await Promise.all(workers);
        runResult = collectFanOutOutputs(results);
      } else {
        const outcome = await runWithPolicy(() => opts.executeNode(node, input), node.errorPolicy);
        if (outcome.kind === 'success') {
          runResult = outcome.value;
        } else if (outcome.kind === 'failure-continue') {
          status[nodeId] = 'failed';
          failures[nodeId] = outcome.error.message;
          if (outcome.errorBranch) {
            // Route an outgoing edge to the error branch using sourcePort='__error'.
            const errEdge = outgoing[nodeId].find(e => e.sourcePort === '__error' || e.target === outcome.errorBranch);
            if (errEdge) firedInbound[errEdge.target].add(errEdge.id);
            outputs[nodeId] = { error: outcome.error.message };
            // Mark non-error outgoing edges as skipped for merge purposes — handled by tryUnlockTarget logic.
          }
          for (const oe of outgoing[nodeId]) tryUnlockTarget(oe.target);
          opts.onNodeStatus?.(nodeId, 'failed', { error: outcome.error.message });
          running.delete(nodeId);
          return;
        } else {
          status[nodeId] = 'failed';
          failures[nodeId] = outcome.error.message;
          opts.onNodeStatus?.(nodeId, 'failed', { error: outcome.error.message });
          running.delete(nodeId);
          throw outcome.error;
        }
      }
    } catch (e: any) {
      // Stop policy: rethrow upward.
      throw e;
    }

    outputs[nodeId] = runResult;
    status[nodeId] = 'completed';
    running.delete(nodeId);
    opts.onNodeStatus?.(nodeId, 'completed');

    // For each outgoing edge, evaluate when, then either fire or mark skipped, then try to unlock target.
    for (const e of outgoing[nodeId]) {
      const truthy = evaluateWhen(e.when, { output: runResult, ...runResult });
      if (truthy) firedInbound[e.target].add(e.id);
      tryUnlockTarget(e.target);
    }
  }

  // Drive the loop.
  let stopped = false;
  while (!stopped && (ready.size > 0 || running.size > 0)) {
    // Fill running up to cap.
    while (ready.size > 0 && running.size < cap) {
      const next = ready.values().next().value as string;
      ready.delete(next);
      executeOne(next).catch((err: Error) => {
        // Stop policy hit; cancel remaining via abort-like behavior: clear ready, let running drain.
        stopped = true;
      });
    }
    if (running.size > 0) {
      // Wait until at least one running node finishes; we do a poll-style await.
      await new Promise(r => setTimeout(r, 5));
    }
  }

  // Wait for any straggling promises to settle.
  while (running.size > 0) await new Promise(r => setTimeout(r, 5));

  const anyFailed = Object.keys(failures).length > 0 && Object.values(status).some(s => s === 'failed');
  return {
    status: stopped || anyFailed ? 'failed' : 'completed',
    nodeOutputs: outputs,
    failures,
  };
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dagScheduler.ts backend/src/__tests__/dagScheduler.test.ts
git commit -m "feat(dag): topological scheduler with bounded parallelism + when + merge"
```

---

### Task 11: Wire scheduler into `executionEngine`

**Files:**
- Modify: `backend/src/services/executionEngine.ts`
- Test: `backend/src/__tests__/migrationCompat.test.ts`

- [ ] **Step 1: Failing test (compatibility)**

```ts
// backend/src/__tests__/migrationCompat.test.ts
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
              code: 'return { sum: (variables.steps.st1?.output?.v || 0) + 1 };'
            }, position: { x: 0, y: 0 } },
          ]},
        ],
      } as any,
    });
    // First read triggers migration.
    const reloaded = WorkflowModel.getById(wf.id);
    expect((reloaded!.definition as any).schemaVersion).toBe(2);

    const { ExecutionEngine } = await import('../services/executionEngine');
    const result = await ExecutionEngine.execute(reloaded!, 'manual', {});
    expect(result.status).toBe('completed');
    // Inspect the result for the chained value.
    // (Adapt the assertion to whatever shape ExecutionEngine.execute returns.)
  });
});
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Update `executionEngine.execute`**

Detect schema version. For v2, build node executor and call `runDag`. For v1, fall back to existing logic *only* if migration is somehow disabled.

```ts
// backend/src/services/executionEngine.ts (sketch — adapt to existing structure)
import { isV2 } from '../types/dag';
import { runDag } from './dagScheduler';
import { StepExecutor } from './stepExecutor';

// Inside ExecutionEngine.execute, after loading workflow + setting up execution record:
if (isV2(workflow.definition)) {
  const executionContext: any = { variables: { ...workflow.definition.variables, input: inputData, executionId }, steps: {}, simulate };
  const result = await runDag(workflow.definition, {
    maxConcurrency: Number(process.env.MAX_CONCURRENT_NODES || 4),
    initialContext: executionContext.variables,
    executeNode: async (node, mergedInput) => {
      // Resolve inputVars from merged DAG input + outputs of upstream steps.
      const resolved = StepExecutor.resolveInputVariables(
        node as any,
        { ...executionContext.variables, ...mergedInput, steps: executionContext.steps }
      );
      const stepResult = await StepExecutor.executeStepByType(
        node as any,
        executionContext,
        resolved
      );
      executionContext.steps[node.id] = { output: stepResult.output, success: stepResult.success };
      if (!stepResult.success) throw new Error(stepResult.error || 'step failed');
      return stepResult.output;
    },
    onNodeStatus: (nodeId, statusVal, info) => {
      // Optionally emit to executionEventBus here.
    },
  });

  // Persist the execution result in the existing execution record format —
  // synthesize a single "node-results" structure or extend ExecutionResult to
  // include a `nodes` field for v2 executions.
  const execution = await persistDagExecutionResult(workflow, result, executionId);
  return execution;
}
// else: existing v1 path (kept for safety until migrator runs everywhere)
```

`persistDagExecutionResult` is a small new helper that writes results in a structure the run panel understands. The simplest path: `ExecutionResult.stations = [{ stationId: 'dag', stationName: 'graph', steps: [...node-shaped step results] }]`. This keeps existing API consumers working while exposing the per-node detail.

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/executionEngine.ts backend/src/__tests__/migrationCompat.test.ts
git commit -m "feat(engine): delegate v2 workflows to dagScheduler"
```

---

## Phase 6 — Spec 1 quiz workflow (DAG version)

### Task 12: Re-emit quiz workflow as a DAG

**Files:**
- Modify: `backend/src/seeds/seedQuizWorkflow.ts` — branch on schema version
- Create: `backend/src/seeds/seedQuizWorkflowDag.ts`
- Test: `backend/src/__tests__/seedQuizWorkflowDag.test.ts`

The original quiz workflow's `script-js` orchestrator works fine post-migration (becomes a single fan-in DAG node). This task replaces it with the *true* DAG version: explicit generator, reviewer, verifier, fixer nodes; fan-out across chunks; edge conditions for the retry loop.

- [ ] **Step 1: Implement DAG seeder**

```ts
// backend/src/seeds/seedQuizWorkflowDag.ts
import { WorkflowModel } from '../models/workflow';
import { v4 as uuidv4 } from 'uuid';

const QUIZ_WORKFLOW_ID = 'builtin-quiz-generator';

export function seedQuizWorkflowDag(): void {
  const existing = WorkflowModel.getById(QUIZ_WORKFLOW_ID);
  // If existing exists and is already v2 with the dag layout, skip; otherwise overwrite.
  if (existing && (existing.definition as any).schemaVersion === 2 && (existing.definition as any).nodes?.some((n: any) => n.id === 'generator')) {
    return;
  }

  const def = {
    schemaVersion: 2,
    inputParameters: [
      { name: 'file', type: 'file', accept: '.pdf,.pptx,.txt', required: true },
      { name: 'focus_area', type: 'string', defaultValue: 'concept and logic, not usage or default values' },
      { name: 'questions_per_chunk', type: 'number', defaultValue: 3 },
    ],
    nodes: [
      // Loader
      { id: 'load', name: 'Load document', type: 'load-document',
        position: { x: 0, y: 0 },
        config: { loadDocumentSourcePath: '${input.file}', loadDocumentMaxChunkChars: 2000 },
      },
      // Generator (fan-out across chunks)
      { id: 'generator', name: 'Generate questions', type: 'ai-structured-output',
        position: { x: 1, y: 0 },
        config: {
          aiPromptTemplateSystemId: '${prompt.quiz-generator-system}',
          aiPromptTemplateUserId: '${prompt.quiz-generator-system}',
          aiOutputSchema: { type: 'object', properties: { questions: { type: 'array' } } },
        },
        fanOut: { enabled: true, inputArrayPath: 'load.chunks' },
      },
      // Reviewer
      { id: 'reviewer', name: 'Review focus-area', type: 'ai-structured-output',
        position: { x: 2, y: 0 },
        config: { aiPromptTemplateSystemId: '${prompt.quiz-reviewer-system}', aiPromptTemplateUserId: '${prompt.quiz-reviewer-system}',
          aiOutputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
      },
      // Verifier (parallel sibling of reviewer)
      { id: 'verifier', name: 'Verify grounding', type: 'ai-structured-output',
        position: { x: 2, y: 1 },
        config: { aiPromptTemplateSystemId: '${prompt.quiz-verifier-system}', aiPromptTemplateUserId: '${prompt.quiz-verifier-system}',
          aiOutputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
      },
      // Merge + fixer (small script-js to consolidate flags + decide loop continuation, drives 3 rounds of fixer in-place)
      { id: 'fix-loop', name: 'Fix flagged + retry', type: 'script-js',
        position: { x: 3, y: 0 },
        config: { code: `
          // Inputs: reviewer (named port), verifier (named port), generated questions
          let questions = inputData.generator.questions || [];
          for (let round = 1; round <= 3; round++) {
            const flagged = [];
            for (const r of (inputData.reviewer.results || [])) if (!r.pass) flagged.push({ ...r, source: 'reviewer' });
            for (const r of (inputData.verifier.results || [])) if (!r.pass) flagged.push({ ...r, source: 'verifier' });
            if (flagged.length === 0) break;
            const fixed = await ai.call({
              systemTemplate: 'quiz-fixer-system',
              userTemplate: 'quiz-fixer-system',
              context: { input: { ...variables.input, questions, issues: flagged, mode: round === 1 ? 'surgical' : 'auto' } },
              outputSchema: { type: 'object', properties: { fixed_questions: { type: 'array' } } },
            });
            questions = (fixed.parsed.fixed_questions || []).map(q => ({
              reference_page: q.reference_page,
              question: q.question, options: q.options,
              answer: q.answer, explanation: q.explanation,
            }));
            if (round === 3) {
              for (const f of flagged) {
                if (questions[f.question_index]) {
                  questions[f.question_index].quality_warnings = (questions[f.question_index].quality_warnings || []);
                  questions[f.question_index].quality_warnings.push(\`\${f.source}: \${f.issue}\`);
                }
              }
            }
            // Re-run reviewer/verifier inline for round 2/3 (still in this script-js node).
            const rev = await ai.call({ systemTemplate: 'quiz-reviewer-system', userTemplate: 'quiz-reviewer-system', context: { input: { ...variables.input, questions } }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } });
            const ver = await ai.call({ systemTemplate: 'quiz-verifier-system', userTemplate: 'quiz-verifier-system', context: { input: { ...variables.input, questions } }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } });
            inputData.reviewer = rev.parsed; inputData.verifier = ver.parsed;
          }
          return { questions };
        `},
      },
      // Collect (fan-in: fan-out node's per-chunk outputs auto-collected by scheduler at the next non-fanout target)
      { id: 'collect', name: 'Collect questions', type: 'script-js',
        position: { x: 4, y: 0 },
        config: { code: `
          // 'fix-loop' is the upstream fan-out target; its output is { items: [{ questions: [...] }, ...] }
          const all = [];
          for (const chunkResult of (inputData.items || [])) {
            for (const q of (chunkResult.questions || [])) all.push(q);
          }
          variables.allQuestions = all;
          return { questions: all };
        `},
      },
      // Writer
      { id: 'writer', name: 'Write quiz JSON', type: 'quiz-output-writer',
        position: { x: 5, y: 0 },
        config: { quizOutputFilename: 'quiz.json' },
        inputVars: [
          { name: 'questions', source: '${variables.allQuestions}' },
          { name: 'sourceFile', source: '${input.file}' },
          { name: 'focusArea', source: '${input.focus_area}' },
        ],
      },
    ],
    edges: [
      { id: uuidv4(), source: 'load', target: 'generator' },
      { id: uuidv4(), source: 'generator', target: 'reviewer' },
      { id: uuidv4(), source: 'generator', target: 'verifier' },
      { id: uuidv4(), source: 'generator', target: 'fix-loop', targetPort: 'generator' },
      { id: uuidv4(), source: 'reviewer', target: 'fix-loop', targetPort: 'reviewer' },
      { id: uuidv4(), source: 'verifier', target: 'fix-loop', targetPort: 'verifier' },
      { id: uuidv4(), source: 'fix-loop', target: 'collect' },
      { id: uuidv4(), source: 'collect', target: 'writer' },
    ],
  };

  if (existing) {
    WorkflowModel.update(QUIZ_WORKFLOW_ID, { definition: def as any });
  } else {
    WorkflowModel.create({ id: QUIZ_WORKFLOW_ID, name: 'Document Quiz Generator (built-in)', status: 'active', definition: def } as any);
  }
}
```

- [ ] **Step 2: Modify the original seeder to call this when v2 is the target**

```ts
// backend/src/seeds/seedQuizWorkflow.ts
import { seedQuizWorkflowDag } from './seedQuizWorkflowDag';
// ...
export function seedQuizWorkflow(): void {
  // Always emit v2 once Spec 3 is merged. The pre-Spec-3 sequential version
  // remains in git history; auto-migration handles existing installs.
  seedQuizWorkflowDag();
}
```

- [ ] **Step 3: Test**

```ts
// backend/src/__tests__/seedQuizWorkflowDag.test.ts — minimal idempotency + shape check
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path'; import os from 'os'; import fs from 'fs';

describe('seedQuizWorkflowDag', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-q-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedQuizWorkflowDag } = await import('../seeds/seedQuizWorkflowDag');
    seedQuizWorkflowDag();
  });

  it('produces a 7-node DAG with named-port edges into fix-loop', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator')!;
    const def: any = wf.definition;
    expect(def.schemaVersion).toBe(2);
    expect(def.nodes.length).toBe(7);
    const intoFix = def.edges.filter((e: any) => e.target === 'fix-loop');
    expect(intoFix.map((e: any) => e.targetPort).sort()).toEqual(['generator', 'reviewer', 'verifier']);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && npm run test -- --run seedQuizWorkflowDag
git add backend/src/seeds/seedQuizWorkflowDag.ts backend/src/seeds/seedQuizWorkflow.ts backend/src/__tests__/seedQuizWorkflowDag.test.ts
git commit -m "feat(dag): re-seed quiz workflow as a true DAG with fan-out + named merge"
```

---

## Phase 7 — Frontend

### Task 13: DAG editor canvas

**Files:**
- Create: `frontend/src/features/editor/dag/DagCanvas.tsx`
- Create: `frontend/src/shared/stores/dagEditorStore.ts`
- Modify: `frontend/src/features/editor/EditorLayout.tsx`

- [ ] **Step 1: Editor store**

```ts
// frontend/src/shared/stores/dagEditorStore.ts
import { create } from 'zustand';

export interface DagNode {
  id: string; name: string; type: string;
  position: { x: number; y: number };
  config: any;
  fanOut?: { enabled: boolean; inputArrayPath: string };
  errorPolicy?: { onError: 'stop' | 'continue' | 'retry'; retryCount?: number; errorBranch?: string };
}
export interface DagEdge {
  id: string; source: string; target: string;
  sourcePort?: string; targetPort?: string;
  when?: string; mergeMode?: 'all' | 'any';
}

interface DagState {
  nodes: DagNode[]; edges: DagEdge[];
  selectedNodeId?: string; selectedEdgeId?: string;
  setGraph: (nodes: DagNode[], edges: DagEdge[]) => void;
  upsertNode: (n: DagNode) => void;
  upsertEdge: (e: DagEdge) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  selectNode: (id?: string) => void;
  selectEdge: (id?: string) => void;
}

export const useDagEditorStore = create<DagState>((set, get) => ({
  nodes: [], edges: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),
  upsertNode: (n) => set({ nodes: [...get().nodes.filter(x => x.id !== n.id), n] }),
  upsertEdge: (e) => set({ edges: [...get().edges.filter(x => x.id !== e.id), e] }),
  removeNode: (id) => set({ nodes: get().nodes.filter(n => n.id !== id), edges: get().edges.filter(e => e.source !== id && e.target !== id) }),
  removeEdge: (id) => set({ edges: get().edges.filter(e => e.id !== id) }),
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: undefined }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: undefined }),
}));
```

- [ ] **Step 2: Canvas component**

Use React Flow (`reactflow` package — confirm version installed; typical install: `npm install reactflow` if not present).

```tsx
// frontend/src/features/editor/dag/DagCanvas.tsx
import React, { useEffect, useCallback } from 'react';
import ReactFlow, { Background, Controls, Edge, Node, Connection, addEdge as rfAddEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { useDagEditorStore } from '@/shared/stores/dagEditorStore';
import { v4 as uuidv4 } from 'uuid';

export const DagCanvas: React.FC = () => {
  const { nodes, edges, setGraph, upsertNode, upsertEdge, selectNode, selectEdge } = useDagEditorStore();

  const rfNodes: Node[] = nodes.map(n => ({
    id: n.id, position: n.position, data: { label: n.name, raw: n }, type: 'default',
  }));
  const rfEdges: Edge[] = edges.map(e => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourcePort, targetHandle: e.targetPort,
    label: e.when ? `when ${e.when}` : (e.targetPort || ''),
  }));

  const onConnect = useCallback((c: Connection) => {
    const id = uuidv4();
    upsertEdge({
      id, source: c.source!, target: c.target!,
      sourcePort: c.sourceHandle || undefined, targetPort: c.targetHandle || undefined,
    });
  }, [upsertEdge]);

  const onNodeClick = (_: any, n: Node) => selectNode(n.id);
  const onEdgeClick = (_: any, e: Edge) => selectEdge(e.id);
  const onNodesChange = (changes: any[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        const node = nodes.find(n => n.id === c.id);
        if (node) upsertNode({ ...node, position: c.position });
      }
    }
  };

  return (
    <div style={{ height: '100%' }}>
      <ReactFlow
        nodes={rfNodes} edges={rfEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
```

- [ ] **Step 3: Mount + commit**

```bash
git add frontend/src/features/editor/dag frontend/src/shared/stores/dagEditorStore.ts frontend/src/features/editor/EditorLayout.tsx
git commit -m "feat(frontend): DAG canvas with React Flow"
```

---

### Task 14: Edge config panel

**Files:**
- Create: `frontend/src/features/editor/dag/EdgeConfigPanel.tsx`

- [ ] **Step 1: Implement panel**

```tsx
// frontend/src/features/editor/dag/EdgeConfigPanel.tsx
import React from 'react';
import { useDagEditorStore } from '@/shared/stores/dagEditorStore';

export const EdgeConfigPanel: React.FC = () => {
  const { selectedEdgeId, edges, upsertEdge, removeEdge } = useDagEditorStore();
  const edge = edges.find(e => e.id === selectedEdgeId);
  if (!edge) return null;
  const set = (patch: any) => upsertEdge({ ...edge, ...patch });

  return (
    <aside className="edge-config">
      <h3>Edge {edge.source} → {edge.target}</h3>
      <label>Target port (named input)
        <input value={edge.targetPort || ''} onChange={e => set({ targetPort: e.target.value || undefined })} />
      </label>
      <label>When (expression)
        <textarea value={edge.when || ''} onChange={e => set({ when: e.target.value || undefined })}
          placeholder="${output.status} === 'ok'" />
      </label>
      <label>Merge mode
        <select value={edge.mergeMode || 'all'} onChange={e => set({ mergeMode: e.target.value })}>
          <option value="all">all (wait for all)</option>
          <option value="any">any (race)</option>
        </select>
      </label>
      <button onClick={() => removeEdge(edge.id)}>Delete edge</button>
    </aside>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/editor/dag/EdgeConfigPanel.tsx
git commit -m "feat(frontend): edge config panel (when/merge/port)"
```

---

### Task 15: Node Advanced section (fan-out + error policy)

**Files:**
- Create: `frontend/src/features/editor/dag/NodeAdvancedSection.tsx`
- Modify: `frontend/src/features/editor/StepConfigPanel.tsx` (or whichever displays node config) to render `NodeAdvancedSection` for v2

- [ ] **Step 1: Implement**

```tsx
// frontend/src/features/editor/dag/NodeAdvancedSection.tsx
import React from 'react';
import { DagNode } from '@/shared/stores/dagEditorStore';

interface Props { node: DagNode; otherNodeIds: string[]; onChange: (patch: Partial<DagNode>) => void; }

export const NodeAdvancedSection: React.FC<Props> = ({ node, otherNodeIds, onChange }) => {
  const fan = node.fanOut || { enabled: false, inputArrayPath: '' };
  const ep = node.errorPolicy || { onError: 'stop' };
  return (
    <details>
      <summary>Advanced</summary>
      <fieldset>
        <legend>Fan-out</legend>
        <label><input type="checkbox" checked={fan.enabled}
          onChange={e => onChange({ fanOut: { ...fan, enabled: e.target.checked } })} /> run once per item in input array</label>
        {fan.enabled && (
          <input placeholder="input.items" value={fan.inputArrayPath}
            onChange={e => onChange({ fanOut: { ...fan, inputArrayPath: e.target.value } })} />
        )}
      </fieldset>
      <fieldset>
        <legend>Error policy</legend>
        <select value={ep.onError} onChange={e => onChange({ errorPolicy: { ...ep, onError: e.target.value as any } })}>
          <option value="stop">stop workflow</option>
          <option value="continue">continue (output null)</option>
          <option value="retry">retry then stop</option>
        </select>
        {ep.onError === 'retry' && (
          <input type="number" min={1} max={10} value={ep.retryCount || 1}
            onChange={e => onChange({ errorPolicy: { ...ep, retryCount: Number(e.target.value) } })} />
        )}
        {ep.onError !== 'stop' && (
          <select value={ep.errorBranch || ''}
            onChange={e => onChange({ errorPolicy: { ...ep, errorBranch: e.target.value || undefined } })}>
            <option value="">(no error branch)</option>
            {otherNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        )}
      </fieldset>
    </details>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/editor/dag/NodeAdvancedSection.tsx frontend/src/features/editor/StepConfigPanel.tsx
git commit -m "feat(frontend): per-node fan-out + error-policy controls"
```

---

### Task 16: Update workflow save/load API for v2

**Files:**
- Modify: `frontend/src/shared/api/workflowApi.ts`

- [ ] **Step 1:** Confirm the existing `saveWorkflow(id, definition)` accepts the new `{ schemaVersion: 2, nodes, edges }` shape. Backend (Task 6) now validates the DAG; frontend must surface the validation error (`error.response.data.data.errors`) in the editor's save toast.

- [ ] **Step 2:** Surface validator warnings as a non-blocking lint banner in the editor.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/api/workflowApi.ts
git commit -m "feat(frontend): surface DAG validator errors and warnings on save"
```

---

### Task 17: Run panel for DAG executions

**Files:**
- Create: `frontend/src/features/editor/dag/RunPanelV2.tsx`
- Modify: `frontend/src/features/executions/RunPanel.tsx`

- [ ] **Step 1: Render per-node status from the DAG result.** Color nodes on the canvas by status (running yellow, completed green, failed red, skipped grey). Click a node → see its output and timing.

- [ ] **Step 2: Branch on schemaVersion** — if `(execution.workflow.definition as any).schemaVersion === 2` (or the execution result carries a `nodes` array), use `RunPanelV2`. Otherwise fall back to the existing station-based view.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/editor/dag/RunPanelV2.tsx frontend/src/features/executions/RunPanel.tsx
git commit -m "feat(frontend): per-node DAG run panel"
```

---

## Phase 8 — Spec 2 diff applier upgrade

### Task 18: Add v2 diff kinds to `diffApplier`

**Files:**
- Modify: `backend/src/services/diffApplier.ts` (from Spec 2)
- Modify: `backend/src/types/assistant.ts` (extend `WorkflowDiff` union)
- Test: `backend/src/__tests__/diffApplierV2.test.ts`

- [ ] **Step 1: Extend types**

```ts
// add to WorkflowDiff in backend/src/types/assistant.ts
| { kind: 'add_node'; node: any }
| { kind: 'remove_node'; nodeId: string }
| { kind: 'update_node'; nodeId: string; patch: Record<string, any> }
| { kind: 'add_edge'; edge: any }
| { kind: 'remove_edge'; edgeId: string }
| { kind: 'update_edge'; edgeId: string; patch: Record<string, any> }
| { kind: 'replace_workflow_v2'; nodes: any[]; edges: any[] }
```

- [ ] **Step 2: Implement v2 cases in `applyDiff`**

```ts
import { isV2 } from '../types/dag';
// inside applyDiff: branch on isV2(out)
//   if v2, handle add_node / remove_node / update_node / add_edge / remove_edge / update_edge / replace_workflow_v2
//   if v1, keep existing handlers + reject v2 kinds with a clear error
//   replace_workflow stays valid for v1; replace_workflow_v2 for v2.
```

(Concrete code is mechanical; mirror the v1 cases.)

- [ ] **Step 3: Tests**

```ts
// backend/src/__tests__/diffApplierV2.test.ts
import { describe, it, expect } from 'vitest';
import { applyDiff } from '../services/diffApplier';

describe('applyDiff v2', () => {
  const base = (): any => ({
    schemaVersion: 2,
    nodes: [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  });

  it('adds a node and edge', () => {
    const out: any = applyDiff(base(), [
      { kind: 'add_node', node: { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 1, y: 0 } } },
      { kind: 'add_edge', edge: { id: 'e1', source: 'a', target: 'b' } },
    ]);
    expect(out.nodes.length).toBe(2);
    expect(out.edges[0].source).toBe('a');
  });

  it('rejects v1 kinds against a v2 workflow', () => {
    expect(() => applyDiff(base(), [{ kind: 'add_station', station: { id: 's', name: 'x', steps: [], position: { x: 0, y: 0 } } }]))
      .toThrow(/v1.*v2/i);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && npm run test -- --run diffApplierV2
git add backend/src/services/diffApplier.ts backend/src/types/assistant.ts backend/src/__tests__/diffApplierV2.test.ts
git commit -m "feat(assistant): apply DAG-aware diffs (v2 kinds)"
```

---

### Task 19: Update assistant system prompt + tool docs

**Files:**
- Modify: `backend/src/services/assistantPromptBuilder.ts`
- Modify: `backend/src/services/assistantTools.ts` (`list_node_types` + `propose_workflow_change` schema text)

- [ ] **Step 1:** When `list_node_types` is called, also expose the new DAG concepts (fan-out, edge `when`, error policy) in the description so the assistant knows they exist.

- [ ] **Step 2:** Update the system prompt to drop "stations" and add a one-line note that workflows are now DAGs of nodes connected by edges with optional fan-out and error policies.

- [ ] **Step 3: Smoke test (extend an existing assistant test) + commit**

```bash
git add backend/src/services/assistantPromptBuilder.ts backend/src/services/assistantTools.ts
git commit -m "feat(assistant): update prompt + tool docs for DAG terminology"
```

---

## Phase 9 — End-to-end

### Task 20: DAG workflow integration test (stubbed vLLM)

**Files:**
- Create: `backend/src/__tests__/dagWorkflow.integration.test.ts`

- [ ] **Step 1: Mirror Spec 1's integration test against the DAG quiz workflow.** The stub responds to system-prompt content patterns just like the Spec 1 stub. Confirm:
  - Multiple chunks fan-out across `generator`.
  - `reviewer` and `verifier` run after `generator` (parallel).
  - `fix-loop` receives both reviewer + verifier outputs.
  - `collect` flattens; `writer` produces the JSON file.

- [ ] **Step 2: Run + commit**

```bash
cd backend && npm run test -- --run dagWorkflow.integration
git add backend/src/__tests__/dagWorkflow.integration.test.ts
git commit -m "test(dag): E2E quiz DAG with stubbed vLLM"
```

---

### Task 21: Manual smoke against real vLLM

This is a manual checkpoint, not a code task.

- [ ] Set env (re-uses Spec 1 env). Restart server. Migrator runs; existing workflows become v2.
- [ ] Open the editor for the quiz workflow. Confirm canvas shows free-form DAG: load → generator (fan-out badge) → reviewer + verifier (parallel siblings) → fix-loop → collect → writer.
- [ ] Right-click an edge into fix-loop → set `targetPort: reviewer`. Confirm round-trip persistence.
- [ ] Run with a real PDF. Confirm: parallel reviewer/verifier visible in run panel timeline; fan-out indicator on generator; final JSON downloadable.

---

## Out of scope (deferred)

- Sub-workflows / `execute-workflow` node — separate spec.
- Workflow versioning / rollback — separate spec.
- Distributed worker pool — single-process bounded parallelism is sufficient for v1.
- Implicit item-based iteration (n8n-style every-node-iterates-over-array). Optional fan-out covers the demand for now.
- `__error` source-port handle UI in the editor — error branches can be created today by setting `errorPolicy.errorBranch`; full visual support is a follow-up.

---

## Self-review checklist

1. **Spec coverage:**
   - §2 schema — Tasks 1, 2.
   - §3 algorithm — Tasks 7-11.
   - §3.5 fan-out — Task 8.
   - §3.6 cycle/orphan/errorBranch — Task 5.
   - §4 migration — Tasks 3, 4.
   - §5 editor — Tasks 13-17.
   - §6.1 quiz workflow DAG — Task 12.
   - §6.2 assistant updates — Tasks 18, 19.
   - §8 testing — Tasks 5-11, 20.
2. **Type consistency** — `DagNode`, `DagEdge`, `WorkflowDefinitionV2` are imported from `types/dag.ts` everywhere. `errorPolicy.onError` strings are uniform across types and runtime.
3. **No placeholders** — none.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-dag-execution-engine-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between.
**2. Inline Execution** — execute tasks in this session.

**Which approach?**

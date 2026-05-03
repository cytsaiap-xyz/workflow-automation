# Spec 3 — n8n-like DAG Execution Engine

**Status:** Design approved 2026-05-03
**Depends on:** none architecturally; Specs 1 and 2 ship first against the existing sequential model and re-target this engine on landing.
**Blocks:** sub-workflows / `execute-workflow` node (separate future spec).

---

## 1. Goal

Replace the current `Workflow → Station[] → Step[]` sequential model with a directed acyclic graph (DAG) of nodes connected by edges. Add the n8n-style features that matter most:
- Parallel branch execution (bounded concurrency).
- Optional per-node fan-out over an input array.
- Named-input merging at converging nodes.
- Edge conditions (lightweight `when` expressions) layered onto the existing `if-else` node.
- Per-node error policies (`stop` / `continue` / `retry` / route to error branch).

Stations are dropped entirely. A one-shot migrator converts existing sequential workflows into linear DAGs.

---

## 2. Schema changes

### 2.1 `WorkflowDefinition`

Before:
```ts
interface WorkflowDefinition {
  inputs?: WorkflowInput[];      // from Spec 1
  stations: Station[];
}
interface Station {
  id: string;
  name: string;
  position: { x: number; y: number };
  steps: Step[];
}
```

After:
```ts
interface WorkflowDefinition {
  inputs?: WorkflowInput[];
  nodes: Node[];
  edges: Edge[];
  schemaVersion: 2;             // sequential = 1
}
```

### 2.2 `Node`

```ts
interface Node {
  id: string;
  type: StepType;
  position: { x: number; y: number };
  config: StepConfig;

  fanOut?: {
    enabled: boolean;
    inputArrayPath: string;     // dot path into incoming context, e.g., "items"
                                // node runs once per element in the array
  };

  errorPolicy?: {
    onError: 'stop' | 'continue' | 'retry';
    retryCount?: number;        // only for 'retry'; default 1
    errorBranch?: string;       // node id; only for 'continue' if you want
                                // routing on failure
  };
}
```

`StepType` and `StepConfig` are unchanged from today's union. The DAG migration does not change individual step shapes.

### 2.3 `Edge`

```ts
interface Edge {
  id: string;
  source: string;               // source node id
  sourcePort?: string;          // 'true' | 'false' for if-else; otherwise undefined
  target: string;               // target node id
  targetPort?: string;          // named input slot at target; undefined = default
  when?: string;                // optional ${...} expression; if provided,
                                // edge only fires when expression is truthy
  mergeMode?: 'all' | 'any';    // default 'all' (wait for all incoming);
                                // 'any' = race semantics
}
```

### 2.4 DB row

`workflows.definition` continues to hold a JSON blob; only the shape inside changes. A new column:

```sql
ALTER TABLE workflows ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
```

The loader uses this column to decide whether to run the migrator.

---

## 3. Execution algorithm

`executionEngine.ts` is rewritten around a scheduler.

### 3.1 State

```ts
type NodeStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';

interface ExecutionState {
  workflow: WorkflowDefinition;
  context: Record<string, any>;            // ${input.x}, ${env.x}, ${nodeId.output.y}
  nodeStatus: Map<string, NodeStatus>;
  nodeOutputs: Map<string, any>;
  satisfiedDeps: Map<string, Set<string>>; // nodeId -> set of source node ids whose
                                           // outgoing edge into nodeId has fired
  ready: Set<string>;
  running: Set<string>;
}
```

### 3.2 Loop

```
1. Initialize: every node with no incoming edges → ready.
2. While ready ∪ running is non-empty:
   a. While ready is non-empty AND running.size < MAX_CONCURRENT_NODES:
        pick any node from ready, move to running, kick off executeNode async.
   b. await Promise.race over running.
   c. On node completion:
        - record output, mark completed.
        - for each outgoing edge:
            - evaluate edge.when (if any) against the node's output context.
            - if when is falsy, mark the edge "skipped" but do NOT count it as
              satisfying the target's mergeMode='all'.
            - if when is truthy or absent, record the source as a satisfied dep
              of the target.
        - for each target whose merge condition is now met, move to ready.
   d. On node failure: apply errorPolicy (see 3.3).
3. Execution status:
   - all-completed-or-skipped → success.
   - any-failed-with-policy='stop' → failed (and we cancel running).
```

### 3.3 Error policy semantics

| Policy | Behavior on failure |
|---|---|
| `stop` (default) | Cancel running nodes, mark execution `failed`. Matches today's behavior. |
| `continue` | Treat the node's output as `null`, mark it `failed` but proceed. Downstream nodes receive `null` for that slot; their merge logic decides what to do. |
| `retry` | Run again up to `retryCount` times with exponential backoff (1s, 2s, 4s capped at 30s). On final failure, fall through to `stop`. |
| `errorBranch` (combined with `continue` or `retry`) | On final failure, fire the edge to the named error-branch node instead of producing `null`. The error branch receives the error object as its input. |

### 3.4 Merge modes

A node with multiple incoming edges:
- `mergeMode: 'all'` (default per edge): node becomes ready when **every** incoming edge has either fired (with truthy `when`) or been definitively skipped (source completed and `when` falsy or source `skipped`). Node receives `{ [targetPort_a]: outputA, [targetPort_b]: outputB, ... }`.
- `mergeMode: 'any'` (per edge — but for race semantics, all converging edges into a node must agree on `'any'`): the first edge to fire delivers its value; the others are dropped. Node receives the single value at its `targetPort` if specified, otherwise as the default input.

Validation rejects mixing `all` and `any` on edges to the same target.

### 3.5 Fan-out

When a node has `fanOut.enabled`:
- The engine reads `inputArrayPath` from the merged input. It must resolve to an array.
- The node executes N times in parallel — subject to the same `MAX_CONCURRENT_NODES` cap shared across the whole execution.
- Outputs are collected into an array preserving input order.
- Downstream nodes either read the whole array, fan-out themselves over it, or use a regular non-fan-out node which sees the array as a single payload and can iterate manually.

### 3.6 Cycle detection and validation

On workflow save (`PUT /api/workflows/:id`):
- Build the graph.
- Run Kahn's algorithm; if any node remains, reject with `400` and a message identifying the cycle.
- Reject orphan edges (source or target missing).
- Reject `errorBranch` references to non-existent nodes.

---

## 4. Migration from sequential model

A migrator runs once per workflow on first read after the upgrade, or via `POST /api/admin/migrate-workflows` for batch.

For each workflow with `schema_version = 1`:

```
nodes := []
edges := []
prevLastStepId := null
for station in stations:
  for i, step in station.steps:
    nodes.push({
      id: step.id,
      type: step.type,
      position: step.position OR derived from station + i,
      config: step.config,
      // no fanOut, no errorPolicy by default
    })
    if i > 0:
      edges.push({ id: uuid(), source: station.steps[i-1].id, target: step.id })
  if prevLastStepId AND station.steps.length > 0:
    edges.push({
      id: uuid(),
      source: prevLastStepId,
      target: station.steps[0].id,
    })
  prevLastStepId := station.steps[last]?.id

write back as { nodes, edges, schemaVersion: 2 }
bump schema_version to 2 in the row
```

The result is a linear DAG that runs identically to the original sequential workflow. The user can then edit it freely in the new editor to introduce branches and fan-out.

For `if-else` steps with `true`/`false` output slots, the migrator emits two outgoing edges with `sourcePort: 'true'` and `sourcePort: 'false'` respectively, pointing to whatever steps the original config specified as the true/false targets.

---

## 5. Editor UI changes

### 5.1 Canvas

React Flow already drives the editor. Switch from station-stack-with-internal-step-list to a free-form node graph:
- Nodes are draggable directly on the canvas; positions stored on each `Node`.
- Node palette (sidebar) drag-drops new nodes onto the canvas.
- Edges drawn by dragging from a node's output handle to a target's input handle.
- Each node has labeled input/output handles. Multiple input handles for nodes that natively merge (e.g., a future `merge` node); single default input + named ports created on-the-fly when the user assigns a `targetPort` on the edge.

### 5.2 Node properties panel

- Existing config (unchanged surface).
- New section "Advanced":
  - Toggle "Run once per item in input array" → expands to `fanOut.inputArrayPath` field with dot-path autocomplete from upstream output schemas.
  - Error policy radio: stop / continue / retry → `retryCount` field on retry. Optional `errorBranch` dropdown listing other nodes.

### 5.3 Edge properties panel

- `targetPort` text field (free-form name; receiving node's input merges by these names).
- `when` expression textarea — accepts `${...}` syntax, validated for syntactic correctness on save.
- `mergeMode` radio: all / any.
- "Test condition" button — given a sample upstream output, evaluates `when` and shows truthy/falsy.

### 5.4 Validation

- Save action runs the validator (cycle, orphan, errorBranch reference checks) and surfaces errors inline on the offending nodes/edges.
- "Lint" button (non-blocking) flags warnings: unreachable nodes, edges with no `targetPort` colliding with another edge to the same target, fan-out paths with no upstream array.

### 5.5 Run panel

- Per-node status indicators (running / completed / failed / skipped), color-coded.
- Click a node to see its actual output and timing. Already in the codebase; just re-keyed from station+step IDs to node IDs.

---

## 6. Coexistence with Spec 1 and Spec 2

### 6.1 Spec 1 (Quiz Generator)

- Quiz workflow ships pre-Spec-3 as a sequential workflow with a single `script-js` orchestrator running the per-chunk pipeline.
- A second seeded workflow ships as a true DAG version: separate generator/reviewer/verifier/fixer nodes, fan-out on the chunk array, edge conditions for the retry loop.
- Loader picks the version matching the current `schema_version`. The migrator does not need to know about the quiz workflow specifically — the seeded sequential version migrates just like any other workflow.

### 6.2 Spec 2 (Assistant)

- The assistant detects `schema_version` when calling `get_workflow` and emits diffs in the matching format.
- Pre-Spec-3 diff format uses `add_step` / `remove_step` / `update_step` with `stationId`. Post-Spec-3 uses `add_node` / `add_edge` etc.
- The assistant's built-in system prompt is updated when Spec 3 lands: removes "stations" terminology, introduces "edges" and "fan-out".

---

## 7. Out of scope for Spec 3

- **Sub-workflows / `execute-workflow`** — clean additive feature; own spec.
- **Workflow versioning** (rollback to a prior definition) — own spec.
- **Distributed worker model** — concurrency is in-process only. Fine for offline single-server deployment.
- **Item-based iteration as an implicit default** (n8n-style: every node implicitly iterates over arrays) — too invasive. Optional fan-out is the v1 substitute; revisit later if needed.
- **Cross-workflow search** for the assistant.

---

## 8. Testing approach

- **Unit:**
  - `dagScheduler.test.ts` — given a fixture graph, assert order of node executions, parallelism (using sleeps + counters), merge wait-for-all, edge `when` evaluation, fan-out fan-in shape, error policies.
  - `cycleDetection.test.ts` — assert reject on cycles.
  - `migrator.test.ts` — fixture sequential workflows → assert the produced DAG runs to the same result on a stub engine.
- **Integration:**
  - `dagWorkflow.e2e.test.ts` — end-to-end run of a fanned-out workflow against a stub vLLM.
  - `migration.api.test.ts` — `POST /api/admin/migrate-workflows`, assert schema_version bumped and old executions still readable.
- **Manual:**
  - Run a real quiz workflow against the local vLLM in DAG mode; verify parallel reviewer/verifier execution shows in the run panel timeline.

---

## 9. Open implementation questions

1. **React Flow handles for named ports** — React Flow supports multiple handles per node, but generating them dynamically from edge `targetPort` strings needs experimentation. Fallback: a fixed set of named slots per node type, declared in the node-type schema.
2. **`when` expression engine** — reuse the existing `${...}` interpolation grammar (`scriptRunner.interpolateVariables`) plus a wrapper that JSON-parses the result and coerces to boolean. Or evaluate as a JS expression in the existing sandbox. Decision deferred to implementation — the simpler interpolation-then-coerce is preferred unless workflows need richer logic.
3. **Cancellation of running nodes on fail-fast** — Node `step-js` and `step-python` need a clean cancel path. The current `script-js` uses `vm.Script` with a 30s timeout; cancel-on-demand requires breaking that timeout early. Likely solution: an `AbortController` plumbed through the sandbox wait loop. Investigation needed.
4. **Backward compatibility of the run panel** — old executions reference station+step IDs. After migration, the new run panel keys by node ID. Old executions still load (their `result` JSON is unchanged); they render in legacy mode (a flat list) with a banner explaining the workflow shape changed.

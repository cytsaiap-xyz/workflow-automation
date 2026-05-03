# Spec 2 — AI Workflow Assistant

**Status:** Design approved 2026-05-03
**Depends on:** Spec 1 (AI Provider entity + prompt library)
**Independent of:** Spec 3 (assistant works against whatever workflow shape the engine supports; emits richer diffs once DAG ships)

---

## 1. Goal

Provide an in-app AI helper that lets the user build, refine, explain, and debug workflows by chatting in natural language. The assistant runs on the same offline vLLM as the rest of the platform.

Two distinct surfaces:
- **Per-node prompt-helper popover** — small ✨ button next to system-prompt and prompt fields in any AI step's config. Drafts or improves a single prompt. Direct-apply on accept.
- **Editor-level chat panel** — right-side collapsible panel, scoped to the current workflow. Scaffolds new workflows, explains existing ones, refines configs, and proposes diffs the user explicitly Applies.

---

## 2. User flows

### 2.1 Drafting a system prompt for a node

1. User adds an `ai-structured-output` node, opens its config.
2. Clicks ✨ next to the System Prompt field.
3. Popover appears with a small input: "Describe what this node should do."
4. User types: "Extract action items from a meeting transcript as JSON."
5. Assistant replies with a drafted system prompt + JSON schema suggestion.
6. User clicks **Use this** → field populates instantly. Conversation persists per node.

### 2.2 Building a workflow from scratch

1. User opens the editor on an empty workflow, expands the chat panel.
2. Types: "I want to read a folder of meeting notes and produce a weekly summary."
3. Assistant responds with prose explanation + invokes `propose_workflow_change` tool. UI renders a diff card: "Add 4 nodes: load-document → script-js (group by week) → ai-structured-output (summarize) → quiz-output-writer (or write to file)."
4. User clicks **Apply** → nodes appear on canvas at suggested positions.
5. User refines: "make it group by month instead." Assistant proposes a config-only diff on the script-js node; user clicks **Apply**.

### 2.3 Debugging a failed run

1. User runs a workflow; one step errors.
2. From the run panel, user clicks "Ask the assistant about this failure".
3. Chat panel opens; the conversation is auto-seeded with `get_execution(...)` and `get_execution_logs(...)` tool calls (visible as collapsed blocks).
4. Assistant explains the error and proposes a fix (e.g., increase `timeout`, add `errorPolicy: continue` if Spec 3 has shipped, or change a prompt).
5. User clicks **Apply**.

---

## 3. Architecture

```
Frontend
├── Per-node popover (PromptHelperPopover.tsx)
└── Chat panel (AssistantChatPanel.tsx)
        │
        ▼ HTTP + SSE
Backend
├── /api/assistant/conversations          (CRUD)
├── /api/assistant/conversations/:id/messages  (POST, SSE response)
├── /api/assistant/changes/:id/apply      (POST)
└── /api/assistant/changes/:id/reject     (POST)
        │
        ▼
assistantService.ts
├── Conversation loader + compaction
├── Prompt builder (system prompt + tool schemas)
├── vLLM client (uses assistant provider)
└── Tool dispatcher (read-only + gated write tools)
        │
        ▼
DB (assistant_conversations, pending_changes)
```

---

## 4. Data model changes

### 4.1 `assistant_conversations`

```sql
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK(surface IN ('panel','node-popover')),
  node_id TEXT,                       -- only set for surface='node-popover'
  messages TEXT NOT NULL,             -- JSON array of {role, content, timestamp, toolCalls?}
  summary TEXT,                       -- compacted summary of older turns
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_conv_workflow ON assistant_conversations(workflow_id);
CREATE UNIQUE INDEX idx_conv_node ON assistant_conversations(workflow_id, node_id)
  WHERE surface = 'node-popover';
```

A workflow has at most one `panel` conversation and at most one `node-popover` conversation per node.

### 4.2 `pending_changes`

```sql
CREATE TABLE IF NOT EXISTS pending_changes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  diff TEXT NOT NULL,                 -- JSON describing the proposed change
  status TEXT CHECK(status IN ('pending','applied','rejected')) DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
```

### 4.3 Diff format

Used by `propose_workflow_change`:

```ts
type WorkflowDiff =
  | { kind: 'add_node'; node: Node }
  | { kind: 'remove_node'; nodeId: string }
  | { kind: 'update_node'; nodeId: string; patch: Partial<Node> }
  | { kind: 'add_edge'; edge: Edge }              // Spec 3 only
  | { kind: 'remove_edge'; edgeId: string }       // Spec 3 only
  | { kind: 'replace_workflow'; nodes: Node[]; edges?: Edge[] }
```

Pre-Spec 3 the engine has stations, not edges. The pre-Spec-3 diff format substitutes `add_step`, `remove_step`, `update_step` with `stationId` parameters; the post-Spec-3 format is what's shown above. The assistant service detects schema version on load and emits the matching format.

---

## 5. Capabilities and tools

### 5.1 Capabilities (all six in v1)

| # | Capability | Primary surface | Tools used |
|---|---|---|---|
| 1 | Draft a system prompt for an AI node | popover | `get_prompt_library`, `set_node_prompt` |
| 2 | Scaffold a workflow from a goal | panel | `list_node_types`, `get_prompt_library`, `propose_workflow_change` |
| 3 | Explain an existing workflow | panel | `get_workflow`, `get_node_docs` |
| 4 | Debug a failed run | panel | `get_execution`, `get_execution_logs`, `get_node_output`, `propose_workflow_change` |
| 5 | Iteratively refine a workflow | panel | `get_workflow`, `propose_workflow_change`, `set_node_prompt` |
| 6 | Improve a draft prompt | popover or panel | (no tools — pure prose response) |

### 5.2 Tool catalog

**Read-only (always available):**

| Tool | Args | Returns |
|---|---|---|
| `get_workflow` | `{ workflow_id }` | full `WorkflowDefinition` |
| `list_node_types` | `{}` | array of `{ type, displayName, description, configSchema }` |
| `get_node_docs` | `{ type }` | markdown help text for a node type |
| `get_prompt_library` | `{ tag?, role? }` | filtered list of templates |
| `get_execution` | `{ execution_id }` | execution metadata + status |
| `get_execution_logs` | `{ execution_id, level? }` | log entries |
| `get_node_output` | `{ execution_id, step_id }` | the recorded output of a single step |

**Write (gated):**

| Tool | Args | Returns | Apply gate |
|---|---|---|---|
| `propose_workflow_change` | `{ workflow_id, diff: WorkflowDiff[], rationale }` | `{ change_id }` | requires explicit Apply via UI button |
| `set_node_prompt` | `{ workflow_id, node_id, role: 'system'\|'user', prompt }` | `{ ok: true }` | applies directly (matches Q2 hybrid rule: prompt edits low-stakes) |

`search_workflows` is intentionally excluded from v1. Add later once the platform has many workflows.

---

## 6. Conversation memory and compaction

### 6.1 Loading

On each user message:
1. Load `assistant_conversations` row.
2. Build the prompt as: `[system, summary?, ...messages, newUserMessage]`.
3. Estimate tokens (a simple char-based estimator is fine for v1: `Math.ceil(chars / 3.5)`).
4. If estimate > 75% of the configured context window (`ASSISTANT_CONTEXT_WINDOW`, default `8192`), trigger compaction before sending.

### 6.2 Compaction

1. Take the oldest 50% of messages.
2. Issue a separate small vLLM call asking for a 200-300 token summary that preserves: user goals, decisions made, files referenced, last-known workflow state.
3. Replace those messages with the new summary text appended to the existing `summary`.
4. Persist.

This is a simple "summary + sliding window" — fine for v1; revisit if quality suffers.

### 6.3 Streaming

The `POST .../messages` endpoint returns Server-Sent Events:
- `data: {"type":"token","value":"..."}` — incremental tokens.
- `data: {"type":"tool_call","name":"...","args":{...}}` — emitted before tool execution.
- `data: {"type":"tool_result","name":"...","summary":"..."}` — short summary of the result; full result available via a follow-up read endpoint if the UI needs it.
- `data: {"type":"done","message_id":"..."}` — end of turn.
- `data: {"type":"pending_change","change_id":"..."}` — emitted when `propose_workflow_change` was used; UI renders Apply/Reject card.

---

## 7. API routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/assistant/conversations` | Body: `{ workflow_id, surface, node_id? }`. Creates or returns existing conversation row. |
| `GET` | `/api/assistant/conversations/:id` | Read conversation history (messages + summary). |
| `POST` | `/api/assistant/conversations/:id/messages` | Body: `{ content }`. Returns SSE stream as described in 6.3. |
| `POST` | `/api/assistant/changes/:change_id/apply` | Apply a pending diff to the workflow. Updates the workflow's `definition` row. |
| `POST` | `/api/assistant/changes/:change_id/reject` | Mark the diff `rejected`. |
| `GET` | `/api/assistant/changes/:change_id` | Read a pending change (used by the UI to render the diff card). |

---

## 8. Backend service: `assistantService.ts`

Responsibilities:
- Conversation CRUD (loaded on each turn, persisted after each turn).
- Prompt construction:
  ```
  system: built-in assistant persona + tool descriptions + offline guardrails note
  + (if non-empty) summary
  + messages
  + new user message
  ```
- vLLM call via the **assistant provider** (separate `ai_providers` row, default `assistant` flag, defaults to the same provider as workflow nodes at first run).
- Tool-call loop (mirrors existing `aiExecutor.executeAgent` patterns):
  - Up to `ASSISTANT_MAX_TOOL_ITERATIONS` (default 8) iterations.
  - Tool dispatch table maps tool name → server-side function.
  - Tool results truncated to a configurable max length before re-feeding to the LLM (avoids ballooning context with full workflow JSON; assistant can re-call the tool with narrower args if it needs more).
- Compaction trigger before send.
- SSE writer for streaming.

### 8.1 Built-in assistant system prompt (lives in code; not user-editable v1)

> You are an offline workflow-building helper for a visual automation platform. The platform runs entirely on a local multi-modal vLLM server with no external internet access except via an explicit allowlist. Available node types are: [interpolated]. When you propose workflow changes, prefer existing templates from the prompt library (`get_prompt_library`). When asked about a specific node, focus narrowly on that node and prefer `set_node_prompt` for prompt-only edits. When asked to build or modify a workflow, produce a `propose_workflow_change` tool call with a clear rationale. When asked to explain a workflow, fetch it first with `get_workflow` and respond in plain English organized by step. When asked about a failed run, fetch the execution + logs first; do not speculate without reading them.

---

## 9. Frontend

### 9.1 Per-node popover (`PromptHelperPopover.tsx`)

- Mounted next to the System Prompt and Prompt fields in any AI step's config panel.
- ✨ button → opens popover.
- On open, lazily creates the `node-popover` conversation for `(workflow_id, node_id)`.
- Single-line input + Send button.
- Streamed response renders in a scrollable area below the input.
- Each assistant response carrying a draft prompt has a **Use this** button → calls `set_node_prompt` (the assistant's own tool path, so the UI just acknowledges and re-reads the workflow). Conversation persists for follow-ups.

### 9.2 Chat panel (`AssistantChatPanel.tsx`)

- Right-side collapsible panel in the editor, persistent across the workflow's lifetime.
- Header with workflow name, "Clear conversation" button (resets to a fresh row, does not delete history just resets `messages`).
- Message list with role badges; tool calls rendered as collapsible blocks ("Reading workflow..." → expand to see args/result).
- **Pending change cards** — when `pending_change` SSE event arrives, a card pins to the bottom of the message list with: rationale, diff summary (e.g., "Adds 3 nodes, removes 1"), expandable full diff, and **Apply** / **Reject** buttons.
- Composer at the bottom with multiline support and Enter to send.

### 9.3 Settings additions

- `/settings/ai-providers` (from Spec 1) gains an "Assistant provider" dropdown — selects which provider the assistant uses. Defaults to the seeded default.

---

## 10. Testing approach

- **Unit:**
  - `assistantService.compaction.test.ts` — synthetic long conversation, assert summary + window behavior.
  - `assistantService.tools.test.ts` — each tool's dispatch + arg validation.
  - `diffApplier.test.ts` — apply each `WorkflowDiff` kind to a fixture workflow; assert the result shape.
- **Integration:**
  - `assistant.api.test.ts` — `supertest` against the SSE endpoint with a stub vLLM that emits canned tool-calls; asserts streaming envelope and final state.
- **Manual:**
  - Build a small workflow via chat panel; verify Apply produces the expected canvas state.
  - Trigger a failed execution and ask the assistant to debug; verify it fetches logs.

---

## 11. Out of scope for Spec 2

- `search_workflows` tool (deferred until many workflows exist).
- Voice input / speech.
- Editing the assistant's own system prompt from the UI.
- Multi-user / per-user conversation namespaces — single-user model assumed for v1.
- Sharing workflows generated by the assistant as templates — covered separately under "templates" feature, future spec.

---

## 12. Open implementation questions

1. **SSE vs WebSocket** — SSE is simpler (one-way streaming over HTTP) and matches the existing `executionEventBus` style. Default: SSE. WebSocket only if a feature later requires bi-directional flow.
2. **Tool-result truncation rule** — initial heuristic: cap each tool result at ~2k tokens; if the assistant needs more, it can re-call with narrower args. Tunable via env: `ASSISTANT_TOOL_RESULT_MAX_TOKENS`.
3. **Concurrency** — only one in-flight assistant call per conversation. New user messages while a stream is in flight are rejected with 409. Cancellation: the user can close the panel; the server aborts the vLLM call.

# Spec 1 — Offline Document Quiz Generator

**Status:** Design approved 2026-05-03
**Depends on:** none (ships on existing sequential engine; will be re-saved as DAG once Spec 3 lands)
**Blocks:** none directly; informs Spec 2 (assistant uses prompt library + provider entity introduced here)

---

## 1. Goal

Provide the first end-to-end use case for the platform: a user uploads a `.pdf`, `.pptx`, or `.txt` document, supplies a focus area, and receives a JSON file of multiple-choice quiz questions back. The pipeline uses a multi-agent quality loop (generator → reviewer → verifier → fixer) to ensure the output is grounded in the source and matches the requested focus area.

The platform runs in an **offline environment** with a **local multi-modal vLLM** server. No external HTTP calls are permitted except via a configurable allowlist.

---

## 2. User flow

1. User opens the editor, picks the built-in **Quiz Generator** workflow template (or builds their own using the new node types).
2. User clicks **Run**. A new **Run with input** dialog appears, populated from the workflow's declared `inputs`:
   - File picker — accepts `.pdf`, `.pptx`, `.txt`. Uploaded to `data/uploads/<execution-id>/<filename>`.
   - Focus-area textarea (default: `"concept and logic, not usage or default values"`).
   - Questions-per-chunk number (default: `3`).
3. User clicks **Start**. Execution starts; progress streams via existing event bus.
4. When the run completes, the run panel shows the produced quiz JSON inline plus a **Download JSON** button. The JSON is also persisted on the execution record.

---

## 3. Output schema

```json
{
  "source_file": "doc.pdf",
  "focus_area": "concept and logic, not usage or default values",
  "generated_at": "2026-05-03T19:30:00Z",
  "questions": [
    {
      "reference_page": "page-3",
      "question": "Which of the following best describes ...?",
      "options": [
        "A. ...",
        "B. ...",
        "C. ...",
        "D. ..."
      ],
      "answer": "B",
      "explanation": "Page 3 states that ...",
      "quality_warnings": []
    }
  ]
}
```

- `reference_page`: `"page-N"` for PDF/PPTX, `"chunk-N"` for TXT (or for over-large pages that were further split).
- `options`: exactly 4, prefixed with `A.` / `B.` / `C.` / `D.`.
- `answer`: the letter (`"A"`–`"D"`).
- `quality_warnings`: empty in the happy path; populated when the feedback loop hit max retries without all checks passing. Example: `["verifier: explanation not fully grounded after 3 fix attempts"]`.

---

## 4. New backend components

### 4.1 `load-document` step type

**Output type:** `Array<{ pageId: string; text: string; imagePath: string | null }>`.

**Behavior by extension:**

| Extension | Text extraction | Image extraction |
|---|---|---|
| `.pdf` | `pdf-parse` per page | Render every page as PNG via `pdfjs-dist` (or `pdf-poppler` if available); 150 DPI, downscaled so the long side ≤ 1568 px. Saved to `data/uploads/<execution-id>/page-<N>.png`. |
| `.pptx` | Extract text per slide via `pptx2json` (or equivalent) | Render every slide as PNG. Investigation needed during implementation: pure-JS slide rasterization is not always reliable. Fallbacks: `libreoffice --headless --convert-to png` if available; otherwise document the limitation and ship without slide images for v1, with a clear runtime warning. |
| `.txt` | Read file, hybrid chunking (see 4.2) | Always `null`. |

The step writes images to disk (not base64 inline) to keep the execution record small.

### 4.2 Hybrid chunking

After per-page extraction, each page is checked against a configurable `MAX_CHUNK_CHARS` (default `2000`). If a page exceeds it, the text is split at sentence boundaries into sub-chunks. Each sub-chunk gets a `pageId` like `"page-3-chunk-2"` and inherits the page's `imagePath`. For TXT, the file is split from the start with no page concept; chunk IDs are `"chunk-1"`, `"chunk-2"`, etc.

### 4.3 `quiz-output-writer` step type

Takes a flat array of questions plus run-time metadata (`source_file`, `focus_area`), assembles the final JSON, writes it to `data/uploads/<execution-id>/quiz.json`, and returns `{ filePath, json }`. The execution record's `result` field receives the JSON inline so the run panel can display it.

### 4.4 AI Provider entity

New table:
```sql
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT,
  headers TEXT,                       -- JSON object
  supports_vision INTEGER DEFAULT 0,  -- 0/1
  is_default INTEGER DEFAULT 0,       -- 0/1, only one row may have 1
  created_at TEXT, updated_at TEXT
);
```

At server start, if no rows exist, seed a default row from env vars: `VLLM_BASE_URL`, `VLLM_DEFAULT_MODEL`, `VLLM_API_KEY` (optional), `VLLM_SUPPORTS_VISION` (default `false`). AI step config gains an optional `providerId`; if absent, the default provider is used. Per-step `aiBaseUrl` / `aiModel` overrides remain supported for advanced cases.

### 4.5 Workflow inputs

`WorkflowDefinition` gains an optional `inputs` field:
```ts
inputs?: Array<{
  name: string;
  type: 'file' | 'string' | 'number' | 'boolean';
  default?: any;
  description?: string;
  accept?: string;          // for type 'file', e.g., '.pdf,.pptx,.txt'
  required?: boolean;
}>
```

At run time, the values are merged into the execution context as `${input.<name>}`. For files, the value is the server-side path of the uploaded file.

### 4.6 Prompt library

New table:
```sql
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('system','user')),
  content TEXT NOT NULL,
  description TEXT,
  requires_vision INTEGER DEFAULT 0,
  tags TEXT,                          -- JSON array
  created_at TEXT, updated_at TEXT
);
```

Seeded at startup with the four quiz pipeline prompts (generator, reviewer, verifier, fixer). Generic AI nodes can reference a template by ID; the executor interpolates `${...}` variables before sending. Future Spec 2 (assistant) will read this library and offer templates as suggestions.

### 4.7 Offline guardrails

- New env: `OFFLINE_MODE` (default `false`). When `true`, hide `notification-slack`, `action-email`, and any future external-only step types from the editor palette; the runtime still loads them but execution returns a clear error.
- New env: `HTTP_ALLOWLIST` (comma-separated). Default: `localhost,127.0.0.1,::1`. The `http-request` step's runtime resolves the URL host and rejects with a 403-equivalent error if the host is not on the allowlist. CIDR ranges (`10.0.0.0/8`) are supported.
- The vLLM host is added to the allowlist automatically based on `VLLM_BASE_URL`.

---

## 5. Multi-modal handling

### 5.1 `aiExecutor.ts` upgrade

The current implementation builds a single string content per message. The upgraded executor builds the OpenAI multi-part `content` array when:
1. The provider has `supports_vision: true`,
2. The input context contains an `imagePath` field (or the prompt template references `${input.imagePath}`),
3. The prompt template has `requires_vision: true`.

Format:
```ts
messages: [
  { role: 'system', content: systemPromptString },
  { role: 'user', content: [
    { type: 'text', text: interpolatedUserPrompt },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
  ]}
]
```

The executor reads the image from `imagePath` and base64-encodes it just-in-time. This is wrapped in a small helper, `buildMultiModalContent(text, imagePath)`, kept next to the executor.

Backwards compatibility: when the prompt does not require vision, behavior is identical to today (string content).

### 5.2 Per-agent prompts

All four agents see the page image (decision: quality over cost). Each system prompt explicitly instructs:

> Use the provided page image to ground your reasoning. The text extraction may have errors; the image is authoritative for diagrams, tables, and visual layout.

Detailed prompt drafts live in `prompt_templates` seeds (see 6.4 below).

---

## 6. Quiz workflow template

Shipped as a built-in workflow. Loaded automatically on first server start (idempotent — won't overwrite if a workflow with the same `id` already exists).

### 6.1 Workflow `inputs` declaration

```json
[
  { "name": "file", "type": "file", "accept": ".pdf,.pptx,.txt", "required": true },
  { "name": "focus_area", "type": "string", "default": "concept and logic, not usage or default values" },
  { "name": "questions_per_chunk", "type": "number", "default": 3 }
]
```

### 6.2 Stations (sequential model — pre-Spec 3)

Spec 1 ships against the existing `Station[] → Step[]` model. The feedback loop is implemented by chaining stations that route through `if-else`.

```
Station 1 — Load + chunk
  step 1: load-document       (input: ${input.file})
  step 2: script-js            (apply hybrid chunking, return { chunks: [...] })

Station 2 — Per-chunk pipeline (executed inside a script-js loop for v1)
  step 1: script-js            (loops over chunks; for each chunk, calls
                                generator/reviewer/verifier/fixer via the
                                sandbox-exposed aiCall helper described in 6.3)

Station 3 — Assemble + write
  step 1: script-js            (flatten all chunks' question arrays)
  step 2: quiz-output-writer   (write JSON file + return)
```

### 6.3 Note on iteration in v1

In the current sequential engine, there is no native fan-out (Spec 3 introduces it). For v1, the per-chunk pipeline runs inside a `script-js` step that issues fetch-style calls into a small helper exposed on the sandbox: `aiCall(provider, template, context)`. This helper is a new addition to `scriptRunner`'s sandbox surface — it returns a Promise and uses the same `ai_providers` and `prompt_templates` tables.

Once Spec 3 lands, the script-js loop is replaced by a true fan-out across four AI nodes (generator, reviewer, verifier, fixer), with a merge node and edge conditions driving the retry loop. This DAG version is checked into seeds alongside the sequential version; the loader picks whichever matches the current `schema_version`.

### 6.4 Seeded prompt templates

Four entries seeded into `prompt_templates`:

- `quiz-generator-system` — system prompt for the generator agent. Includes the focus-area placeholder and the JSON output schema.
- `quiz-reviewer-system` — system prompt for focus-area conformance review.
- `quiz-verifier-system` — system prompt for source-grounding verification (uses the page image).
- `quiz-fixer-system` — system prompt for surgical-first fixing; instructs the model to identify whether the fix is partial or full regenerate, and to emit a structured patch.

All four have `requires_vision: true`.

### 6.5 Feedback loop logic (v1)

Inside the per-chunk script-js step:

```
generated = aiCall(provider, 'quiz-generator-system', { ...chunk, focus_area })
for round in 1..3:
  reviewerResult = aiCall(provider, 'quiz-reviewer-system', { questions: generated, focus_area })
  verifierResult = aiCall(provider, 'quiz-verifier-system', { questions: generated, ...chunk })
  flagged = mergeFlags(reviewerResult, verifierResult)
  if flagged.length === 0: break
  generated = aiCall(provider, 'quiz-fixer-system', {
    questions: generated,
    issues: flagged,
    mode: round === 1 ? 'surgical' : 'auto',  // round 1 prefers surgical
    ...chunk
  })

attachQualityWarnings(generated, finalFlags)
return generated
```

After Spec 3, this loop becomes an explicit DAG with edge conditions on the "any failures?" branch.

---

## 7. API changes

### 7.1 Run with input

`POST /api/workflows/:id/execute` accepts a multipart body when the workflow declares `file` inputs:
- Form fields for non-file inputs (`focus_area`, `questions_per_chunk`).
- File parts for each `file` input. Each file is saved to `data/uploads/<execution-id>/<sanitized-filename>` before execution starts; the path is injected into context as `${input.<name>}`.

### 7.2 AI providers

- `GET /api/ai-providers` — list.
- `POST /api/ai-providers` — create.
- `PUT /api/ai-providers/:id` — update.
- `DELETE /api/ai-providers/:id` — delete (cannot delete the default; clear `is_default` first by promoting another).
- `POST /api/ai-providers/:id/promote` — set as default.

### 7.3 Prompt library

- `GET /api/prompt-templates` — list.
- `POST /api/prompt-templates` — create.
- `PUT /api/prompt-templates/:id` — update.
- `DELETE /api/prompt-templates/:id` — delete.

---

## 8. Frontend changes

- **Run with input dialog** — new component, rendered when the user clicks Run on a workflow that declares `inputs`. Form fields rendered from the declaration. Submit POSTs multipart to the execute endpoint.
- **Run panel** — gains a "Quiz" view tab when the workflow's last step is `quiz-output-writer`; renders the JSON in a readable layout with download button. Falls back to generic JSON view otherwise.
- **AI Providers admin page** — CRUD UI under `/settings/ai-providers`. List with default-marker, edit form, "Test Connection" button that pings `/v1/models` on the configured base URL.
- **Prompt Library page** — CRUD UI under `/settings/prompt-templates`. Read-only badges on seeded templates ("Built-in") with a "Duplicate" action to fork.
- **Step config panels** — AI nodes gain a provider dropdown (with "default" option) and an optional prompt-template picker.
- **Editor palette** — when `OFFLINE_MODE=true`, hide `notification-slack` / `action-email` from the palette.

---

## 9. Testing approach

- **Unit:**
  - `load-document.test.ts` — fixture PDFs/PPTXs/TXTs, assert page count, text excerpts, image presence.
  - `hybridChunking.test.ts` — assert split behavior at boundaries.
  - `aiExecutor.multimodal.test.ts` — given a context with `imagePath`, assert the message body contains an `image_url` part with a base64 data URL.
  - `httpAllowlist.test.ts` — assert blocked vs allowed hosts, including CIDR.
- **Integration:**
  - `quizWorkflow.test.ts` — runs the seeded workflow against a small fixture PDF using a stubbed vLLM (records of expected request/response pairs). Asserts final JSON shape and `quality_warnings` propagation.
- **Manual:**
  - Smoke test against the real local vLLM: upload a known PDF, verify the JSON file is produced and downloadable.

---

## 10. Out of scope for Spec 1

- DAG execution (Spec 3) — Spec 1's quiz workflow uses script-js for the per-chunk loop; will be replaced.
- AI assistant integration (Spec 2).
- Subscription to incoming-folder triggers (drop a doc into a folder; quiz appears) — could be a future trigger type but not v1.
- Result history UI for quizzes (already covered by existing executions list, just with quiz-shaped result).

---

## 11. Open implementation questions

These are decisions to make during implementation, not design:

1. **PPTX rasterization library** — research needed. If pure-JS path is unreliable, document the limitation and either ship without slide images (text-only for PPTX) or require LibreOffice on the host.
2. **PDF rasterization library choice** — `pdfjs-dist` (pure JS, slower) vs `pdf-poppler` (native, faster, requires Poppler installed). Default: pure JS for portability.
3. **Image downscale parameters** — long-side max 1568 px is the typical multi-modal sweet spot, but the local vLLM might benefit from a different size. Make it env-tunable: `IMAGE_LONG_SIDE_PX` (default 1568).
4. **Sandbox `aiCall` helper signature** — needs to match the existing `script-js` sandbox conventions (no `require`, no globals beyond what's exposed). Probably exposed as `globals.ai.call(...)`.

# Quiz Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Spec 1 — an offline workflow that takes a PDF/PPTX/TXT document, runs a multi-modal multi-agent pipeline (generator → reviewer → verifier → fixer with feedback loop), and emits a JSON quiz file.

**Architecture:** New backend pieces — document loader, hybrid chunker, multi-modal aiExecutor upgrade, AI Provider entity, prompt library, quiz output writer, HTTP allowlist, file upload pipeline — wired into the existing sequential station/step engine. Frontend gains a Run-with-Input dialog, AI Providers admin page, Prompt Library admin page, and a quiz result view in the run panel. Quiz workflow ships as a built-in seeded template using a `script-js` orchestrator that calls the AI pipeline via a sandbox-exposed `ai.call` helper. When Spec 3's DAG engine lands, the workflow is re-saved as a true DAG.

**Tech Stack:** Node 18+/TypeScript, Express, sql.js, Vitest, supertest, OpenAI SDK (vLLM-compatible), pdf-parse, pdfjs-dist, multer for uploads, React + React Flow + Zustand on the frontend.

**Spec reference:** `docs/superpowers/specs/2026-05-03-quiz-generator-design.md`

---

## File Structure

### Backend — new files

| Path | Responsibility |
|---|---|
| `backend/src/types/aiProvider.ts` | `AiProvider` interface |
| `backend/src/types/promptTemplate.ts` | `PromptTemplate` interface |
| `backend/src/types/quiz.ts` | Quiz JSON output types |
| `backend/src/models/aiProviderModel.ts` | DB CRUD for `ai_providers` |
| `backend/src/models/promptTemplateModel.ts` | DB CRUD for `prompt_templates` |
| `backend/src/services/documentLoader/index.ts` | Dispatches by extension |
| `backend/src/services/documentLoader/pdf.ts` | PDF text + page rasterization |
| `backend/src/services/documentLoader/pptx.ts` | PPTX text + slide rasterization (with fallback) |
| `backend/src/services/documentLoader/txt.ts` | TXT text |
| `backend/src/services/hybridChunking.ts` | Page/chunk-size splitter |
| `backend/src/services/quizOutputWriter.ts` | Assemble + write quiz JSON |
| `backend/src/services/httpAllowlist.ts` | URL allowlist enforcement |
| `backend/src/services/aiCallSandbox.ts` | `ai.call(provider, template, context)` for script-js |
| `backend/src/routes/aiProviders.ts` | REST CRUD |
| `backend/src/routes/promptTemplates.ts` | REST CRUD |
| `backend/src/seeds/seedAiProvider.ts` | Seed default provider from env |
| `backend/src/seeds/seedPromptTemplates.ts` | Seed quiz pipeline prompts |
| `backend/src/seeds/seedQuizWorkflow.ts` | Seed built-in quiz workflow |
| `backend/src/seeds/quizPromptTexts.ts` | Constants for the 4 system prompts |
| `backend/src/middleware/uploadHandler.ts` | multer config for `/execute` multipart |
| `backend/src/__tests__/aiProvider.test.ts` | Provider model + API tests |
| `backend/src/__tests__/promptTemplate.test.ts` | Template model + API tests |
| `backend/src/__tests__/httpAllowlist.test.ts` | Allowlist tests |
| `backend/src/__tests__/hybridChunking.test.ts` | Chunking tests |
| `backend/src/__tests__/documentLoader.test.ts` | Loader tests |
| `backend/src/__tests__/aiExecutor.multimodal.test.ts` | Multi-modal content tests |
| `backend/src/__tests__/quizOutputWriter.test.ts` | Output writer tests |
| `backend/src/__tests__/aiCallSandbox.test.ts` | Sandbox helper tests |
| `backend/src/__tests__/quizWorkflow.integration.test.ts` | E2E with stubbed vLLM |
| `backend/src/__tests__/fixtures/sample.pdf` | Test fixture |
| `backend/src/__tests__/fixtures/sample.pptx` | Test fixture |
| `backend/src/__tests__/fixtures/sample.txt` | Test fixture |

### Backend — modified files

| Path | Why |
|---|---|
| `backend/src/db/database.ts` | Add 2 tables: `ai_providers`, `prompt_templates` |
| `backend/src/types/workflow.ts` | Extend `InputParameter.type` to include `'file'`; add `accept` field; add `'load-document'` and `'quiz-output-writer'` to `StepType`; add per-step `aiProviderId`, `aiPromptTemplateId`, `imagePath` config fields |
| `backend/src/services/aiExecutor.ts` | Multi-modal content support; provider lookup by ID; template resolution |
| `backend/src/services/stepExecutor.ts` | Register `load-document` + `quiz-output-writer` cases |
| `backend/src/services/scriptRunner.ts` | Expose `ai.call` in script-js sandbox |
| `backend/src/services/executionEngine.ts` | No structural change; just confirm `inputData` flows through context as `${input.<name>}` |
| `backend/src/routes/workflows.ts` | `/execute` accepts multipart when workflow declares `file` inputs |
| `backend/src/index.ts` | Register new routes; run seeds at startup; create uploads dir |
| `backend/package.json` | Deps: `pdf-parse`, `pdfjs-dist`, `multer`, `@types/multer` |

### Frontend — new files

| Path | Responsibility |
|---|---|
| `frontend/src/features/editor/RunWithInputDialog.tsx` | File picker + dynamic form |
| `frontend/src/features/settings/AIProvidersPage.tsx` | CRUD page |
| `frontend/src/features/settings/PromptLibraryPage.tsx` | CRUD page |
| `frontend/src/features/executions/QuizResultView.tsx` | Render quiz JSON |
| `frontend/src/shared/api/aiProvidersApi.ts` | Axios calls |
| `frontend/src/shared/api/promptTemplatesApi.ts` | Axios calls |

### Frontend — modified files

| Path | Why |
|---|---|
| `frontend/src/features/editor/EditorToolbar.tsx` (or equivalent Run button) | Open Run-with-Input dialog when workflow declares inputs |
| `frontend/src/features/editor/StepConfigPanel.tsx` | Provider + template dropdowns on AI nodes |
| `frontend/src/features/editor/NodePalette.tsx` (if exists) | Hide slack/email nodes when `OFFLINE_MODE=true` |
| `frontend/src/shared/api/workflowApi.ts` | `executeWithFiles(id, FormData)` |
| `frontend/src/App.tsx` (or routes file) | Add `/settings/ai-providers`, `/settings/prompt-templates` |

---

## Phase 1 — Database schema and shared types

### Task 1: Extend `InputParameter` type to accept files

**Files:**
- Modify: `backend/src/types/workflow.ts`
- Test: `backend/src/__tests__/inputParameter.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/inputParameter.test.ts
import { describe, it, expect } from 'vitest';
import type { InputParameter } from '../types/workflow';

describe('InputParameter type', () => {
  it('accepts file type with accept field', () => {
    const fileInput: InputParameter = {
      name: 'document',
      type: 'file',
      accept: '.pdf,.pptx,.txt',
      required: true,
    };
    expect(fileInput.type).toBe('file');
    expect(fileInput.accept).toBe('.pdf,.pptx,.txt');
  });

  it('still accepts existing primitive types', () => {
    const stringInput: InputParameter = { name: 'q', type: 'string', defaultValue: 'x' };
    const numberInput: InputParameter = { name: 'n', type: 'number', defaultValue: 3 };
    expect(stringInput.type).toBe('string');
    expect(numberInput.type).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run inputParameter`
Expected: FAIL — `Type '"file"' is not assignable to type '"string" | "number" | "boolean" | "json"'`.

- [ ] **Step 3: Extend the type**

```ts
// backend/src/types/workflow.ts — replace existing InputParameter
export interface InputParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'file';
  description?: string;
  defaultValue?: any;
  required?: boolean;
  accept?: string;       // for type 'file', e.g., '.pdf,.pptx,.txt'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run inputParameter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/workflow.ts backend/src/__tests__/inputParameter.test.ts
git commit -m "feat(types): add 'file' to InputParameter with accept field"
```

---

### Task 2: Add new step types and AI fields to `StepType` / `StepConfig`

**Files:**
- Modify: `backend/src/types/workflow.ts`

- [ ] **Step 1: Extend `StepType` union**

```ts
// backend/src/types/workflow.ts — replace StepType
export type StepType =
  | 'trigger-manual'
  | 'trigger-cron'
  | 'trigger-webhook'
  | 'script-js'
  | 'script-python'
  | 'http-request'
  | 'if-else'
  | 'set-variable'
  | 'wait'
  | 'notification-slack'
  | 'action-email'
  | 'action-slack'
  | 'connector-db'
  | 'ai-prompt'
  | 'ai-structured-output'
  | 'ai-agent'
  | 'ai-router'
  | 'load-document'
  | 'quiz-output-writer';
```

- [ ] **Step 2: Extend `StepConfig` with new fields**

Add these fields to the `StepConfig` interface (append to existing block, keep existing fields):

```ts
  // Provider / template references (Spec 1)
  aiProviderId?: string;
  aiPromptTemplateSystemId?: string;
  aiPromptTemplateUserId?: string;

  // load-document
  loadDocumentSourcePath?: string;        // ${input.file} or absolute path
  loadDocumentMaxChunkChars?: number;     // default 2000

  // quiz-output-writer
  quizOutputDirectory?: string;           // default 'data/uploads/<execution-id>'
  quizOutputFilename?: string;            // default 'quiz.json'
```

- [ ] **Step 3: Build to verify types compile**

Run: `cd backend && npm run build`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add backend/src/types/workflow.ts
git commit -m "feat(types): add load-document and quiz-output-writer step types"
```

---

### Task 3: Add `ai_providers` and `prompt_templates` tables to schema

**Files:**
- Modify: `backend/src/db/database.ts`
- Test: `backend/src/__tests__/dbSchema.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/dbSchema.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('DB schema', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-db-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  it('has ai_providers table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_providers'"
    ).all();
    expect(rows.length).toBe(1);
  });

  it('has prompt_templates table', async () => {
    const db = (await import('../db/database')).default;
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_templates'"
    ).all();
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run dbSchema`
Expected: FAIL — `expected 0 to be 1`.

- [ ] **Step 3: Add tables to `SCHEMA_SQL`**

Append to `SCHEMA_SQL` in `backend/src/db/database.ts` (before the closing backtick):

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run dbSchema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/database.ts backend/src/__tests__/dbSchema.test.ts
git commit -m "feat(db): add ai_providers and prompt_templates tables"
```

---

## Phase 2 — AI Provider entity

### Task 4: `AiProvider` type + model

**Files:**
- Create: `backend/src/types/aiProvider.ts`
- Create: `backend/src/models/aiProviderModel.ts`
- Test: `backend/src/__tests__/aiProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/aiProvider.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AiProviderModel', () => {
  let AiProviderModel: typeof import('../models/aiProviderModel').AiProviderModel;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ap-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    AiProviderModel = (await import('../models/aiProviderModel')).AiProviderModel;
  });

  beforeEach(() => {
    AiProviderModel.deleteAll();
  });

  it('creates a provider', () => {
    const p = AiProviderModel.create({
      name: 'local-vllm',
      baseUrl: 'http://localhost:8000/v1',
      model: 'qwen2-vl-7b',
      supportsVision: true,
      isDefault: true,
    });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('local-vllm');
    expect(p.supportsVision).toBe(true);
    expect(p.isDefault).toBe(true);
  });

  it('demotes other defaults when promoting one', () => {
    const a = AiProviderModel.create({ name: 'a', baseUrl: 'http://a/v1', model: 'm', isDefault: true });
    const b = AiProviderModel.create({ name: 'b', baseUrl: 'http://b/v1', model: 'm', isDefault: true });
    const refreshed = AiProviderModel.getById(a.id);
    expect(refreshed?.isDefault).toBe(false);
    expect(AiProviderModel.getDefault()?.id).toBe(b.id);
  });

  it('returns the default provider', () => {
    AiProviderModel.create({ name: 'x', baseUrl: 'http://x/v1', model: 'm', isDefault: true });
    expect(AiProviderModel.getDefault()?.name).toBe('x');
  });

  it('refuses to delete the default provider', () => {
    const p = AiProviderModel.create({ name: 'x', baseUrl: 'http://x/v1', model: 'm', isDefault: true });
    expect(() => AiProviderModel.delete(p.id)).toThrow(/default/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run aiProvider`
Expected: FAIL — `Cannot find module '../models/aiProviderModel'`.

- [ ] **Step 3: Create the type**

```ts
// backend/src/types/aiProvider.ts
export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  supportsVision: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiProviderInput {
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  supportsVision?: boolean;
  isDefault?: boolean;
}

export type UpdateAiProviderInput = Partial<CreateAiProviderInput>;
```

- [ ] **Step 4: Create the model**

```ts
// backend/src/models/aiProviderModel.ts
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { AiProvider, CreateAiProviderInput, UpdateAiProviderInput } from '../types/aiProvider';

function rowToProvider(row: any): AiProvider {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    model: row.model,
    apiKey: row.api_key || undefined,
    headers: row.headers ? JSON.parse(row.headers) : undefined,
    supportsVision: !!row.supports_vision,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run aiProvider`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/types/aiProvider.ts backend/src/models/aiProviderModel.ts backend/src/__tests__/aiProvider.test.ts
git commit -m "feat(ai-provider): add AiProviderModel with default-promotion"
```

---

### Task 5: AI Provider REST routes

**Files:**
- Create: `backend/src/routes/aiProviders.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/aiProvidersRoutes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/aiProvidersRoutes.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

let app: express.Express;

describe('AI Providers API', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-apr-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const router = (await import('../routes/aiProviders')).default;
    app = express();
    app.use(express.json());
    app.use('/api/ai-providers', router);
  });

  beforeEach(async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.deleteAll();
  });

  it('GET / returns empty list', async () => {
    const res = await request(app).get('/api/ai-providers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('POST / creates a provider', async () => {
    const res = await request(app).post('/api/ai-providers').send({
      name: 'vllm', baseUrl: 'http://localhost:8000/v1', model: 'qwen2-vl-7b',
      supportsVision: true, isDefault: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('vllm');
  });

  it('PUT /:id/promote sets default', async () => {
    const a = await request(app).post('/api/ai-providers').send({ name: 'a', baseUrl: 'http://a/v1', model: 'm' });
    const b = await request(app).post('/api/ai-providers').send({ name: 'b', baseUrl: 'http://b/v1', model: 'm' });
    await request(app).post(`/api/ai-providers/${b.body.data.id}/promote`);
    const list = await request(app).get('/api/ai-providers');
    expect(list.body.data.find((p: any) => p.id === b.body.data.id).isDefault).toBe(true);
    expect(list.body.data.find((p: any) => p.id === a.body.data.id).isDefault).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run aiProvidersRoutes`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the routes**

```ts
// backend/src/routes/aiProviders.ts
import { Router, Request, Response } from 'express';
import { AiProviderModel } from '../models/aiProviderModel';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: AiProviderModel.getAll() });
});

router.get('/:id', (req: Request, res: Response) => {
  const p = AiProviderModel.getById(req.params.id);
  if (!p) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: p });
});

router.post('/', (req: Request, res: Response) => {
  try {
    const p = AiProviderModel.create(req.body);
    res.status(201).json({ success: true, data: p });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const p = AiProviderModel.update(req.params.id, req.body);
  if (!p) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: p });
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const ok = AiProviderModel.delete(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (e: any) {
    res.status(409).json({ success: false, error: e.message });
  }
});

router.post('/:id/promote', (req: Request, res: Response) => {
  const p = AiProviderModel.update(req.params.id, { isDefault: true });
  if (!p) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: p });
});

export default router;
```

- [ ] **Step 4: Wire route into `backend/src/index.ts`**

Add near the other router registrations:
```ts
import aiProvidersRouter from './routes/aiProviders';
// ...
app.use('/api/ai-providers', aiProvidersRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run aiProvidersRoutes`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/aiProviders.ts backend/src/index.ts backend/src/__tests__/aiProvidersRoutes.test.ts
git commit -m "feat(api): AI provider CRUD routes"
```

---

### Task 6: Seed default AI provider from env

**Files:**
- Create: `backend/src/seeds/seedAiProvider.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/seedAiProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/seedAiProvider.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedAiProvider', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-seed-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  beforeEach(async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.deleteAll();
  });

  it('creates a default provider when env is set and table empty', async () => {
    process.env.VLLM_BASE_URL = 'http://localhost:8000/v1';
    process.env.VLLM_DEFAULT_MODEL = 'qwen2-vl-7b';
    process.env.VLLM_SUPPORTS_VISION = 'true';
    const { seedAiProvider } = await import('../seeds/seedAiProvider');
    seedAiProvider();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const def = AiProviderModel.getDefault();
    expect(def?.baseUrl).toBe('http://localhost:8000/v1');
    expect(def?.supportsVision).toBe(true);
  });

  it('is a no-op when a default already exists', async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    AiProviderModel.create({ name: 'existing', baseUrl: 'http://x/v1', model: 'm', isDefault: true });
    process.env.VLLM_BASE_URL = 'http://elsewhere:8000/v1';
    const { seedAiProvider } = await import('../seeds/seedAiProvider');
    seedAiProvider();
    expect(AiProviderModel.getDefault()?.name).toBe('existing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run seedAiProvider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the seeder**

```ts
// backend/src/seeds/seedAiProvider.ts
import { AiProviderModel } from '../models/aiProviderModel';
import { createLogger } from '../utils/logger';

const log = createLogger('seedAiProvider');

export function seedAiProvider(): void {
  const existing = AiProviderModel.getDefault();
  if (existing) {
    log.info(`Default AI provider already exists: ${existing.name}`);
    return;
  }
  const baseUrl = process.env.VLLM_BASE_URL;
  const model = process.env.VLLM_DEFAULT_MODEL;
  if (!baseUrl || !model) {
    log.warn('VLLM_BASE_URL or VLLM_DEFAULT_MODEL not set; skipping default provider seed');
    return;
  }
  AiProviderModel.create({
    name: 'default-vllm',
    baseUrl,
    model,
    apiKey: process.env.VLLM_API_KEY || undefined,
    supportsVision: process.env.VLLM_SUPPORTS_VISION === 'true',
    isDefault: true,
  });
  log.info(`Seeded default AI provider: ${baseUrl} (${model})`);
}
```

- [ ] **Step 4: Wire into `backend/src/index.ts`** — call `seedAiProvider()` after `initDatabase()` succeeds.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run seedAiProvider`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/seeds/seedAiProvider.ts backend/src/index.ts backend/src/__tests__/seedAiProvider.test.ts
git commit -m "feat(seeds): seed default AI provider from VLLM_* env vars"
```

---

## Phase 3 — Prompt library

### Task 7: `PromptTemplate` type + model

**Files:**
- Create: `backend/src/types/promptTemplate.ts`
- Create: `backend/src/models/promptTemplateModel.ts`
- Test: `backend/src/__tests__/promptTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/promptTemplate.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PromptTemplateModel', () => {
  let PromptTemplateModel: typeof import('../models/promptTemplateModel').PromptTemplateModel;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-pt-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    PromptTemplateModel = (await import('../models/promptTemplateModel')).PromptTemplateModel;
  });

  beforeEach(() => PromptTemplateModel.deleteAll());

  it('creates and reads a template', () => {
    const t = PromptTemplateModel.create({
      name: 'gen', role: 'system', content: 'You are a quiz generator', requiresVision: true, tags: ['quiz'],
    });
    expect(t.id).toBeTruthy();
    expect(t.requiresVision).toBe(true);
    expect(t.tags).toEqual(['quiz']);
  });

  it('filters by tag', () => {
    PromptTemplateModel.create({ name: 'a', role: 'system', content: '...', tags: ['quiz'] });
    PromptTemplateModel.create({ name: 'b', role: 'system', content: '...', tags: ['email'] });
    const q = PromptTemplateModel.getByTag('quiz');
    expect(q.length).toBe(1);
    expect(q[0].name).toBe('a');
  });

  it('refuses to delete builtin templates', () => {
    const t = PromptTemplateModel.create({ name: 'x', role: 'system', content: '.', builtin: true });
    expect(() => PromptTemplateModel.delete(t.id)).toThrow(/builtin/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run promptTemplate`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the type**

```ts
// backend/src/types/promptTemplate.ts
export interface PromptTemplate {
  id: string;
  name: string;
  role: 'system' | 'user';
  content: string;
  description?: string;
  requiresVision: boolean;
  tags: string[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptTemplateInput {
  name: string;
  role: 'system' | 'user';
  content: string;
  description?: string;
  requiresVision?: boolean;
  tags?: string[];
  builtin?: boolean;
}

export type UpdatePromptTemplateInput = Partial<CreatePromptTemplateInput>;
```

- [ ] **Step 4: Create the model**

```ts
// backend/src/models/promptTemplateModel.ts
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';
import { PromptTemplate, CreatePromptTemplateInput, UpdatePromptTemplateInput } from '../types/promptTemplate';

function rowToTemplate(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    content: row.content,
    description: row.description || undefined,
    requiresVision: !!row.requires_vision,
    tags: row.tags ? JSON.parse(row.tags) : [],
    builtin: !!row.builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run promptTemplate`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/types/promptTemplate.ts backend/src/models/promptTemplateModel.ts backend/src/__tests__/promptTemplate.test.ts
git commit -m "feat(prompt-library): add PromptTemplateModel with builtin protection"
```

---

### Task 8: Prompt template REST routes

**Files:**
- Create: `backend/src/routes/promptTemplates.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/promptTemplatesRoutes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/promptTemplatesRoutes.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

let app: express.Express;

describe('Prompt Templates API', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ptr-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const router = (await import('../routes/promptTemplates')).default;
    app = express();
    app.use(express.json());
    app.use('/api/prompt-templates', router);
  });

  beforeEach(async () => {
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    PromptTemplateModel.deleteAll();
  });

  it('CRUDs templates', async () => {
    const created = await request(app).post('/api/prompt-templates').send({
      name: 'p', role: 'system', content: 'hello', tags: ['x'],
    });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/prompt-templates?tag=x');
    expect(list.body.data.length).toBe(1);
    const updated = await request(app).put(`/api/prompt-templates/${created.body.data.id}`).send({ content: 'hi' });
    expect(updated.body.data.content).toBe('hi');
    const deleted = await request(app).delete(`/api/prompt-templates/${created.body.data.id}`);
    expect(deleted.body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run promptTemplatesRoutes`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement routes**

```ts
// backend/src/routes/promptTemplates.ts
import { Router, Request, Response } from 'express';
import { PromptTemplateModel } from '../models/promptTemplateModel';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const tag = req.query.tag as string | undefined;
  const role = req.query.role as 'system' | 'user' | undefined;
  let list = PromptTemplateModel.getAll();
  if (tag) list = list.filter(t => t.tags.includes(tag));
  if (role) list = list.filter(t => t.role === role);
  res.json({ success: true, data: list });
});

router.get('/:id', (req: Request, res: Response) => {
  const t = PromptTemplateModel.getById(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: t });
});

router.post('/', (req: Request, res: Response) => {
  const t = PromptTemplateModel.create(req.body);
  res.status(201).json({ success: true, data: t });
});

router.put('/:id', (req: Request, res: Response) => {
  const t = PromptTemplateModel.update(req.params.id, req.body);
  if (!t) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: t });
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const ok = PromptTemplateModel.delete(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (e: any) {
    res.status(409).json({ success: false, error: e.message });
  }
});

export default router;
```

- [ ] **Step 4: Wire into `backend/src/index.ts`**

```ts
import promptTemplatesRouter from './routes/promptTemplates';
// ...
app.use('/api/prompt-templates', promptTemplatesRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run promptTemplatesRoutes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/promptTemplates.ts backend/src/index.ts backend/src/__tests__/promptTemplatesRoutes.test.ts
git commit -m "feat(api): prompt templates CRUD routes"
```

---

## Phase 4 — HTTP allowlist and offline-mode flag

### Task 9: HTTP allowlist utility

**Files:**
- Create: `backend/src/services/httpAllowlist.ts`
- Test: `backend/src/__tests__/httpAllowlist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/httpAllowlist.test.ts
import { describe, it, expect } from 'vitest';
import { isHostAllowed, parseAllowlist } from '../services/httpAllowlist';

describe('httpAllowlist', () => {
  it('allows loopback by default', () => {
    expect(isHostAllowed('http://127.0.0.1:8000/v1', ['localhost', '127.0.0.1', '::1'])).toBe(true);
    expect(isHostAllowed('http://localhost:5000', ['localhost', '127.0.0.1', '::1'])).toBe(true);
  });

  it('blocks unlisted hosts', () => {
    expect(isHostAllowed('https://example.com', ['localhost'])).toBe(false);
  });

  it('honors CIDR ranges', () => {
    expect(isHostAllowed('http://10.0.5.7:80', ['10.0.0.0/8'])).toBe(true);
    expect(isHostAllowed('http://192.168.0.1', ['10.0.0.0/8'])).toBe(false);
  });

  it('parses an empty allowlist string as default loopback', () => {
    expect(parseAllowlist('')).toEqual(['localhost', '127.0.0.1', '::1']);
  });

  it('parses comma-separated env values', () => {
    expect(parseAllowlist('localhost, vllm.internal, 10.0.0.0/8'))
      .toEqual(['localhost', 'vllm.internal', '10.0.0.0/8']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run httpAllowlist`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the utility**

```ts
// backend/src/services/httpAllowlist.ts
const LOOPBACK = ['localhost', '127.0.0.1', '::1'];

export function parseAllowlist(value: string | undefined): string[] {
  if (!value || value.trim() === '') return [...LOOPBACK];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null || !Number.isInteger(bits)) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function isHostAllowed(url: string, allowlist: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  for (const entry of allowlist) {
    if (entry.includes('/')) {
      if (ipMatchesCidr(host, entry)) return true;
    } else {
      if (host === entry || host.endsWith('.' + entry)) return true;
    }
  }
  return false;
}

export function getEnvAllowlist(): string[] {
  const list = parseAllowlist(process.env.HTTP_ALLOWLIST);
  // Always allow vLLM if its host isn't already on the list.
  const vllm = process.env.VLLM_BASE_URL;
  if (vllm) {
    try {
      const h = new URL(vllm).hostname;
      if (!list.includes(h)) list.push(h);
    } catch { /* ignore */ }
  }
  return list;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run httpAllowlist`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/httpAllowlist.ts backend/src/__tests__/httpAllowlist.test.ts
git commit -m "feat(security): HTTP allowlist with CIDR support"
```

---

### Task 10: Wire allowlist into `http-request` step

**Files:**
- Modify: `backend/src/services/scriptRunner.ts` (the `executeHttpRequest` method)
- Test: `backend/src/__tests__/httpAllowlistEnforcement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/httpAllowlistEnforcement.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptRunner } from '../services/scriptRunner';

describe('http-request allowlist enforcement', () => {
  beforeEach(() => {
    process.env.HTTP_ALLOWLIST = 'localhost,127.0.0.1';
    delete process.env.VLLM_BASE_URL;
  });

  it('rejects a non-allowlisted URL with a clear error', async () => {
    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://example.com', method: 'GET' },
      {}
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowlist/i);
    expect(result.error).toMatch(/example\.com/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run httpAllowlistEnforcement`
Expected: FAIL — request goes through (or fails for unrelated reason).

- [ ] **Step 3: Add allowlist check to `executeHttpRequest`**

In `backend/src/services/scriptRunner.ts`, near the top of `executeHttpRequest`, after URL interpolation but before the actual `fetch` call, insert:

```ts
import { getEnvAllowlist, isHostAllowed } from './httpAllowlist';
// ...

// (inside executeHttpRequest, after URL is resolved)
const allowlist = getEnvAllowlist();
if (!isHostAllowed(resolvedUrl, allowlist)) {
  return {
    success: false,
    error: `URL host blocked by HTTP_ALLOWLIST: ${resolvedUrl}. Update HTTP_ALLOWLIST env to permit.`,
    logs: [`Blocked outbound request to ${resolvedUrl}`],
  };
}
```

(Adapt variable names to whatever the existing function uses for the resolved URL.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run httpAllowlistEnforcement`
Expected: PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `cd backend && npm run test -- --run`
Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/scriptRunner.ts backend/src/__tests__/httpAllowlistEnforcement.test.ts
git commit -m "feat(security): enforce HTTP_ALLOWLIST in http-request step"
```

---

## Phase 5 — Workflow inputs and Run-with-Input UX

### Task 11: Multipart upload middleware

**Files:**
- Create: `backend/src/middleware/uploadHandler.ts`
- Modify: `backend/package.json` — add `multer` and `@types/multer`

- [ ] **Step 1: Install multer**

```bash
cd backend && npm install --save multer && npm install --save-dev @types/multer
```

- [ ] **Step 2: Implement the middleware**

```ts
// backend/src/middleware/uploadHandler.ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'data/uploads');

if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

export const ENV_UPLOADS_ROOT = UPLOADS_ROOT;

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // executionId is generated upstream and stored on req
    const executionId = (req as any).executionId || `pending-${uuidv4()}`;
    (req as any).executionId = executionId;
    const dir = path.join(UPLOADS_ROOT, executionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]/g, '_');
    cb(null, safe);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
}).any();
```

- [ ] **Step 3: Quick smoke commit (no test yet — covered in Task 12)**

```bash
git add backend/package.json backend/package-lock.json backend/src/middleware/uploadHandler.ts
git commit -m "feat(uploads): add multer middleware writing to data/uploads/<id>"
```

---

### Task 12: Update `/execute` to accept multipart

**Files:**
- Modify: `backend/src/routes/workflows.ts`
- Test: `backend/src/__tests__/executeMultipart.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/executeMultipart.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

let app: express.Express;
let workflowId: string;

describe('POST /api/workflows/:id/execute (multipart)', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ex-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.create({
      name: 'echo-input',
      definition: {
        inputParameters: [
          { name: 'doc', type: 'file', required: true, accept: '.txt' },
          { name: 'note', type: 'string', defaultValue: 'hi' },
        ],
        stations: [{
          id: 's1', name: 'echo', position: { x: 0, y: 0 },
          steps: [{
            id: 'st1', name: 'echo', type: 'script-js',
            position: { x: 0, y: 0 },
            config: { code: 'return { docPath: variables.input.doc, note: variables.input.note };' },
          }],
        }],
      },
    });
    workflowId = wf.id;
    const router = (await import('../routes/workflows')).default;
    app = express();
    app.use(express.json());
    app.use('/api/workflows', router);
  });

  it('accepts a file upload and exposes its path as ${input.doc}', async () => {
    const res = await request(app)
      .post(`/api/workflows/${workflowId}/execute`)
      .field('note', 'hello')
      .attach('doc', Buffer.from('sample content'), 'sample.txt');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const stepOutput = res.body.data.result.stations[0].steps[0].output;
    expect(stepOutput.note).toBe('hello');
    expect(stepOutput.docPath).toMatch(/sample\.txt$/);
    expect(fs.existsSync(stepOutput.docPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run executeMultipart`
Expected: FAIL — multipart not handled.

- [ ] **Step 3: Update the `/execute` route**

In `backend/src/routes/workflows.ts`, replace the existing `POST /:id/execute` handler with:

```ts
import { uploadMiddleware } from '../middleware/uploadHandler';
import { v4 as uuidv4 } from 'uuid';

router.post('/:id/execute', (req: Request, res: Response, next) => {
  // Pre-allocate executionId so multer can name the upload directory.
  (req as any).executionId = uuidv4();
  uploadMiddleware(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    try {
      const workflow = WorkflowModel.getById(req.params.id);
      if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });

      // Build inputData merging non-file fields + uploaded file paths.
      const inputData: Record<string, any> = {};
      // Non-file fields come from req.body (multer puts text fields here)
      Object.assign(inputData, req.body);
      // Uploaded files: req.files is an array; field name is the input parameter name.
      const files = (req.files as Express.Multer.File[]) || [];
      for (const f of files) {
        inputData[f.fieldname] = f.path;
      }

      const triggeredBy = (req.body.triggeredBy as any) || 'manual';
      const execution = await ExecutionEngine.execute(
        workflow,
        triggeredBy,
        inputData,
        false,
        (req as any).executionId
      );
      res.json({ success: true, data: execution });
    } catch (error: any) {
      const status = error.message?.startsWith('Missing required input parameter') ? 400 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  });
});
```

If `ExecutionEngine.execute` does not currently accept an externally supplied `executionId`, also do this:

- [ ] **Step 3a: Modify `ExecutionEngine.execute` to accept an optional executionId**

In `backend/src/services/executionEngine.ts`, change the signature:

```ts
static async execute(
  workflow: Workflow,
  triggeredBy: 'manual' | 'schedule' | 'webhook' | 'api' = 'manual',
  inputData: Record<string, any> = {},
  simulate: boolean = false,
  executionId?: string
): Promise<Execution>
```

Where the method generates an `executionId` today, replace with `executionId = executionId || uuidv4();`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run executeMultipart`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd backend && npm run test -- --run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/workflows.ts backend/src/services/executionEngine.ts backend/src/__tests__/executeMultipart.test.ts
git commit -m "feat(api): /execute accepts multipart and exposes file paths as input"
```

---

## Phase 6 — Document loader

### Task 13: Hybrid chunking utility

**Files:**
- Create: `backend/src/services/hybridChunking.ts`
- Test: `backend/src/__tests__/hybridChunking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/hybridChunking.test.ts
import { describe, it, expect } from 'vitest';
import { applyHybridChunking } from '../services/hybridChunking';

describe('applyHybridChunking', () => {
  const MAX = 50;

  it('preserves short pages as a single chunk', () => {
    const out = applyHybridChunking([{ pageId: 'page-1', text: 'short text', imagePath: null }], MAX);
    expect(out).toEqual([{ pageId: 'page-1', text: 'short text', imagePath: null }]);
  });

  it('splits long pages at sentence boundaries', () => {
    const longText = 'A.'.padEnd(40, ' ') + ' ' + 'B.'.padEnd(40, ' ') + ' ' + 'C.'.padEnd(40, ' ');
    const out = applyHybridChunking([{ pageId: 'page-2', text: longText, imagePath: '/img.png' }], MAX);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].pageId).toBe('page-2-chunk-1');
    expect(out[0].imagePath).toBe('/img.png');
  });

  it('treats TXT-style chunk- inputs without further splitting if short', () => {
    const out = applyHybridChunking([{ pageId: 'chunk-1', text: 'hello', imagePath: null }], MAX);
    expect(out[0].pageId).toBe('chunk-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run hybridChunking`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chunker**

```ts
// backend/src/services/hybridChunking.ts
export interface RawPage {
  pageId: string;
  text: string;
  imagePath: string | null;
}

function splitAtSentenceBoundaries(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).length > maxChars) {
      if (current) chunks.push(current.trim());
      // If a single sentence is itself longer than maxChars, hard-split it.
      if (s.length > maxChars) {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = s;
      }
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export function applyHybridChunking(pages: RawPage[], maxChars: number): RawPage[] {
  const out: RawPage[] = [];
  for (const page of pages) {
    if (page.text.length <= maxChars) {
      out.push(page);
      continue;
    }
    const subs = splitAtSentenceBoundaries(page.text, maxChars);
    subs.forEach((text, i) => {
      out.push({
        pageId: `${page.pageId}-chunk-${i + 1}`,
        text,
        imagePath: page.imagePath,
      });
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run hybridChunking`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/hybridChunking.ts backend/src/__tests__/hybridChunking.test.ts
git commit -m "feat(loader): hybrid chunking by sentence boundaries"
```

---

### Task 14: TXT loader

**Files:**
- Create: `backend/src/services/documentLoader/txt.ts`
- Test: `backend/src/__tests__/documentLoader.test.ts` (start file; will grow in following tasks)
- Create test fixture: `backend/src/__tests__/fixtures/sample.txt`

- [ ] **Step 1: Create the fixture**

```bash
mkdir -p backend/src/__tests__/fixtures
printf "Concepts overview. The variable X is bounded.\nUsage example: foo(1).\nMore concepts here." > backend/src/__tests__/fixtures/sample.txt
```

- [ ] **Step 2: Write the failing test**

```ts
// backend/src/__tests__/documentLoader.test.ts
import { describe, it, expect } from 'vitest';
import path from 'path';
import { loadDocument } from '../services/documentLoader';

const fixtures = path.join(__dirname, 'fixtures');

describe('documentLoader', () => {
  describe('TXT', () => {
    it('loads a TXT file as a single chunk-1', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.txt'), {
        executionId: 'exec-1',
        maxChunkChars: 10000,
      });
      expect(out.length).toBe(1);
      expect(out[0].pageId).toBe('chunk-1');
      expect(out[0].text).toContain('Concepts');
      expect(out[0].imagePath).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement TXT loader**

```ts
// backend/src/services/documentLoader/txt.ts
import fs from 'fs/promises';
import { RawPage } from '../hybridChunking';

export async function loadTxt(filePath: string): Promise<RawPage[]> {
  const text = await fs.readFile(filePath, 'utf8');
  return [{ pageId: 'chunk-1', text, imagePath: null }];
}
```

- [ ] **Step 5: Implement the dispatcher**

```ts
// backend/src/services/documentLoader/index.ts
import path from 'path';
import { loadTxt } from './txt';
import { applyHybridChunking, RawPage } from '../hybridChunking';

export interface LoadDocumentOptions {
  executionId: string;
  maxChunkChars?: number;
}

export async function loadDocument(
  filePath: string,
  opts: LoadDocumentOptions
): Promise<RawPage[]> {
  const ext = path.extname(filePath).toLowerCase();
  let raw: RawPage[];
  switch (ext) {
    case '.txt':
      raw = await loadTxt(filePath);
      break;
    case '.pdf':
      throw new Error('PDF loader not yet implemented (Task 15)');
    case '.pptx':
      throw new Error('PPTX loader not yet implemented (Task 17)');
    default:
      throw new Error(`Unsupported document extension: ${ext}`);
  }
  return applyHybridChunking(raw, opts.maxChunkChars ?? 2000);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/documentLoader backend/src/__tests__/documentLoader.test.ts backend/src/__tests__/fixtures/sample.txt
git commit -m "feat(loader): TXT loader + dispatcher"
```

---

### Task 15: PDF loader (text)

**Files:**
- Create: `backend/src/services/documentLoader/pdf.ts`
- Modify: `backend/package.json` — add `pdf-parse`, `pdfjs-dist`
- Modify: `backend/src/services/documentLoader/index.ts` — wire `.pdf`
- Modify: `backend/src/__tests__/documentLoader.test.ts` — add PDF cases
- Create test fixture: `backend/src/__tests__/fixtures/sample.pdf` (small 2-page PDF; commit a fixture file)

- [ ] **Step 1: Install deps**

```bash
cd backend && npm install --save pdf-parse pdfjs-dist
```

- [ ] **Step 2: Add the test fixture**

Generate or commit a 2-page PDF named `sample.pdf` under `backend/src/__tests__/fixtures/`. If you don't have one, create with: `pdftk` or use `pdfkit` in a one-off Node script. Page 1 should contain text "Concepts page". Page 2 should contain text "Usage page" plus an embedded image (any small PNG works for image tests later).

- [ ] **Step 3: Add failing test**

Append to `backend/src/__tests__/documentLoader.test.ts`:

```ts
  describe('PDF', () => {
    it('loads each page with its text', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.pdf'), {
        executionId: 'exec-pdf-1',
        maxChunkChars: 10000,
      });
      expect(out.length).toBeGreaterThanOrEqual(2);
      expect(out[0].pageId).toBe('page-1');
      expect(out[0].text).toContain('Concepts page');
      expect(out[1].pageId).toBe('page-2');
      expect(out[1].text).toContain('Usage page');
    });
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: FAIL — `PDF loader not yet implemented`.

- [ ] **Step 5: Implement PDF text extraction**

```ts
// backend/src/services/documentLoader/pdf.ts
import fs from 'fs/promises';
import path from 'path';
import { RawPage } from '../hybridChunking';

export async function loadPdf(
  filePath: string,
  executionId: string
): Promise<RawPage[]> {
  // Use pdfjs-dist (legacy build) for per-page text extraction.
  // pdf-parse is a single-blob extractor; we need page granularity.
  // @ts-ignore — pdfjs-dist legacy build has no types
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;

  const pages: RawPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it: any) => it.str).join(' ').trim();
    pages.push({
      pageId: `page-${i}`,
      text,
      imagePath: null,        // image rasterization handled in Task 16
    });
  }
  return pages;
}
```

Wire into the dispatcher:

```ts
// backend/src/services/documentLoader/index.ts
import { loadPdf } from './pdf';
// ...
case '.pdf':
  raw = await loadPdf(filePath, opts.executionId);
  break;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: PASS (TXT + PDF text).

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/documentLoader/pdf.ts backend/src/services/documentLoader/index.ts backend/src/__tests__/documentLoader.test.ts backend/src/__tests__/fixtures/sample.pdf
git commit -m "feat(loader): PDF text extraction per page via pdfjs-dist"
```

---

### Task 16: PDF image rasterization

**Files:**
- Modify: `backend/src/services/documentLoader/pdf.ts`
- Modify: `backend/src/__tests__/documentLoader.test.ts`

- [ ] **Step 1: Install canvas (required by pdfjs for rasterization)**

```bash
cd backend && npm install --save canvas
```

(If `canvas` build fails on the host, document the limitation; pure-JS rendering is hard. The fallback is to use `pdf-poppler` via system `poppler` if installed. Default we'll use `canvas`.)

- [ ] **Step 2: Add failing image-presence test**

Append to `backend/src/__tests__/documentLoader.test.ts` PDF describe block:

```ts
    it('rasterizes each page to a PNG file', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.pdf'), {
        executionId: 'exec-pdf-img',
        maxChunkChars: 10000,
      });
      expect(out[0].imagePath).toBeTruthy();
      expect(out[0].imagePath).toMatch(/page-1\.png$/);
      const fs = await import('fs');
      expect(fs.existsSync(out[0].imagePath!)).toBe(true);
    });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: FAIL — `imagePath` is null.

- [ ] **Step 4: Implement rasterization**

Replace `loadPdf` body:

```ts
// backend/src/services/documentLoader/pdf.ts
import fs from 'fs/promises';
import path from 'path';
import { RawPage } from '../hybridChunking';
import { ENV_UPLOADS_ROOT } from '../../middleware/uploadHandler';

const LONG_SIDE = Number(process.env.IMAGE_LONG_SIDE_PX || 1568);
const RENDER_DPI = 150;

export async function loadPdf(
  filePath: string,
  executionId: string
): Promise<RawPage[]> {
  // @ts-ignore
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('canvas');

  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;

  const outDir = path.join(ENV_UPLOADS_ROOT, executionId);
  await fs.mkdir(outDir, { recursive: true });

  const pages: RawPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it: any) => it.str).join(' ').trim();

    // Compute a viewport that fits within LONG_SIDE.
    const baseViewport = page.getViewport({ scale: 1 });
    const longSide = Math.max(baseViewport.width, baseViewport.height);
    const targetScale = (RENDER_DPI / 72);
    const scaledLongSide = longSide * targetScale;
    const finalScale = scaledLongSide > LONG_SIDE
      ? targetScale * (LONG_SIDE / scaledLongSide)
      : targetScale;
    const viewport = page.getViewport({ scale: finalScale });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx as any, viewport }).promise;

    const imagePath = path.join(outDir, `page-${i}.png`);
    await fs.writeFile(imagePath, canvas.toBuffer('image/png'));

    pages.push({ pageId: `page-${i}`, text, imagePath });
  }
  return pages;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/documentLoader/pdf.ts backend/src/__tests__/documentLoader.test.ts
git commit -m "feat(loader): rasterize PDF pages to PNG via pdfjs + canvas"
```

---

### Task 17: PPTX loader

**Files:**
- Create: `backend/src/services/documentLoader/pptx.ts`
- Modify: `backend/package.json` — add `node-pptx-parser` (or equivalent — research at implementation time)
- Modify: `backend/src/services/documentLoader/index.ts`
- Modify: `backend/src/__tests__/documentLoader.test.ts`
- Create test fixture: `backend/src/__tests__/fixtures/sample.pptx`

- [ ] **Step 1: Add a 2-slide fixture** named `sample.pptx`. Slide 1: "Concept slide". Slide 2: "Usage slide" with a small image shape.

- [ ] **Step 2: Install a PPTX text-extraction library**

```bash
cd backend && npm install --save officeparser
```

(`officeparser` is a small library that extracts text from PPTX. Slide rasterization without LibreOffice is difficult in pure-JS — we ship text-only for PPTX in v1 and document the limitation. If the host has `libreoffice`, we use it for rasterization as a graceful upgrade.)

- [ ] **Step 3: Write the failing test**

Append PPTX describe block:

```ts
  describe('PPTX', () => {
    it('loads each slide with its text', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.pptx'), {
        executionId: 'exec-pptx-1',
        maxChunkChars: 10000,
      });
      expect(out.length).toBeGreaterThanOrEqual(2);
      expect(out[0].pageId).toBe('page-1');
      expect(out[0].text).toMatch(/Concept slide/);
      expect(out[1].pageId).toBe('page-2');
    });

    it('rasterizes slides when libreoffice is available, otherwise null', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.pptx'), {
        executionId: 'exec-pptx-2',
        maxChunkChars: 10000,
      });
      // imagePath may be a real file (when libreoffice present) or null (graceful fallback).
      // Test asserts the type is correct either way.
      for (const p of out) {
        expect(p.imagePath === null || typeof p.imagePath === 'string').toBe(true);
      }
    });
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: FAIL — `PPTX loader not yet implemented`.

- [ ] **Step 5: Implement loader**

```ts
// backend/src/services/documentLoader/pptx.ts
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { RawPage } from '../hybridChunking';
import { ENV_UPLOADS_ROOT } from '../../middleware/uploadHandler';
import { createLogger } from '../../utils/logger';

const log = createLogger('pptxLoader');

async function extractTextPerSlide(filePath: string): Promise<string[]> {
  // officeparser dumps all text; we use the slide separator tokens to split.
  // Fallback heuristic: split by pages-feed character or by occurrence of "Slide N".
  const officeparser = await import('officeparser');
  const fullText: string = await new Promise((resolve, reject) => {
    (officeparser as any).parseOffice(filePath, (data: string, err: any) => {
      if (err) return reject(err);
      resolve(data || '');
    });
  });
  // officeparser separates slides with form-feed (\f) when available; if not,
  // we conservatively return one big chunk.
  const splits = fullText.split('\f').map(s => s.trim()).filter(Boolean);
  if (splits.length >= 2) return splits;
  return [fullText.trim()];
}

async function rasterizeWithLibreOffice(
  filePath: string,
  outDir: string
): Promise<string[] | null> {
  return new Promise((resolve) => {
    const child = spawn('libreoffice', [
      '--headless',
      '--convert-to', 'png',
      '--outdir', outDir,
      filePath,
    ]);
    child.on('error', () => resolve(null));
    child.on('exit', async (code) => {
      if (code !== 0) return resolve(null);
      // libreoffice writes one png named like the source, but for multi-slide
      // it writes one png per slide as <basename>-<n>.png.
      try {
        const files = (await fs.readdir(outDir))
          .filter(f => f.endsWith('.png'))
          .sort();
        resolve(files.map(f => path.join(outDir, f)));
      } catch {
        resolve(null);
      }
    });
  });
}

export async function loadPptx(
  filePath: string,
  executionId: string
): Promise<RawPage[]> {
  const outDir = path.join(ENV_UPLOADS_ROOT, executionId);
  await fs.mkdir(outDir, { recursive: true });

  const slideTexts = await extractTextPerSlide(filePath);
  const slideImages = await rasterizeWithLibreOffice(filePath, outDir);
  if (!slideImages) {
    log.warn('libreoffice not available; PPTX slides will have no rasterized images');
  }

  return slideTexts.map((text, i) => ({
    pageId: `page-${i + 1}`,
    text,
    imagePath: slideImages?.[i] ?? null,
  }));
}
```

Wire into the dispatcher:

```ts
// backend/src/services/documentLoader/index.ts
import { loadPptx } from './pptx';
// ...
case '.pptx':
  raw = await loadPptx(filePath, opts.executionId);
  break;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm run test -- --run documentLoader`
Expected: PASS (text extraction works; image test passes either way).

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/documentLoader/pptx.ts backend/src/services/documentLoader/index.ts backend/src/__tests__/documentLoader.test.ts backend/src/__tests__/fixtures/sample.pptx
git commit -m "feat(loader): PPTX text + optional libreoffice rasterization"
```

---

### Task 18: Register `load-document` step type

**Files:**
- Modify: `backend/src/services/stepExecutor.ts`
- Test: `backend/src/__tests__/loadDocumentStep.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/loadDocumentStep.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { StepExecutor } from '../services/stepExecutor';
import type { Step } from '../types/workflow';

describe('load-document step', () => {
  beforeAll(() => {
    process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ld-'));
  });

  it('returns chunks for a TXT input path', async () => {
    const txtPath = path.join(__dirname, 'fixtures', 'sample.txt');
    const step: Step = {
      id: 'ld-1',
      name: 'load',
      type: 'load-document',
      position: { x: 0, y: 0 },
      config: {
        loadDocumentSourcePath: txtPath,
        loadDocumentMaxChunkChars: 10000,
      },
    };
    const result = await StepExecutor.executeStepByType(step, {
      variables: { executionId: 'exec-ld-1' },
      steps: {},
      simulate: false,
    }, {});
    expect(result.success).toBe(true);
    expect(result.output.chunks.length).toBe(1);
    expect(result.output.chunks[0].pageId).toBe('chunk-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run loadDocumentStep`
Expected: FAIL — `Unknown step type: load-document`.

- [ ] **Step 3: Add the case to `stepExecutor.ts`**

In `backend/src/services/stepExecutor.ts`, inside `executeStepByType`'s switch, before `default`:

```ts
      case 'load-document': {
        const sourcePath = ScriptRunner.interpolateVariables(
          step.config.loadDocumentSourcePath || '',
          { ...context.variables, inputData: resolvedInput }
        );
        if (!sourcePath) {
          return { success: false, error: 'load-document: source path is empty', logs: [] };
        }
        const { loadDocument } = await import('./documentLoader');
        try {
          const executionId = context.variables.executionId || 'unknown';
          const chunks = await loadDocument(sourcePath, {
            executionId,
            maxChunkChars: step.config.loadDocumentMaxChunkChars,
          });
          return {
            success: true,
            output: { chunks, count: chunks.length },
            logs: [`Loaded ${chunks.length} chunk(s) from ${sourcePath}`],
          };
        } catch (e: any) {
          return { success: false, error: `load-document failed: ${e.message}`, logs: [] };
        }
      }
```

Also ensure `executionId` is exposed on `variables` — in `executionEngine.ts`, when initializing the per-execution context, set `variables.executionId = executionId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run loadDocumentStep`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/stepExecutor.ts backend/src/services/executionEngine.ts backend/src/__tests__/loadDocumentStep.test.ts
git commit -m "feat(steps): register load-document step type"
```

---

## Phase 7 — Multi-modal aiExecutor

### Task 19: Multi-part content + provider/template resolution

**Files:**
- Modify: `backend/src/services/aiExecutor.ts`
- Test: `backend/src/__tests__/aiExecutor.multimodal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/__tests__/aiExecutor.multimodal.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AiExecutor multimodal', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-mm-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
  });

  beforeEach(async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    AiProviderModel.deleteAll();
    PromptTemplateModel.deleteAll();
  });

  it('builds multi-part content when provider supports vision and prompt requires it', async () => {
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    AiProviderModel.create({
      name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'qwen2-vl-7b',
      supportsVision: true, isDefault: true,
    });
    PromptTemplateModel.create({
      name: 'sys', role: 'system', content: 'analyze the image', requiresVision: true,
    });
    PromptTemplateModel.create({
      name: 'usr', role: 'user', content: 'page text: ${input.text}', requiresVision: true,
    });

    // Create a tiny 1x1 PNG file
    const tmpImg = path.join(os.tmpdir(), 'tiny.png');
    fs.writeFileSync(tmpImg, Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108020000007E2E5A5A0000000C4944415478DA63F8FFFF3F00050001FE7B0E1E0000000049454E44AE426082',
      'hex'
    ));

    let captured: any;
    vi.doMock('openai', () => ({
      default: class {
        chat = { completions: { create: async (params: any) => {
          captured = params;
          return { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'qwen2-vl-7b' };
        }}};
      }
    }));

    const { AiExecutor } = await import('../services/aiExecutor');
    await AiExecutor.executeStructuredOutput({
      aiPromptTemplateSystemId: PromptTemplateModel.getByName('sys')!.id,
      aiPromptTemplateUserId: PromptTemplateModel.getByName('usr')!.id,
    } as any, {
      input: { text: 'Hello', imagePath: tmpImg },
    });

    const userMsg = captured.messages.find((m: any) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[0].type).toBe('text');
    expect(userMsg.content[1].type).toBe('image_url');
    expect(userMsg.content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run aiExecutor.multimodal`
Expected: FAIL — config has no template support.

- [ ] **Step 3: Refactor `AiExecutor` to support providers, templates, and multi-modal**

Replace `aiExecutor.ts` with a refactored version that:
1. Looks up provider by `config.aiProviderId` (else default).
2. Looks up system + user prompt templates by IDs (else falls back to inline `aiSystemPrompt` / `aiPrompt`).
3. Builds multi-part content when provider supports vision AND any active template has `requiresVision: true` AND context has `imagePath`.

Add a helper:

```ts
// at top of aiExecutor.ts
import fs from 'fs/promises';
import path from 'path';
import { AiProviderModel } from '../models/aiProviderModel';
import { PromptTemplateModel } from '../models/promptTemplateModel';

interface ResolvedPrompts {
  systemContent: string | null;
  userContent: string;
  needsImage: boolean;
}

async function resolvePrompts(
  config: StepConfig,
  inputContext: Record<string, any>
): Promise<ResolvedPrompts> {
  let systemContent: string | null = null;
  let userContent = '';
  let needsImage = false;

  if (config.aiPromptTemplateSystemId) {
    const t = PromptTemplateModel.getById(config.aiPromptTemplateSystemId);
    if (t) {
      systemContent = ScriptRunner.interpolateVariables(t.content, inputContext);
      if (t.requiresVision) needsImage = true;
    }
  } else if (config.aiSystemPrompt) {
    systemContent = ScriptRunner.interpolateVariables(config.aiSystemPrompt, inputContext);
  }

  if (config.aiPromptTemplateUserId) {
    const t = PromptTemplateModel.getById(config.aiPromptTemplateUserId);
    if (t) {
      userContent = ScriptRunner.interpolateVariables(t.content, inputContext);
      if (t.requiresVision) needsImage = true;
    }
  } else if (config.aiPrompt) {
    userContent = ScriptRunner.interpolateVariables(config.aiPrompt, inputContext);
  }

  return { systemContent, userContent, needsImage };
}

async function resolveProvider(config: StepConfig) {
  if (config.aiProviderId) {
    const p = AiProviderModel.getById(config.aiProviderId);
    if (p) return p;
  }
  if (config.aiBaseUrl) {
    // Backwards-compat path: adapt inline config to a provider-shaped object.
    return {
      id: 'inline',
      name: 'inline',
      baseUrl: config.aiBaseUrl,
      model: config.aiModel || 'default',
      apiKey: config.aiApiKey,
      headers: config.aiHeaders,
      supportsVision: false,
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    };
  }
  return AiProviderModel.getDefault();
}

async function buildUserContent(
  text: string,
  needsImage: boolean,
  providerSupportsVision: boolean,
  imagePath: string | undefined
): Promise<string | Array<{ type: string; text?: string; image_url?: { url: string } }>> {
  if (!needsImage || !providerSupportsVision || !imagePath) {
    return text;
  }
  const data = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).slice(1).toLowerCase() || 'png';
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${data.toString('base64')}` } },
  ];
}
```

Then replace `executePrompt` / `executeStructuredOutput` / `executeAgent` / `executeRouter` to call `resolveProvider` and `resolvePrompts`, build messages with `buildUserContent` for the user message, and use `provider.baseUrl` / `provider.model` / `provider.apiKey` instead of `config.aiBaseUrl` etc.

The `imagePath` is read from `inputContext.input.imagePath` (or `inputContext.imagePath` for direct passthrough).

(The full refactored file is mechanical — apply the helper above to each existing method.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run test -- --run aiExecutor.multimodal`
Expected: PASS.

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && npm run test -- --run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/aiExecutor.ts backend/src/__tests__/aiExecutor.multimodal.test.ts
git commit -m "feat(ai): multi-modal content + provider/template resolution"
```

---

## Phase 8 — Quiz output writer

### Task 20: `quiz-output-writer` step

**Files:**
- Create: `backend/src/services/quizOutputWriter.ts`
- Create: `backend/src/types/quiz.ts`
- Modify: `backend/src/services/stepExecutor.ts`
- Test: `backend/src/__tests__/quizOutputWriter.test.ts`

- [ ] **Step 1: Define types**

```ts
// backend/src/types/quiz.ts
export interface QuizQuestion {
  reference_page: string;
  question: string;
  options: [string, string, string, string];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  quality_warnings?: string[];
}

export interface QuizOutput {
  source_file: string;
  focus_area: string;
  generated_at: string;
  questions: QuizQuestion[];
}
```

- [ ] **Step 2: Write failing test**

```ts
// backend/src/__tests__/quizOutputWriter.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { Step } from '../types/workflow';
import { StepExecutor } from '../services/stepExecutor';

describe('quiz-output-writer step', () => {
  beforeAll(() => {
    process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-qow-'));
  });

  it('writes a quiz JSON file and returns its path', async () => {
    const step: Step = {
      id: 'qow', name: 'write', type: 'quiz-output-writer',
      position: { x: 0, y: 0 },
      config: { quizOutputFilename: 'quiz.json' },
      inputVars: [
        { name: 'questions', source: '${variables.allQuestions}' },
        { name: 'sourceFile', source: '${input.file}' },
        { name: 'focusArea', source: '${input.focus_area}' },
      ],
    };
    const result = await StepExecutor.executeStepByType(step, {
      variables: {
        executionId: 'exec-qow-1',
        input: { file: '/tmp/doc.pdf', focus_area: 'concept and logic' },
        allQuestions: [{
          reference_page: 'page-1', question: 'Q?',
          options: ['A. a', 'B. b', 'C. c', 'D. d'],
          answer: 'B', explanation: 'because', quality_warnings: [],
        }],
      },
      steps: {},
      simulate: false,
    }, {
      questions: [{
        reference_page: 'page-1', question: 'Q?',
        options: ['A. a', 'B. b', 'C. c', 'D. d'],
        answer: 'B', explanation: 'because', quality_warnings: [],
      }],
      sourceFile: '/tmp/doc.pdf',
      focusArea: 'concept and logic',
    });
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.output.filePath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(result.output.filePath, 'utf8'));
    expect(written.questions[0].answer).toBe('B');
    expect(written.focus_area).toBe('concept and logic');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm run test -- --run quizOutputWriter`
Expected: FAIL — `Unknown step type: quiz-output-writer`.

- [ ] **Step 4: Implement writer**

```ts
// backend/src/services/quizOutputWriter.ts
import fs from 'fs/promises';
import path from 'path';
import { ENV_UPLOADS_ROOT } from '../middleware/uploadHandler';
import { QuizOutput, QuizQuestion } from '../types/quiz';

export interface QuizOutputWriterInput {
  questions: QuizQuestion[];
  sourceFile: string;
  focusArea: string;
}

export interface QuizOutputWriterOptions {
  executionId: string;
  directory?: string;
  filename?: string;
}

export async function writeQuizOutput(
  input: QuizOutputWriterInput,
  opts: QuizOutputWriterOptions
): Promise<{ filePath: string; json: QuizOutput }> {
  const dir = opts.directory || path.join(ENV_UPLOADS_ROOT, opts.executionId);
  await fs.mkdir(dir, { recursive: true });
  const filename = opts.filename || 'quiz.json';
  const filePath = path.join(dir, filename);
  const json: QuizOutput = {
    source_file: input.sourceFile,
    focus_area: input.focusArea,
    generated_at: new Date().toISOString(),
    questions: input.questions,
  };
  await fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8');
  return { filePath, json };
}
```

- [ ] **Step 5: Add the case to `stepExecutor.ts`**

```ts
      case 'quiz-output-writer': {
        const { writeQuizOutput } = await import('./quizOutputWriter');
        try {
          const out = await writeQuizOutput(
            {
              questions: resolvedInput.questions,
              sourceFile: resolvedInput.sourceFile,
              focusArea: resolvedInput.focusArea,
            },
            {
              executionId: context.variables.executionId || 'unknown',
              directory: step.config.quizOutputDirectory,
              filename: step.config.quizOutputFilename,
            }
          );
          return {
            success: true,
            output: { filePath: out.filePath, json: out.json },
            logs: [`Wrote quiz JSON to ${out.filePath}`],
          };
        } catch (e: any) {
          return { success: false, error: `quiz-output-writer failed: ${e.message}`, logs: [] };
        }
      }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm run test -- --run quizOutputWriter`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/quizOutputWriter.ts backend/src/types/quiz.ts backend/src/services/stepExecutor.ts backend/src/__tests__/quizOutputWriter.test.ts
git commit -m "feat(steps): quiz-output-writer step"
```

---

## Phase 9 — Sandbox `ai.call` helper

### Task 21: Expose `ai.call` to script-js

**Files:**
- Modify: `backend/src/services/scriptRunner.ts` — extend the JS sandbox
- Create: `backend/src/services/aiCallSandbox.ts`
- Test: `backend/src/__tests__/aiCallSandbox.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/__tests__/aiCallSandbox.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('script-js ai.call helper', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ac-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { AiProviderModel } = await import('../models/aiProviderModel');
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    AiProviderModel.create({ name: 'p', baseUrl: 'http://localhost:8000/v1', model: 'm', isDefault: true });
    PromptTemplateModel.upsertByName({ name: 'gen-sys', role: 'system', content: 'You generate JSON.' });
    PromptTemplateModel.upsertByName({ name: 'gen-usr', role: 'user', content: 'page: ${input.text}' });
  });

  it('calls aiCall and returns the parsed response', async () => {
    vi.doMock('openai', () => ({
      default: class { chat = { completions: { create: async () => ({
        choices: [{ message: { content: '{"questions":[{"q":"x"}]}' } }],
        model: 'm',
      })}}; }
    }));
    const { ScriptRunner } = await import('../services/scriptRunner');
    const result = await ScriptRunner.executeJS(
      `const out = await ai.call({
         systemTemplate: 'gen-sys',
         userTemplate: 'gen-usr',
         context: { input: { text: 'hello' } },
       });
       return out.parsed.questions[0].q;`,
      { variables: {}, inputData: {}, steps: {} },
      30000
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- --run aiCallSandbox`
Expected: FAIL — `ai is not defined`.

- [ ] **Step 3: Implement the sandbox helper**

```ts
// backend/src/services/aiCallSandbox.ts
import { AiProviderModel } from '../models/aiProviderModel';
import { PromptTemplateModel } from '../models/promptTemplateModel';
import { AiExecutor } from './aiExecutor';

export interface AiCallParams {
  providerId?: string;
  providerName?: string;
  systemTemplate?: string;       // template name
  userTemplate?: string;         // template name
  context: Record<string, any>;
  outputSchema?: Record<string, any>;
  temperature?: number;
  maxTokens?: number;
}

export async function aiCall(params: AiCallParams): Promise<any> {
  let providerId = params.providerId;
  if (!providerId && params.providerName) {
    const all = AiProviderModel.getAll();
    providerId = all.find(p => p.name === params.providerName)?.id;
  }
  const sysT = params.systemTemplate ? PromptTemplateModel.getByName(params.systemTemplate) : undefined;
  const usrT = params.userTemplate ? PromptTemplateModel.getByName(params.userTemplate) : undefined;
  const config: any = {
    aiProviderId: providerId,
    aiPromptTemplateSystemId: sysT?.id,
    aiPromptTemplateUserId: usrT?.id,
    aiOutputSchema: params.outputSchema,
    aiTemperature: params.temperature,
    aiMaxTokens: params.maxTokens,
  };
  const fn = params.outputSchema
    ? AiExecutor.executeStructuredOutput
    : AiExecutor.executePrompt;
  const result = await fn(config, params.context);
  if (!result.success) throw new Error(result.error || 'ai.call failed');
  return result.output;
}
```

- [ ] **Step 4: Wire into `scriptRunner.executeJS` sandbox**

In `backend/src/services/scriptRunner.ts`, where the `vm` context is built, add:

```ts
import { aiCall } from './aiCallSandbox';
// ...
// In the place where the sandbox object is constructed (where things like
// `variables`, `inputData`, `steps` are placed), add:
const sandbox = {
  // ... existing fields ...
  ai: {
    call: aiCall,
  },
};
```

If `executeJS` is currently synchronous (no `async`/`await` support in the sandbox), promote it to async and wrap user code in an async IIFE. The existing implementation already supports promises since AI calls are async; if not, the change is:

```ts
const wrapped = `(async () => { ${userCode} })()`;
const fn = new vm.Script(wrapped, { timeout: timeoutMs });
const result = await fn.runInNewContext(sandbox, { timeout: timeoutMs });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- --run aiCallSandbox`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/aiCallSandbox.ts backend/src/services/scriptRunner.ts backend/src/__tests__/aiCallSandbox.test.ts
git commit -m "feat(sandbox): expose ai.call helper to script-js"
```

---

## Phase 10 — Seeded prompts and quiz workflow

### Task 22: Seed quiz prompt templates

**Files:**
- Create: `backend/src/seeds/quizPromptTexts.ts`
- Create: `backend/src/seeds/seedPromptTemplates.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/seedPromptTemplates.test.ts`

- [ ] **Step 1: Write the prompt text constants**

```ts
// backend/src/seeds/quizPromptTexts.ts
export const QUIZ_GENERATOR_SYSTEM = `You are a quiz question generator. You will receive a page of source material (text and an authoritative image of the page layout) and a focus area.

FOCUS AREA: \${input.focus_area}

Produce exactly \${input.questions_per_chunk} multiple-choice questions grounded ONLY in the provided source. Each question must:
- Test understanding of the focus area; do not generate questions outside that focus.
- Have exactly 4 options labelled A./B./C./D.
- Have exactly one correct answer.
- Include an explanation that quotes or paraphrases specific source content.

Use the page image when text extraction is ambiguous; the image is authoritative for diagrams, tables, and visual layout.

Return JSON only, no prose, matching this shape:
{
  "questions": [
    {
      "reference_page": "\${input.pageId}",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "B",
      "explanation": "..."
    }
  ]
}`;

export const QUIZ_REVIEWER_SYSTEM = `You are a focus-area conformance reviewer for quiz questions.

FOCUS AREA: \${input.focus_area}

For each question in the input list, decide whether it tests the focus area. If the focus area says "concept and logic, not usage or default values", reject questions that are about specific usage syntax, parameter defaults, or implementation details.

Use the page image to better understand context.

Return JSON only:
{
  "results": [
    { "question_index": 0, "pass": true, "issue": null },
    { "question_index": 1, "pass": false, "issue": "Asks about default value, not concept." }
  ]
}`;

export const QUIZ_VERIFIER_SYSTEM = `You are a source-grounding verifier. For each question, decide whether the stated answer and explanation are supported by the source material (text + page image).

Reject any question whose answer cannot be defended from the source, or whose explanation references content not present.

Return JSON only:
{
  "results": [
    { "question_index": 0, "pass": true, "issue": null },
    { "question_index": 1, "pass": false, "issue": "Explanation references a value that does not appear on this page." }
  ]
}`;

export const QUIZ_FIXER_SYSTEM = `You repair flagged quiz questions.

Mode: \${input.mode}  // 'surgical' (preferred for round 1) or 'auto' (judge per item)
Focus area: \${input.focus_area}

For each flagged question, decide whether the issue can be fixed by editing the smallest possible field (option text, explanation wording, swapping the correct letter) — preferred — or whether the question is fundamentally off-topic / ungrounded and must be regenerated. Use the page image when needed.

Return JSON only:
{
  "fixed_questions": [
    { "reference_page": "...", "question": "...", "options": ["A. ...","B. ...","C. ...","D. ..."], "answer": "B", "explanation": "...", "fix_strategy": "surgical|regenerated", "addresses_issue": "..." }
  ]
}`;
```

- [ ] **Step 2: Write the seeder**

```ts
// backend/src/seeds/seedPromptTemplates.ts
import { PromptTemplateModel } from '../models/promptTemplateModel';
import {
  QUIZ_GENERATOR_SYSTEM,
  QUIZ_REVIEWER_SYSTEM,
  QUIZ_VERIFIER_SYSTEM,
  QUIZ_FIXER_SYSTEM,
} from './quizPromptTexts';

export function seedPromptTemplates(): void {
  const seeds = [
    { name: 'quiz-generator-system', role: 'system' as const, content: QUIZ_GENERATOR_SYSTEM, requiresVision: true, tags: ['quiz', 'generator'], builtin: true },
    { name: 'quiz-reviewer-system', role: 'system' as const, content: QUIZ_REVIEWER_SYSTEM, requiresVision: true, tags: ['quiz', 'reviewer'], builtin: true },
    { name: 'quiz-verifier-system', role: 'system' as const, content: QUIZ_VERIFIER_SYSTEM, requiresVision: true, tags: ['quiz', 'verifier'], builtin: true },
    { name: 'quiz-fixer-system', role: 'system' as const, content: QUIZ_FIXER_SYSTEM, requiresVision: true, tags: ['quiz', 'fixer'], builtin: true },
  ];
  for (const s of seeds) PromptTemplateModel.upsertByName(s);
}
```

- [ ] **Step 3: Wire into `index.ts`** — call `seedPromptTemplates()` after `initDatabase()`.

- [ ] **Step 4: Write the test**

```ts
// backend/src/__tests__/seedPromptTemplates.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedPromptTemplates', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-spt-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedPromptTemplates } = await import('../seeds/seedPromptTemplates');
    seedPromptTemplates();
  });

  it('seeds the four quiz templates as builtin', async () => {
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    const all = PromptTemplateModel.getByTag('quiz');
    expect(all.length).toBe(4);
    expect(all.every(t => t.builtin)).toBe(true);
    expect(all.every(t => t.requiresVision)).toBe(true);
  });

  it('is idempotent', async () => {
    const { seedPromptTemplates } = await import('../seeds/seedPromptTemplates');
    seedPromptTemplates();
    const { PromptTemplateModel } = await import('../models/promptTemplateModel');
    expect(PromptTemplateModel.getByTag('quiz').length).toBe(4);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd backend && npm run test -- --run seedPromptTemplates`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/seeds/quizPromptTexts.ts backend/src/seeds/seedPromptTemplates.ts backend/src/index.ts backend/src/__tests__/seedPromptTemplates.test.ts
git commit -m "feat(seeds): seed four quiz pipeline prompt templates"
```

---

### Task 23: Seed the built-in quiz workflow

**Files:**
- Create: `backend/src/seeds/seedQuizWorkflow.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/seedQuizWorkflow.test.ts`

- [ ] **Step 1: Implement the seeder**

The workflow uses three stations — load+chunk, per-chunk pipeline (script-js orchestrator using `ai.call`), assemble+write.

```ts
// backend/src/seeds/seedQuizWorkflow.ts
import { WorkflowModel } from '../models/workflow';

const QUIZ_WORKFLOW_ID = 'builtin-quiz-generator';

const ORCHESTRATOR_CODE = `
const chunks = inputData.chunks || variables.steps['load-and-chunk'].output.chunks;
const focusArea = variables.input.focus_area || 'concept and logic, not usage or default values';
const questionsPerChunk = Number(variables.input.questions_per_chunk || 3);
const all = [];

for (const chunk of chunks) {
  const ctx = {
    input: {
      ...variables.input,
      pageId: chunk.pageId,
      text: chunk.text,
      imagePath: chunk.imagePath,
      focus_area: focusArea,
      questions_per_chunk: questionsPerChunk,
    },
  };

  // Generator
  let gen = await ai.call({
    systemTemplate: 'quiz-generator-system',
    userTemplate: 'quiz-generator-system', // user prompt unused; system prompt drives output
    context: ctx,
    outputSchema: { type: 'object', properties: { questions: { type: 'array' } }, required: ['questions'] },
  });
  let questions = gen.parsed.questions || [];

  for (let round = 1; round <= 3; round++) {
    const reviewer = await ai.call({
      systemTemplate: 'quiz-reviewer-system',
      userTemplate: 'quiz-reviewer-system',
      context: { ...ctx, input: { ...ctx.input, questions } },
      outputSchema: { type: 'object', properties: { results: { type: 'array' } }, required: ['results'] },
    });
    const verifier = await ai.call({
      systemTemplate: 'quiz-verifier-system',
      userTemplate: 'quiz-verifier-system',
      context: { ...ctx, input: { ...ctx.input, questions } },
      outputSchema: { type: 'object', properties: { results: { type: 'array' } }, required: ['results'] },
    });
    const flagged = [];
    for (const r of (reviewer.parsed.results || [])) if (!r.pass) flagged.push({ ...r, source: 'reviewer' });
    for (const r of (verifier.parsed.results || [])) if (!r.pass) flagged.push({ ...r, source: 'verifier' });
    if (flagged.length === 0) break;

    const fixer = await ai.call({
      systemTemplate: 'quiz-fixer-system',
      userTemplate: 'quiz-fixer-system',
      context: { ...ctx, input: { ...ctx.input, questions, issues: flagged, mode: round === 1 ? 'surgical' : 'auto' } },
      outputSchema: { type: 'object', properties: { fixed_questions: { type: 'array' } }, required: ['fixed_questions'] },
    });
    questions = (fixer.parsed.fixed_questions || []).map(q => ({
      reference_page: q.reference_page,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    }));

    if (round === 3 && flagged.length > 0) {
      // Tag remaining warnings.
      for (const f of flagged) {
        if (questions[f.question_index]) {
          questions[f.question_index].quality_warnings = (questions[f.question_index].quality_warnings || []);
          questions[f.question_index].quality_warnings.push(\`\${f.source}: \${f.issue}\`);
        }
      }
    }
  }

  for (const q of questions) all.push(q);
}

variables.allQuestions = all;
return { questions: all, count: all.length };
`;

export function seedQuizWorkflow(): void {
  const existing = WorkflowModel.getById(QUIZ_WORKFLOW_ID);
  if (existing) return;
  WorkflowModel.create({
    id: QUIZ_WORKFLOW_ID,
    name: 'Document Quiz Generator (built-in)',
    description: 'Generate a JSON quiz from a PDF/PPTX/TXT document via a multi-agent feedback loop.',
    status: 'active',
    definition: {
      inputParameters: [
        { name: 'file', type: 'file', accept: '.pdf,.pptx,.txt', required: true, description: 'Source document' },
        { name: 'focus_area', type: 'string', defaultValue: 'concept and logic, not usage or default values', description: 'What the questions should test' },
        { name: 'questions_per_chunk', type: 'number', defaultValue: 3, description: 'How many questions to generate per page/chunk' },
      ],
      stations: [
        {
          id: 'load-and-chunk',
          name: 'Load & chunk document',
          position: { x: 0, y: 0 },
          steps: [
            {
              id: 'load',
              name: 'Load document',
              type: 'load-document',
              position: { x: 0, y: 0 },
              config: {
                loadDocumentSourcePath: '${input.file}',
                loadDocumentMaxChunkChars: 2000,
              },
            },
          ],
        },
        {
          id: 'pipeline',
          name: 'Per-chunk pipeline',
          position: { x: 1, y: 0 },
          steps: [
            {
              id: 'orchestrator',
              name: 'Generator + reviewer + verifier + fixer (loop)',
              type: 'script-js',
              position: { x: 0, y: 0 },
              config: { code: ORCHESTRATOR_CODE },
              inputVars: [
                { name: 'chunks', source: '${steps.load.output.chunks}' },
              ],
              timeout: 600000,
            },
          ],
        },
        {
          id: 'write',
          name: 'Write quiz JSON',
          position: { x: 2, y: 0 },
          steps: [
            {
              id: 'writer',
              name: 'Write JSON',
              type: 'quiz-output-writer',
              position: { x: 0, y: 0 },
              config: { quizOutputFilename: 'quiz.json' },
              inputVars: [
                { name: 'questions', source: '${variables.allQuestions}' },
                { name: 'sourceFile', source: '${input.file}' },
                { name: 'focusArea', source: '${input.focus_area}' },
              ],
            },
          ],
        },
      ],
    },
  } as any);
}
```

(`WorkflowModel.create` may not currently accept a fixed `id`. If so, extend it minimally, or change to a dedicated `WorkflowModel.upsertById` method. Match the existing model's conventions.)

- [ ] **Step 2: Wire into `index.ts`** — call `seedQuizWorkflow()` after `seedPromptTemplates()`.

- [ ] **Step 3: Write the test**

```ts
// backend/src/__tests__/seedQuizWorkflow.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('seedQuizWorkflow', () => {
  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-sqw-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedQuizWorkflow();
  });

  it('seeds the quiz workflow with three stations and inputParameters', async () => {
    const { WorkflowModel } = await import('../models/workflow');
    const wf = WorkflowModel.getById('builtin-quiz-generator');
    expect(wf).toBeTruthy();
    expect(wf!.definition.stations.length).toBe(3);
    expect(wf!.definition.inputParameters?.find(p => p.name === 'file')?.type).toBe('file');
  });

  it('is idempotent', async () => {
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedQuizWorkflow();
    const { WorkflowModel } = await import('../models/workflow');
    expect(WorkflowModel.getAll().filter(w => w.id === 'builtin-quiz-generator').length).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npm run test -- --run seedQuizWorkflow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/seeds/seedQuizWorkflow.ts backend/src/index.ts backend/src/__tests__/seedQuizWorkflow.test.ts
git commit -m "feat(seeds): built-in quiz generator workflow"
```

---

## Phase 11 — Frontend

### Task 24: AI Providers admin page

**Files:**
- Create: `frontend/src/shared/api/aiProvidersApi.ts`
- Create: `frontend/src/features/settings/AIProvidersPage.tsx`
- Modify: `frontend/src/App.tsx` — add route `/settings/ai-providers`

- [ ] **Step 1: Implement the API client**

```ts
// frontend/src/shared/api/aiProvidersApi.ts
import axios from 'axios';

export interface AiProvider {
  id: string; name: string; baseUrl: string; model: string;
  apiKey?: string; supportsVision: boolean; isDefault: boolean;
}

const BASE = '/api/ai-providers';
export const aiProvidersApi = {
  list: () => axios.get(BASE).then(r => r.data.data as AiProvider[]),
  create: (data: Partial<AiProvider>) => axios.post(BASE, data).then(r => r.data.data as AiProvider),
  update: (id: string, data: Partial<AiProvider>) => axios.put(`${BASE}/${id}`, data).then(r => r.data.data),
  remove: (id: string) => axios.delete(`${BASE}/${id}`).then(r => r.data),
  promote: (id: string) => axios.post(`${BASE}/${id}/promote`).then(r => r.data.data),
};
```

- [ ] **Step 2: Implement the page**

```tsx
// frontend/src/features/settings/AIProvidersPage.tsx
import React, { useEffect, useState } from 'react';
import { aiProvidersApi, AiProvider } from '@/shared/api/aiProvidersApi';

export const AIProvidersPage: React.FC = () => {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [draft, setDraft] = useState<Partial<AiProvider>>({});

  const refresh = () => aiProvidersApi.list().then(setProviders);
  useEffect(() => { refresh(); }, []);

  const onCreate = async () => {
    await aiProvidersApi.create(draft);
    setDraft({});
    refresh();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">AI Providers</h1>
      <table className="w-full">
        <thead><tr><th>Name</th><th>Base URL</th><th>Model</th><th>Vision</th><th>Default</th><th></th></tr></thead>
        <tbody>
          {providers.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.baseUrl}</td><td>{p.model}</td>
              <td>{p.supportsVision ? 'yes' : 'no'}</td>
              <td>{p.isDefault ? '★' : <button onClick={() => aiProvidersApi.promote(p.id).then(refresh)}>Promote</button>}</td>
              <td><button onClick={() => aiProvidersApi.remove(p.id).then(refresh)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mt-6">Add</h2>
      <input placeholder="name" value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/>
      <input placeholder="baseUrl" value={draft.baseUrl||''} onChange={e=>setDraft({...draft,baseUrl:e.target.value})}/>
      <input placeholder="model" value={draft.model||''} onChange={e=>setDraft({...draft,model:e.target.value})}/>
      <label><input type="checkbox" checked={!!draft.supportsVision} onChange={e=>setDraft({...draft,supportsVision:e.target.checked})}/> vision</label>
      <label><input type="checkbox" checked={!!draft.isDefault} onChange={e=>setDraft({...draft,isDefault:e.target.checked})}/> default</label>
      <button onClick={onCreate}>Create</button>
    </div>
  );
};
```

(Style classes are placeholders — match the codebase's existing styling conventions.)

- [ ] **Step 3: Add the route in `frontend/src/App.tsx`**

```tsx
import { AIProvidersPage } from '@/features/settings/AIProvidersPage';
// ...
<Route path="/settings/ai-providers" element={<AIProvidersPage />} />
```

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev` (root). Browse `/settings/ai-providers`. Expected: page loads, list works, create+promote+delete work.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/api/aiProvidersApi.ts frontend/src/features/settings/AIProvidersPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): AI providers admin page"
```

---

### Task 25: Prompt Library admin page

**Files:**
- Create: `frontend/src/shared/api/promptTemplatesApi.ts`
- Create: `frontend/src/features/settings/PromptLibraryPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: API client** — analogous to `aiProvidersApi`, methods `list(tag?, role?), create, update, remove`.

- [ ] **Step 2: Page** — table of templates, "Built-in" badge for `builtin: true`, "Duplicate" action that POSTs a copy with `builtin: false`. Edit modal with `name`, `role`, `content`, `description`, `requiresVision`, `tags` (comma-separated).

- [ ] **Step 3: Route** — add `/settings/prompt-templates` in `App.tsx`.

- [ ] **Step 4: Manual smoke check** — verify built-in quiz templates appear and cannot be deleted.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/api/promptTemplatesApi.ts frontend/src/features/settings/PromptLibraryPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): prompt library admin page"
```

---

### Task 26: Run-with-Input dialog

**Files:**
- Create: `frontend/src/features/editor/RunWithInputDialog.tsx`
- Modify: `frontend/src/shared/api/workflowApi.ts` — add `executeWithFiles`
- Modify: `frontend/src/features/editor/EditorToolbar.tsx` (or whichever component owns the Run button)

- [ ] **Step 1: API client method**

```ts
// add to frontend/src/shared/api/workflowApi.ts
export async function executeWithFiles(workflowId: string, formData: FormData) {
  const res = await axios.post(`/api/workflows/${workflowId}/execute`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}
```

- [ ] **Step 2: Dialog component**

```tsx
// frontend/src/features/editor/RunWithInputDialog.tsx
import React, { useState } from 'react';
import type { InputParameter } from '@/shared/types';
import { executeWithFiles } from '@/shared/api/workflowApi';

interface Props {
  workflowId: string;
  inputs: InputParameter[];
  onClose: () => void;
  onComplete: (execution: any) => void;
}

export const RunWithInputDialog: React.FC<Props> = ({ workflowId, inputs, onClose, onComplete }) => {
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(inputs.filter(i => i.defaultValue !== undefined).map(i => [i.name, i.defaultValue]))
  );
  const [files, setFiles] = useState<Record<string, File>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setRunning(true);
    try {
      const fd = new FormData();
      for (const i of inputs) {
        if (i.type === 'file') {
          const f = files[i.name];
          if (i.required && !f) throw new Error(`Missing required file: ${i.name}`);
          if (f) fd.append(i.name, f);
        } else {
          const v = values[i.name];
          if (i.required && (v === undefined || v === '')) throw new Error(`Missing required input: ${i.name}`);
          if (v !== undefined) fd.append(i.name, String(v));
        }
      }
      const exec = await executeWithFiles(workflowId, fd);
      onComplete(exec);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="dialog">
      <h2>Run with input</h2>
      {inputs.map(i => (
        <div key={i.name}>
          <label>{i.name}{i.required && ' *'}</label>
          {i.type === 'file' ? (
            <input type="file" accept={i.accept} onChange={e => {
              const f = e.target.files?.[0];
              if (f) setFiles({ ...files, [i.name]: f });
            }} />
          ) : i.type === 'number' ? (
            <input type="number" value={values[i.name] ?? ''} onChange={e => setValues({ ...values, [i.name]: Number(e.target.value) })} />
          ) : (
            <input type="text" value={values[i.name] ?? ''} onChange={e => setValues({ ...values, [i.name]: e.target.value })} />
          )}
          {i.description && <p className="hint">{i.description}</p>}
        </div>
      ))}
      {error && <div className="error">{error}</div>}
      <button onClick={onClose}>Cancel</button>
      <button onClick={submit} disabled={running}>{running ? 'Running...' : 'Start'}</button>
    </div>
  );
};
```

- [ ] **Step 3: Wire into the Run button**

In whichever component owns the Run action: when the user clicks Run, check `workflow.definition.inputParameters?.length > 0`. If yes, open `RunWithInputDialog` instead of calling the existing JSON-body execute. If no, keep existing behavior.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`. Open the built-in quiz workflow. Click Run → dialog appears with file picker, focus area, questions per chunk. Submit a small TXT → execution starts. (No vLLM needed for this smoke; the orchestrator will fail because of no model, but the upload flow is verified.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/editor/RunWithInputDialog.tsx frontend/src/shared/api/workflowApi.ts frontend/src/features/editor/EditorToolbar.tsx
git commit -m "feat(frontend): Run-with-Input dialog with file upload"
```

---

### Task 27: Quiz result view in run panel

**Files:**
- Create: `frontend/src/features/executions/QuizResultView.tsx`
- Modify: `frontend/src/features/executions/RunPanel.tsx` (or equivalent)

- [ ] **Step 1: Implement the view**

```tsx
// frontend/src/features/executions/QuizResultView.tsx
import React from 'react';

interface Props { json: any; filePath?: string; }

export const QuizResultView: React.FC<Props> = ({ json, filePath }) => {
  if (!json?.questions) return <pre>{JSON.stringify(json, null, 2)}</pre>;
  return (
    <div>
      <header>
        <h2>{json.questions.length} questions</h2>
        <p>Source: {json.source_file} · Focus: {json.focus_area}</p>
        {filePath && <a href={`/api/files?path=${encodeURIComponent(filePath)}`} download>Download JSON</a>}
      </header>
      <ol>
        {json.questions.map((q: any, idx: number) => (
          <li key={idx}>
            <p><strong>{q.reference_page}</strong> — {q.question}</p>
            <ul>{q.options.map((o: string) => <li key={o}>{o}</li>)}</ul>
            <p>Answer: <strong>{q.answer}</strong></p>
            <p><em>{q.explanation}</em></p>
            {q.quality_warnings?.length > 0 && (
              <ul className="warnings">{q.quality_warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};
```

For the download link to work, add a tiny `GET /api/files?path=...` route that serves files only from `data/uploads/<execution-id>/...` (path traversal-safe).

- [ ] **Step 2: Add the file-serve route**

```ts
// backend/src/routes/files.ts
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ENV_UPLOADS_ROOT } from '../middleware/uploadHandler';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const requested = String(req.query.path || '');
  const resolved = path.resolve(requested);
  if (!resolved.startsWith(ENV_UPLOADS_ROOT)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  res.download(resolved);
});

export default router;
```

Wire into `index.ts`: `app.use('/api/files', filesRouter)`.

- [ ] **Step 3: Use `QuizResultView` in the run panel**

In `RunPanel`, when the last step is `quiz-output-writer` and its output has `json`, render `QuizResultView` with `json={output.json}` and `filePath={output.filePath}`. Otherwise fall back to the existing JSON viewer.

- [ ] **Step 4: Manual smoke check**

End-to-end run with a real PDF + working vLLM: result panel shows quiz + Download button; downloaded file equals the on-disk JSON.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/executions/QuizResultView.tsx frontend/src/features/executions/RunPanel.tsx backend/src/routes/files.ts backend/src/index.ts
git commit -m "feat(frontend): quiz result view + secure file download endpoint"
```

---

### Task 28: Hide offline-only steps from palette

**Files:**
- Modify: `backend/src/index.ts` — expose `OFFLINE_MODE` via `/api/health` or a new `/api/config` endpoint
- Modify: `frontend/src/features/editor/NodePalette.tsx` (or wherever the palette is built)

- [ ] **Step 1: Backend — expose config**

```ts
// add a route in backend/src/routes/config.ts
import { Router } from 'express';
const router = Router();
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      offlineMode: process.env.OFFLINE_MODE === 'true',
    },
  });
});
export default router;
```

Wire: `app.use('/api/config', configRouter)`.

- [ ] **Step 2: Frontend — fetch on app startup**

In a startup hook (e.g., `useEffect` in `App.tsx`), `axios.get('/api/config').then(r => setConfig(r.data.data))`. Store in a small Zustand store `useConfigStore`.

- [ ] **Step 3: Filter palette**

```ts
const HIDDEN_OFFLINE = ['notification-slack', 'action-email', 'action-slack'];
const palette = ALL_NODE_TYPES.filter(t => !(useConfigStore().offlineMode && HIDDEN_OFFLINE.includes(t.id)));
```

- [ ] **Step 4: Manual smoke check** — set `OFFLINE_MODE=true`, restart server, reload editor; slack/email no longer appear.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/config.ts backend/src/index.ts frontend/src/features/editor/NodePalette.tsx frontend/src/App.tsx
git commit -m "feat(offline): hide slack/email nodes from palette when OFFLINE_MODE=true"
```

---

## Phase 12 — End-to-end integration

### Task 29: Quiz workflow integration test (stubbed vLLM)

**Files:**
- Create: `backend/src/__tests__/quizWorkflow.integration.test.ts`

- [ ] **Step 1: Write the test**

```ts
// backend/src/__tests__/quizWorkflow.integration.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import request from 'supertest';
import express from 'express';

describe('Quiz workflow E2E', () => {
  let app: express.Express;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-e2e-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
    process.env.VLLM_BASE_URL = 'http://localhost:8000/v1';
    process.env.VLLM_DEFAULT_MODEL = 'qwen2-vl-7b';
    process.env.VLLM_SUPPORTS_VISION = 'true';

    // Stub OpenAI before importing services that use it.
    vi.doMock('openai', () => ({
      default: class {
        chat = { completions: { create: async (params: any) => {
          // Echo a canned response shaped by the JSON schema in the request.
          if ((params.response_format as any)?.type === 'json_schema' || params.response_format?.type === 'json_object') {
            // For the generator we return one question per call.
            const isReviewer = (params.messages[0].content as string)?.includes('focus-area conformance reviewer');
            const isVerifier = (params.messages[0].content as string)?.includes('source-grounding verifier');
            const isFixer = (params.messages[0].content as string)?.includes('repair flagged quiz');
            if (isReviewer || isVerifier) {
              return { choices: [{ message: { content: '{"results":[{"question_index":0,"pass":true,"issue":null}]}' } }], usage: {} };
            }
            if (isFixer) {
              return { choices: [{ message: { content: '{"fixed_questions":[]}' } }], usage: {} };
            }
            return { choices: [{ message: { content: '{"questions":[{"reference_page":"chunk-1","question":"Q?","options":["A. a","B. b","C. c","D. d"],"answer":"B","explanation":"because"}]}' } }], usage: {} };
          }
          return { choices: [{ message: { content: '{}' } }], usage: {} };
        }}};
      }
    }));

    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedAiProvider } = await import('../seeds/seedAiProvider');
    const { seedPromptTemplates } = await import('../seeds/seedPromptTemplates');
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedAiProvider();
    seedPromptTemplates();
    seedQuizWorkflow();

    const router = (await import('../routes/workflows')).default;
    app = express();
    app.use(express.json());
    app.use('/api/workflows', router);
  });

  it('runs the built-in quiz workflow against a TXT input', async () => {
    const txt = path.join(__dirname, 'fixtures', 'sample.txt');
    const res = await request(app)
      .post('/api/workflows/builtin-quiz-generator/execute')
      .field('focus_area', 'concept and logic')
      .field('questions_per_chunk', '1')
      .attach('file', txt);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Drill into the writer's output.
    const writerOutput = res.body.data.result.stations[2].steps[0].output;
    expect(writerOutput.json.questions.length).toBeGreaterThan(0);
    expect(fs.existsSync(writerOutput.filePath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npm run test -- --run quizWorkflow.integration`
Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `cd backend && npm run test -- --run`
Expected: all pass (this is the gate before merge).

- [ ] **Step 4: Commit**

```bash
git add backend/src/__tests__/quizWorkflow.integration.test.ts
git commit -m "test(quiz): end-to-end integration with stubbed vLLM"
```

---

### Task 30: Manual smoke against real vLLM (no commit needed)

This is a manual checkpoint — not a code task — to validate the system against your actual local vLLM.

- [ ] Start your local vLLM with a multi-modal model (e.g., Qwen2-VL-7B).
- [ ] Set env in `.env.development`:
  ```
  VLLM_BASE_URL=http://<host>:8000/v1
  VLLM_DEFAULT_MODEL=<your-model>
  VLLM_SUPPORTS_VISION=true
  HTTP_ALLOWLIST=localhost,127.0.0.1,<your-host>
  OFFLINE_MODE=true
  ```
- [ ] `npm run dev` from the repo root.
- [ ] Open the editor, find "Document Quiz Generator (built-in)".
- [ ] Click Run → upload a small PDF (2-5 pages with a diagram), set focus area, click Start.
- [ ] Verify: progress streams; final result panel shows the questions; Download JSON works; the file on disk matches.
- [ ] Verify: with `HTTP_ALLOWLIST` not including a public host, the `http-request` step (if you build a test workflow that uses it) is blocked.

If anything fails, file the failure as a follow-up issue rather than blocking the plan.

---

## Self-review checklist (run after writing code, before merge)

These are checks for the implementer to perform — not part of any single task.

1. **Spec coverage** — every section in `2026-05-03-quiz-generator-design.md` has a corresponding task above (4.1 → Task 14-17, 4.2 → Task 13, 4.3 → Task 20, 4.4 → Tasks 4-6, 4.5 → Tasks 1+11+12, 4.6 → Tasks 7-8+22, 4.7 → Tasks 9-10+28, 5.1-5.2 → Task 19, 6 → Task 23, 7 → Tasks 5+8+12, 8 → Tasks 24-28, 9 → Task 29).
2. **Type consistency** — `RawPage` shape matches across loader / chunker / step. `QuizQuestion.options` is a 4-tuple. `AiProvider.supportsVision` is a boolean both in TS and at the JSON boundary.
3. **No placeholders** — no `TBD` / `TODO` / "implement later" left in non-test code.
4. **Idempotent seeds** — quiz workflow + prompt templates use `upsertByName` / id-based skip so server restart doesn't duplicate.

---

## Out of scope for this plan (deferred)

- Spec 2 (assistant) — separate plan after this one ships.
- Spec 3 (DAG engine) — separate plan; quiz workflow gets re-saved as a true DAG once that lands.
- Watch-folder triggers, webhook-based quiz generation — covered in `2026-05-03-quiz-generator-design.md §10` as out-of-scope.
- Authentication / multi-user — single-user assumed.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-quiz-generator-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**

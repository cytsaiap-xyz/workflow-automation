# CLAUDE.md - AI Assistant Guide for Workflow Automation

This file provides essential context for AI assistants working on this codebase. Read this before making changes.

## Project Overview

A full-stack **visual workflow automation** platform. Users design, schedule, and monitor automated workflows through a drag-and-drop editor. Workflows consist of **stations** (sequential stages) containing **steps** (individual actions).

**Architecture:** React SPA (frontend) + Node.js/Express API (backend) + SQLite database, all served from a single Docker container in production.

---

## Repository Structure

```
workflow-automation/
├── backend/            # Node.js/Express API server
│   └── src/
│       ├── __tests__/  # Vitest test suite
│       ├── db/         # SQLite initialization (sql.js with sync adapter)
│       ├── models/     # Database access layer
│       ├── routes/     # Express route handlers
│       ├── services/   # Business logic
│       ├── types/      # TypeScript interfaces
│       └── utils/      # Logger (Pino)
├── frontend/           # React/Vite SPA
│   └── src/
│       ├── features/   # Feature modules (dashboard, editor, monitoring)
│       └── shared/     # Reusable components, API client, stores
├── scripts/            # Seed/demo/test utility scripts
├── Dockerfile          # Multi-stage build (UBI 8 base)
├── docker-compose.yml
└── *.sh / *.ps1 / *.csh  # Dev/prod startup scripts
```

---

## Development Workflow

### Initial Setup
```bash
./setup.sh          # Install all dependencies and initialize database
```

### Running Locally
```bash
npm run dev         # Run backend (port 3002) + frontend (port 5173) concurrently

# Or separately:
cd backend && npm run dev    # ts-node-dev with auto-reload
cd frontend && npm run dev   # Vite dev server
```

### Building
```bash
npm run build                # Build both services
cd backend && npm run build  # Compile TypeScript → dist/
cd frontend && npm run build # Vite production bundle → dist/
```

### Testing
```bash
# Backend
cd backend && npm run test           # Vitest (watch)
cd backend && npm run test -- --run  # Single run

# Frontend
cd frontend && npm run test          # Vitest watch
cd frontend && npm run test:run      # Single run
cd frontend && npm run test:coverage # Coverage report
```

---

## Key Conventions

### TypeScript
- **Strict mode is enabled** in both packages — no `any` types without justification
- Backend uses CommonJS modules; frontend uses ESNext
- Frontend path alias: `@/*` maps to `src/*`
- Compiler flags: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` (frontend)

### Naming
| Context | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `execution-engine.ts` |
| React components | PascalCase | `StepCanvas.tsx` |
| Interfaces/Types | PascalCase | `WorkflowDefinition` |
| Variables/functions | camelCase | `executionEngine` |
| DB columns | snake_case | `workflow_id` |

### Code Structure (Backend)
- **Routes** (`routes/`) — Only HTTP handling; delegate logic to services
- **Services** (`services/`) — Business logic; no direct HTTP context
- **Models** (`models/`) — Database access only; return domain types
- Keep route files thin; put computation in services

### State Management (Frontend)
- **Zustand** stores in `stores/` directories
- Editor state lives in `workflowStore.ts`
- Toast notifications via `toastStore.ts`
- API calls go through `shared/api/workflowApi.ts` (Axios client)

---

## Data Model

### Core Hierarchy
```
Workflow
  └── WorkflowDefinition
        └── Station[]          (sequential execution stages)
              └── Step[]       (individual actions within a station)
```

### Workflow Statuses
- `draft` — Not yet activated; cannot be triggered externally
- `active` — Can be executed (manual, webhook, schedule)
- `paused` — Temporarily halted; schedules won't fire

### Step Types
| Type | Purpose |
|------|---------|
| `trigger-manual` | Manual execution entry point |
| `trigger-cron` | Scheduled (cron expression) entry point |
| `trigger-webhook` | HTTP webhook entry point |
| `script-js` | Execute JavaScript in a sandboxed VM |
| `script-python` | Execute Python via subprocess |
| `http-request` | Make outbound HTTP API calls |
| `if-else` | Conditional branching |
| `set-variable` | Assign workflow variables |
| `wait` | Delay execution |
| `notification-slack` | Send Slack message |
| `action-email` | Send email via SMTP (nodemailer) |
| `action-slack` | Slack action |
| `connector-db` | Run SQL query on PostgreSQL or MySQL |

### Variable Reference Syntax
Steps reference outputs using `${}` interpolation:
```
${step1.output.fieldName}           # Output from a specific step
${station1.output.stepResults}      # Aggregated station output
${env.MY_ENV_VAR}                   # Environment variable
```

---

## Database (SQLite via sql.js)

### Schema Overview
```sql
-- workflows: stores workflow definitions as JSON
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','active','paused')),
  definition TEXT NOT NULL,  -- JSON serialized WorkflowDefinition
  created_at TEXT,
  updated_at TEXT
);

-- executions: execution run records
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_name TEXT NOT NULL,
  status TEXT CHECK(status IN ('running','completed','failed','cancelled')),
  triggered_by TEXT CHECK(triggered_by IN ('manual','schedule','webhook','api')),
  start_time TEXT, end_time TEXT,
  success_rate REAL DEFAULT 0,
  result TEXT  -- JSON serialized ExecutionResult
);

-- execution_logs: per-step log entries
CREATE TABLE execution_logs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  station_id TEXT, step_id TEXT,
  level TEXT CHECK(level IN ('debug','info','warn','error')),
  message TEXT NOT NULL,
  data TEXT,
  timestamp TEXT
);
```

**Key facts:**
- Uses sql.js with a synchronous adapter (SqlJsAdapter in `backend/src/db/database.ts`) that persists to disk after writes
- Schema is created on first run (no migrations); all tables use `CREATE TABLE IF NOT EXISTS`
- Foreign key enforcement is enabled at startup
- `definition` and `result` fields are JSON-stringified before storage
- Always use parameterized queries (prepared statements) — no string concatenation in SQL

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET/POST | `/api/workflows` | List / Create workflows |
| GET/PUT/DELETE | `/api/workflows/:id` | Read / Update / Delete |
| POST | `/api/workflows/:id/execute` | Trigger manual execution |
| POST | `/api/workflows/:id/simulate` | Simulate without side effects |
| GET | `/api/workflows/:id/executions` | Execution history |
| GET/DELETE | `/api/executions/:id` | Get / Delete execution |
| GET | `/api/executions/:id/logs` | Fetch execution logs |
| GET | `/api/executions` | Recent executions (limit 50) |
| GET | `/api/schedules` | List scheduled workflows |
| PUT | `/api/schedules/:id/pause` | Pause schedule |
| PUT | `/api/schedules/:id/resume` | Resume schedule |
| ANY | `/api/webhooks/:id` | Dynamic webhook handler (returns 202) |
| GET | `/api/metrics` | Dashboard metrics |

---

## Environment Variables

### Backend
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3002` | HTTP server port |
| `DB_PATH` | `./data/workflow.db` | SQLite file path |
| `PYTHON_CMD` | `python` | Python executable name |
| `NODE_ENV` | — | `development` or `production` |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | — | Email configuration |

### Frontend
| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:3002` | Backend API base URL |

### Environment Files
- `.env.development` — Loaded by `start-dev.sh`
- `.env.production` — Loaded by `start-prod.sh`
- `backend/.env.example` / `frontend/.env.example` — Templates

---

## Security Notes

### JavaScript Script Execution
- Runs inside Node.js `vm` module sandbox
- `setTimeout`, `setInterval`, `fetch`, `require` are **not** available to user scripts
- Hard 30-second timeout enforced

### Python Script Execution
- Runs as a child subprocess (isolated)
- Input passed via stdin as JSON; output parsed from stdout
- Hard timeout enforced

### Database Queries
- **Always use parameterized queries.** Models use `sql.js` prepared statements via the sync adapter.
- Do not construct SQL from user input strings.

### CORS
- Currently allows all origins (`cors()` with defaults). For production deployments, restrict this to known origins.

---

## Docker / Production

### Build
```bash
docker build -t workflow-automation .
docker-compose up -d
```

### Container Details
- **Base image:** `registry.access.redhat.com/ubi8/nodejs-18` (Red Hat UBI 8)
- **Builder stage:** Installs GCC 12 toolset for native dependencies
- **Runtime stage:** Non-root user (UID 1001), Python 3 available for script steps
- **Data volume:** `/var/data` — mount this for persistent SQLite storage
- **Health check:** `GET /api/health` every 30s

### Python in Docker
- The `PYTHON_CMD` env var must be set to `python3` in the Docker environment (set in `docker-compose.yml`).

---

## Testing Approach

### Backend Tests (`backend/src/__tests__/`)
- `executionEngine.test.ts` — Core workflow execution logic
- `scriptRunner.test.ts` — JS/Python script execution
- `dbConnector.test.ts` — External database connector
- `webhooks.test.ts` — Webhook route handling
- `features.test.ts` — Integration-style feature tests

Tests use `vitest` + `supertest` for HTTP testing. Mocking follows Vitest conventions (`vi.mock`, `vi.fn`).

### Frontend Tests
- Co-located with source files or in `src/test/`
- Uses `@testing-library/react` + `vitest` in `jsdom` environment
- Setup file at `frontend/src/test/setup.ts`

---

## Common Patterns & Pitfalls

1. **Workflow definitions are stored as JSON strings.** When reading from the DB, call `JSON.parse(row.definition)`. The models handle this, but be aware when writing raw queries.

2. **Executions are fire-and-forget for webhooks.** The webhook route returns 202 immediately; execution happens asynchronously. Don't await execution in the webhook handler.

3. **Station ordering matters.** Stations execute sequentially in array order. A failed station (unless skipped via condition) stops the entire workflow.

4. **React Flow positions are in the `position` field.** Both `Station` and `Step` objects carry `{ x, y }` layout coordinates for the canvas — don't strip these when serializing.

5. **The scheduler initializes on server start.** `scheduler.ts` loads all `active` workflows with cron triggers at startup. After creating/updating a scheduled workflow, call the scheduler's reload method to pick up changes.

6. **SMTP is optional.** Email steps will fail gracefully (logged error) if SMTP env vars are not configured. Don't make email a hard dependency.

7. **The `sql.js` adapter provides a synchronous API.** All DB operations are blocking (no promises), with the adapter persisting to disk after writes. This is by design — don't add `async/await` wrappers to model methods.

---

## Utility Scripts

Located in `scripts/`:

| Script | Purpose |
|--------|---------|
| `seed_demo.js` | Seed database with demo workflows |
| `seed_complex.js` | Seed with complex multi-station examples |
| `execute_demo.js` | Trigger demo workflow executions |
| `create_scheduled_workflow.js` | Create a cron-scheduled workflow |
| `verify_scheduled_execution.js` | Verify cron scheduling works |
| `test_python_fix.js` | Validate Python execution |
| `test-production.sh` | End-to-end production smoke test |

Run scripts with: `node scripts/<script-name>.js` from the repo root (after the backend is running).

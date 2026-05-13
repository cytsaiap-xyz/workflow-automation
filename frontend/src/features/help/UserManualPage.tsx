import { BookOpen } from 'lucide-react';

interface NodeRow {
  type: string;
  what: string;
  config?: string;
  runs: string;
}

const SECTIONS: { id: string; title: string; intro?: string; rows: NodeRow[] }[] = [
  {
    id: 'triggers',
    title: 'Triggers — workflow entry points',
    intro: "These don't process inputs themselves; they're the start of a workflow.",
    rows: [
      {
        type: 'trigger-manual',
        what: 'User clicks Run in the editor or POSTs /api/workflows/:id/execute.',
        runs: 'No-op; emits { triggered: true, timestamp } so downstream nodes have a non-empty input.',
      },
      {
        type: 'trigger-cron',
        what: 'Schedule expression fires the workflow on a recurring basis.',
        config: 'cronExpression: e.g. "0 9 * * *"',
        runs: 'At server startup, scheduler.ts reads every active workflow with a cron trigger and registers it with node-cron. When the cron fires, the scheduler calls ExecutionEngine.execute(workflow, "schedule", {}).',
      },
      {
        type: 'trigger-webhook',
        what: 'Workflow runs when its /api/webhooks/:id URL receives an HTTP request.',
        config: 'webhookMethod: GET | POST | PUT | DELETE | any',
        runs: 'The webhooks route returns 202 immediately and queues execution asynchronously. The caller does not wait for the workflow to finish; the response payload becomes inputData.',
      },
    ],
  },
  {
    id: 'logic',
    title: 'Logic & control flow',
    rows: [
      {
        type: 'if-else',
        what: 'Evaluates an expression and routes to true/false branch.',
        config: 'condition: e.g. ${input.x > 5}',
        runs: 'ScriptRunner.evaluateCondition interpolates ${...} against the workflow context, then evaluates the resulting expression in a sandboxed vm context. Output: { result, branch: "true" | "false" }. In v2 DAGs, downstream edges use the sourcePort to pick which branch fires.',
      },
      {
        type: 'set-variable',
        what: 'Assigns a value to a workflow-scope variable.',
        config: 'variableName, variableValue (interpolated)',
        runs: 'Sets context.variables[name]. Subsequent steps can read it via ${name}.',
      },
      {
        type: 'wait',
        what: 'Pauses execution for a configurable duration.',
        config: 'duration: number, unit: seconds | minutes | hours',
        runs: 'await new Promise(r => setTimeout(r, ms)). In simulate mode the sleep is skipped.',
      },
    ],
  },
  {
    id: 'scripts',
    title: 'Scripts — your own code',
    rows: [
      {
        type: 'script-js',
        what: 'Run a JavaScript snippet you write.',
        config: 'code: string',
        runs: 'Wraps your code in an async function and runs it inside a Node vm sandbox. The sandbox exposes variables, inputData, steps (outputs of previous steps), Promise, and ai.call(params) for inline AI provider calls. fetch, require, setTimeout, setInterval are NOT available. Hard 30s timeout. Your return value becomes the step output.',
      },
      {
        type: 'script-python',
        what: 'Run a Python snippet you write.',
        config: 'code: string',
        runs: 'Forks a Python subprocess via the PYTHON_CMD env var (default "python" / "python3"). The workflow context is piped to stdin as JSON; stdout is parsed back as JSON. Isolated process, no platform globals leak. Hard timeout enforced.',
      },
    ],
  },
  {
    id: 'http',
    title: 'HTTP & data sources',
    rows: [
      {
        type: 'http-request',
        what: 'Outbound HTTP/HTTPS request.',
        config: 'url, method, headers, body (all ${...} interpolated)',
        runs: 'URL hostname is checked against HTTP_ALLOWLIST env BEFORE the network call — even a misconfigured workflow cannot accidentally hit the internet. Returns { status, statusText, data }. In simulate mode, non-GET methods are skipped.',
      },
      {
        type: 'connector-db',
        what: 'Run a SQL query on PostgreSQL or MySQL.',
        config: 'dbType, dbHost, dbPort, dbName, dbUser, dbPassword, dbQuery',
        runs: 'pg or mysql2 opens a connection, executes the parameterized query, returns { rows, count }. Connection closes after each call (no pooling).',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI nodes — call an LLM',
    intro:
      'All AI nodes resolve their provider in this order: (1) config.aiProviderId → look up the AI Provider entity, (2) inline aiBaseUrl/aiModel/aiApiKey, (3) AiProviderModel.getDefault(). All AI nodes strip <thought>...</thought> blocks from the model output before parsing so reasoning leaks (e.g. from Gemma) do not corrupt structured output.',
    rows: [
      {
        type: 'ai-prompt',
        what: 'One LLM call. Returns raw text (and auto-parsed JSON if the text is valid JSON).',
        config: 'aiPrompt, aiSystemPrompt OR aiPromptTemplateSystemId / aiPromptTemplateUserId, aiTemperature, aiMaxTokens',
        runs: 'Builds messages: [system, user], calls chat.completions.create on the provider, returns { response, parsed, model, usage }.',
      },
      {
        type: 'ai-structured-output',
        what: 'LLM call constrained to a JSON schema.',
        config: 'Same as ai-prompt + aiOutputSchema (JSON Schema object)',
        runs: 'Sets response_format: { type: "json_schema", json_schema: { schema, strict: true } }. Falls back to json_object mode if no schema is given. output.parsed is a real object, not a string.',
      },
      {
        type: 'ai-agent',
        what: 'Agentic loop: AI selects tools, executes them, repeats until done or max-iter reached.',
        config: 'aiTools: [{ function: { name, description, parameters } }], aiMaxIterations',
        runs: 'Each iteration the model may emit tool_calls. Each tool call argument is executed in the script-js sandbox (tools are JS functions you define inline). Results are appended as role: "tool" messages and fed back. Exits when no tool calls are emitted.',
      },
      {
        type: 'ai-router',
        what: 'LLM-based multi-branch router. The model classifies the input and chooses one route.',
        config: 'aiRoutes: [{ branchId, description }, ...]',
        runs: 'Sends route descriptions plus a JSON-only output instruction. Parses the chosen branchId. Falls back to the first route on invalid output. Output: { branch, reasoning }. In v2 DAGs the branch id becomes the sourcePort for routing.',
      },
      {
        type: 'ai-loop',
        what: 'Sequenced-template loop. Runs the same prompt template over each item in an input list.',
        config: 'aiPromptTemplate, inputArrayPath',
        runs: 'For each element of the input array, calls ai.call with the same template. Aggregates results. Cleaner than script-js for simple per-item AI calls.',
      },
    ],
  },
  {
    id: 'documents',
    title: 'Documents & output',
    rows: [
      {
        type: 'load-document',
        what: 'Read a PDF, PPTX, or TXT file into structured per-page chunks.',
        config: 'loadDocumentSourcePath (typically ${input.file}), loadDocumentMaxChunkChars',
        runs: 'Dispatches by extension. PDF: pdfjs-dist extracts text per page; @napi-rs/canvas renders each page to PNG. PPTX: officeparser extracts slide text; LibreOffice (if installed) renders slides to PNG. TXT: reads the whole file. Hybrid chunking splits long pages at sentence boundaries. Output: { chunks: [{ pageId, text, imagePath }] }.',
      },
      {
        type: 'transform',
        what: 'Declarative JSON shaper — reshape an input without writing script-js.',
        config: 'Transform spec (field rules)',
        runs: 'Applies the spec to the input data: renames, projects, flattens, defaults. Cleaner than ad-hoc script-js for simple data shaping.',
      },
      {
        type: 'aggregate',
        what: 'Combine multiple inputs (e.g. fan-out results) into one structure.',
        config: 'Aggregation spec',
        runs: 'Collects items into arrays, sums/concats, or groups by key. Often paired with a fan-out node to merge per-item outputs back into a single payload.',
      },
      {
        type: 'json-output-writer',
        what: 'Write any JSON value to a file under the upload directory.',
        config: 'filename, directory (defaults to data/uploads/<execution-id>/), data (${...} interpolated)',
        runs: 'Generic JSON-to-file writer. Returns { filePath }. Use this as the canonical output writer for most workflows.',
      },
      {
        type: 'quiz-output-writer',
        what: 'Quiz-specific JSON writer used by the example workflow.',
        config: 'quizOutputFilename, quizOutputDirectory',
        runs: 'Assembles { source_file, focus_area, generated_at, questions } and writes to disk. Returns { filePath, json } so the run panel can display + offer download.',
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & email',
    intro:
      'These nodes are hidden from the editor palette when OFFLINE_MODE=true. They still load on existing workflows but fail at execution if their endpoints are not reachable.',
    rows: [
      {
        type: 'notification-slack / action-slack',
        what: 'Send a message to a Slack incoming-webhook URL.',
        config: 'slackWebhookUrl, slackMessage',
        runs: 'Wraps a POST to the webhook URL with body { text }. Subject to the HTTP allowlist.',
      },
      {
        type: 'action-email',
        what: 'Send an email via SMTP.',
        config: 'emailTo, emailSubject, emailBody (all ${...} interpolated). SMTP_HOST/PORT/SECURE/USER/PASS/FROM env vars must be set.',
        runs: 'nodemailer opens an SMTP connection, sends, and closes. Fails with a clear logged error if SMTP_* env vars are missing.',
      },
    ],
  },
];

const VARIABLE_REFERENCE_EXAMPLES = `
\${load.output.chunks}            # output of step with id 'load'
\${input.focus_area}              # workflow input parameter
\${variables.allQuestions}        # workflow-scope variable set elsewhere
\${env.HTTP_ALLOWLIST}            # process env var
\${steps.<stepId>.output.x}       # alternative path (older code uses this)
`.trim();

const DAG_FEATURES = [
  {
    name: 'Bounded parallel execution',
    detail:
      'Independent branches run concurrently; capped by MAX_CONCURRENT_NODES env (default 4).',
  },
  {
    name: 'Edge `when` expressions',
    detail:
      "when: ${parsed.all_pass} means the edge only fires when the source's parsed.all_pass is truthy. Used for branchless if-then routing.",
  },
  {
    name: 'Named ports (targetPort)',
    detail:
      'A node with two incoming edges sees inputData.<portName> for each upstream source. Used by the quiz example to merge verifier + reviewer results into the fixer.',
  },
  {
    name: 'Per-node fan-out',
    detail:
      "Set fanOut.enabled = true + fanOut.inputArrayPath: 'load.chunks' → the node runs once per array item; results are collected into { items: [...] }.",
  },
  {
    name: 'Per-node error policy',
    detail:
      "errorPolicy.onError: 'stop' | 'continue' | 'retry' with optional retryCount and errorBranch. 'continue' lets the workflow proceed past a failed step (with null output downstream); 'retry' wraps the step in exponential backoff.",
  },
];

export default function UserManualPage() {
  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <BookOpen size={28} />
        <div>
          <h1 style={{ margin: 0 }}>User Manual</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted, #666)' }}>
            Every node type, what it does, and how it runs.
          </p>
        </div>
      </header>

      <nav className="card" style={{ padding: 16, marginBottom: 24 }}>
        <strong>Contents</strong>
        <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} style={{ color: 'var(--color-primary, #2563eb)' }}>
                {s.title}
              </a>
            </li>
          ))}
          <li>
            <a href="#variables" style={{ color: 'var(--color-primary, #2563eb)' }}>
              Variable reference syntax
            </a>
          </li>
          <li>
            <a href="#dag" style={{ color: 'var(--color-primary, #2563eb)' }}>
              DAG engine features (v2 workflows)
            </a>
          </li>
        </ul>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} style={{ marginBottom: 32 }}>
          <h2 style={{ borderBottom: '1px solid var(--color-border, #e0e0e0)', paddingBottom: 6 }}>
            {s.title}
          </h2>
          {s.intro && (
            <p style={{ color: 'var(--color-text-muted, #666)' }}>{s.intro}</p>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {s.rows.map((row) => (
              <article key={row.type} className="card" style={{ padding: 16 }}>
                <code
                  style={{
                    fontWeight: 600,
                    fontSize: '1em',
                    background: 'var(--color-surface-2, #f5f5f5)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {row.type}
                </code>
                <p style={{ marginTop: 8, marginBottom: 6 }}>{row.what}</p>
                {row.config && (
                  <p style={{ margin: '4px 0', fontSize: '0.9em' }}>
                    <strong style={{ color: 'var(--color-text-muted, #666)' }}>Config:</strong>{' '}
                    <code>{row.config}</code>
                  </p>
                )}
                <p style={{ margin: '4px 0 0', fontSize: '0.9em' }}>
                  <strong style={{ color: 'var(--color-text-muted, #666)' }}>How it runs:</strong>{' '}
                  {row.runs}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section id="variables" style={{ marginBottom: 32 }}>
        <h2 style={{ borderBottom: '1px solid var(--color-border, #e0e0e0)', paddingBottom: 6 }}>
          Variable reference syntax
        </h2>
        <p>
          Any string field that supports interpolation expands <code>{'${path.to.value}'}</code> against
          the running workflow's context. The interpolator
          (<code>ScriptRunner.interpolateVariables</code>) walks the context by dot-path; an unresolved
          path becomes an empty string.
        </p>
        <pre
          className="card"
          style={{
            padding: 12,
            background: 'var(--color-surface-2, #f5f5f5)',
            overflowX: 'auto',
            fontSize: '0.9em',
          }}
        >
          {VARIABLE_REFERENCE_EXAMPLES}
        </pre>
      </section>

      <section id="dag" style={{ marginBottom: 32 }}>
        <h2 style={{ borderBottom: '1px solid var(--color-border, #e0e0e0)', paddingBottom: 6 }}>
          DAG engine features (v2 workflows)
        </h2>
        <p style={{ color: 'var(--color-text-muted, #666)' }}>
          On top of per-node behavior, the v2 DAG executor adds these capabilities. They apply uniformly to
          any of the step types above.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {DAG_FEATURES.map((f) => (
            <article key={f.name} className="card" style={{ padding: 16 }}>
              <strong>{f.name}</strong>
              <p style={{ margin: '6px 0 0' }}>{f.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <footer
        style={{
          marginTop: 40,
          padding: 16,
          borderTop: '1px solid var(--color-border, #e0e0e0)',
          color: 'var(--color-text-muted, #666)',
          fontSize: '0.9em',
        }}
      >
        Source of truth for behavior: <code>backend/src/services/stepExecutor.ts</code>{' '}
        (per-node case bodies) and <code>backend/src/services/dagScheduler.ts</code> (DAG features).
      </footer>
    </div>
  );
}

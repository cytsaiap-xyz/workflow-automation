/**
 * EXAMPLE — Document Quiz Generator workflow (v2 DAG).
 *
 * This is NOT part of the core platform. It's an example workflow that
 * demonstrates how the platform supports multi-agent pipelines, multi-modal
 * AI calls, named-port merges, and conditional `if-else` branching with an
 * internal feedback loop.
 *
 * Disable with the env var LOAD_EXAMPLE_QUIZ_WORKFLOW=false at startup.
 *
 * Pipeline shape:
 *
 *   load → analyzer → generator
 *                       │
 *                       ├──► verifier ──(all_pass)──► collect ──► writer
 *                       │       │
 *                       │       └──(has_failures)──► fixer
 *                       │                              │
 *                       └──► reviewer ──(all_pass)──► collect
 *                                │                     ▲
 *                                └──(has_failures)──► fixer ───┘
 *
 * The v2 DAG validator rejects cycles, so the verifier → reviewer → fixer →
 * verifier loop cannot be expressed as a back-edge. Instead, verifier and
 * reviewer fire once and route through `if-else` edges based on
 * `${parsed.all_pass}` / `${parsed.has_failures}`. The fixer is a single
 * script-js node that internally loops up to 3 rounds, calling fixer +
 * re-verifier + re-reviewer agents via the in-sandbox `ai.call` helper.
 *
 * The `collect` node converges all paths (verifier-pass, reviewer-pass,
 * fixer-done) into a single questions array consumed by the writer.
 */
import { v4 as uuidv4 } from 'uuid';
import { WorkflowModel } from '../models/workflow';
import { PromptTemplateModel } from '../models/promptTemplateModel';
import { AiProviderModel } from '../models/aiProviderModel';

const QUIZ_WORKFLOW_ID = 'builtin-quiz-generator';

// JSON schema reused by verifier and reviewer. Requiring `all_pass` and
// `has_failures` at the top level lets edge `when` expressions like
// `${parsed.all_pass}` and `${parsed.has_failures}` evaluate without
// touching the per-question results array.
const PASS_FAIL_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question_index: { type: 'number' },
          pass: { type: 'boolean' },
          issue: { type: ['string', 'null'] },
        },
        required: ['question_index', 'pass'],
      },
    },
    all_pass: { type: 'boolean' },
    has_failures: { type: 'boolean' },
  },
  required: ['results', 'all_pass', 'has_failures'],
};

const ANALYZER_SCHEMA = {
  type: 'object',
  properties: {
    refined_focus: { type: 'string' },
    must_cover: { type: 'array', items: { type: 'string' } },
    avoid: { type: 'array', items: { type: 'string' } },
  },
  required: ['refined_focus', 'must_cover', 'avoid'],
};

const GENERATOR_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          reference_page: { type: 'string' },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['question', 'options', 'answer', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

const FIXER_SCHEMA = {
  type: 'object',
  properties: { fixed_questions: { type: 'array' } },
  required: ['fixed_questions'],
};

/**
 * Fix-loop orchestrator. Receives initial generator questions plus the first-
 * pass verifier and reviewer results via inputVars, then iterates up to 3
 * rounds of fix → re-verify → re-review. Stops early when both gates pass.
 *
 * Built as a function so the seeder can bake the explicit `providerId` into
 * every `ai.call` invocation. Passing the id literal at seed time makes the
 * provider reference visible in the stored workflow definition rather than
 * relying on runtime fallback to the default provider.
 */
const buildFixerLoopCode = (providerId?: string): string => {
  const idLiteral = providerId ? JSON.stringify(providerId) : 'undefined';
  return `
const focusArea  = inputData.focusArea  || variables.input?.focus_area || '';
const mustCover  = Array.isArray(inputData.mustCover) ? inputData.mustCover : [];
const avoid      = Array.isArray(inputData.avoid)     ? inputData.avoid     : [];

let questions = Array.isArray(inputData.generatorQuestions) ? [...inputData.generatorQuestions] : [];
let verifierResults = (inputData.verifierOutput && Array.isArray(inputData.verifierOutput.results)) ? inputData.verifierOutput.results : [];
let reviewerResults = (inputData.reviewerOutput && Array.isArray(inputData.reviewerOutput.results)) ? inputData.reviewerOutput.results : [];

const baseCtx = {
  input: {
    ...variables.input,
    focus_area: focusArea,
    must_cover: mustCover,
    avoid,
  },
};

let roundsUsed = 0;
for (let round = 1; round <= 3; round++) {
  const flagged = [];
  for (const r of verifierResults) if (r && r.pass === false) flagged.push({ ...r, source: 'verifier' });
  for (const r of reviewerResults) if (r && r.pass === false) flagged.push({ ...r, source: 'reviewer' });
  if (flagged.length === 0) break;
  roundsUsed = round;

  const fixer = await ai.call({
    providerId: ${idLiteral},
    systemTemplate: 'quiz-fixer-system',
    userTemplate: 'quiz-fixer-system',
    context: {
      ...baseCtx,
      input: {
        ...baseCtx.input,
        questions,
        issues: flagged,
        mode: round === 1 ? 'surgical' : 'auto',
      },
    },
    outputSchema: ${JSON.stringify(FIXER_SCHEMA)},
  });
  questions = (fixer.parsed?.fixed_questions || []).map(q => ({
    reference_page: q.reference_page,
    question: q.question,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
  }));

  // No point re-running the gates on the last allowed round.
  if (round === 3) break;

  const verifier = await ai.call({
    providerId: ${idLiteral},
    systemTemplate: 'quiz-verifier-system',
    userTemplate: 'quiz-verifier-system',
    context: { ...baseCtx, input: { ...baseCtx.input, questions } },
    outputSchema: ${JSON.stringify(PASS_FAIL_SCHEMA)},
  });
  verifierResults = verifier.parsed?.results || [];

  const reviewer = await ai.call({
    providerId: ${idLiteral},
    systemTemplate: 'quiz-reviewer-system',
    userTemplate: 'quiz-reviewer-system',
    context: { ...baseCtx, input: { ...baseCtx.input, questions } },
    outputSchema: ${JSON.stringify(PASS_FAIL_SCHEMA)},
  });
  reviewerResults = reviewer.parsed?.results || [];

  if (verifier.parsed?.all_pass && reviewer.parsed?.all_pass) break;
}

return { questions, rounds_used: roundsUsed };
`;
};

/**
 * Convergence node. The three paths into here are mutually exclusive at the
 * data level: the fixer only ran if at least one gate failed, in which case
 * its questions array is authoritative. Otherwise the generator's questions
 * already passed both gates.
 */
const COLLECT_CODE = `
const fixed = Array.isArray(inputData.fixerQuestions) ? inputData.fixerQuestions : null;
if (fixed && fixed.length) return { questions: fixed };
const raw = Array.isArray(inputData.generatorQuestions) ? inputData.generatorQuestions : [];
return { questions: raw };
`;

// Bump when changing the seeded layout / node ids / edges so existing DB rows
// get refreshed on the next startup. Increment when default positions change.
const QUIZ_LAYOUT_VERSION = 5;

export function seedQuizWorkflowDag(): void {
  const existing = WorkflowModel.getById(QUIZ_WORKFLOW_ID);
  // Skip ONLY if already in the new shape AND at the current layout version.
  if (existing) {
    const def: any = existing.definition;
    if (
      def?.schemaVersion === 2 &&
      Array.isArray(def?.nodes) &&
      def.nodes.some((n: any) => n.id === 'analyzer') &&
      def.layoutVersion === QUIZ_LAYOUT_VERSION
    ) {
      return;
    }
  }

  // Look up template IDs by name so the AI nodes pull the seeded system
  // prompts from the prompt library. seedPromptTemplates() runs immediately
  // before this in index.ts, so these are guaranteed to exist.
  const tplId = (name: string) => PromptTemplateModel.getByName(name)?.id;
  const analyzerTpl = tplId('quiz-doc-analyzer-system');
  const generatorTpl = tplId('quiz-generator-system');
  const verifierTpl = tplId('quiz-verifier-system');
  const reviewerTpl = tplId('quiz-reviewer-system');

  // Bake the default AI provider's id into every AI node's config so the
  // workflow definition explicitly records which provider it runs against
  // (instead of relying on the runtime fallback chain). If no default
  // provider exists at seed time (e.g., env vars unset and no UI-created
  // provider yet), aiProviderId stays undefined and the executor falls
  // back to inline config → default-at-call-time.
  const providerId = AiProviderModel.getDefault()?.id;

  // Top-to-bottom layout: nodes stacked vertically along a center column,
  // with verifier and reviewer rendered side-by-side at the same y.
  // React Flow's default handles are top (target) and bottom (source).
  const COL = 280; // horizontal column step
  const ROW = 140; // vertical row step

  const def: any = {
    schemaVersion: 2,
    layoutVersion: QUIZ_LAYOUT_VERSION,
    inputParameters: [
      { name: 'file', type: 'file', accept: '.pdf,.pptx,.txt', required: true, description: 'Source document' },
      { name: 'focus_area', type: 'string', defaultValue: 'concept and logic, not usage or default values' },
      { name: 'questions_per_chunk', type: 'number', defaultValue: 3 },
    ],
    nodes: [
      {
        id: 'load',
        name: 'Load document',
        type: 'load-document',
        position: { x: COL, y: 0 },
        config: {
          loadDocumentSourcePath: '${input.file}',
          loadDocumentMaxChunkChars: 2000,
        },
      },
      {
        id: 'analyzer',
        name: 'Analyze focus area',
        type: 'ai-structured-output',
        position: { x: COL, y: ROW },     // row 1
        config: {
          aiProviderId: providerId,
          aiPromptTemplateSystemId: analyzerTpl,
          aiPrompt: 'User focus area: ${input.focus_area}\n\nDocument sample (first chunk):\n${inputData.firstChunkText}',
          aiOutputSchema: ANALYZER_SCHEMA,
        },
        inputVars: [
          { name: 'firstChunkText', source: '${load.output.chunks.0.text}' },
        ],
      },
      {
        id: 'generator',
        name: 'Generate questions',
        type: 'ai-structured-output',
        position: { x: COL, y: ROW * 2 }, // row 2
        config: {
          aiProviderId: providerId,
          aiPromptTemplateSystemId: generatorTpl,
          aiPrompt: '${inputData.chunks}',
          aiOutputSchema: GENERATOR_SCHEMA,
        },
        inputVars: [
          { name: 'chunks', source: '${load.output.chunks}' },
          { name: 'refined_focus', source: '${analyzer.output.parsed.refined_focus}' },
          { name: 'must_cover', source: '${analyzer.output.parsed.must_cover}' },
          { name: 'avoid', source: '${analyzer.output.parsed.avoid}' },
        ],
      },
      {
        id: 'verifier',
        name: 'Verify grounding',
        type: 'ai-structured-output',
        position: { x: 0, y: ROW * 3 },   // row 3, left branch
        config: {
          aiProviderId: providerId,
          aiPromptTemplateSystemId: verifierTpl,
          aiPrompt: '${inputData.questions}',
          aiOutputSchema: PASS_FAIL_SCHEMA,
        },
        inputVars: [
          { name: 'questions', source: '${generator.output.parsed.questions}' },
          { name: 'focus_area', source: '${analyzer.output.parsed.refined_focus}' },
          { name: 'must_cover', source: '${analyzer.output.parsed.must_cover}' },
          { name: 'avoid', source: '${analyzer.output.parsed.avoid}' },
        ],
      },
      {
        id: 'reviewer',
        name: 'Review focus coverage',
        type: 'ai-structured-output',
        position: { x: COL * 2, y: ROW * 3 }, // row 3, right branch
        config: {
          aiProviderId: providerId,
          aiPromptTemplateSystemId: reviewerTpl,
          aiPrompt: '${inputData.questions}',
          aiOutputSchema: PASS_FAIL_SCHEMA,
        },
        inputVars: [
          { name: 'questions', source: '${generator.output.parsed.questions}' },
          { name: 'focus_area', source: '${analyzer.output.parsed.refined_focus}' },
          { name: 'must_cover', source: '${analyzer.output.parsed.must_cover}' },
          { name: 'avoid', source: '${analyzer.output.parsed.avoid}' },
        ],
      },
      {
        id: 'fixer',
        name: 'Fix flagged + retry (up to 3)',
        type: 'script-js',
        position: { x: COL, y: ROW * 4 }, // row 4
        config: { code: buildFixerLoopCode(providerId) },
        inputVars: [
          { name: 'generatorQuestions', source: '${generator.output.parsed.questions}' },
          { name: 'verifierOutput', source: '${verifier.output.parsed}' },
          { name: 'reviewerOutput', source: '${reviewer.output.parsed}' },
          { name: 'focusArea', source: '${analyzer.output.parsed.refined_focus}' },
          { name: 'mustCover', source: '${analyzer.output.parsed.must_cover}' },
          { name: 'avoid', source: '${analyzer.output.parsed.avoid}' },
        ],
      },
      {
        id: 'collect',
        name: 'Collect final questions',
        type: 'script-js',
        position: { x: COL, y: ROW * 5 }, // row 5
        config: { code: COLLECT_CODE },
        inputVars: [
          { name: 'fixerQuestions', source: '${fixer.output.questions}' },
          { name: 'generatorQuestions', source: '${generator.output.parsed.questions}' },
        ],
      },
      {
        id: 'writer',
        name: 'Write quiz JSON',
        type: 'quiz-output-writer',
        position: { x: COL, y: ROW * 6 }, // row 6
        config: { quizOutputFilename: 'quiz.json' },
        inputVars: [
          { name: 'questions', source: '${collect.output.questions}' },
          { name: 'sourceFile', source: '${input.file}' },
          { name: 'focusArea', source: '${analyzer.output.parsed.refined_focus}' },
        ],
      },
    ],
    edges: [
      { id: uuidv4(), source: 'load', target: 'analyzer' },
      { id: uuidv4(), source: 'analyzer', target: 'generator' },
      { id: uuidv4(), source: 'generator', target: 'verifier' },
      { id: uuidv4(), source: 'generator', target: 'reviewer' },

      // verifier branches: pass → collect, fail → fixer.
      { id: uuidv4(), source: 'verifier', target: 'collect', when: '${parsed.all_pass}' },
      { id: uuidv4(), source: 'verifier', target: 'fixer',   when: '${parsed.has_failures}' },

      // reviewer branches: pass → collect, fail → fixer.
      { id: uuidv4(), source: 'reviewer', target: 'collect', when: '${parsed.all_pass}' },
      { id: uuidv4(), source: 'reviewer', target: 'fixer',   when: '${parsed.has_failures}' },

      // Fixer runs only if at least one gate failed; mergeMode 'all' (default)
      // means it auto-skips when both inbound edges resolve without firing.
      { id: uuidv4(), source: 'fixer', target: 'collect' },

      { id: uuidv4(), source: 'collect', target: 'writer' },
    ],
  };

  if (existing) {
    WorkflowModel.update(QUIZ_WORKFLOW_ID, { definition: def });
  } else {
    WorkflowModel.create({
      id: QUIZ_WORKFLOW_ID,
      name: 'Document Quiz Generator (example)',
      description: 'Generate a JSON quiz from a PDF/PPTX/TXT via a multi-agent pipeline with if-else gates and an iterative fixer.',
      status: 'active',
      definition: def,
    } as any);
  }
}

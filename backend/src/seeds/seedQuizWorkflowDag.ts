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
 */
const FIXER_LOOP_CODE = `
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
    systemTemplate: 'quiz-verifier-system',
    userTemplate: 'quiz-verifier-system',
    context: { ...baseCtx, input: { ...baseCtx.input, questions } },
    outputSchema: ${JSON.stringify(PASS_FAIL_SCHEMA)},
  });
  verifierResults = verifier.parsed?.results || [];

  const reviewer = await ai.call({
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

export function seedQuizWorkflowDag(): void {
  const existing = WorkflowModel.getById(QUIZ_WORKFLOW_ID);
  // Skip ONLY if already in the new shape (idempotent re-seed on restart).
  if (existing) {
    const def: any = existing.definition;
    if (def?.schemaVersion === 2 && Array.isArray(def?.nodes) && def.nodes.some((n: any) => n.id === 'analyzer')) {
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

  // Pixel coordinates so React Flow lays the nodes out as a proper graph.
  // Grid coords like (0,0)/(1,0) used to collapse on top of each other.
  const COL = 280;
  const ROW = 140;

  const def: any = {
    schemaVersion: 2,
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
        position: { x: 0, y: ROW },
        config: {
          loadDocumentSourcePath: '${input.file}',
          loadDocumentMaxChunkChars: 2000,
        },
      },
      {
        id: 'analyzer',
        name: 'Analyze focus area',
        type: 'ai-structured-output',
        position: { x: COL, y: ROW },
        config: {
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
        position: { x: COL * 2, y: ROW },
        config: {
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
        position: { x: COL * 3, y: 0 },
        config: {
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
        position: { x: COL * 3, y: ROW * 2 },
        config: {
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
        position: { x: COL * 4, y: ROW },
        config: { code: FIXER_LOOP_CODE },
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
        position: { x: COL * 5, y: ROW },
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
        position: { x: COL * 6, y: ROW },
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

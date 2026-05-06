import { v4 as uuidv4 } from 'uuid';
import { WorkflowModel } from '../models/workflow';

const QUIZ_WORKFLOW_ID = 'builtin-quiz-generator';

/**
 * Fix-loop orchestrator: reads generator questions plus reviewer/verifier results
 * from named-port inputs, runs up to 3 fix rounds per chunk, then returns merged
 * questions across all chunks.
 *
 * In the DAG shape the generator node fan-outs per chunk and the fix-loop merges:
 *   fix-loop.targetPort.generator  → inputData.generator  (array of {questions:[]})
 *   fix-loop.targetPort.reviewer   → inputData.reviewer   (array of {results:[]})
 *   fix-loop.targetPort.verifier   → inputData.verifier   (array of {results:[]})
 */
const FIX_LOOP_CODE = `
// Helper: extract questions from an ai-structured-output result or fan-out items.
// The ai-structured-output step returns { parsed: { questions: [] }, raw, model, usage }.
// A fan-out collects per-chunk results in { items: [result, ...] }.
// variables[node.id].output is set per-chunk (last chunk wins) due to runV2 callback timing,
// so inputData.generator is the last-chunk result: { parsed: { questions: [] }, ... }
function extractQuestions(raw) {
  if (!raw) return [];
  // Single ai-structured-output result
  if (raw.parsed && Array.isArray(raw.parsed.questions)) return raw.parsed.questions;
  // Pre-parsed: { questions: [] }
  if (Array.isArray(raw.questions)) return raw.questions;
  // Fan-out aggregate: { items: [{ parsed: { questions: [] } }, ...] }
  if (Array.isArray(raw.items)) {
    const out = [];
    for (const item of raw.items) {
      const qs = item && item.parsed && Array.isArray(item.parsed.questions) ? item.parsed.questions
        : item && Array.isArray(item.questions) ? item.questions : [];
      for (const q of qs) out.push(q);
    }
    return out;
  }
  return [];
}

function extractResults(raw) {
  if (!raw) return [];
  if (raw.parsed && Array.isArray(raw.parsed.results)) return raw.parsed.results;
  if (Array.isArray(raw.results)) return raw.results;
  return [];
}

const genRaw = inputData.generator || {};
const revRaw = inputData.reviewer  || {};
const verRaw = inputData.verifier  || {};

// Flat reviewer/verifier results shared across all chunks (single-pass DAG nodes)
const sharedReviewerResults = extractResults(revRaw);
const sharedVerifierResults = extractResults(verRaw);

const focusArea         = variables.input?.focus_area          || 'concept and logic, not usage or default values';
const questionsPerChunk = Number(variables.input?.questions_per_chunk || 3);

const all = [];

// Collect all questions from generator (handles both fan-out and single-chunk cases)
let questions = extractQuestions(genRaw);

// --- Per-question review loop ---
{
  let i = 0; // dummy block for single-chunk flow
  const _ = i;

  // Use pre-computed reviewer/verifier results for the first round (shared across chunks)
  let reviewerResults = sharedReviewerResults;
  let verifierResults = sharedVerifierResults;

  const chunkCtx = {
    input: {
      ...variables.input,
      focus_area: focusArea,
      questions_per_chunk: questionsPerChunk,
    },
  };

  for (let round = 1; round <= 3; round++) {
    if (round > 1) {
      // Re-run reviewer/verifier in subsequent rounds via ai.call
      const reviewer = await ai.call({
        systemTemplate: 'quiz-reviewer-system',
        userTemplate: 'quiz-reviewer-system',
        context: { ...chunkCtx, input: { ...chunkCtx.input, questions } },
        outputSchema: { type: 'object', properties: { results: { type: 'array' } }, required: ['results'] },
      });
      reviewerResults = reviewer.parsed.results || [];

      const verifier = await ai.call({
        systemTemplate: 'quiz-verifier-system',
        userTemplate: 'quiz-verifier-system',
        context: { ...chunkCtx, input: { ...chunkCtx.input, questions } },
        outputSchema: { type: 'object', properties: { results: { type: 'array' } }, required: ['results'] },
      });
      verifierResults = verifier.parsed.results || [];
    }

    const flagged = [];
    for (const r of reviewerResults) if (!r.pass) flagged.push({ ...r, source: 'reviewer' });
    for (const r of verifierResults) if (!r.pass) flagged.push({ ...r, source: 'verifier' });
    if (flagged.length === 0) break;

    const fixer = await ai.call({
      systemTemplate: 'quiz-fixer-system',
      userTemplate: 'quiz-fixer-system',
      context: { ...chunkCtx, input: { ...chunkCtx.input, questions, issues: flagged, mode: round === 1 ? 'surgical' : 'auto' } },
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
      for (const f of flagged) {
        if (questions[f.question_index]) {
          questions[f.question_index].quality_warnings = questions[f.question_index].quality_warnings || [];
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

export function seedQuizWorkflowDag(): void {
  const existing = WorkflowModel.getById(QUIZ_WORKFLOW_ID);
  // Skip ONLY if already in the new DAG shape with identifying nodes (idempotent).
  if (existing) {
    const def: any = existing.definition;
    if (def?.schemaVersion === 2 && Array.isArray(def?.nodes) && def.nodes.some((n: any) => n.id === 'generator')) {
      return;
    }
  }

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
        position: { x: 0, y: 0 },
        config: {
          loadDocumentSourcePath: '${input.file}',
          loadDocumentMaxChunkChars: 2000,
        },
      },
      {
        id: 'generator',
        name: 'Generate questions',
        type: 'ai-structured-output',
        position: { x: 1, y: 0 },
        config: {
          aiSystemPrompt: 'Use the quiz-generator-system template via inputs.',
          aiPrompt: '${chunks}',
          aiOutputSchema: { type: 'object', properties: { questions: { type: 'array' } } },
        },
        fanOut: { enabled: true, inputArrayPath: 'chunks' },
      },
      {
        id: 'reviewer',
        name: 'Review focus-area',
        type: 'ai-structured-output',
        position: { x: 2, y: 0 },
        config: {
          aiSystemPrompt: 'Reviewer.',
          aiPrompt: '${generator.questions}',
          aiOutputSchema: { type: 'object', properties: { results: { type: 'array' } } },
        },
      },
      {
        id: 'verifier',
        name: 'Verify grounding',
        type: 'ai-structured-output',
        position: { x: 2, y: 1 },
        config: {
          aiSystemPrompt: 'Verifier.',
          aiPrompt: '${generator.questions}',
          aiOutputSchema: { type: 'object', properties: { results: { type: 'array' } } },
        },
      },
      {
        id: 'fix-loop',
        name: 'Fix flagged + retry',
        type: 'script-js',
        position: { x: 3, y: 0 },
        config: { code: FIX_LOOP_CODE },
        // inputVars expose the generator/reviewer/verifier outputs as inputData fields.
        // After each node runs, runV2 sets variables[node.id] = { output: r.output }.
        inputVars: [
          { name: 'generator', source: '${generator.output}' },
          { name: 'reviewer',  source: '${reviewer.output}' },
          { name: 'verifier',  source: '${verifier.output}' },
        ],
      },
      {
        id: 'collect',
        name: 'Collect questions',
        type: 'script-js',
        position: { x: 4, y: 0 },
        config: {
          // fix-loop sets variables.allQuestions; collect reads from there directly.
          code: "const qs = variables.allQuestions || []; return { questions: qs };",
        },
      },
      {
        id: 'writer',
        name: 'Write quiz JSON',
        type: 'quiz-output-writer',
        position: { x: 5, y: 0 },
        config: { quizOutputFilename: 'quiz.json' },
        inputVars: [
          { name: 'questions', source: '${allQuestions}' },
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
    WorkflowModel.update(QUIZ_WORKFLOW_ID, { definition: def });
  } else {
    WorkflowModel.create({
      id: QUIZ_WORKFLOW_ID,
      name: 'Document Quiz Generator (built-in)',
      description: 'Generate a JSON quiz from a PDF/PPTX/TXT via a multi-agent feedback loop (DAG).',
      status: 'active',
      definition: def,
    } as any);
  }
}

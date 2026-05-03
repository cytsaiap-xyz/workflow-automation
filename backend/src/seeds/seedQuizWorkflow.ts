import { WorkflowModel } from '../models/workflow';

const QUIZ_WORKFLOW_ID = 'builtin-quiz-generator';

const ORCHESTRATOR_CODE = `
const chunks = inputData.chunks || variables.steps['load']?.output?.chunks || [];
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
    userTemplate: 'quiz-generator-system',
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
  });
}

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { Step } from '../types/workflow';

let StepExecutor: typeof import('../services/stepExecutor').StepExecutor;

describe('quiz-output-writer step', () => {
  beforeAll(async () => {
    process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-qow-'));
    // dynamic import so the env var takes effect first
    StepExecutor = (await import('../services/stepExecutor')).StepExecutor;
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

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

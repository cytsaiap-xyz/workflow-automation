/**
 * EXAMPLE — seeds the four quiz pipeline prompt templates used by the
 * Document Quiz Generator example workflow. The platform's prompt library
 * itself is empty by default; users add their own templates via the
 * /settings/prompt-templates page.
 *
 * Gated at startup behind LOAD_EXAMPLE_QUIZ_WORKFLOW (see backend/src/index.ts).
 */
import { PromptTemplateModel } from '../models/promptTemplateModel';
import {
  QUIZ_DOC_ANALYZER_SYSTEM,
  QUIZ_GENERATOR_SYSTEM,
  QUIZ_REVIEWER_SYSTEM,
  QUIZ_VERIFIER_SYSTEM,
  QUIZ_FIXER_SYSTEM,
} from './quizPromptTexts';

export function seedPromptTemplates(): void {
  const seeds = [
    { name: 'quiz-doc-analyzer-system', role: 'system' as const, content: QUIZ_DOC_ANALYZER_SYSTEM, requiresVision: true, tags: ['quiz', 'analyzer'], builtin: true },
    { name: 'quiz-generator-system', role: 'system' as const, content: QUIZ_GENERATOR_SYSTEM, requiresVision: true, tags: ['quiz', 'generator'], builtin: true },
    { name: 'quiz-reviewer-system', role: 'system' as const, content: QUIZ_REVIEWER_SYSTEM, requiresVision: true, tags: ['quiz', 'reviewer'], builtin: true },
    { name: 'quiz-verifier-system', role: 'system' as const, content: QUIZ_VERIFIER_SYSTEM, requiresVision: true, tags: ['quiz', 'verifier'], builtin: true },
    { name: 'quiz-fixer-system', role: 'system' as const, content: QUIZ_FIXER_SYSTEM, requiresVision: true, tags: ['quiz', 'fixer'], builtin: true },
  ];
  for (const s of seeds) PromptTemplateModel.upsertByName(s);
}

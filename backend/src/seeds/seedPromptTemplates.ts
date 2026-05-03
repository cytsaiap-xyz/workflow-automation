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

/**
 * EXAMPLE — entry point for seeding the Document Quiz Generator workflow.
 * See seedQuizWorkflowDag.ts for the full file-level rationale.
 *
 * Gated at startup behind LOAD_EXAMPLE_QUIZ_WORKFLOW (see backend/src/index.ts).
 */
import { seedQuizWorkflowDag } from './seedQuizWorkflowDag';

export function seedQuizWorkflow(): void {
  seedQuizWorkflowDag();
}

import { aiCall } from './aiCallSandbox';
import { evaluateWhen } from './edgeWhen';

export interface AiLoopStep {
  id: string;
  systemTemplate?: string;
  userTemplate?: string;
  outputSchema?: Record<string, any>;
  providerId?: string;
  providerName?: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional `${path}` expression; the step is skipped in a round when it evaluates falsy. */
  runWhen?: string;
}

export interface AiLoopConfig {
  rounds: number;
  steps: AiLoopStep[];
  /** Array of `${path}` expressions; the loop exits early after a round when ALL evaluate truthy. */
  earlyExitWhen?: string[];
}

export interface AiLoopRoundResult {
  round: number;
  steps: Record<string, unknown>;   // keyed by step.id
  skipped: string[];                // step ids that were runWhen-skipped this round
}

export interface AiLoopResult {
  rounds: number;
  earlyExit: boolean;
  steps: Record<string, unknown>;   // last-round outputs (convenience for downstream nodes)
  history: AiLoopRoundResult[];
}

/**
 * Executes a sequenced-template loop. Each round runs every step in order; the
 * loop exits early when all `earlyExitWhen` expressions evaluate truthy after a
 * round. Per-step `runWhen` lets a step be skipped within a round.
 *
 * Each step's context is `{ ...baseContext, round, history, ...previousStepResultsInThisRound }`,
 * so a step can reference `${earlierStepId.output.x}` (last-round result is in
 * `${earlierStepId.output}` from baseContext) or `${earlierStepId.parsed.x}`
 * for the current-round inner step (spread into top-level).
 */
export async function runAiLoop(
  baseContext: Record<string, any>,
  config: AiLoopConfig,
): Promise<AiLoopResult> {
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    throw new Error('ai-loop: no steps configured');
  }
  const maxRounds = Math.max(1, Math.floor(config.rounds || 1));
  const history: AiLoopRoundResult[] = [];
  let lastSteps: Record<string, unknown> = {};
  let earlyExit = false;
  let rounds = 0;

  for (let round = 1; round <= maxRounds; round++) {
    rounds = round;
    const roundOutputs: Record<string, unknown> = {};
    const skipped: string[] = [];

    for (const step of config.steps) {
      // Context for runWhen and the AI call. Includes prior steps in this
      // round as `${step.id.output}` and spread into the top level.
      const stepContext: Record<string, any> = {
        ...baseContext,
        round,
        history,
        ...lastSteps,                                          // last-round results: e.g. ${verify.output.x}
        ...Object.fromEntries(                                 // current-round prior steps
          Object.entries(roundOutputs).map(([k, v]) => [k, { output: v }]),
        ),
      };

      if (step.runWhen && !evaluateWhen(step.runWhen, stepContext)) {
        skipped.push(step.id);
        continue;
      }

      const output = await aiCall({
        providerId: step.providerId,
        providerName: step.providerName,
        systemTemplate: step.systemTemplate,
        userTemplate: step.userTemplate,
        outputSchema: step.outputSchema,
        temperature: step.temperature,
        maxTokens: step.maxTokens,
        context: stepContext,
      });
      roundOutputs[step.id] = output;
    }

    lastSteps = roundOutputs;
    history.push({ round, steps: roundOutputs, skipped });

    // Early exit check — evaluate against the full post-round context.
    const exitContext: Record<string, any> = {
      ...baseContext,
      round,
      history,
      ...Object.fromEntries(
        Object.entries(roundOutputs).map(([k, v]) => [k, { output: v }]),
      ),
      // Also spread inner step outputs to support `${stepId.fieldName}` style
      ...Object.fromEntries(
        Object.entries(roundOutputs).flatMap(([k, v]) =>
          v && typeof v === 'object' && !Array.isArray(v)
            ? [[k, { output: v, ...(v as Record<string, unknown>) }]]
            : [[k, { output: v }]],
        ),
      ),
    };

    const exitExprs = (config.earlyExitWhen || []).filter(e => typeof e === 'string' && e.trim() !== '');
    if (exitExprs.length > 0 && exitExprs.every(e => evaluateWhen(e, exitContext))) {
      earlyExit = true;
      break;
    }
  }

  return {
    rounds,
    earlyExit,
    steps: lastSteps,
    history,
  };
}

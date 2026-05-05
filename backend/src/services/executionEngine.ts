import { v4 as uuidv4 } from 'uuid';
import {
  Workflow,
  Station,
  Step,
  Execution,
  ExecutionResult,
  StationResult,
  StepResult,
  ExecutionLog
} from '../types/workflow';
import { isV2, WorkflowDefinitionV2 } from '../types/dag';
import { ExecutionModel, LogModel } from '../models/execution';
import { ScriptRunner, ScriptResult } from './scriptRunner';
import { executionManager } from './executionManager';
import { executionEventBus, ExecutionEvent } from './executionEventBus';
import { StepExecutor } from './stepExecutor';
import { runDag } from './dagScheduler';

export interface ExecutionContext {
  executionId: string;
  workflow: Workflow;
  variables: Record<string, any>;
  stations: Record<string, StationResult>;
  steps: Record<string, StepResult>;
  logs: Omit<ExecutionLog, 'id' | 'timestamp'>[];
  simulate: boolean;
  signal?: AbortSignal;
}

export class ExecutionEngine {
  /**
   * Execute a workflow with a pre-created execution record (used by webhooks)
   */
  static async executeWithId(
    executionId: string,
    workflow: Workflow,
    triggeredBy: Execution['triggeredBy'] = 'manual',
    inputData: Record<string, any> = {},
  ): Promise<Execution> {
    return this.executeInternal(executionId, workflow, triggeredBy, inputData, false);
  }

  /**
   * Execute a workflow
   */
  static async execute(
    workflow: Workflow,
    triggeredBy: Execution['triggeredBy'] = 'manual',
    inputData: Record<string, any> = {},
    simulate: boolean = false
  ): Promise<Execution> {
    // Create execution record
    const execution = ExecutionModel.create(workflow.id, workflow.name, triggeredBy);
    return this.executeInternal(execution.id, workflow, triggeredBy, inputData, simulate);
  }

  private static async executeInternal(
    executionId: string,
    workflow: Workflow,
    triggeredBy: Execution['triggeredBy'],
    inputData: Record<string, any>,
    simulate: boolean,
  ): Promise<Execution> {
    const execution = { id: executionId, workflowId: workflow.id, workflowName: workflow.name, status: 'running' as const, triggeredBy, startTime: new Date().toISOString(), successRate: 0 };

    // Validate input parameters
    if (workflow.definition.inputParameters?.length) {
      for (const param of workflow.definition.inputParameters) {
        if (inputData[param.name] === undefined && param.defaultValue !== undefined) {
          inputData[param.name] = param.defaultValue;
        } else if (param.required && inputData[param.name] === undefined) {
          throw new Error(`Missing required input parameter: ${param.name}`);
        }
      }
    }

    // Dispatch v2 workflows to the DAG scheduler.
    if (isV2(workflow.definition)) {
      return this.runV2(executionId, workflow, triggeredBy, inputData, simulate);
    }

    // Register with execution manager for cancellation support
    const signal = executionManager.register(execution.id);

    // Initialize context
    const context: ExecutionContext = {
      executionId: execution.id,
      workflow,
      variables: { ...inputData, input: { ...inputData }, executionId: execution.id },
      stations: {},
      steps: {},
      logs: [],
      simulate,
      signal
    };

    this.log(context, 'info', `${simulate ? '[SIMULATE] ' : ''}Starting workflow: ${workflow.name}`);

    const result: ExecutionResult = {
      stations: []
    };

    let totalSteps = 0;
    let completedSteps = 0;
    let failed = false;

    // Execute stations sequentially (v1 path only; v2 is dispatched to runV2 above)
    const stations = (workflow.definition as any).stations as Station[];
    let cancelled = false;
    for (const station of stations) {
      if (failed) break;

      // Check for cancellation
      if (signal.aborted) {
        cancelled = true;
        failed = true;
        result.error = { message: 'Execution cancelled', code: 'CANCELLED' };
        break;
      }

      // Check station condition
      if (!this.shouldExecuteStation(station, context)) {
        this.log(context, 'info', `Skipping station: ${station.name} (condition not met)`, undefined, station.id);
        const skippedResult = this.createSkippedStationResult(station);
        result.stations.push(skippedResult);
        continue;
      }

      this.log(context, 'info', `Starting station: ${station.name}`, undefined, station.id);
      this.emitEvent(context, 'station:start', { stationId: station.id, stationName: station.name });

      const stationResult = await this.executeStation(station, context);
      result.stations.push(stationResult);

      // Count steps
      totalSteps += station.steps.length;
      completedSteps += stationResult.steps.filter(s => s.status === 'completed').length;

      // Check if station failed
      if (stationResult.status === 'failed') {
        failed = true;
        // Check if it was due to cancellation
        if (signal.aborted) {
          cancelled = true;
          result.error = { message: 'Execution cancelled', code: 'CANCELLED' };
        } else {
          result.error = {
            message: `Workflow stopped at station: ${station.name}`,
            code: 'STATION_FAILED'
          };
        }
        this.log(context, 'error', `Station failed: ${station.name}`, undefined, station.id);
        this.emitEvent(context, 'station:failed', { stationId: station.id, stationName: station.name, error: result.error.message });
      } else {
        this.log(context, 'info', `Station completed: ${station.name}`, stationResult.output, station.id);
        this.emitEvent(context, 'station:complete', { stationId: station.id, stationName: station.name, output: stationResult.output });
      }

      // Store station result for variable access
      context.stations[station.id] = stationResult;
      context.stations[station.name] = stationResult;
    }

    // Calculate success rate
    const successRate = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    // Determine final status
    const finalStatus = cancelled ? 'cancelled' : (failed ? 'failed' : 'completed');

    // Save logs
    if (context.logs.length > 0) {
      LogModel.createMany(context.logs);
    }

    // Unregister from execution manager
    executionManager.unregister(execution.id);

    // Emit terminal event
    const terminalEventType: ExecutionEvent['type'] = cancelled ? 'execution:cancelled' : (failed ? 'execution:failed' : 'execution:complete');
    this.emitEvent(context, terminalEventType, {
      status: finalStatus,
      progress: { completed: completedSteps, total: totalSteps }
    });

    // Update execution record
    const updatedExecution = ExecutionModel.update(execution.id, {
      status: finalStatus,
      endTime: new Date().toISOString(),
      successRate,
      result
    });

    if (simulate) {
      this.log(context, 'info', `[SIMULATE] Workflow ${finalStatus}. Success rate: ${successRate.toFixed(1)}%`);
    } else {
      this.log(context, 'info', `Workflow ${finalStatus}. Success rate: ${successRate.toFixed(1)}%`);
    }

    return updatedExecution!;
  }

  /**
   * Execute a v2 (DAG-schema) workflow by delegating to the dagScheduler.
   * Produces a v1-compatible result shape (one synthetic station) so the run
   * panel keeps working without changes.
   */
  private static async runV2(
    executionId: string,
    workflow: Workflow,
    triggeredBy: Execution['triggeredBy'],
    inputData: Record<string, any>,
    simulate: boolean,
  ): Promise<Execution> {
    const def = workflow.definition as unknown as WorkflowDefinitionV2;
    const startTime = new Date().toISOString();

    // Shared mutable context — nodes populate this as they complete.
    const variables: Record<string, any> = {
      ...(def.variables || {}),
      ...inputData,
      input: { ...inputData },
      executionId,
      steps: {} as Record<string, { output: any; success: boolean }>,
    };

    // Collect per-node step results in execution order.
    const stepResults: StepResult[] = [];

    const dagResult = await runDag(def, {
      maxConcurrency: Number(process.env.MAX_CONCURRENT_NODES || 4),
      initialContext: { variables },
      executeNode: async (node, _mergedInput) => {
        const stepStart = new Date().toISOString();
        const ctx = { variables, steps: variables.steps as Record<string, any>, simulate };
        const resolved = StepExecutor.resolveInputVariables(node as unknown as Step, variables);
        const r = await StepExecutor.executeStepByType(node as unknown as Step, ctx, resolved);
        const stepEnd = new Date().toISOString();

        // Record result so later nodes can reference ${nodeId.output.x}.
        variables.steps[node.id] = { output: r.output, success: r.success };
        variables[node.id] = { output: r.output };

        const sr: StepResult = {
          stepId: node.id,
          stepName: node.name,
          stepType: node.type,
          status: r.success ? 'completed' : 'failed',
          startTime: stepStart,
          endTime: stepEnd,
          input: resolved,
          output: r.output,
          error: r.error ? { message: r.error } : undefined,
        };
        stepResults.push(sr);

        if (!r.success) throw new Error(r.error || 'step failed');
        return r.output;
      },
      onNodeStatus: (_nodeId, _status, _info) => {
        // Future: emit to executionEventBus if needed.
      },
    });

    const endTime = new Date().toISOString();
    const finalStatus = dagResult.status === 'completed' ? 'completed' : 'failed';
    const completedCount = stepResults.filter(s => s.status === 'completed').length;
    const successRate = stepResults.length > 0 ? (completedCount / stepResults.length) * 100 : 0;

    const finalResult: ExecutionResult = {
      stations: [{
        stationId: 'dag',
        stationName: 'graph',
        status: finalStatus,
        startTime,
        endTime,
        steps: stepResults,
        output: {
          allStepsCompleted: finalStatus === 'completed',
          stepCount: stepResults.length,
          completedCount,
          stepResults: stepResults.map(s => ({
            stepId: s.stepId,
            stepName: s.stepName,
            status: s.status,
            output: s.output,
          })),
        },
      }],
    };

    const updated = ExecutionModel.update(executionId, {
      status: finalStatus,
      endTime,
      successRate,
      result: finalResult,
    });

    return updated!;
  }

  /**
   * Execute a station with all its steps
   */
  private static async executeStation(station: Station, context: ExecutionContext): Promise<StationResult> {
    const stationResult: StationResult = {
      stationId: station.id,
      stationName: station.name,
      status: 'running',
      startTime: new Date().toISOString(),
      steps: [],
      output: {}
    };

    if (station.iterator?.enabled) {
      const sourceVar = station.iterator.sourceVariable;
      const resolvedSource = ScriptRunner.interpolateVariables(sourceVar, context.variables);
      let items: any[] = [];

      try {
        items = JSON.parse(resolvedSource);
        if (!Array.isArray(items)) {
          throw new Error('Resolved source is not an array');
        }
      } catch (e) {
        this.log(context, 'error', `Iteration failed: Source variable ${sourceVar} is not a valid array`, undefined, station.id);
        stationResult.status = 'failed';
        stationResult.endTime = new Date().toISOString();
        return stationResult;
      }

      this.log(context, 'info', `Starting iteration over ${items.length} items`, undefined, station.id);

      const iterationResults: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Scoped iteration context: each iteration gets its own copy of steps
        // to prevent cross-iteration variable collisions
        const iterationContext: ExecutionContext = {
          ...context,
          variables: {
            ...context.variables,
            [station.iterator.itemVariableName || 'item']: item,
            ['index']: i
          },
          steps: { ...context.steps }, // Scoped copy per iteration
        };

        this.log(context, 'info', `Iteration ${i + 1}/${items.length}`, { item }, station.id);

        const iterStepsResult = await this.executeStationSteps(station, iterationContext);
        stationResult.steps.push(...iterStepsResult.steps);

        // Store indexed step results for cross-iteration access
        for (const [key, value] of Object.entries(iterationContext.steps)) {
          if (!context.steps[key]) {
            context.steps[`${key}_iter_${i}`] = value;
          }
        }
        // Final iteration's results also stored at original keys for backward compatibility
        if (i === items.length - 1) {
          for (const [key, value] of Object.entries(iterationContext.steps)) {
            context.steps[key] = value;
          }
        }

        if (iterStepsResult.status === 'failed') {
          stationResult.status = 'failed';
          stationResult.endTime = new Date().toISOString();
          this.log(context, 'error', `Iteration failed at index ${i}`, undefined, station.id);
          return stationResult;
        }

        iterationResults.push(iterStepsResult.output);
      }

      stationResult.status = 'completed';
      stationResult.output = iterationResults;
    } else {
      const res = await this.executeStationSteps(station, context);
      stationResult.status = res.status;
      stationResult.steps = res.steps;
      stationResult.output = res.output;
    }

    stationResult.endTime = new Date().toISOString();

    // Store station output for next stations
    context.variables[station.id] = { output: stationResult.output };
    context.variables[station.name] = { output: stationResult.output };

    return stationResult;
  }

  /**
   * Helper to execute a set of steps for a station
   */
  private static async executeStationSteps(station: Station, context: ExecutionContext): Promise<{ status: StationResult['status'], steps: StepResult[], output: any }> {
    const steps: StepResult[] = [];

    // If edges defined, use graph-based execution with if-else routing
    if (station.edges && station.edges.length > 0) {
      const stepMap = new Map(station.steps.map(s => [s.id, s]));
      const executed = new Set<string>();

      // Find start steps (no incoming edges)
      const targetIds = new Set(station.edges.map(e => e.target));
      const startStepIds = station.steps
        .filter(s => !targetIds.has(s.id))
        .map(s => s.id);

      const queue: string[] = [...startStepIds];

      while (queue.length > 0) {
        const stepId = queue.shift()!;
        if (executed.has(stepId)) continue;

        const step = stepMap.get(stepId);
        if (!step) continue;

        if (context.signal?.aborted) {
          return { status: 'failed', steps, output: {} };
        }

        const stepResult = await this.executeStep(step, context);
        steps.push(stepResult);
        executed.add(stepId);

        context.steps[step.id] = stepResult;
        context.steps[step.name] = stepResult;

        if (stepResult.status === 'failed') {
          return { status: 'failed', steps, output: {} };
        }

        if (stepResult.output) {
          context.variables[step.id] = { output: stepResult.output };
          context.variables[step.name] = { output: stepResult.output };
        }

        // Find next steps based on edges
        const outEdges = station.edges!.filter(e => e.source === stepId);

        if ((step.type === 'if-else' || step.type === 'ai-router') && stepResult.output?.branch) {
          const branch = stepResult.output.branch as string;
          const nextEdges = outEdges.filter(e => e.sourceHandle === branch);
          for (const edge of nextEdges) {
            if (!executed.has(edge.target)) queue.push(edge.target);
          }
          // Mark skipped branch steps
          const skippedEdges = outEdges.filter(e => e.sourceHandle !== branch);
          for (const edge of skippedEdges) {
            this.markBranchSkipped(edge.target, station, executed, steps, context);
          }
        } else {
          for (const edge of outEdges) {
            if (!executed.has(edge.target)) queue.push(edge.target);
          }
        }
      }
    } else {
      // Linear execution (backward compatible)
      for (const step of station.steps) {
        if (context.signal?.aborted) {
          return { status: 'failed', steps, output: {} };
        }

        const stepResult = await this.executeStep(step, context);
        steps.push(stepResult);

        context.steps[step.id] = stepResult;
        context.steps[step.name] = stepResult;

        if (stepResult.status === 'failed') {
          return { status: 'failed', steps, output: {} };
        }

        if (stepResult.output) {
          context.variables[step.id] = { output: stepResult.output };
          context.variables[step.name] = { output: stepResult.output };
        }
      }
    }

    const output = this.aggregateStationOutput(station, steps, context);
    return { status: 'completed', steps, output };
  }

  /**
   * Recursively mark steps in a skipped branch as 'skipped'
   */
  private static markBranchSkipped(
    stepId: string,
    station: Station,
    executed: Set<string>,
    steps: StepResult[],
    context: ExecutionContext
  ): void {
    if (executed.has(stepId)) return;
    executed.add(stepId);

    const step = station.steps.find(s => s.id === stepId);
    if (!step) return;

    const skippedResult: StepResult = {
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
      status: 'skipped',
    };
    steps.push(skippedResult);
    context.steps[step.id] = skippedResult;
    context.steps[step.name] = skippedResult;

    const downstreamEdges = (station.edges || []).filter(e => e.source === stepId);
    for (const edge of downstreamEdges) {
      this.markBranchSkipped(edge.target, station, executed, steps, context);
    }
  }

  /**
   * Execute a single step with retry logic, logging, and event emission.
   * Delegates the actual type-specific execution to StepExecutor.
   */
  private static async executeStep(step: Step, context: ExecutionContext): Promise<StepResult> {
    const resolvedInput = StepExecutor.resolveInputVariables(step, context.variables);

    const stepResult: StepResult = {
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
      status: 'running',
      startTime: new Date().toISOString(),
      input: resolvedInput
    };

    this.emitEvent(context, 'step:start', { stepId: step.id, stepName: step.name });

    let retryAttempts = 0;
    let currentInterval = step.retryPolicy?.initialInterval || 1000;
    const maxAttempts = step.retryPolicy?.maxAttempts || 1;

    while (retryAttempts < maxAttempts) {
      if (retryAttempts > 0) {
        this.log(context, 'warn', `Retrying step: ${step.name} (Attempt ${retryAttempts + 1}/${maxAttempts})`, undefined, undefined, step.id);
        await new Promise(resolve => setTimeout(resolve, currentInterval));
        currentInterval = Math.min(
          currentInterval * (step.retryPolicy?.backoffCoefficient || 2),
          step.retryPolicy?.maxInterval || 300000 // default 5m cap
        );
      }

      this.log(context, 'info', `Executing step: ${step.name}`, stepResult.input, undefined, step.id);

      try {
        const result = await StepExecutor.executeStepByType(
          step,
          { variables: context.variables, steps: context.steps, simulate: context.simulate },
          resolvedInput
        );

        // Log script output
        for (const log of result.logs) {
          this.log(context, 'debug', log, undefined, undefined, step.id);
        }

        if (result.success) {
          stepResult.status = 'completed';
          stepResult.output = result.output;
          this.log(context, 'info', `Step completed: ${step.name}`, result.output, undefined, step.id);
          break; // Exit retry loop
        } else {
          retryAttempts++;
          if (retryAttempts >= maxAttempts) {
            stepResult.status = 'failed';
            stepResult.error = { message: result.error || 'Unknown error' };
            this.log(context, 'error', `Step failed: ${step.name} - ${result.error}`, undefined, undefined, step.id);
          }
        }

      } catch (error: any) {
        retryAttempts++;
        if (retryAttempts >= maxAttempts) {
          stepResult.status = 'failed';
          stepResult.error = {
            message: error.message || String(error),
            stack: error.stack
          };
          this.log(context, 'error', `Step error: ${step.name} - ${error.message}`, undefined, undefined, step.id);
        }
      }
    }

    stepResult.endTime = new Date().toISOString();

    // Emit step completion/failure event
    if (stepResult.status === 'completed') {
      this.emitEvent(context, 'step:complete', { stepId: step.id, stepName: step.name, output: stepResult.output });
    } else if (stepResult.status === 'failed') {
      this.emitEvent(context, 'step:failed', { stepId: step.id, stepName: step.name, error: stepResult.error?.message });
    }

    return stepResult;
  }

  /**
   * Check if station should execute based on condition
   */
  private static shouldExecuteStation(station: Station, context: ExecutionContext): boolean {
    if (!station.condition) return true;

    switch (station.condition.type) {
      case 'always':
        return true;

      case 'previousSuccess':
        // Check if previous station completed successfully
        const stationResults = Object.values(context.stations);
        if (stationResults.length === 0) return true;
        const lastStation = stationResults[stationResults.length - 1];
        return lastStation.status === 'completed';

      case 'expression':
        if (!station.condition.expression) return true;
        return ScriptRunner.evaluateCondition(station.condition.expression, {
          ...context.variables,
          steps: context.steps
        });

      default:
        return true;
    }
  }

  /**
   * Aggregate all step outputs into station output
   */
  private static aggregateStationOutput(
    station: Station,
    stepResults: StepResult[],
    context: ExecutionContext
  ): Record<string, any> {
    return {
      allStepsCompleted: stepResults.every(s => s.status === 'completed'),
      stepCount: stepResults.length,
      completedCount: stepResults.filter(s => s.status === 'completed').length,
      stepResults: stepResults.map(s => ({
        stepId: s.stepId,
        stepName: s.stepName,
        status: s.status,
        output: s.output
      }))
    };
  }

  /**
   * Create a skipped station result
   */
  private static createSkippedStationResult(station: Station): StationResult {
    return {
      stationId: station.id,
      stationName: station.name,
      status: 'skipped',
      steps: station.steps.map(step => ({
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        status: 'skipped'
      }))
    };
  }

  /**
   * Emit a real-time execution event via the event bus
   */
  private static emitEvent(context: ExecutionContext, type: ExecutionEvent['type'], data: Partial<ExecutionEvent['data']> = {}): void {
    executionEventBus.emitExecutionEvent({
      executionId: context.executionId,
      type,
      data: {
        timestamp: new Date().toISOString(),
        ...data,
      },
    });
  }

  /**
   * Add log entry
   */
  private static log(
    context: ExecutionContext,
    level: ExecutionLog['level'],
    message: string,
    data?: any,
    stationId?: string,
    stepId?: string
  ): void {
    context.logs.push({
      executionId: context.executionId,
      stationId,
      stepId,
      level,
      message,
      data
    });
  }
}

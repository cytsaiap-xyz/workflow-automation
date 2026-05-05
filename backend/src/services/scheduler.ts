import cron, { ScheduledTask } from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import { WorkflowModel } from '../models/workflow';
import { ExecutionEngine } from './executionEngine';
import { createLogger } from '../utils/logger';
import type { Workflow, Execution } from '../types/workflow';
import { isV2 } from '../types/dag';

const log = createLogger('scheduler');

interface ScheduledWorkflow {
  workflowId: string;
  workflowName: string;
  cronExpression: string;
  task: ScheduledTask;
  isActive: boolean;
  nextRun?: Date;
  lastRun?: Date;
  lastExecution?: Execution;
}

class SchedulerService {
  private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize the scheduler and load all active scheduled workflows
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.info('Already initialized');
      return;
    }

    log.info('Initializing scheduler service...');

    try {
      const workflows = await WorkflowModel.getAll();
      let scheduledCount = 0;

      for (const workflow of workflows) {
        if (workflow.status !== 'active') continue;

        const cronStep = this.findCronTrigger(workflow);
        if (cronStep && cronStep.config.cronExpression) {
          await this.scheduleWorkflow(workflow, cronStep.config.cronExpression);
          scheduledCount++;
        }
      }

      this.isInitialized = true;
      log.info('Initialized with %d scheduled workflow(s)', scheduledCount);
    } catch (error) {
      log.error('Failed to initialize: %s', error);
      throw error;
    }
  }

  /**
   * Schedule a workflow to run on a cron expression
   */
  async scheduleWorkflow(workflow: Workflow, cronExpression: string): Promise<boolean> {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      log.error('Invalid cron expression: %s', cronExpression);
      return false;
    }

    // Stop existing schedule if any
    this.unscheduleWorkflow(workflow.id);

    log.info('Scheduling workflow "%s" with cron: %s', workflow.name, cronExpression);

    const task = cron.schedule(cronExpression, async () => {
      log.info('Executing scheduled workflow: %s', workflow.name);

      const scheduled = this.scheduledWorkflows.get(workflow.id);
      if (scheduled) {
        scheduled.lastRun = new Date();
      }

      try {
        // Re-fetch the workflow in case it was updated
        const latestWorkflow = await WorkflowModel.getById(workflow.id);
        if (!latestWorkflow) {
          log.error('Workflow %s not found', workflow.id);
          return;
        }

        if (latestWorkflow.status !== 'active') {
          log.info('Workflow %s is not active, skipping', workflow.name);
          return;
        }

        const execution = await ExecutionEngine.execute(latestWorkflow, 'schedule');

        if (scheduled) {
          scheduled.lastExecution = execution;
        }

        log.info('Workflow "%s" completed with status: %s', workflow.name, execution.status);
      } catch (error) {
        log.error('Failed to execute workflow "%s": %s', workflow.name, error);
      }
    }, {
      timezone: 'Asia/Taipei',
    });

    this.scheduledWorkflows.set(workflow.id, {
      workflowId: workflow.id,
      workflowName: workflow.name,
      cronExpression,
      task,
      isActive: true,
      nextRun: this.getNextRunDate(cronExpression),
    });

    return true;
  }

  /**
   * Unschedule a workflow
   */
  unscheduleWorkflow(workflowId: string): boolean {
    const scheduled = this.scheduledWorkflows.get(workflowId);
    if (!scheduled) {
      return false;
    }

    scheduled.task.stop();
    this.scheduledWorkflows.delete(workflowId);
    log.info('Unscheduled workflow: %s', scheduled.workflowName);
    return true;
  }

  /**
   * Pause a scheduled workflow
   */
  pauseWorkflow(workflowId: string): boolean {
    const scheduled = this.scheduledWorkflows.get(workflowId);
    if (!scheduled) {
      return false;
    }

    scheduled.task.stop();
    scheduled.isActive = false;
    log.info('Paused workflow: %s', scheduled.workflowName);
    return true;
  }

  /**
   * Resume a paused workflow
   */
  resumeWorkflow(workflowId: string): boolean {
    const scheduled = this.scheduledWorkflows.get(workflowId);
    if (!scheduled) {
      return false;
    }

    scheduled.task.start();
    scheduled.isActive = true;
    scheduled.nextRun = this.getNextRunDate(scheduled.cronExpression);
    log.info('Resumed workflow: %s', scheduled.workflowName);
    return true;
  }

  /**
   * Get all scheduled workflows
   */
  getScheduledWorkflows(): Array<Omit<ScheduledWorkflow, 'task'>> {
    return Array.from(this.scheduledWorkflows.values()).map(({ task, ...rest }) => rest);
  }

  /**
   * Get a specific scheduled workflow
   */
  getScheduledWorkflow(workflowId: string): Omit<ScheduledWorkflow, 'task'> | null {
    const scheduled = this.scheduledWorkflows.get(workflowId);
    if (!scheduled) return null;

    const { task, ...rest } = scheduled;
    return rest;
  }

  /**
   * Find the cron trigger step in a workflow
   */
  private findCronTrigger(workflow: Workflow): { config: { cronExpression?: string } } | null {
    const def = workflow.definition as any;
    const allSteps: any[] = isV2(def)
      ? (def.nodes as any[])
      : (def.stations as any[]).flatMap((s: any) => s.steps as any[]);
    for (const step of allSteps) {
      if (step.type === 'trigger-cron') {
        return step;
      }
    }
    return null;
  }

  /**
   * Calculate the next run date for a cron expression
   */
  private getNextRunDate(cronExpression: string): Date | undefined {
    try {
      const interval = CronExpressionParser.parse(cronExpression, {
        tz: 'Asia/Taipei'
      });
      return interval.next().toDate();
    } catch {
      return undefined;
    }
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    log.info('Shutting down...');
    for (const [id, scheduled] of this.scheduledWorkflows) {
      scheduled.task.stop();
    }
    this.scheduledWorkflows.clear();
    this.isInitialized = false;
    log.info('Shutdown complete');
  }
}

// Export singleton instance
export const scheduler = new SchedulerService();

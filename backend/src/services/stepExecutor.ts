import { Step } from '../types/workflow';
import { ScriptRunner, ScriptResult } from './scriptRunner';
import { DbConnectorService } from './dbConnector';
import { AiExecutor } from './aiExecutor';
import nodemailer from 'nodemailer';

// Initialize email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface StepExecutionContext {
  variables: Record<string, any>;
  steps: Record<string, any>;
  simulate: boolean;
}

export class StepExecutor {
  /**
   * Resolve input variables for a step using its inputVars mappings
   */
  static resolveInputVariables(step: Step, variables: Record<string, any>): Record<string, any> {
    const input: Record<string, any> = {};

    if (step.inputVars) {
      for (const mapping of step.inputVars) {
        const value = ScriptRunner.interpolateVariables(mapping.source, variables);
        try {
          input[mapping.name] = JSON.parse(value);
        } catch {
          input[mapping.name] = value;
        }
      }
    }

    return input;
  }

  /**
   * Execute a step by its type. Handles the dispatch to the appropriate runner
   * and returns a ScriptResult. Does not handle retries, logging, or event emission.
   */
  static async executeStepByType(
    step: Step,
    context: StepExecutionContext,
    resolvedInput: Record<string, any>
  ): Promise<ScriptResult> {
    switch (step.type) {
      case 'script-js':
        return ScriptRunner.executeJS(
          step.config.code || '',
          {
            variables: context.variables,
            inputData: resolvedInput,
            steps: context.steps
          },
          step.timeout || 30000
        );

      case 'script-python':
        return ScriptRunner.executePython(
          step.config.code || '',
          {
            variables: context.variables,
            inputData: resolvedInput,
            steps: context.steps
          },
          step.timeout || 30000
        );

      case 'http-request': {
        const method = (step.config.method || 'GET').toUpperCase();
        if (context.simulate && method !== 'GET') {
          return {
            success: true,
            output: { simulated: true, status: 200, statusText: 'OK (simulated)', data: null },
            logs: [`[SIMULATE] HTTP ${method} request skipped to prevent side effects`]
          };
        }
        return ScriptRunner.executeHttpRequest(
          step.config,
          { ...context.variables, inputData: resolvedInput }
        );
      }

      case 'wait': {
        const duration = step.config.duration || 0;
        const unit = step.config.unit || 'seconds';
        const multiplier = unit === 'hours' ? 3600000 : unit === 'minutes' ? 60000 : 1000;
        const waitMs = duration * multiplier;
        if (!context.simulate) {
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        return {
          success: true,
          output: { waited: !context.simulate, simulated: context.simulate, duration, unit, ms: waitMs },
          logs: [context.simulate ? `[SIMULATE] Wait skipped (${duration} ${unit})` : `Waited for ${duration} ${unit}`]
        };
      }

      case 'if-else': {
        const condition = step.config.condition || 'true';
        const conditionResult = ScriptRunner.evaluateCondition(condition, {
          ...context.variables,
          inputData: resolvedInput
        });
        return {
          success: true,
          output: { result: conditionResult, branch: conditionResult ? 'true' : 'false' },
          logs: [`Condition evaluated to: ${conditionResult}`]
        };
      }

      case 'set-variable': {
        const varName = step.config.variableName || 'variable';
        const varValue = ScriptRunner.interpolateVariables(
          step.config.variableValue || '',
          { ...context.variables, inputData: resolvedInput }
        );
        context.variables[varName] = varValue;
        return {
          success: true,
          output: { [varName]: varValue },
          logs: [`Set variable ${varName} = ${varValue}`]
        };
      }

      case 'trigger-manual':
      case 'trigger-cron':
      case 'trigger-webhook':
        return {
          success: true,
          output: { triggered: true, timestamp: new Date().toISOString() },
          logs: [`Trigger ${step.type} activated`]
        };

      case 'notification-slack':
      case 'action-slack': {
        const slackUrl = ScriptRunner.interpolateVariables(step.config.slackWebhookUrl || '', { ...context.variables, inputData: resolvedInput });
        const slackMsg = ScriptRunner.interpolateVariables(step.config.slackMessage || '', { ...context.variables, inputData: resolvedInput });

        if (context.simulate) {
          return {
            success: true,
            output: { simulated: true, sent: false, message: slackMsg },
            logs: ['[SIMULATE] Slack message skipped']
          };
        }
        return ScriptRunner.executeHttpRequest(
          {
            url: slackUrl,
            method: 'POST',
            body: JSON.stringify({ text: slackMsg })
          },
          { ...context.variables, inputData: resolvedInput }
        );
      }

      case 'action-email': {
        const to = ScriptRunner.interpolateVariables(step.config.emailTo || '', { ...context.variables, inputData: resolvedInput });
        const subject = ScriptRunner.interpolateVariables(step.config.emailSubject || '', { ...context.variables, inputData: resolvedInput });
        const emailBody = ScriptRunner.interpolateVariables(step.config.emailBody || '', { ...context.variables, inputData: resolvedInput });

        if (context.simulate) {
          return {
            success: true,
            output: { simulated: true, sent: false, to, subject, timestamp: new Date().toISOString() },
            logs: [`[SIMULATE] Email to ${to} skipped`]
          };
        }

        try {
          const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Workflow Automation" <no-reply@localhost>',
            to,
            subject,
            text: emailBody,
          });

          return {
            success: true,
            output: { sent: true, to, subject, messageId: info.messageId, timestamp: new Date().toISOString() },
            logs: [`Email successfully sent to ${to} (MessageId: ${info.messageId})`]
          };
        } catch (err: any) {
          return {
            success: false,
            error: `Failed to send email: ${err.message}`,
            output: { sent: false, to, subject, timestamp: new Date().toISOString() },
            logs: [`Email sending failed: ${err.message}`]
          };
        }
      }

      case 'connector-db': {
        const dbQuery = ScriptRunner.interpolateVariables(
          step.config.dbQuery || '',
          { ...context.variables, inputData: resolvedInput }
        );

        if (context.simulate) {
          return {
            success: true,
            output: { simulated: true, rows: [], count: 0 },
            logs: [`[SIMULATE] Database query skipped`]
          };
        }

        try {
          const rows = await DbConnectorService.executeQuery(step.config, dbQuery);
          return {
            success: true,
            output: { rows, count: rows.length },
            logs: [`Query executed successfully, returned ${rows.length} rows`]
          };
        } catch (err: any) {
          return {
            success: false,
            error: `Database connection or query failed: ${err.message}`,
            output: { error: err.message },
            logs: [`Database error: ${err.message}`]
          };
        }
      }

      case 'ai-prompt': {
        if (context.simulate) {
          const prompt = ScriptRunner.interpolateVariables(step.config.aiPrompt || '', { ...context.variables, inputData: resolvedInput });
          return {
            success: true,
            output: { simulated: true, prompt, model: step.config.aiModel },
            logs: ['[SIMULATE] AI Prompt skipped']
          };
        }
        return AiExecutor.executePrompt(step.config, { ...context.variables, inputData: resolvedInput });
      }

      case 'ai-structured-output': {
        if (context.simulate) {
          const prompt = ScriptRunner.interpolateVariables(step.config.aiPrompt || '', { ...context.variables, inputData: resolvedInput });
          return {
            success: true,
            output: { simulated: true, prompt, model: step.config.aiModel, schema: step.config.aiOutputSchema },
            logs: ['[SIMULATE] AI Structured Output skipped']
          };
        }
        return AiExecutor.executeStructuredOutput(step.config, { ...context.variables, inputData: resolvedInput });
      }

      case 'ai-agent': {
        if (context.simulate) {
          const prompt = ScriptRunner.interpolateVariables(step.config.aiPrompt || '', { ...context.variables, inputData: resolvedInput });
          return {
            success: true,
            output: { simulated: true, prompt, model: step.config.aiModel, tools: step.config.aiTools?.length || 0 },
            logs: ['[SIMULATE] AI Agent skipped']
          };
        }
        return AiExecutor.executeAgent(step.config, { ...context.variables, inputData: resolvedInput });
      }

      case 'ai-router': {
        if (context.simulate) {
          const routes = step.config.aiRoutes || [];
          const firstBranch = routes[0]?.branchId || 'default';
          return {
            success: true,
            output: { simulated: true, branch: firstBranch, reasoning: 'Simulated: using first route', allRoutes: routes.map(r => r.branchId) },
            logs: ['[SIMULATE] AI Router skipped, using first route']
          };
        }
        return AiExecutor.executeRouter(step.config, { ...context.variables, inputData: resolvedInput });
      }

      case 'load-document': {
        const sourcePath = ScriptRunner.interpolateVariables(
          step.config.loadDocumentSourcePath || '',
          { ...context.variables, inputData: resolvedInput }
        );
        if (!sourcePath) {
          return { success: false, error: 'load-document: source path is empty', logs: [] };
        }
        const { loadDocument } = await import('./documentLoader');
        try {
          const executionId = context.variables.executionId || 'unknown';
          const chunks = await loadDocument(sourcePath, {
            executionId,
            maxChunkChars: step.config.loadDocumentMaxChunkChars,
          });
          return {
            success: true,
            output: { chunks, count: chunks.length },
            logs: [`Loaded ${chunks.length} chunk(s) from ${sourcePath}`],
          };
        } catch (e: any) {
          return { success: false, error: `load-document failed: ${e.message}`, logs: [] };
        }
      }

      case 'transform': {
        const { transform } = await import('./transformer');
        try {
          const mapping = step.config.transformMapping || {};
          const out = transform(
            { ...context.variables, inputData: resolvedInput },
            { mapping },
          );
          return {
            success: true,
            output: out,
            logs: [`transform produced ${Object.keys(out).length} field(s)`],
          };
        } catch (e: any) {
          return { success: false, error: `transform failed: ${e.message}`, logs: [] };
        }
      }

      case 'aggregate': {
        const { aggregate } = await import('./aggregator');
        try {
          const path = step.config.aggregateInputPath?.trim() || 'items';
          // dot-path into resolvedInput; allow a top-level direct array via empty string.
          const arr = path
            ? path.split('.').reduce<any>((acc, p) => acc?.[p], resolvedInput)
            : resolvedInput;
          const out = aggregate(arr, {
            operation: step.config.aggregateOperation || 'count',
            field: step.config.aggregateField,
            separator: step.config.aggregateSeparator,
          });
          return {
            success: true,
            output: out,
            logs: [`aggregate ${step.config.aggregateOperation || 'count'} over ${out.count} item(s)`],
          };
        } catch (e: any) {
          return { success: false, error: `aggregate failed: ${e.message}`, logs: [] };
        }
      }

      case 'json-output-writer': {
        const { writeJsonOutput } = await import('./jsonOutputWriter');
        try {
          const rootKey = step.config.jsonOutputRootKey?.trim();
          const body = rootKey ? resolvedInput[rootKey] : resolvedInput;
          const out = await writeJsonOutput(body, {
            executionId: context.variables.executionId || 'unknown',
            directory: step.config.jsonOutputDirectory,
            filename: step.config.jsonOutputFilename,
            pretty: step.config.jsonOutputPretty,
          });
          return {
            success: true,
            output: { filePath: out.filePath },
            logs: [`Wrote JSON to ${out.filePath}`],
          };
        } catch (e: any) {
          return { success: false, error: `json-output-writer failed: ${e.message}`, logs: [] };
        }
      }

      case 'quiz-output-writer': {
        const { writeQuizOutput } = await import('./quizOutputWriter');
        try {
          const out = await writeQuizOutput(
            {
              questions: resolvedInput.questions,
              sourceFile: resolvedInput.sourceFile,
              focusArea: resolvedInput.focusArea,
            },
            {
              executionId: context.variables.executionId || 'unknown',
              directory: step.config.quizOutputDirectory,
              filename: step.config.quizOutputFilename,
            }
          );
          return {
            success: true,
            output: { filePath: out.filePath, json: out.json },
            logs: [`Wrote quiz JSON to ${out.filePath}`],
          };
        } catch (e: any) {
          return { success: false, error: `quiz-output-writer failed: ${e.message}`, logs: [] };
        }
      }

      default:
        return {
          success: false,
          error: `Unknown step type: ${step.type}`,
          logs: []
        };
    }
  }
}

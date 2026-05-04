import { WorkflowModel } from '../models/workflow';
import { ExecutionModel, LogModel } from '../models/execution';
import { PromptTemplateModel } from '../models/promptTemplateModel';
import { PendingChangeModel } from '../models/pendingChangeModel';
import { applyDiff } from './diffApplier';
import { WorkflowDiff } from '../types/assistant';

export interface ToolContext {
  conversationId: string;
  workflowId: string;
}

const NODE_DOCS: Record<string, string> = {
  'ai-prompt': 'Calls the configured LLM with a free-form prompt and returns the response text (parsed as JSON when possible).',
  'ai-structured-output': 'Calls the LLM with a JSON schema and returns parsed structured output.',
  'ai-agent': 'Agentic tool-call loop driven by the LLM until done or max iterations.',
  'ai-router': 'LLM-based multi-branch router; chooses one of the named branches.',
  'load-document': 'Reads a PDF/PPTX/TXT file. Output: { chunks: [{ pageId, text, imagePath }] }.',
  'quiz-output-writer': 'Writes the assembled quiz JSON to data/uploads/<execution-id>/quiz.json.',
  'script-js': 'Executes JavaScript in a sandboxed VM (no setTimeout, no fetch, no require).',
  'script-python': 'Executes Python in a child subprocess (input via stdin, output via stdout).',
  'http-request': 'Outbound HTTP. URL must be on the HTTP_ALLOWLIST.',
  'if-else': 'Boolean condition, routes to true/false branch.',
  'set-variable': 'Sets a named workflow variable.',
  'wait': 'Sleeps for a configurable duration.',
};

const STEP_TYPES = [
  'trigger-manual', 'trigger-cron', 'trigger-webhook',
  'script-js', 'script-python', 'http-request', 'if-else', 'set-variable', 'wait',
  'notification-slack', 'action-email', 'action-slack', 'connector-db',
  'ai-prompt', 'ai-structured-output', 'ai-agent', 'ai-router',
  'load-document', 'quiz-output-writer',
];

export const ASSISTANT_TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_workflow',
      description: 'Read the current workflow definition.',
      parameters: {
        type: 'object', required: ['workflow_id'],
        properties: { workflow_id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_node_types',
      description: 'List all available step types and their config descriptions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_docs',
      description: 'Get documentation for a single step type.',
      parameters: {
        type: 'object', required: ['type'],
        properties: { type: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prompt_library',
      description: 'List prompt templates, optionally filtered by tag or role.',
      parameters: {
        type: 'object',
        properties: { tag: { type: 'string' }, role: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_execution',
      description: 'Read an execution record by id.',
      parameters: {
        type: 'object', required: ['execution_id'],
        properties: { execution_id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_execution_logs',
      description: 'Read log entries for an execution.',
      parameters: {
        type: 'object', required: ['execution_id'],
        properties: {
          execution_id: { type: 'string' },
          level: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_output',
      description: 'Read the recorded output of a single step in an execution.',
      parameters: {
        type: 'object', required: ['execution_id', 'step_id'],
        properties: {
          execution_id: { type: 'string' },
          step_id: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_workflow_change',
      description: 'Propose a workflow diff. Returns a change_id; the user must Apply it via UI.',
      parameters: {
        type: 'object', required: ['workflow_id', 'diff'],
        properties: {
          workflow_id: { type: 'string' },
          diff: { type: 'array', items: { type: 'object' } },
          rationale: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_node_prompt',
      description: 'Directly write a prompt to a single AI node (low-stakes; applied immediately).',
      parameters: {
        type: 'object', required: ['workflow_id', 'node_id', 'role', 'prompt'],
        properties: {
          workflow_id: { type: 'string' },
          node_id: { type: 'string' },
          role: { type: 'string', enum: ['system', 'user'] },
          prompt: { type: 'string' },
        },
      },
    },
  },
] as const;

export async function dispatchTool(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<any> {
  switch (name) {
    case 'get_workflow': {
      const w = WorkflowModel.getById(args.workflow_id as string);
      if (!w) throw new Error('workflow not found');
      return w;
    }
    case 'list_node_types': {
      return STEP_TYPES.map(t => ({
        type: t,
        description: NODE_DOCS[t] ?? `(no detailed documentation; type: ${t})`,
      }));
    }
    case 'get_node_docs': {
      const t = args.type as string;
      return { type: t, doc: NODE_DOCS[t] ?? '(no detailed documentation)' };
    }
    case 'get_prompt_library': {
      let list = PromptTemplateModel.getAll();
      if (args.tag) list = list.filter(tmpl => tmpl.tags.includes(args.tag as string));
      if (args.role) list = list.filter(tmpl => tmpl.role === args.role);
      return list;
    }
    case 'get_execution': {
      const ex = ExecutionModel.getById(args.execution_id as string);
      if (!ex) throw new Error('execution not found');
      return ex;
    }
    case 'get_execution_logs': {
      let logs = LogModel.getByExecutionId(args.execution_id as string);
      if (args.level) logs = logs.filter(l => l.level === args.level);
      return logs;
    }
    case 'get_node_output': {
      const ex = ExecutionModel.getById(args.execution_id as string);
      if (!ex || !ex.result) throw new Error('execution or result not found');
      for (const station of ex.result.stations) {
        for (const step of station.steps) {
          if (step.stepId === args.step_id) return step.output;
        }
      }
      throw new Error('step not found in execution');
    }
    case 'propose_workflow_change': {
      const wf = WorkflowModel.getById(args.workflow_id as string);
      if (!wf) throw new Error('workflow not found');
      // Validate the diff applies (throws if invalid target).
      applyDiff(wf.definition, args.diff as WorkflowDiff[]);
      const change = PendingChangeModel.create({
        conversationId: ctx.conversationId,
        workflowId: args.workflow_id as string,
        diff: args.diff as WorkflowDiff[],
        rationale: args.rationale as string | undefined,
      });
      return { change_id: change.id, status: 'pending' };
    }
    case 'set_node_prompt': {
      const wf = WorkflowModel.getById(args.workflow_id as string);
      if (!wf) throw new Error('workflow not found');
      let mutated = false;
      for (const station of wf.definition.stations) {
        for (const step of station.steps) {
          if (step.id === args.node_id) {
            if (args.role === 'system') {
              step.config.aiSystemPrompt = args.prompt as string;
            } else {
              step.config.aiPrompt = args.prompt as string;
            }
            mutated = true;
          }
        }
      }
      if (!mutated) throw new Error('node not found');
      WorkflowModel.update(args.workflow_id as string, { definition: wf.definition });
      return { ok: true };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

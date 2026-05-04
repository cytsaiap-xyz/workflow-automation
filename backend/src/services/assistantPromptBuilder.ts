import { ASSISTANT_TOOL_SCHEMAS } from './assistantTools';

interface Options {
  surface: 'panel' | 'node-popover';
  nodeId?: string;
}

export function buildAssistantSystemPrompt(opts: Options): string {
  const tools = ASSISTANT_TOOL_SCHEMAS.map((t: any) =>
    `- ${t.function.name}: ${t.function.description}`
  ).join('\n');

  const surfaceGuidance = opts.surface === 'node-popover'
    ? `You are in node-popover mode. Focus narrowly on node "${opts.nodeId}". Prefer set_node_prompt for prompt edits. Do not propose whole-workflow changes.`
    : `You are in panel mode. You may scaffold workflows, explain workflows, debug failures, and propose changes via propose_workflow_change.`;

  return [
    'You are an offline workflow-building helper for a visual automation platform.',
    'The platform runs entirely on a local multi-modal vLLM server with no external internet access except via an explicit allowlist.',
    'Slack/email nodes are hidden by default in offline mode.',
    surfaceGuidance,
    'When asked to build or modify a workflow, prefer existing templates from get_prompt_library and produce propose_workflow_change with a clear rationale.',
    'When asked to explain a workflow, fetch it first with get_workflow.',
    'When asked about a failed run, fetch get_execution + get_execution_logs first; do not speculate without reading them.',
    'Tools available:',
    tools,
  ].join('\n\n');
}

// Shared types between frontend and backend

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused';
  // definition may be v1 (WorkflowDefinition) or v2 (WorkflowDefinitionV2).
  // Use isV2(workflow.definition) to narrow. Typed as WorkflowDefinition for
  // backward compatibility; v2 workflows carry schemaVersion at runtime.
  definition: WorkflowDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinition {
  stations: Station[];
  variables?: Record<string, any>;
  inputParameters?: InputParameter[];
}

// ---- DAG / v2 types ----

export interface DagNode {
  id: string;
  name: string;
  type: StepType;
  position: { x: number; y: number };
  config: StepConfig;
  inputVars?: VariableMapping[];
  outputVars?: VariableDefinition[];
  timeout?: number;
  retryPolicy?: {
    maxAttempts: number;
    initialInterval: number;
    backoffCoefficient?: number;
    maxInterval?: number;
  };
  fanOut?: {
    enabled: boolean;
    inputArrayPath: string;
  };
  errorPolicy?: {
    onError: 'stop' | 'continue' | 'retry';
    retryCount?: number;
    errorBranch?: string;
  };
}

export interface DagEdge {
  id: string;
  source: string;
  sourcePort?: string;
  target: string;
  targetPort?: string;
  when?: string;
  mergeMode?: 'all' | 'any';
}

export interface WorkflowDefinitionV2 {
  schemaVersion: 2;
  inputParameters?: InputParameter[];
  variables?: Record<string, any>;
  nodes: DagNode[];
  edges: DagEdge[];
}

// Runtime guard for v2 DAG workflow definitions.
// We accept WorkflowDefinition (the typed baseline) and assert WorkflowDefinitionV2
// via an intermediate unknown cast because the two types are structurally disjoint.
export function isV2(
  def: WorkflowDefinition,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): def is WorkflowDefinition & WorkflowDefinitionV2 {
  return (def as unknown as WorkflowDefinitionV2).schemaVersion === 2;
}

export interface InputParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'file';
  description?: string;
  defaultValue?: any;
  required?: boolean;
  accept?: string;
}

export interface Station {
  id: string;
  name: string;
  description?: string;
  steps: Step[];
  position: { x: number; y: number };
  condition?: StationCondition;
  iterator?: {
    enabled: boolean;
    sourceVariable: string;
    itemVariableName: string;
  };
  edges?: StationEdge[];
}

export interface StationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface StationCondition {
  type: 'always' | 'expression' | 'previousSuccess';
  expression?: string;
}

export interface Step {
  id: string;
  name: string;
  type: StepType;
  config: StepConfig;
  position: { x: number; y: number };
  inputVars?: VariableMapping[];
  outputVars?: VariableDefinition[];
  timeout?: number;
  retryPolicy?: {
    maxAttempts: number;
    initialInterval: number;
    backoffCoefficient: number;
    maxInterval?: number;
  };
}

export type StepType = 
  | 'trigger-manual'
  | 'trigger-cron'
  | 'script-js'
  | 'script-python'
  | 'http-request'
  | 'if-else'
  | 'set-variable'
  | 'wait'
  | 'trigger-webhook'
  | 'action-email'
  | 'action-slack'
  | 'connector-db'
  | 'ai-prompt'
  | 'ai-structured-output'
  | 'ai-agent'
  | 'ai-router'
  | 'load-document'
  | 'quiz-output-writer'
  | 'json-output-writer'
  | 'aggregate'
  | 'transform';

export interface StepConfig {
  code?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  condition?: string;
  variableName?: string;
  variableValue?: string;
  cronExpression?: string;
  duration?: number;
  unit?: 'seconds' | 'minutes' | 'hours';
  webhookMethod?: 'GET' | 'POST' | 'PUT';
  // Email fields
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  smtpHost?: string;
  smtpPort?: number;
  // Slack fields
  slackWebhookUrl?: string;
  slackMessage?: string;
  // Database connector fields
  dbType?: 'postgres' | 'mysql';
  dbHost?: string;
  dbPort?: number;
  dbName?: string;
  dbUser?: string;
  dbPassword?: string;
  dbQuery?: string;
  // AI fields
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiPrompt?: string;
  aiSystemPrompt?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  aiHeaders?: Record<string, string>;
  aiOutputSchema?: Record<string, any>;
  aiTools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, any> } }>;
  aiMaxIterations?: number;
  aiRoutes?: Array<{ branchId: string; description: string }>;
  // load-document
  loadDocumentSourcePath?: string;
  loadDocumentMaxChunkChars?: number;
  // quiz-output-writer
  quizOutputDirectory?: string;
  quizOutputFilename?: string;
  // json-output-writer
  jsonOutputDirectory?: string;
  jsonOutputFilename?: string;
  jsonOutputRootKey?: string;
  jsonOutputPretty?: boolean;
  // aggregate
  aggregateInputPath?: string;
  aggregateOperation?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'flatten' | 'group-by' | 'pick' | 'concat';
  aggregateField?: string;
  aggregateSeparator?: string;
  // transform
  transformMapping?: Record<string, string>;
}

export interface VariableMapping {
  name: string;
  source: string;
}

export interface VariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  triggeredBy: 'manual' | 'schedule' | 'webhook' | 'api';
  startTime: string;
  endTime?: string;
  successRate: number;
  result?: ExecutionResult;
}

export interface ExecutionResult {
  stations: StationResult[];
  error?: ErrorInfo;
}

export interface StationResult {
  stationId: string;
  stationName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  endTime?: string;
  steps: StepResult[];
  output?: Record<string, any>;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  stepType: StepType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  endTime?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: ErrorInfo;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  code?: string;
}

export interface ExecutionLog {
  id: string;
  executionId: string;
  stationId?: string;
  stepId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ExecutionEvent {
  executionId: string;
  type: 'step:start' | 'step:complete' | 'step:failed'
      | 'station:start' | 'station:complete' | 'station:failed'
      | 'execution:complete' | 'execution:failed' | 'execution:cancelled';
  data: {
    stationId?: string;
    stationName?: string;
    stepId?: string;
    stepName?: string;
    status?: string;
    output?: any;
    error?: string;
    progress?: { completed: number; total: number };
    timestamp: string;
  };
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  definition: WorkflowDefinition;
  changeSummary?: string;
  createdAt: string;
}

// Node types for React Flow
export interface NodeData {
  step: Step;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export const STEP_TYPE_INFO: Record<StepType, { label: string; icon: string; color: string }> = {
  'trigger-manual': { label: 'Manual Trigger', icon: '🔘', color: '#22c55e' },
  'trigger-cron': { label: 'Cron Trigger', icon: '⏰', color: '#22c55e' },
  'script-js': { label: 'JavaScript', icon: '📜', color: '#f59e0b' },
  'script-python': { label: 'Python', icon: '🐍', color: '#3b82f6' },
  'http-request': { label: 'HTTP Request', icon: '🔗', color: '#8b5cf6' },
  'if-else': { label: 'If/Else', icon: '🔀', color: '#ec4899' },
  'set-variable': { label: 'Set Variable', icon: '📝', color: '#6366f1' },
  'wait': { label: 'Wait', icon: '⏳', color: '#64748b' },
  'trigger-webhook': { label: 'Webhook Trigger', icon: '⚡', color: '#22c55e' },
  'action-email': { label: 'Send Email', icon: '📧', color: '#3b82f6' },
  'action-slack': { label: 'Slack Message', icon: '💬', color: '#4a154b' },
  'connector-db': { label: 'Database Query', icon: '🗄️', color: '#0ea5e9' },
  'ai-prompt': { label: 'AI Prompt', icon: '🤖', color: '#8b5cf6' },
  'ai-structured-output': { label: 'AI Structured Output', icon: '📋', color: '#6366f1' },
  'ai-agent': { label: 'AI Agent', icon: '🧠', color: '#a855f7' },
  'ai-router': { label: 'AI Router', icon: '🔀', color: '#7c3aed' },
  'load-document': { label: 'Load Document', icon: '📄', color: '#0ea5e9' },
  'quiz-output-writer': { label: 'Quiz Output Writer', icon: '📝', color: '#10b981' },
  'json-output-writer': { label: 'JSON Output Writer', icon: '💾', color: '#10b981' },
  'aggregate': { label: 'Aggregate', icon: '📊', color: '#0891b2' },
  'transform': { label: 'Transform', icon: '🔄', color: '#0891b2' },
};

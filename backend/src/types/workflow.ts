// Workflow Types

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused';
  definition: WorkflowDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinition {
  stations: Station[];
  variables?: Record<string, any>;
  inputParameters?: InputParameter[];
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
  iterator?: StationIterator;
  edges?: StationEdge[];
}

export interface StationEdge {
  id: string;
  source: string;      // source step ID
  target: string;      // target step ID
  sourceHandle?: string; // 'true' | 'false' for if-else branches
}

export interface StationIterator {
  enabled: boolean;
  sourceVariable: string;
  itemVariableName?: string;
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
  retryPolicy?: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialInterval: number;
  backoffCoefficient?: number;
  maxInterval?: number;
}

export type StepType =
  | 'trigger-manual'
  | 'trigger-cron'
  | 'trigger-webhook'
  | 'script-js'
  | 'script-python'
  | 'http-request'
  | 'if-else'
  | 'set-variable'
  | 'wait'
  | 'notification-slack'
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
  | 'transform'
  | 'ai-loop';

export interface StepConfig {
  // Script nodes
  code?: string;
  
  // HTTP Request
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  
  // If/Else
  condition?: string;
  
  // Set Variable
  variableName?: string;
  variableValue?: string;
  
  // Cron
  cronExpression?: string;
  
  // Webhook Trigger
  webhookMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'any';
  
  // Wait Node
  duration?: number;
  unit?: 'seconds' | 'minutes' | 'hours';
  
  // Email Notification
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  
  // Slack Notification
  slackWebhookUrl?: string;
  slackMessage?: string;
  
  // DB Connector
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

  // Provider / template references (Spec 1)
  aiProviderId?: string;
  aiPromptTemplateSystemId?: string;
  aiPromptTemplateUserId?: string;

  // load-document step
  loadDocumentSourcePath?: string;
  loadDocumentMaxChunkChars?: number;

  // quiz-output-writer step
  quizOutputDirectory?: string;
  quizOutputFilename?: string;

  // json-output-writer step — generic JSON file writer. Serializes the node's
  // resolved inputVars (or a single named root) to a file under the uploads dir.
  jsonOutputDirectory?: string;
  jsonOutputFilename?: string;
  jsonOutputRootKey?: string;  // if set, writes inputData[rootKey] instead of the whole inputData
  jsonOutputPretty?: boolean;  // default true (2-space indented)

  // aggregate step — collapses an input array via a chosen operation.
  aggregateInputPath?: string;  // dot-path into inputData; default 'items' (matches fan-out output)
  aggregateOperation?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'flatten' | 'group-by' | 'pick' | 'concat';
  aggregateField?: string;      // dot-path into each item, required for sum/avg/min/max/group-by/pick
  aggregateSeparator?: string;  // used by concat (default '')

  // transform step — declarative JSON shaper. Each output key maps to a
  // `${path}`-interpolated source expression, resolved against the same
  // context inputVars uses.
  transformMapping?: Record<string, string>;

  // ai-loop step — sequenced-template loop. Each round runs every inner step
  // in order; the loop exits early when all earlyExitWhen expressions are truthy.
  aiLoopRounds?: number;
  aiLoopSteps?: Array<{
    id: string;
    systemTemplate?: string;       // prompt template name
    userTemplate?: string;
    outputSchema?: Record<string, any>;
    providerId?: string;
    providerName?: string;
    temperature?: number;
    maxTokens?: number;
    runWhen?: string;              // optional `${path}` — skip step in a round when falsy
  }>;
  aiLoopEarlyExitWhen?: string[];  // array of `${path}` expressions; ALL must be truthy to exit
}

export interface VariableMapping {
  name: string;
  source: string; // e.g., "${step1.output.data}"
}

export interface VariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

// Execution Types

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

// Log Types

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

// API Types

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  definition: WorkflowDefinition;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  definition?: WorkflowDefinition;
}

export interface ExecuteWorkflowRequest {
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'api';
  inputData?: Record<string, any>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type { WorkflowDefinitionV2, DagNode, DagEdge } from './dag';
export { isV2 } from './dag';

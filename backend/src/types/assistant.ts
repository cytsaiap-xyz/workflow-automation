export type AssistantSurface = 'panel' | 'node-popover';

export interface AssistantToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  resultSummary?: string;
  resultFull?: any;
}

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AssistantToolCall[];
  toolCallId?: string;
  timestamp: string;
}

export interface AssistantConversation {
  id: string;
  workflowId: string;
  surface: AssistantSurface;
  nodeId?: string;
  messages: AssistantMessage[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowDiff =
  | { kind: 'add_step'; stationId: string; step: any; position?: number }
  | { kind: 'remove_step'; stationId: string; stepId: string }
  | { kind: 'update_step'; stationId: string; stepId: string; patch: Record<string, any> }
  | { kind: 'add_station'; station: any; position?: number }
  | { kind: 'remove_station'; stationId: string }
  | { kind: 'update_station'; stationId: string; patch: Record<string, any> }
  | { kind: 'replace_workflow'; stations: any[] };

export interface PendingChange {
  id: string;
  conversationId: string;
  workflowId: string;
  diff: WorkflowDiff[];
  rationale?: string;
  status: 'pending' | 'applied' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
}

import { StepType, StepConfig, InputParameter, VariableMapping, VariableDefinition, RetryPolicy } from './workflow';

export interface DagNode {
  id: string;
  name: string;
  type: StepType;
  position: { x: number; y: number };
  config: StepConfig;
  inputVars?: VariableMapping[];
  outputVars?: VariableDefinition[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
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

export type AnyWorkflowDefinition = import('./workflow').WorkflowDefinition | WorkflowDefinitionV2;

export function isV2(def: AnyWorkflowDefinition): def is WorkflowDefinitionV2 {
  return (def as any)?.schemaVersion === 2;
}

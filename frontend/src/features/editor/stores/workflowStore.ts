import { create } from 'zustand';

import type { 
  Workflow, 
  WorkflowDefinition, 
  Station, 
  Step, 
  StepType,
  Execution,
  ExecutionLog 
} from '../../../shared/types/workflow';
import { workflowApi, executionApi } from '../../../shared/api/workflowApi';

// Generate UUID function (simple version for browser)
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface WorkflowState {
  // Data
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  executions: Execution[];
  currentExecution: Execution | null;
  executionLogs: ExecutionLog[];
  
  // UI State
  isLoading: boolean;
  error: string | null;
  selectedStepId: string | null;
  selectedStationId: string | null;
  isSimulating: boolean;
  
  // Actions
  fetchWorkflows: () => Promise<void>;
  fetchWorkflow: (id: string) => Promise<void>;
  createWorkflow: (name: string, description?: string, definition?: WorkflowDefinition) => Promise<Workflow>;
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  saveWorkflow: () => Promise<void>;
  
  // Editor actions
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  addStation: (name: string) => void;
  updateStation: (stationId: string, data: Partial<Station>) => void;
  deleteStation: (stationId: string) => void;
  addStep: (stationId: string, type: StepType, name: string) => void;
  updateStep: (stepId: string, data: Partial<Step>) => void;
  deleteStep: (stepId: string) => void;
  connectSteps: (stationId: string, sourceId: string, targetId: string, sourceHandle?: string) => void;
  selectStep: (stepId: string | null) => void;
  selectStation: (stationId: string | null) => void;
  
  // Execution actions
  executeWorkflow: (inputData?: Record<string, any>) => Promise<Execution>;
  simulateWorkflow: (inputData?: Record<string, any>) => Promise<Execution>;
  fetchExecutions: (workflowId: string) => Promise<void>;
  fetchExecutionLogs: (executionId: string) => Promise<void>;
  
  // Utils
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Initial state
  workflows: [],
  currentWorkflow: null,
  executions: [],
  currentExecution: null,
  executionLogs: [],
  isLoading: false,
  error: null,
  selectedStepId: null,
  selectedStationId: null,
  isSimulating: false,

  // Fetch all workflows
  fetchWorkflows: async () => {
    set({ isLoading: true, error: null });
    try {
      const workflows = await workflowApi.getAll();
      set({ workflows, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Fetch single workflow
  fetchWorkflow: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const workflow = await workflowApi.getById(id);
      set({ currentWorkflow: workflow, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Create new workflow
  createWorkflow: async (name: string, description?: string, existingDefinition?: WorkflowDefinition) => {
    set({ isLoading: true, error: null });
    try {
      const definition: WorkflowDefinition = existingDefinition || {
        stations: [],
        variables: {},
      };
      const workflow = await workflowApi.create({ name, description, definition });
      set((state) => ({
        workflows: [workflow, ...state.workflows],
        currentWorkflow: workflow,
        isLoading: false,
      }));
      return workflow;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Update workflow
  updateWorkflow: async (id: string, data: Partial<Workflow>) => {
    try {
      const workflow = await workflowApi.update(id, data);
      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? workflow : w)),
        currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Delete workflow
  deleteWorkflow: async (id: string) => {
    try {
      await workflowApi.delete(id);
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Save current workflow
  saveWorkflow: async () => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    set({ isLoading: true });
    try {
      await workflowApi.update(currentWorkflow.id, {
        name: currentWorkflow.name,
        description: currentWorkflow.description,
        definition: currentWorkflow.definition,
      });
      set({ isLoading: false });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Save failed';
      set({ error: msg, isLoading: false });
      // Re-throw so callers (e.g. EditorPage.handleSave) can inspect the error,
      // including structured validationData from the DAG validator.
      throw error;
    }
  },

  // Set current workflow
  setCurrentWorkflow: (workflow) => {
    set({ currentWorkflow: workflow, selectedStepId: null, selectedStationId: null });
  },

  // Add a new station
  addStation: (name: string) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    const newStation: Station = {
      id: generateId(),
      name,
      steps: [],
      position: { x: currentWorkflow.definition.stations.length * 300, y: 100 },
    };

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: [...currentWorkflow.definition.stations, newStation],
        },
      },
    });
  },

  // Update station
  updateStation: (stationId: string, data: Partial<Station>) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: currentWorkflow.definition.stations.map((s) =>
            s.id === stationId ? { ...s, ...data } : s
          ),
        },
      },
    });
  },

  // Delete station
  deleteStation: (stationId: string) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: currentWorkflow.definition.stations.filter((s) => s.id !== stationId),
        },
      },
    });
  },

  // Add a new step to a station
  addStep: (stationId: string, type: StepType, name: string) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    const station = currentWorkflow.definition.stations.find((s) => s.id === stationId);
    if (!station) return;

    const newStep: Step = {
      id: generateId(),
      name,
      type,
      config: {},
      position: { x: 0, y: station.steps.length * 100 },
      inputVars: [],
      outputVars: [],
    };

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: currentWorkflow.definition.stations.map((s) =>
            s.id === stationId ? { ...s, steps: [...s.steps, newStep] } : s
          ),
        },
      },
    });
  },

  // Update step
  updateStep: (stepId: string, data: Partial<Step>) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: currentWorkflow.definition.stations.map((station) => ({
            ...station,
            steps: station.steps.map((step) =>
              step.id === stepId ? { ...step, ...data } : step
            ),
          })),
        },
      },
    });
  },

  // Delete step (also cleans up related edges)
  deleteStep: (stepId: string) => {
    const { currentWorkflow, selectedStepId } = get();
    if (!currentWorkflow) return;

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: currentWorkflow.definition.stations.map((station) => ({
            ...station,
            steps: station.steps.filter((step) => step.id !== stepId),
            edges: station.edges?.filter((edge) => edge.source !== stepId && edge.target !== stepId),
          })),
        },
      },
      selectedStepId: selectedStepId === stepId ? null : selectedStepId,
    });
  },

  // Connect steps (persist edge to station)
  connectSteps: (stationId: string, sourceId: string, targetId: string, sourceHandle?: string) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    const newEdge = {
      id: `edge-${sourceId}-${sourceHandle || 'default'}-${targetId}`,
      source: sourceId,
      target: targetId,
      sourceHandle,
    };

    set({
      currentWorkflow: {
        ...currentWorkflow,
        definition: {
          ...currentWorkflow.definition,
          stations: currentWorkflow.definition.stations.map((station) => {
            if (station.id !== stationId) return station;
            const existing = station.edges || [];
            return { ...station, edges: [...existing, newEdge] };
          }),
        },
      },
    });
  },

  // Select step
  selectStep: (stepId) => {
    set({ selectedStepId: stepId, selectedStationId: null });
  },
  
  // Select station
  selectStation: (stationId) => {
    set({ selectedStationId: stationId, selectedStepId: null });
  },

  // Execute workflow
  executeWorkflow: async (inputData) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) throw new Error('No workflow selected');

    set({ isSimulating: true, error: null });
    try {
      const execution = await workflowApi.execute(currentWorkflow.id, inputData);
      set({ currentExecution: execution, isSimulating: false });
      return execution;
    } catch (error: any) {
      set({ error: error.message, isSimulating: false });
      throw error;
    }
  },

  // Simulate workflow
  simulateWorkflow: async (inputData) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) throw new Error('No workflow selected');

    set({ isSimulating: true, error: null });
    try {
      const execution = await workflowApi.simulate(currentWorkflow.id, inputData);
      set({ currentExecution: execution, isSimulating: false });
      
      // Fetch logs
      const logs = await executionApi.getLogs(execution.id);
      set({ executionLogs: logs });
      
      return execution;
    } catch (error: any) {
      set({ error: error.message, isSimulating: false });
      throw error;
    }
  },

  // Fetch executions
  fetchExecutions: async (workflowId: string) => {
    try {
      const executions = await workflowApi.getExecutions(workflowId);
      set({ executions });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Fetch execution logs
  fetchExecutionLogs: async (executionId: string) => {
    try {
      const logs = await executionApi.getLogs(executionId);
      set({ executionLogs: logs });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

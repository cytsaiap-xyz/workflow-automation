import axios from 'axios';
import type {
  Workflow,
  WorkflowDefinition,
  Execution,
  ExecutionLog,
  WorkflowVersion,
  ApiResponse
} from '../types/workflow';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Workflows API
export const workflowApi = {
  getAll: async (): Promise<Workflow[]> => {
    const response = await api.get<ApiResponse<Workflow[]>>('/workflows');
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  getById: async (id: string): Promise<Workflow> => {
    const response = await api.get<ApiResponse<Workflow>>(`/workflows/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  create: async (data: { name: string; description?: string; definition: WorkflowDefinition }): Promise<Workflow> => {
    const response = await api.post<ApiResponse<Workflow>>('/workflows', data);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  update: async (id: string, data: Partial<{
    name: string;
    description: string;
    status: 'draft' | 'active' | 'paused';
    definition: WorkflowDefinition;
  }>): Promise<Workflow> => {
    // Use validateStatus so axios does not throw on 4xx — we inspect the body ourselves
    // to propagate structured validator errors (errors/warnings arrays) on HTTP 400.
    const response = await api.put<ApiResponse<Workflow>>(
      `/workflows/${id}`,
      data,
      { validateStatus: (status) => status < 500 },
    );
    if (!response.data.success) {
      const err: Error & { validationData?: { errors?: string[]; warnings?: string[] } } =
        new Error(response.data.error || 'Save failed');
      // Attach the structured validator payload (errors/warnings) when present (HTTP 400 invalid DAG)
      const raw = response.data as unknown as { data?: { errors?: string[]; warnings?: string[] } };
      if (raw.data && (raw.data.errors || raw.data.warnings)) {
        err.validationData = raw.data;
      }
      throw err;
    }
    return response.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`/workflows/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
  },

  execute: async (id: string, inputData?: Record<string, any>): Promise<Execution> => {
    const response = await api.post<ApiResponse<Execution>>(`/workflows/${id}/execute`, {
      triggeredBy: 'manual',
      inputData,
    });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  executeWithFiles: async (id: string, formData: FormData): Promise<Execution> => {
    const response = await api.post<ApiResponse<Execution>>(
      `/workflows/${id}/execute`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  simulate: async (id: string, inputData?: Record<string, any>): Promise<Execution> => {
    const response = await api.post<ApiResponse<Execution>>(`/workflows/${id}/simulate`, {
      inputData,
    });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  simulateWithFiles: async (id: string, formData: FormData): Promise<Execution> => {
    const response = await api.post<ApiResponse<Execution>>(
      `/workflows/${id}/simulate`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  getExecutions: async (id: string, limit = 20): Promise<Execution[]> => {
    const response = await api.get<ApiResponse<Execution[]>>(`/workflows/${id}/executions`, {
      params: { limit },
    });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },
};

// Executions API
export const executionApi = {
  getAll: async (limit = 50): Promise<Execution[]> => {
    const response = await api.get<ApiResponse<Execution[]>>('/executions', {
      params: { limit },
    });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  getById: async (id: string): Promise<Execution> => {
    const response = await api.get<ApiResponse<Execution>>(`/executions/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  getLogs: async (id: string): Promise<ExecutionLog[]> => {
    const response = await api.get<ApiResponse<ExecutionLog[]>>(`/executions/${id}/logs`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`/executions/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
  },

  cancel: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<{ cancelled: boolean }>>(`/executions/${id}/cancel`);
    if (!response.data.success) throw new Error(response.data.error);
  },
};

// Metrics API
export interface ExecutionHistoryEntry {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

export const versionApi = {
  getVersions: async (workflowId: string): Promise<WorkflowVersion[]> => {
    const response = await api.get<ApiResponse<WorkflowVersion[]>>(`/workflows/${workflowId}/versions`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  getVersion: async (workflowId: string, version: number): Promise<WorkflowVersion> => {
    const response = await api.get<ApiResponse<WorkflowVersion>>(`/workflows/${workflowId}/versions/${version}`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  restore: async (workflowId: string, version: number): Promise<Workflow> => {
    const response = await api.post<ApiResponse<Workflow>>(`/workflows/${workflowId}/versions/${version}/restore`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },
};

export const metricsApi = {
  getExecutionHistory: async (days = 7): Promise<ExecutionHistoryEntry[]> => {
    const response = await api.get<ApiResponse<ExecutionHistoryEntry[]>>('/metrics/executions/history', {
      params: { days },
    });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },
};

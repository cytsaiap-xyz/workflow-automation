import axios from 'axios';
import type { ApiResponse } from '../types/workflow';

export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  supportsVision: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const BASE = '/ai-providers';

export const aiProvidersApi = {
  list: async (): Promise<AiProvider[]> => {
    const response = await api.get<ApiResponse<AiProvider[]>>(BASE);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  create: async (data: Partial<AiProvider>): Promise<AiProvider> => {
    const response = await api.post<ApiResponse<AiProvider>>(BASE, data);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  update: async (id: string, data: Partial<AiProvider>): Promise<AiProvider> => {
    const response = await api.put<ApiResponse<AiProvider>>(`${BASE}/${id}`, data);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  remove: async (id: string): Promise<void> => {
    const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`${BASE}/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
  },

  promote: async (id: string): Promise<AiProvider> => {
    const response = await api.post<ApiResponse<AiProvider>>(`${BASE}/${id}/promote`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },
};

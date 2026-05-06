import axios from 'axios';
import type { ApiResponse } from '../types/workflow';

export interface PromptTemplate {
  id: string;
  name: string;
  role: 'system' | 'user';
  content: string;
  description?: string;
  requiresVision: boolean;
  tags: string[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const BASE = '/prompt-templates';

export const promptTemplatesApi = {
  list: async (params?: { tag?: string; role?: 'system' | 'user' }): Promise<PromptTemplate[]> => {
    const response = await api.get<ApiResponse<PromptTemplate[]>>(BASE, { params });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  get: async (id: string): Promise<PromptTemplate> => {
    const response = await api.get<ApiResponse<PromptTemplate>>(`${BASE}/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  create: async (data: Partial<PromptTemplate>): Promise<PromptTemplate> => {
    const response = await api.post<ApiResponse<PromptTemplate>>(BASE, data);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  update: async (id: string, data: Partial<PromptTemplate>): Promise<PromptTemplate> => {
    const response = await api.put<ApiResponse<PromptTemplate>>(`${BASE}/${id}`, data);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
  },

  remove: async (id: string): Promise<void> => {
    const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`${BASE}/${id}`);
    if (!response.data.success) throw new Error(response.data.error);
  },
};

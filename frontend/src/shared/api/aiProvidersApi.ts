import axios from 'axios';

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
    const response = await api.get<{ data: AiProvider[] }>(BASE);
    return response.data.data;
  },

  create: async (data: Partial<AiProvider>): Promise<AiProvider> => {
    const response = await api.post<{ data: AiProvider }>(BASE, data);
    return response.data.data;
  },

  update: async (id: string, data: Partial<AiProvider>): Promise<AiProvider> => {
    const response = await api.put<{ data: AiProvider }>(`${BASE}/${id}`, data);
    return response.data.data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },

  promote: async (id: string): Promise<AiProvider> => {
    const response = await api.post<{ data: AiProvider }>(`${BASE}/${id}/promote`);
    return response.data.data;
  },
};

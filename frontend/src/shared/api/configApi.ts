import axios from 'axios';
import type { ApiResponse } from '../types/workflow';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface AppConfig {
  offlineMode: boolean;
}

export const configApi = {
  get: async (): Promise<AppConfig> => {
    const res = await api.get<ApiResponse<AppConfig>>('/config');
    if (!res.data.success) throw new Error(res.data.error || 'Failed to load config');
    return res.data.data!;
  },
};

import axios from 'axios';
import type { ApiResponse } from '../types/workflow';

export interface AssistantConversation {
  id: string;
  workflowId: string;
  surface: 'panel' | 'node-popover';
  nodeId?: string;
  messages: any[];
  summary?: string;
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const BASE = '/assistant';

export const assistantApi = {
  conversation: {
    findOrCreate: async (data: {
      workflowId: string;
      surface: 'panel' | 'node-popover';
      nodeId?: string;
    }): Promise<AssistantConversation> => {
      const r = await api.post<ApiResponse<AssistantConversation>>(`${BASE}/conversations`, data);
      if (!r.data.success) throw new Error(r.data.error || 'Failed to create conversation');
      return r.data.data!;
    },
    get: async (id: string): Promise<AssistantConversation> => {
      const r = await api.get<ApiResponse<AssistantConversation>>(`${BASE}/conversations/${id}`);
      if (!r.data.success) throw new Error(r.data.error || 'Conversation not found');
      return r.data.data!;
    },
  },

  // SSE: caller passes content + onEvent.
  sendMessage(
    conversationId: string,
    content: string,
    onEvent: (e: any) => void,
  ): { close: () => void } {
    const ctrl = new AbortController();
    fetch(`/api${BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: ctrl.signal,
    })
      .then(async (resp) => {
        if (!resp.body) return;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const ev of events) {
            const line = ev.split('\n').find((l: string) => l.startsWith('data: '));
            if (line) {
              try {
                onEvent(JSON.parse(line.slice(6)));
              } catch {
                /* ignore parse errors */
              }
            }
          }
        }
      })
      .catch(() => {
        /* aborted or network error */
      });
    return { close: () => ctrl.abort() };
  },

  changes: {
    get: async (id: string): Promise<any> => {
      const r = await api.get<ApiResponse<any>>(`${BASE}/changes/${id}`);
      if (!r.data.success) throw new Error(r.data.error || 'Change not found');
      return r.data.data;
    },
    apply: async (id: string): Promise<any> => {
      const r = await api.post<ApiResponse<any>>(`${BASE}/changes/${id}/apply`);
      if (!r.data.success) throw new Error(r.data.error || 'Failed to apply');
      return r.data.data;
    },
    reject: async (id: string): Promise<any> => {
      const r = await api.post<ApiResponse<any>>(`${BASE}/changes/${id}/reject`);
      if (!r.data.success) throw new Error(r.data.error || 'Failed to reject');
      return r.data.data;
    },
  },
};

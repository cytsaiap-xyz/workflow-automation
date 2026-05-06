import { create } from 'zustand';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: { id: string; name: string; args: any; resultSummary?: string }[];
}

interface AssistantState {
  panelOpen: boolean;
  conversationId?: string;
  messages: ChatMessage[];
  pendingChangeIds: string[];
  streaming: boolean;
  setPanelOpen: (b: boolean) => void;
  setConversation: (id: string, history: ChatMessage[]) => void;
  appendUser: (content: string) => void;
  appendStreaming: (chunk: string) => void;
  appendToolCall: (name: string, args: any) => void;
  attachToolResult: (name: string, summary: string) => void;
  addPendingChange: (id: string) => void;
  removePendingChange: (id: string) => void;
  setStreaming: (b: boolean) => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  panelOpen: false,
  messages: [],
  pendingChangeIds: [],
  streaming: false,

  setPanelOpen: (b) => set({ panelOpen: b }),

  setConversation: (id, history) =>
    set({ conversationId: id, messages: history, pendingChangeIds: [] }),

  appendUser: (content) =>
    set({ messages: [...get().messages, { role: 'user', content }] }),

  appendStreaming: (chunk) => {
    const msgs = [...get().messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && !last.toolCalls) {
      last.content += chunk;
    } else {
      msgs.push({ role: 'assistant', content: chunk });
    }
    set({ messages: msgs });
  },

  appendToolCall: (name, args) =>
    set({
      messages: [
        ...get().messages,
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: `${Date.now()}`, name, args }],
        },
      ],
    }),

  attachToolResult: (name, summary) => {
    const msgs = [...get().messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const tc = msgs[i].toolCalls?.find((t) => t.name === name && !t.resultSummary);
      if (tc) {
        tc.resultSummary = summary;
        break;
      }
    }
    set({ messages: msgs });
  },

  addPendingChange: (id) =>
    set({ pendingChangeIds: [...get().pendingChangeIds, id] }),

  removePendingChange: (id) =>
    set({ pendingChangeIds: get().pendingChangeIds.filter((x: string) => x !== id) }),

  setStreaming: (b) => set({ streaming: b }),
}));

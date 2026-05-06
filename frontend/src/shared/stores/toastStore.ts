import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** Optional list of detail lines rendered as bullet points below the message */
  details?: string[];
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, details?: string[], duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  
  addToast: (type, message, details?, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    set((state) => ({
      toasts: [...state.toasts, { id, type, message, details, duration }],
    }));

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().addToast('success', message, undefined, duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().addToast('error', message, undefined, duration),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().addToast('warning', message, undefined, duration),
  info: (message: string, duration?: number) =>
    useToastStore.getState().addToast('info', message, undefined, duration),
  /** Show an error toast with a structured bullet list of detail lines below the message */
  errorWithDetails: (message: string, details: string[], duration?: number) =>
    useToastStore.getState().addToast('error', message, details, duration),
};

import { create } from 'zustand';
import type { AppConfig } from '../api/configApi';
import { configApi } from '../api/configApi';

interface ConfigState {
  config: AppConfig | null;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loaded: false,
  load: async () => {
    try {
      const config = await configApi.get();
      set({ config, loaded: true });
    } catch {
      // If config fails to load, default to non-offline (safer fallback for the UI)
      set({ config: { offlineMode: false }, loaded: true });
    }
  },
}));

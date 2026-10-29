import { create } from 'zustand';

interface SearchState {
  regex: boolean;
  kinds: string[];
  setRegex: (v: boolean) => void;
  toggleKind: (k: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  regex: false,
  kinds: [],
  setRegex: (regex) => set({ regex }),
  toggleKind: (k) => set((s) => ({ kinds: s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k] })),
}));

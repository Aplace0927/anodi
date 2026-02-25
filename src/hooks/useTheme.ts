import { useSyncExternalStore, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'anodi-theme';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }
  return null;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// ── Shared module-level state ──────────────────────────────────
let currentTheme: Theme = getStoredTheme() ?? getSystemTheme();
applyTheme(currentTheme);

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function setThemeInternal(t: Theme) {
  if (t === currentTheme) return;
  currentTheme = t;
  applyTheme(t);
  listeners.forEach((l) => l());
}

// Listen for system preference changes — always respond
if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    setThemeInternal(e.matches ? 'dark' : 'light');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  });
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);

  const setTheme = useCallback((t: Theme) => {
    setThemeInternal(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}

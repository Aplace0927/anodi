import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Modal from './ui/Modal';
import Kbd from './ui/Kbd';
import { SHORTCUT_GROUPS } from '../hooks/useKeyboardShortcuts';

export const SHOW_SHORTCUTS_EVENT = 'anodi:show-shortcuts';
export const showShortcutHelp = () => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT));

export default function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onShow = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, onShow);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHOW_SHORTCUTS_EVENT, onShow);
    };
  }, []);

  if (!open) return null;
  return (
    <Modal onClose={() => setOpen(false)} className="w-[34rem]">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <span className="font-bold text-gray-900 dark:text-white">Keyboard shortcuts</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X size={18} />
        </button>
      </div>
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto p-4 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{g.title}</h3>
            <ul className="space-y-1.5">
              {g.items.map((it) => (
                <li key={it.label} className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <span>{it.label}</span>
                  <Kbd>{it.keys}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

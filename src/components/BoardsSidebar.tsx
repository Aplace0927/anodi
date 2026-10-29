import { useEffect, useState } from 'react';
import { Plus, Copy, Trash2, Pencil, X, Check } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function BoardsSidebar({ onClose }: { onClose: () => void }) {
  const boards = useGraphStore((s) => s.boards);
  const currentBoardId = useGraphStore((s) => s.currentBoardId);
  const createBoard = useGraphStore((s) => s.createBoard);
  const switchBoard = useGraphStore((s) => s.switchBoard);
  const renameBoard = useGraphStore((s) => s.renameBoard);
  const duplicateBoard = useGraphStore((s) => s.duplicateBoard);
  const deleteBoard = useGraphStore((s) => s.deleteBoard);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (renamingId) setRenamingId(null);
        else if (confirmId) setConfirmId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, renamingId, confirmId]);

  const sorted = [...boards].sort((a, b) => b.updatedAt - a.updatedAt);

  const commitRename = () => {
    if (renamingId && draft.trim()) renameBoard(renamingId, draft.trim());
    setRenamingId(null);
  };

  const iconBtn = 'rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200';

  return (
    <div className="fixed inset-0 z-40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30" />
      <aside className="absolute bottom-0 left-0 top-0 flex w-72 max-w-[85vw] flex-col border-r border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <span className="font-bold text-gray-900 dark:text-white">Boards</span>
          <button onClick={onClose} className={iconBtn} title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-3">
          <button
            onClick={() => { createBoard(); onClose(); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> New board
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {sorted.map((b) => {
            const active = b.id === currentBoardId;
            return (
              <li key={b.id}>
                <div
                  className={`group flex items-center gap-1 rounded-lg px-2 py-2 ${active ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {renamingId === b.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                  ) : (
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => { if (!active) switchBoard(b.id); onClose(); }}
                    >
                      <div className="truncate text-sm text-gray-800 dark:text-gray-100">{b.name}</div>
                      <div className="text-xs text-gray-400">{relativeTime(b.updatedAt)}</div>
                    </button>
                  )}
                  {confirmId === b.id ? (
                    <div className="flex shrink-0 items-center gap-1 text-xs">
                      <button onClick={() => { deleteBoard(b.id); setConfirmId(null); }} className="rounded bg-red-600 px-1.5 py-0.5 text-white hover:bg-red-700">
                        Delete
                      </button>
                      <button onClick={() => setConfirmId(null)} className={iconBtn}>
                        <X size={12} />
                      </button>
                    </div>
                  ) : renamingId === b.id ? (
                    <button onMouseDown={(e) => e.preventDefault()} onClick={commitRename} className={iconBtn}>
                      <Check size={13} />
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      <button className={iconBtn} title="Rename" onClick={() => { setRenamingId(b.id); setDraft(b.name); }}>
                        <Pencil size={13} />
                      </button>
                      <button className={iconBtn} title="Duplicate" onClick={() => duplicateBoard(b.id)}>
                        <Copy size={13} />
                      </button>
                      <button className={`${iconBtn} hover:!text-red-500`} title="Delete" onClick={() => setConfirmId(b.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

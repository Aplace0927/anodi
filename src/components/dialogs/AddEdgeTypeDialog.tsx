import { useState } from 'react';
import { X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import ColorPicker from '../ColorPicker';

interface Props {
  onClose: () => void;
}

export default function AddEdgeTypeDialog({ onClose }: Props) {
  const addUserEdgeType = useGraphStore((s) => s.addUserEdgeType);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<string>('#6366f1');
  const [dashStyle, setDashStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');

  const handleAdd = () => {
    const name = label.trim();
    if (!name) return;
    const strokeDasharray =
      dashStyle === 'dashed' ? '6 3' : dashStyle === 'dotted' ? '2 4' : undefined;
    addUserEdgeType(name, color, strokeDasharray);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Title bar */}
        <div className="flex items-center justify-between rounded-t-xl bg-gray-800 px-4 py-3">
          <span className="font-semibold text-white">Add Edge Type</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Name
            </label>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Dependency"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Color */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Color
            </label>
            <ColorPicker value={color} onChange={(c) => setColor(c ?? '#6366f1')} />
          </div>

          {/* Line style */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Line Style
            </label>
            <div className="flex gap-2">
              {(['solid', 'dashed', 'dotted'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setDashStyle(s)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-xs font-medium transition-all ${
                    dashStyle === s
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <svg width="24" height="4" className="shrink-0">
                    <line
                      x1="0" y1="2" x2="24" y2="2"
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray={s === 'dashed' ? '6 3' : s === 'dotted' ? '2 4' : undefined}
                    />
                  </svg>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!label.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Type
          </button>
        </div>
      </div>
    </div>
  );
}

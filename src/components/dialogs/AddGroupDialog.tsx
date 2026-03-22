import { useState } from 'react';
import { X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import ColorPicker from '../ColorPicker';

interface Props {
  onClose: () => void;
  getViewportCenter?: () => { x: number; y: number };
}

export default function AddGroupDialog({ onClose, getViewportCenter }: Props) {
  const addGroup = useGraphStore((s) => s.addGroup);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);

  const handleAdd = () => {
    addGroup(name.trim() || 'Untitled Group', color, getViewportCenter?.());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Title bar */}
        <div className="flex items-center justify-between rounded-t-xl bg-gray-800 px-4 py-3">
          <span className="font-bold text-white">Add Group</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
              Group Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="My Group"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Color */}
          <div>
            <ColorPicker
              label="Group Color"
              value={color}
              onChange={(c) => setColor(c)}
            />
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            Add Group
          </button>
        </div>
      </div>
    </div>
  );
}

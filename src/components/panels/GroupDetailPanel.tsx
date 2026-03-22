import { useCallback } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type { NodeData, GroupData } from '../../types';
import ColorPicker from '../ColorPicker';

export default function GroupDetailPanel() {
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const selectNode = useGraphStore((s) => s.selectNode);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const updateNodeName = useGraphStore((s) => s.updateNodeName);
  const removeNodeFromGroup = useGraphStore((s) => s.removeNodeFromGroup);

  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const node = nodes.find((n) => n.id === selectedNodeId);

  const closePanel = useCallback(() => selectNode(null), [selectNode]);

  if (!node || node.type !== 'group') return null;

  const data = node.data as GroupData;

  const memberNodes = nodes.filter((n) => data.memberNodeIds.includes(n.id));

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Group</span>
        </div>
        <button onClick={closePanel} className="text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Group name */}
      <div className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Name</label>
        <input
          value={data.name ?? ''}
          onChange={(e) => updateNodeName(node.id, e.target.value)}
          className="w-full rounded border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      {/* Group color */}
      <div className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <ColorPicker
          label="Group Color"
          value={data.groupColor}
          onChange={(color) => updateNodeData(node.id, { groupColor: color })}
        />
      </div>

      {/* Member nodes */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
          Members ({memberNodes.length})
        </p>
        {memberNodes.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Drag a node over this group and hold to add it.
          </p>
        ) : (
          <ul className="space-y-1">
            {memberNodes.map((m) => {
              const mData = m.data as NodeData & { name?: string };
              const kindLabel =
                mData.kind === 'source' ? '📄' :
                mData.kind === 'class' ? '🔷' :
                mData.kind === 'notepad' ? '📝' :
                mData.kind === 'memory' ? '🗃' : '';
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded bg-gray-100 px-2 py-1.5 text-xs dark:bg-gray-800"
                >
                  <span>{kindLabel}</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-200">
                    {mData.name ?? m.id}
                  </span>
                  <button
                    onClick={() => removeNodeFromGroup(node.id, m.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove from group"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

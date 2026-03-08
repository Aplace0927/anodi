import { memo, useCallback } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { NotepadData } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { contrastTextColor } from '../ColorPicker';

type Props = NodeProps & { data: NotepadData & { name?: string } };

const NotepadNode = memo(({ id, data, selected, dragging }: Props) => {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const customColor = data.nodeColor;
  const headerTextColor = customColor ? contrastTextColor(customColor) : undefined;

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { content: e.target.value });
    },
    [id, updateNodeData]
  );

  return (
    <div
      className={`anodi-export-node flex flex-col rounded-lg border-2 bg-white shadow-lg transition-all dark:bg-gray-900 dark:text-white ${
        selected
          ? customColor
            ? 'shadow-lg'
            : 'border-amber-400 shadow-amber-400/40 shadow-lg'
          : customColor
            ? ''
            : 'border-gray-300 dark:border-gray-600'
      }`}
      style={{
        minWidth: 200,
        minHeight: 120,
        width: '100%',
        height: '100%',
        position: 'relative',
        ...(customColor
          ? {
              borderColor: selected ? customColor : `${customColor}99`,
              boxShadow: selected ? `0 10px 15px -3px ${customColor}40` : undefined,
            }
          : {}),
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-amber-400"
        handleClassName="!bg-amber-400 !w-2 !h-2 !border-amber-500"
      />

      <Handle type="target" position={Position.Top} className="!bg-gray-400 !opacity-0" />
      <Handle type="source" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div
        className={`anodi-export-data flex items-center gap-2 rounded-t-lg px-3 py-2 ${customColor ? '' : 'bg-amber-500'}`}
        style={customColor ? { backgroundColor: customColor } : {}}
      >
        <span
          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${customColor ? '' : 'bg-amber-700 text-white'}`}
          style={customColor ? { backgroundColor: `${customColor}cc`, color: contrastTextColor(customColor) } : {}}
        >
          📝 Note
        </span>
        <span
          className={`flex-1 truncate text-sm font-semibold ${headerTextColor ? '' : 'text-white'}`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
        >
          {data.name ?? 'Untitled'}
        </span>
      </div>

      {/* Content */}
      {dragging ? (
        <div className="mx-1 mb-2 flex-1 rounded bg-gray-100 dark:bg-black/40" style={{ minHeight: 24 }} />
      ) : (
        <div className="anodi-export-data flex-1 p-2">
          <textarea
            value={data.content}
            onChange={handleContentChange}
            placeholder="Write your notes here…"
            className="nodrag nopan nowheel h-full w-full resize-none rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
            style={{ minHeight: 60 }}
            onKeyDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <Handle type="target" position={Position.Bottom} className="!bg-gray-400 !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
});

NotepadNode.displayName = 'NotepadNode';
export default NotepadNode;

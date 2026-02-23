import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MemoryLayoutData } from '../../types';

type Props = NodeProps & { data: MemoryLayoutData & { name?: string } };

const MemoryLayoutNode = memo(({ data, selected }: Props) => {
  return (
    <div
      className={`w-60 rounded-lg border-2 bg-gray-950 text-white shadow-lg transition-all ${
        selected ? 'border-orange-400 shadow-orange-400/30 shadow-lg' : 'border-gray-700'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div className="rounded-t-lg bg-orange-800 px-3 py-2">
        <div className="text-[10px] text-orange-200">memory layout</div>
        <div className="truncate font-bold text-orange-50">{data.name ?? 'Untitled'}</div>
      </div>

      {/* Badge */}
      <div className="px-3 pt-1">
        <span className="rounded bg-orange-900/50 px-2 py-0.5 text-[10px] text-orange-300">
          memory
        </span>
      </div>

      {/* Regions */}
      <div className="mx-2 mb-2 mt-1.5 space-y-0.5">
        {data.regions.length === 0 && (
          <div className="text-[10px] text-gray-500 italic">No regions defined</div>
        )}
        {data.regions.slice(0, 4).map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-1.5 rounded bg-gray-800 px-2 py-0.5 text-[10px]"
          >
            <span className="font-mono text-green-400">{r.start}</span>
            <span className="text-gray-500">–</span>
            <span className="font-mono text-green-400">{r.end}</span>
            <span className="truncate text-gray-300">{r.description}</span>
          </div>
        ))}
        {data.regions.length > 4 && (
          <div className="text-[9px] text-gray-500">+{data.regions.length - 4} more regions</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
});

MemoryLayoutNode.displayName = 'MemoryLayoutNode';
export default MemoryLayoutNode;

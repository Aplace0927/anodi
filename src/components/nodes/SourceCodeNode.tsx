import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SourceCodeData } from '../../types';

type Props = NodeProps & { data: SourceCodeData & { name?: string } };

const LANG_COLORS: Record<string, string> = {
  c: 'bg-blue-700',
  cpp: 'bg-blue-500',
  python: 'bg-yellow-500',
  javascript: 'bg-yellow-300 text-black',
  typescript: 'bg-blue-400',
  rust: 'bg-orange-600',
  go: 'bg-cyan-500',
};

const SourceCodeNode = memo(({ data, selected }: Props) => {
  const preview = data.code
    ? data.code.split('\n').slice(0, 4).join('\n')
    : '// empty';

  const langColor = LANG_COLORS[data.language] ?? 'bg-gray-500';

  return (
    <div
      className={`anodi-export w-56 rounded-lg border-2 bg-gray-900 text-white shadow-lg transition-all ${
        selected ? 'border-blue-400 shadow-blue-400/40 shadow-lg' : 'border-gray-600'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div className="anodi-export flex items-center gap-2 rounded-t-lg bg-gray-800 px-3 py-2">
        <span
          className={`anodi-export rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white ${langColor}`}
        >
          {data.language}
        </span>
        <span className="anodi-export truncate text-sm font-semibold text-gray-100">
          {data.name ?? 'Untitled'}
        </span>
      </div>

      {/* Badge */}
      <div className="anodi-export px-3 pt-1">
        <span className="anodi-export rounded bg-indigo-900/60 px-2 py-0.5 text-[10px] text-indigo-300">
          source code
        </span>
      </div>

      {/* Preview */}
      <pre className="anodi-export mx-3 mb-3 mt-1.5 overflow-hidden rounded bg-black/40 px-2 py-1.5 text-[10px] leading-relaxed text-green-300 opacity-90 line-clamp-4">
        {preview}
      </pre>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
});

SourceCodeNode.displayName = 'SourceCodeNode';
export default SourceCodeNode;

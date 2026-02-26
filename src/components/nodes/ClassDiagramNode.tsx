import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ClassDiagramData } from '../../types';

type Props = NodeProps & { data: ClassDiagramData & { name?: string } };

const ClassDiagramNode = memo(({ data, selected }: Props) => {
  return (
    <div
      className={`anodi-export w-52 rounded-lg border-2 bg-white shadow-lg transition-all ${
        selected ? 'border-purple-500 shadow-purple-400/30 shadow-lg' : 'border-gray-300'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div className="anodi-export rounded-t-lg bg-purple-700 px-3 py-2 text-center">
        <span className="anodi-export block text-[10px] text-purple-200">«class»</span>
        <span className="anodi-export block truncate font-bold text-white">
          {data.className || data.name || 'ClassName'}
        </span>
      </div>

      {/* Badge */}
      <div className="anodi-export px-3 pt-1">
        <span className="anodi-export rounded bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700">
          class diagram
        </span>
      </div>

      {/* Fields */}
      {data.fields.length > 0 && (
        <div className="anodi-export mx-2 mt-1.5 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          {data.fields.slice(0, 3).map((f) => (
            <div key={f.id} className="anodi-export truncate text-[10px] text-gray-700">
              <span className="anodi-export text-blue-600">{f.type}</span> {f.name}
            </div>
          ))}
          {data.fields.length > 3 && (
            <div className="anodi-export text-[9px] text-gray-400">+{data.fields.length - 3} more</div>
          )}
        </div>
      )}

      {/* Methods */}
      {data.methods.length > 0 && (
        <div className="anodi-export mx-2 mb-2 mt-1 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          {data.methods.slice(0, 3).map((m) => (
            <div key={m.id} className="anodi-export truncate text-[10px] text-gray-700">
              <span className="anodi-export text-green-700">⚙ </span>
              {m.signature}
            </div>
          ))}
          {data.methods.length > 3 && (
            <div className="anodi-export text-[9px] text-gray-400">+{data.methods.length - 3} more</div>
          )}
        </div>
      )}

      {data.fields.length === 0 && data.methods.length === 0 && (
        <div className="anodi-export mb-2 px-3 text-[10px] text-gray-400 italic">No members defined</div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
});

ClassDiagramNode.displayName = 'ClassDiagramNode';
export default ClassDiagramNode;

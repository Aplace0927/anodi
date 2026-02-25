import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { ClassDiagramData } from "../../types";
import { contrastTextColor } from "../ColorPicker";

type Props = NodeProps & { data: ClassDiagramData & { name?: string } };

const ClassDiagramNode = memo(({ data, selected }: Props) => {
  const customColor = data.nodeColor;
  const headerTextColor = customColor ? contrastTextColor(customColor) : undefined;

  return (
    <div
      className={`w-52 rounded-lg border-2 bg-white shadow-lg transition-all ${
        selected
          ? customColor
            ? 'shadow-lg'
            : 'border-purple-500 shadow-purple-400/30 shadow-lg'
          : customColor
            ? ''
            : 'border-gray-300'
      }`}
      style={
        customColor
          ? {
              borderColor: selected ? customColor : `${customColor}99`,
              boxShadow: selected ? `0 10px 15px -3px ${customColor}40` : undefined,
            }
          : {}
      }
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div
        className={`rounded-t-lg px-3 py-2 text-center ${customColor ? '' : 'bg-purple-700'}`}
        style={customColor ? { backgroundColor: customColor } : {}}
      >
        <span
          className={`block text-[10px] ${headerTextColor ? '' : 'text-purple-200'}`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
        >
          «class»
        </span>
        <span
          className={`block truncate font-bold ${headerTextColor ? '' : 'text-white'}`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
        >
          {data.className || data.name || "ClassName"}
        </span>
      </div>

      {/* Fields */}
      {data.fields.length > 0 && (
        <div className="mx-2 mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          {data.fields.map((f) => (
            <div key={f.id} className="truncate text-[10px] text-gray-700">
              <span className="text-blue-600">{f.type}</span> {f.name}
            </div>
          ))}
        </div>
      )}

      {/* Methods */}
      {data.methods.length > 0 && (
        <div className="mx-2 mb-2 mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          {data.methods.map((m) => (
            <div key={m.id} className="truncate text-[10px] text-gray-700">
              <span className="text-green-700">⚙ </span>
              {m.signature}
            </div>
          ))}
        </div>
      )}

      {data.fields.length === 0 && data.methods.length === 0 && (
        <div className="mb-2 px-3 py-2 text-[10px] text-gray-400 italic">
          No members defined
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400"
      />
    </div>
  );
});

ClassDiagramNode.displayName = "ClassDiagramNode";
export default ClassDiagramNode;

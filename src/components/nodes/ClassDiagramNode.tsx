import { memo, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { ClassDiagramData } from "../../types";
import { useGraphStore } from "../../store/graphStore";
import { contrastTextColor } from "../ColorPicker";

type Props = NodeProps & { data: ClassDiagramData & { name?: string } };

const MEMBER_H = 18; // height of each field/method row in px

const ClassDiagramNode = memo(({ id, data, selected, dragging }: Props) => {
  const edges = useGraphStore((s) => s.edges);
  const customColor = data.nodeColor;
  const headerTextColor = customColor ? contrastTextColor(customColor) : undefined;

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  return (
    <div
      className={`anodi-export-node font-sans w-52 rounded-lg border-2 bg-white shadow-lg transition-all dark:bg-gray-900 ${
        selected
          ? customColor
            ? 'shadow-lg'
            : 'border-purple-500 shadow-purple-400/30 shadow-lg'
          : customColor
            ? ''
            : 'border-gray-300 dark:border-gray-600'
      }`}
      style={{
        position: 'relative',
        ...(customColor
          ? {
              borderColor: selected ? customColor : `${customColor}99`,
              boxShadow: selected ? `0 10px 15px -3px ${customColor}40` : undefined,
            }
          : {}),
      }}
    >
      <Handle type="target" position={Position.Top} id="top" style={{ background: '#9ca3af', width: 7, height: 7, opacity: 0 }} />
      <Handle type="source" position={Position.Top} id="top" className={connectedHandles.has('top') ? 'anodi-connected' : undefined} style={{ background: '#9ca3af', width: 7, height: 7 }} />

      {/* Header */}
      <div
        className={`anodi-export-data rounded-t-lg px-3 py-2 text-center ${customColor ? '' : 'bg-purple-700'}`}
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
      {!dragging && data.fields.length > 0 && (
        <div className="anodi-export-data mx-2 mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
          {data.fields.map((f) => (
            <div key={f.id} className="relative truncate text-[10px] text-gray-700 dark:text-gray-300" style={{ height: MEMBER_H, lineHeight: `${MEMBER_H}px`, paddingLeft: 12, paddingRight: 12 }}>
              <Handle
                type="target"
                position={Position.Left}
                id={`field-${f.id}-left`}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7, opacity: 0 }}
              />
              <Handle
                type="source"
                position={Position.Left}
                id={`field-${f.id}-left`}
                className={connectedHandles.has(`field-${f.id}-left`) ? 'anodi-connected' : undefined}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7 }}
              />
              <span className="text-blue-600 dark:text-blue-400">{f.type}</span> {f.name}
              <Handle
                type="target"
                position={Position.Right}
                id={`field-${f.id}-right`}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7, opacity: 0 }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`field-${f.id}-right`}
                className={connectedHandles.has(`field-${f.id}-right`) ? 'anodi-connected' : undefined}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7 }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Methods */}
      {!dragging && data.methods.length > 0 && (
        <div className="anodi-export-data mx-2 mb-2 mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
          {data.methods.map((m) => (
            <div key={m.id} className="relative truncate text-[10px] text-gray-700 dark:text-gray-300" style={{ height: MEMBER_H, lineHeight: `${MEMBER_H}px`, paddingLeft: 12, paddingRight: 12 }}>
              <Handle
                type="target"
                position={Position.Left}
                id={`method-${m.id}-left`}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7, opacity: 0 }}
              />
              <Handle
                type="source"
                position={Position.Left}
                id={`method-${m.id}-left`}
                className={connectedHandles.has(`method-${m.id}-left`) ? 'anodi-connected' : undefined}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7 }}
              />
              <span className="text-green-700 dark:text-green-500">⚙ </span>
              {m.signature}
              <Handle
                type="target"
                position={Position.Right}
                id={`method-${m.id}-right`}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7, opacity: 0 }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`method-${m.id}-right`}
                className={connectedHandles.has(`method-${m.id}-right`) ? 'anodi-connected' : undefined}
                style={{ top: '50%', transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7 }}
              />
            </div>
          ))}
        </div>
      )}

      {!dragging && data.fields.length === 0 && data.methods.length === 0 && (
        <div className="mb-2 px-3 py-2 text-[10px] text-gray-400 italic">
          No members defined
        </div>
      )}

      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        style={{ background: '#9ca3af', width: 7, height: 7, opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={connectedHandles.has('bottom') ? 'anodi-connected' : undefined}
        style={{ background: '#9ca3af', width: 7, height: 7 }}
      />
    </div>
  );
});

ClassDiagramNode.displayName = "ClassDiagramNode";
export default ClassDiagramNode;

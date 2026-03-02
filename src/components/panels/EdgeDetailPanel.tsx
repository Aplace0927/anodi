import { useCallback } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type { NodeData, EdgeRelationship } from '../../types';
import { EDGE_STYLES } from '../../types';

const RELATIONSHIPS: EdgeRelationship[] = ['call', 'reference', 'information'];

/** Describe a connection endpoint for display in the edge sidebar. */
function describeEndpoint(
  nodeData: (NodeData & { name?: string }) | undefined,
  nodeId: string,
  handleId: string | null | undefined
): { nodeLabel: string; detail: string } {
  if (!nodeData) return { nodeLabel: nodeId, detail: '' };

  const nodeName = nodeData.name ?? nodeId;

  if (nodeData.kind === 'source') {
    // Handle IDs are like "line-5-left" or "line-5-right"
    const match = handleId?.match(/^line-(\d+)/);
    if (match) return { nodeLabel: nodeName, detail: `Line ${match[1]}` };
    return { nodeLabel: nodeName, detail: 'Source Code' };
  }

  if (nodeData.kind === 'memory') {
    // Handle IDs are like "addr-0x4010-left" or "addr-0x4010-right"
    const match = handleId?.match(/^addr-(0x[0-9A-Fa-f]+)/);
    if (match) return { nodeLabel: nodeName, detail: `Address ${match[1]}` };
    return { nodeLabel: nodeName, detail: 'Memory Layout' };
  }

  if (nodeData.kind === 'class') {
    // Handle IDs are like "field-<id>-left", "method-<id>-left", or top/bottom default
    const fieldMatch = handleId?.match(/^field-(.+?)-(left|right)$/);
    if (fieldMatch) {
      const field = nodeData.fields.find((f) => f.id === fieldMatch[1]);
      if (field) return { nodeLabel: nodeName, detail: `Field: ${field.type} ${field.name}` };
    }
    const methodMatch = handleId?.match(/^method-(.+?)-(left|right)$/);
    if (methodMatch) {
      const method = nodeData.methods.find((m) => m.id === methodMatch[1]);
      if (method) return { nodeLabel: nodeName, detail: `Method: ${method.signature}` };
    }
    return { nodeLabel: nodeName, detail: `Class: ${nodeData.className}` };
  }

  if (nodeData.kind === 'notepad') {
    return { nodeLabel: nodeName, detail: nodeName };
  }

  return { nodeLabel: nodeName, detail: '' };
}

export default function EdgeDetailPanel() {
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const swapEdgeDirection = useGraphStore((s) => s.swapEdgeDirection);
  const updateEdgeRelationship = useGraphStore((s) => s.updateEdgeRelationship);

  const edge = edges.find((e) => e.id === selectedEdgeId);
  const closePanel = useCallback(() => selectEdge(null), [selectEdge]);

  if (!edge) return null;

  const rel = edge.data?.relationship ?? 'call';
  const style = EDGE_STYLES[rel];

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceData = sourceNode?.data as (NodeData & { name?: string }) | undefined;
  const targetData = targetNode?.data as (NodeData & { name?: string }) | undefined;

  const from = describeEndpoint(sourceData, edge.source, edge.sourceHandle);
  const to = describeEndpoint(targetData, edge.target, edge.targetHandle);

  const handleSwap = () => {
    swapEdgeDirection(edge.id);
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: style.color }}
          >
            {style.label}
          </span>
          <span className="text-sm font-semibold">Edge</span>
        </div>
        <button onClick={closePanel} className="text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* From / To */}
      <div className="space-y-4 px-4 py-4">
        {/* Connected From */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Connected From
          </label>
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{from.nodeLabel}</p>
            {from.detail && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{from.detail}</p>
            )}
          </div>
        </div>

        {/* Direction arrow */}
        <div className="flex justify-center">
          <span className="text-lg text-gray-400 dark:text-gray-500">↓</span>
        </div>

        {/* Connected To */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Connected To
          </label>
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{to.nodeLabel}</p>
            {to.detail && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{to.detail}</p>
            )}
          </div>
        </div>

        {/* Swap button */}
        <button
          onClick={handleSwap}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowRightLeft size={14} />
          Swap Direction
        </button>
      </div>

      {/* Relationship type selector */}
      <div className="border-t border-gray-300 px-4 py-3 dark:border-gray-700">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          Relationship
        </label>
        <div className="flex gap-1.5">
          {RELATIONSHIPS.map((r) => {
            const s = EDGE_STYLES[r];
            const isActive = r === rel;
            return (
              <button
                key={r}
                onClick={() => updateEdgeRelationship(edge.id, r)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-gray-400 bg-gray-200 text-gray-900 dark:border-gray-500 dark:bg-gray-700 dark:text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800'
                }`}
              >
                <span
                  className="inline-block h-2 w-4 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

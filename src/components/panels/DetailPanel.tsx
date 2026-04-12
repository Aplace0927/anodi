import { useCallback, useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type {
  SourceLanguage,
  ClassField,
  ClassMethod,
  MemoryCollapsedRange,
  MemoryLayoutData,
  MemoryUnitSize,
  NodeData,
} from '../../types';
import { getEdgeStyle } from '../../types';
import { v4 } from '../../utils/uuid';
import { findEllipsisIndices } from '../../utils/code';
import ColorPicker from '../ColorPicker';

const LANGS: SourceLanguage[] = ['c', 'cpp', 'python', 'javascript', 'typescript', 'rust', 'go', 'ocaml', 'assembly (x86-64)', 'assembly (arm)'];

/** Maximum memory range per node: 4 KB (one page). */
const MAX_MEMORY_RANGE = 0x1000;

function parseHexAddr(s: string): number {
  const trimmed = s.trim().toLowerCase();
  if (trimmed.startsWith('0x')) return parseInt(trimmed, 16) || 0;
  if (/[a-f]/.test(trimmed)) return parseInt(trimmed, 16) || 0;
  return parseInt(trimmed, 10) || 0;
}

export default function DetailPanel() {
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const updateNodeName = useGraphStore((s) => s.updateNodeName);

  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);

  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const node = nodes.find((n) => n.id === selectedNodeId);

  const connectedEdges = edges.filter(
    (e) => e.source === selectedNodeId || e.target === selectedNodeId
  );

  const closePanel = useCallback(() => selectNode(null), [selectNode]);

  // ── Memory address draft state (deferred apply) ───────────────
  const nodeData = node?.data as (NodeData & { name?: string }) | undefined;
  const memData = nodeData?.kind === 'memory' ? nodeData as MemoryLayoutData : null;
  const [draftBase, setDraftBase] = useState(memData?.baseAddress ?? '');
  const [draftEnd, setDraftEnd] = useState(memData?.endAddress ?? '');
  const [addrError, setAddrError] = useState<string | null>(null);

  // Sync draft when the selected node or its stored addresses change
  useEffect(() => {
    if (memData) {
      setDraftBase(memData.baseAddress ?? '');
      setDraftEnd(memData.endAddress ?? '');
      setAddrError(null);
    }
  }, [selectedNodeId, memData?.baseAddress, memData?.endAddress]);

  if (!node) return null;
  if (node.type === 'group') return null;

  const data = node.data as NodeData & { name?: string };
  const nodeColor = typeof data.nodeColor === 'string' ? data.nodeColor : undefined;

  // ── Source code panel ──────────────────────────────────────────
  const renderSourcePanel = () => {
    if (data.kind !== 'source') return null;

    // Count how many "..." marker lines exist in the current code
    const ellipsisIndices = findEllipsisIndices(data.code || '');

    const handleMapChange = (ellipsisOrdinal: number, value: string) => {
      const num = parseInt(value, 10);
      const map = [...(data.collapsedLineMap ?? [])];
      if (isNaN(num)) {
        delete map[ellipsisOrdinal];
      } else {
        map[ellipsisOrdinal] = num;
      }
      updateNodeData(node.id, { collapsedLineMap: map });
    };

    return (
      <div className="flex flex-col gap-3">
        {/* Language selector */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Language</label>
          <select
            value={data.language}
            onChange={(e) =>
              updateNodeData(node.id, { language: e.target.value as SourceLanguage })
            }
            className="w-full rounded border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Open the inline editor (✎ button on the node) to edit code with syntax highlighting.
        </p>
        {/* Collapsed line map — one input per "..." marker */}
        {ellipsisIndices.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
              Collapsed section start lines
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-500">
              For each <code className="text-gray-700 dark:text-gray-300">...</code> line in the code, specify the line
              number where the next section begins.
            </p>
            {ellipsisIndices.map((_, ordinal) => (
              <div key={ordinal} className="mb-1 flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">After collapse {ordinal + 1}:</span>
                <input
                  type="number"
                  min={1}
                  value={(data.collapsedLineMap ?? [])[ordinal] ?? ''}
                  onChange={(e) => handleMapChange(ordinal, e.target.value)}
                  placeholder="line #"
                  className="w-20 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Class diagram panel ────────────────────────────────────────
  const renderClassPanel = () => {
    if (data.kind !== 'class') return null;

    const addField = () => {
      const f: ClassField = { id: v4(), name: 'field', type: 'int' };
      updateNodeData(node.id, { fields: [...data.fields, f] });
    };
    const removeField = (id: string) =>
      updateNodeData(node.id, { fields: data.fields.filter((f) => f.id !== id) });
    const updateField = (id: string, patch: Partial<ClassField>) =>
      updateNodeData(node.id, {
        fields: data.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      });

    const addMethod = () => {
      const m: ClassMethod = { id: v4(), signature: 'void method()' };
      updateNodeData(node.id, { methods: [...data.methods, m] });
    };
    const removeMethod = (id: string) =>
      updateNodeData(node.id, { methods: data.methods.filter((m) => m.id !== id) });
    const updateMethod = (id: string, patch: Partial<ClassMethod>) =>
      updateNodeData(node.id, {
        methods: data.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      });

    return (
      <div className="space-y-4">
        {/* Class name */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            Class Name
          </label>
          <input
            value={data.className}
            onChange={(e) => updateNodeData(node.id, { className: e.target.value })}
            className="w-full rounded border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Fields */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Fields</span>
            <button
              onClick={addField}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {data.fields.map((f) => (
            <div key={f.id} className="mb-1 flex items-center gap-1.5">
              <input
                value={f.type}
                onChange={(e) => updateField(f.id, { type: e.target.value })}
                placeholder="type"
                className="w-20 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-blue-600 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-blue-300"
              />
              <input
                value={f.name}
                onChange={(e) => updateField(f.id, { name: e.target.value })}
                placeholder="name"
                className="flex-1 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={() => removeField(f.id)}
                className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Methods */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Methods</span>
            <button
              onClick={addMethod}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {data.methods.map((m) => (
            <div key={m.id} className="mb-1 flex items-center gap-1.5">
              <input
                value={m.signature}
                onChange={(e) => updateMethod(m.id, { signature: e.target.value })}
                placeholder="signature"
                className="flex-1 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={() => removeMethod(m.id)}
                className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Memory layout panel ────────────────────────────────────────
  const renderMemoryPanel = () => {
    if (data.kind !== 'memory') return null;

    const addCollapsedRange = () => {
      const r: MemoryCollapsedRange = { id: v4(), start: '0x0000', end: '0x0100' };
      updateNodeData(node.id, { collapsedRanges: [...(data.collapsedRanges ?? []), r] });
    };
    const removeCollapsedRange = (id: string) =>
      updateNodeData(node.id, {
        collapsedRanges: (data.collapsedRanges ?? []).filter((r) => r.id !== id),
      });
    const updateCollapsedRange = (id: string, patch: Partial<MemoryCollapsedRange>) =>
      updateNodeData(node.id, {
        collapsedRanges: (data.collapsedRanges ?? []).map((r) =>
          r.id === id ? { ...r, ...patch } : r,
        ),
      });

    return (
      <div className="space-y-4">
        {/* Address range (deferred apply) */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            Address Range
          </label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-10 text-xs text-gray-500 dark:text-gray-400">From</span>
              <input
                value={draftBase}
                onChange={(e) => { setDraftBase(e.target.value); setAddrError(null); }}
                placeholder="e.g. 0x4000"
                className="flex-1 rounded border border-gray-300 bg-gray-100 px-2 py-1.5 font-mono text-xs text-green-700 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-green-300"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-10 text-xs text-gray-500 dark:text-gray-400">To</span>
              <input
                value={draftEnd}
                onChange={(e) => { setDraftEnd(e.target.value); setAddrError(null); }}
                placeholder="e.g. 0x4200"
                className="flex-1 rounded border border-gray-300 bg-gray-100 px-2 py-1.5 font-mono text-xs text-green-700 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-green-300"
              />
            </div>
          </div>
          {addrError && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">{addrError}</p>
          )}
          <button
            onClick={() => {
              const baseVal = parseHexAddr(draftBase);
              const endVal = parseHexAddr(draftEnd);
              if (baseVal >= endVal) {
                setAddrError('Start address must be smaller than end address.');
                return;
              }
              if (endVal - baseVal > MAX_MEMORY_RANGE) {
                setAddrError(`Range exceeds 4 KB (0x${MAX_MEMORY_RANGE.toString(16).toUpperCase()}). Max one page per node.`);
                return;
              }
              setAddrError(null);
              updateNodeData(node.id, { baseAddress: draftBase, endAddress: draftEnd });

              // Garbage-collect edges connected to addresses outside the new range
              const staleEdgeIds = connectedEdges
                .filter((e) => {
                  const handle =
                    e.source === node.id ? e.sourceHandle : e.targetHandle;
                  if (!handle) return false;
                  const m = handle.match(/^addr-(0x[0-9A-Fa-f]+)/);
                  if (!m) return false;
                  const addr = parseHexAddr(m[1]);
                  return addr < baseVal || addr >= endVal;
                })
                .map((e) => ({ type: 'remove' as const, id: e.id }));
              if (staleEdgeIds.length > 0) {
                onEdgesChange(staleEdgeIds);
              }
            }}
            className="mt-2 w-full rounded bg-orange-700 px-2 py-1 text-xs font-bold text-white hover:bg-orange-600"
          >
            Apply
          </button>
        </div>

        {/* Unit size */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            Unit Size (bytes)
          </label>
          <div className="flex gap-2">
            {([4, 8, 16] as MemoryUnitSize[]).map((u) => (
              <button
                key={u}
                onClick={() => updateNodeData(node.id, { unitSize: u })}
                className={`flex-1 rounded border py-1 text-xs font-normal transition-all ${
                  (data.unitSize ?? 8) === u
                    ? 'border-orange-500 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {u}B
              </button>
            ))}
          </div>
        </div>

        {/* Collapsed ranges */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Collapsed Ranges</span>
            <button
              onClick={addCollapsedRange}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-500">
            Address ranges to hide (exclusive end). Shown as <code className="text-gray-700 dark:text-gray-300">···</code> in the node.
          </p>
          {(data.collapsedRanges ?? []).map((r) => (
            <div key={r.id} className="mb-2 rounded border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex items-center gap-1.5">
                <input
                  value={r.start}
                  onChange={(e) => updateCollapsedRange(r.id, { start: e.target.value })}
                  placeholder="start"
                  className="w-24 rounded border border-gray-300 bg-gray-100 px-2 py-1 font-mono text-xs text-green-700 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-green-300"
                />
                <span className="text-gray-400 dark:text-gray-500">–</span>
                <input
                  value={r.end}
                  onChange={(e) => updateCollapsedRange(r.id, { end: e.target.value })}
                  placeholder="end"
                  className="w-24 rounded border border-gray-300 bg-gray-100 px-2 py-1 font-mono text-xs text-green-700 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-green-300"
                />
                <button
                  onClick={() => removeCollapsedRange(r.id)}
                  className="ml-auto text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {(data.collapsedRanges ?? []).length === 0 && (
            <p className="text-xs italic text-gray-500">No collapsed ranges</p>
          )}
        </div>
      </div>
    );
  };

  // ── Notepad panel ───────────────────────────────────────────────
  const renderNotepadPanel = () => {
    if (data.kind !== 'notepad') return null;
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Content</label>
          <textarea
            value={data.content}
            onChange={(e) => updateNodeData(node.id, { content: e.target.value })}
            placeholder="Write your notes…"
            rows={8}
            className="w-full rounded border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>
    );
  };

  const kindLabel =
    data.kind === 'source' ? 'Source Code' : data.kind === 'class' ? 'Class Diagram' : data.kind === 'notepad' ? 'Notepad' : 'Memory Layout';

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{kindLabel}</span>
        </div>
        <button onClick={closePanel} className="text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Node name */}
      <div className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Name</label>
        <input
          value={data.name ?? ''}
          onChange={(e) => updateNodeName(node.id, e.target.value)}
          className="w-full rounded border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      {/* Node color */}
      <div className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <ColorPicker
          label="Node Color"
          value={nodeColor}
          onChange={(color) => updateNodeData(node.id, { nodeColor: color })}
        />
      </div>

      {/* Type-specific content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {renderSourcePanel()}
        {renderClassPanel()}
        {renderMemoryPanel()}
        {renderNotepadPanel()}
      </div>

      {/* Connected edges */}
      {connectedEdges.length > 0 && (
        <div className="border-t border-gray-300 px-4 py-3 dark:border-gray-700">
          <p className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            Connections ({connectedEdges.length})
          </p>
          <ul className="space-y-1">
            {connectedEdges.map((e) => {
              const rel = e.data?.relationship ?? 'call';
              const style = getEdgeStyle(rel, useGraphStore.getState().userEdgeTypes);
              const otherId = e.source === node.id ? e.target : e.source;
              const other = nodes.find((n) => n.id === otherId);
              const otherData = other?.data as (NodeData & { name?: string }) | undefined;
              const otherName = otherData?.name ?? otherId;
              const direction = e.source === node.id ? '→' : '←';
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800"
                >
                  <span style={{ color: style.color }} className="font-bold">
                    {direction}
                  </span>
                  <span className="truncate text-gray-700 dark:text-gray-200">{otherName}</span>
                  <span
                    className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: style.color }}
                  >
                    {style.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

import { useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type {
  SourceLanguage,
  ClassField,
  ClassMethod,
  MemoryCollapsedRange,
  MemoryUnitSize,
  NodeData,
} from '../../types';
import { EDGE_STYLES } from '../../types';
import { v4 } from '../../utils/uuid';
import { findEllipsisIndices } from '../../utils/code';

const LANGS: SourceLanguage[] = ['c', 'cpp', 'python', 'javascript', 'typescript', 'rust', 'go'];

const MONACO_LANG: Record<SourceLanguage, string> = {
  c: 'c',
  cpp: 'cpp',
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  rust: 'rust',
  go: 'go',
};

export default function DetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const updateNodeName = useGraphStore((s) => s.updateNodeName);

  const node = nodes.find((n) => n.id === selectedNodeId);

  const connectedEdges = edges.filter(
    (e) => e.source === selectedNodeId || e.target === selectedNodeId
  );

  const closePanel = useCallback(() => selectNode(null), [selectNode]);

  if (!node) return null;

  const data = node.data as NodeData & { name?: string };

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
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Language</label>
          <select
            value={data.language}
            onChange={(e) =>
              updateNodeData(node.id, { language: e.target.value as SourceLanguage })
            }
            className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {/* Monaco editor */}
        <div className="overflow-hidden rounded border border-gray-600" style={{ height: 320 }}>
          <MonacoEditor
            height="100%"
            language={MONACO_LANG[data.language]}
            theme="vs-dark"
            value={data.code}
            onChange={(val) => updateNodeData(node.id, { code: val ?? '' })}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
        {/* Collapsed line map — one input per "..." marker */}
        {ellipsisIndices.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">
              Collapsed section start lines
            </label>
            <p className="mb-2 text-[10px] text-gray-500">
              For each <code className="text-gray-300">...</code> line in the code, specify the line
              number where the next section begins.
            </p>
            {ellipsisIndices.map((_, ordinal) => (
              <div key={ordinal} className="mb-1 flex items-center gap-2">
                <span className="text-xs text-gray-400">After collapse {ordinal + 1}:</span>
                <input
                  type="number"
                  min={1}
                  value={(data.collapsedLineMap ?? [])[ordinal] ?? ''}
                  onChange={(e) => handleMapChange(ordinal, e.target.value)}
                  placeholder="line #"
                  className="w-20 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white focus:outline-none"
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
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">
            Class Name
          </label>
          <input
            value={data.className}
            onChange={(e) => updateNodeData(node.id, { className: e.target.value })}
            className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Fields */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-400">Fields</span>
            <button
              onClick={addField}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-indigo-900/40"
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
                className="w-20 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-blue-300 focus:outline-none"
              />
              <input
                value={f.name}
                onChange={(e) => updateField(f.id, { name: e.target.value })}
                placeholder="name"
                className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white focus:outline-none"
              />
              <button
                onClick={() => removeField(f.id)}
                className="text-gray-500 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Methods */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-400">Methods</span>
            <button
              onClick={addMethod}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-indigo-900/40"
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
                className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white focus:outline-none"
              />
              <button
                onClick={() => removeMethod(m.id)}
                className="text-gray-500 hover:text-red-400"
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
        {/* Address range */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">
            Address Range
          </label>
          <div className="flex items-center gap-2">
            <input
              value={data.baseAddress ?? ''}
              onChange={(e) => updateNodeData(node.id, { baseAddress: e.target.value })}
              placeholder="Base (e.g. 0x4000)"
              className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1.5 font-mono text-xs text-green-300 focus:outline-none"
            />
            <span className="text-gray-500">–</span>
            <input
              value={data.endAddress ?? ''}
              onChange={(e) => updateNodeData(node.id, { endAddress: e.target.value })}
              placeholder="End (e.g. 0x4200)"
              className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1.5 font-mono text-xs text-green-300 focus:outline-none"
            />
          </div>
        </div>

        {/* Unit size */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">
            Unit Size (bytes)
          </label>
          <div className="flex gap-2">
            {([4, 8, 16] as MemoryUnitSize[]).map((u) => (
              <button
                key={u}
                onClick={() => updateNodeData(node.id, { unitSize: u })}
                className={`flex-1 rounded border py-1 text-xs font-medium transition-all ${
                  (data.unitSize ?? 8) === u
                    ? 'border-orange-500 bg-orange-900/40 text-orange-300'
                    : 'border-gray-600 text-gray-400 hover:border-gray-500'
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
            <span className="text-xs font-semibold uppercase text-gray-400">Collapsed Ranges</span>
            <button
              onClick={addCollapsedRange}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-indigo-900/40"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          <p className="mb-2 text-[10px] text-gray-500">
            Address ranges to hide (exclusive end). Shown as <code className="text-gray-300">···</code> in the node.
          </p>
          {(data.collapsedRanges ?? []).map((r) => (
            <div key={r.id} className="mb-2 rounded border border-gray-700 bg-gray-800/60 p-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={r.start}
                  onChange={(e) => updateCollapsedRange(r.id, { start: e.target.value })}
                  placeholder="start"
                  className="w-24 rounded border border-gray-600 bg-gray-700 px-2 py-1 font-mono text-xs text-green-300 focus:outline-none"
                />
                <span className="text-gray-500">–</span>
                <input
                  value={r.end}
                  onChange={(e) => updateCollapsedRange(r.id, { end: e.target.value })}
                  placeholder="end"
                  className="w-24 rounded border border-gray-600 bg-gray-700 px-2 py-1 font-mono text-xs text-green-300 focus:outline-none"
                />
                <button
                  onClick={() => removeCollapsedRange(r.id)}
                  className="ml-auto text-gray-500 hover:text-red-400"
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

  const kindLabel =
    data.kind === 'source' ? 'Source Code' : data.kind === 'class' ? 'Class Diagram' : 'Memory Layout';

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-700 bg-gray-900 text-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400">{kindLabel}</span>
        </div>
        <button onClick={closePanel} className="text-gray-500 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Node name */}
      <div className="border-b border-gray-700 px-4 py-3">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Name</label>
        <input
          value={data.name ?? ''}
          onChange={(e) => updateNodeName(node.id, e.target.value)}
          className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Type-specific content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {renderSourcePanel()}
        {renderClassPanel()}
        {renderMemoryPanel()}
      </div>

      {/* Connected edges */}
      {connectedEdges.length > 0 && (
        <div className="border-t border-gray-700 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase text-gray-400">
            Connections ({connectedEdges.length})
          </p>
          <ul className="space-y-1">
            {connectedEdges.map((e) => {
              const rel = e.data?.relationship ?? 'call';
              const style = EDGE_STYLES[rel];
              const otherId = e.source === node.id ? e.target : e.source;
              const other = nodes.find((n) => n.id === otherId);
              const otherData = other?.data as (NodeData & { name?: string }) | undefined;
              const otherName = otherData?.name ?? otherId;
              const direction = e.source === node.id ? '→' : '←';
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded bg-gray-800 px-2 py-1 text-xs"
                >
                  <span style={{ color: style.color }} className="font-bold">
                    {direction}
                  </span>
                  <span className="truncate text-gray-200">{otherName}</span>
                  <span
                    className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
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

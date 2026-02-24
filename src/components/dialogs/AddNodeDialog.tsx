import { useState } from 'react';
import { X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type { NodeData, SourceLanguage, MemoryUnitSize } from '../../types';

interface Props {
  onClose: () => void;
}

const LANGS: SourceLanguage[] = ['c', 'cpp', 'python', 'javascript', 'typescript', 'rust', 'go'];

export default function AddNodeDialog({ onClose }: Props) {
  const addNode = useGraphStore((s) => s.addNode);
  const [nodeType, setNodeType] = useState<'source' | 'class' | 'memory'>('source');
  const [name, setName] = useState('');
  const [lang, setLang] = useState<SourceLanguage>('python');
  const [baseAddress, setBaseAddress] = useState('0x0000');
  const [endAddress, setEndAddress] = useState('0x0100');
  const [unitSize, setUnitSize] = useState<MemoryUnitSize>(8);

  const handleAdd = () => {
    const n = name.trim() || 'Untitled';
    let data: NodeData;
    if (nodeType === 'source') {
      data = { kind: 'source', language: lang, code: '', collapsedLineMap: [] };
    } else if (nodeType === 'class') {
      data = { kind: 'class', className: n, fields: [], methods: [] };
    } else {
      data = {
        kind: 'memory',
        baseAddress: baseAddress.trim() || '0x0000',
        endAddress: endAddress.trim() || '0x0100',
        unitSize,
        collapsedRanges: [],
      };
    }
    addNode(n, data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-xl bg-white shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center justify-between rounded-t-xl bg-gray-800 px-4 py-3">
          <span className="font-semibold text-white">Add Node</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Node type */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Node Type
            </label>
            <div className="flex gap-2">
              {(['source', 'class', 'memory'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNodeType(t)}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                    nodeType === t
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t === 'source' ? '📄 Source' : t === 'class' ? '🔷 Class' : '🗃 Memory'}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={
                nodeType === 'class' ? 'ClassName' : nodeType === 'memory' ? 'Stack Frame' : 'main.c'
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Language (source only) */}
          {nodeType === 'source' && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                Language
              </label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as SourceLanguage)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Memory fields */}
          {nodeType === 'memory' && (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                    Base Address
                  </label>
                  <input
                    value={baseAddress}
                    onChange={(e) => setBaseAddress(e.target.value)}
                    placeholder="0x0000"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                    End Address
                  </label>
                  <input
                    value={endAddress}
                    onChange={(e) => setEndAddress(e.target.value)}
                    placeholder="0x0100"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                  Unit Size (bytes)
                </label>
                <div className="flex gap-2">
                  {([4, 8, 16] as MemoryUnitSize[]).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnitSize(u)}
                      className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                        unitSize === u
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {u}B
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Add Node
          </button>
        </div>
      </div>
    </div>
  );
}


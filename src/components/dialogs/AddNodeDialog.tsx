import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import { parseClassDefinition, withIds } from '../../utils/classParse';
import type { NodeData, SourceLanguage, MemoryUnitSize } from '../../types';

interface Props {
  onClose: () => void;
  getViewportCenter?: () => { x: number; y: number };
}

const LANGS: SourceLanguage[] = ['c', 'cpp', 'python', 'javascript', 'typescript', 'rust', 'go', 'ocaml', 'assembly (x86-64)', 'assembly (arm)'];

const EXT_LANG: Record<string, SourceLanguage> = {
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', rs: 'rust', go: 'go', ml: 'ocaml', mli: 'ocaml',
  s: 'assembly (x86-64)', asm: 'assembly (x86-64)',
};

export default function AddNodeDialog({ onClose, getViewportCenter }: Props) {
  const addNode = useGraphStore((s) => s.addNode);
  const [nodeType, setNodeType] = useState<'source' | 'class' | 'memory' | 'notepad'>('source');
  const [name, setName] = useState('');
  const [lang, setLang] = useState<SourceLanguage>('c');
  const [baseAddress, setBaseAddress] = useState('0x0000');
  const [endAddress, setEndAddress] = useState('0x0100');
  const [code, setCode] = useState('');
  const [pasteSrc, setPasteSrc] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (pasteSrc.trim() ? parseClassDefinition(pasteSrc) : null), [pasteSrc]);
  const [unitSize, setUnitSize] = useState<MemoryUnitSize>(8);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (EXT_LANG[ext]) setLang(EXT_LANG[ext]);
    setName(file.name);
    setCode(await file.text());
  };

  const handleAdd = () => {
    const n = name.trim() || (nodeType === 'class' && parsed ? parsed.className : 'Untitled');
    let data: NodeData;
    if (nodeType === 'source') {
      data = { kind: 'source', language: lang, code, collapsedLineMap: [] };
    } else if (nodeType === 'class') {
      data = { kind: 'class', className: parsed?.className ?? n, ...(parsed ? withIds(parsed) : { fields: [], methods: [] }) };
    } else if (nodeType === 'notepad') {
      data = { kind: 'notepad', content: '' };
    } else {
      data = {
        kind: 'memory',
        baseAddress: baseAddress.trim() || '0x0000',
        endAddress: endAddress.trim() || '0x0100',
        unitSize,
        collapsedRanges: [],
      };
    }
    addNode(n, data, getViewportCenter?.());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Title bar */}
        <div className="flex items-center justify-between rounded-t-xl bg-gray-800 px-4 py-3">
          <span className="font-bold text-white">Add Node</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Node type */}
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
              Node Type
            </label>
            <select
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value as 'source' | 'class' | 'memory' | 'notepad')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="source">📄 Source</option>
              <option value="class">🔷 Class</option>
              <option value="memory">🗃 Memory</option>
              <option value="notepad">📝 Note</option>
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={
                nodeType === 'class' ? 'ClassName' : nodeType === 'memory' ? 'Stack Frame' : nodeType === 'notepad' ? 'My Notes' : 'main.c'
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Language (source only) */}
          {nodeType === 'source' && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                Language
              </label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as SourceLanguage)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Source: prefill from file */}
          {nodeType === 'source' && (
            <div>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                {code ? `Loaded ${code.split('\n').length} lines — choose another file` : 'Prefill from file…'}
              </button>
            </div>
          )}

          {/* Class: paste definition */}
          {nodeType === 'class' && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                Paste definition (optional)
              </label>
              <textarea
                value={pasteSrc}
                onChange={(e) => setPasteSrc(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                rows={5}
                placeholder="C/C++ struct or class, Rust struct + impl, Python class, Java/TS class…"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              {pasteSrc.trim() && (
                <div className="mt-1 max-h-32 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {parsed ? (
                    <>
                      <div className="font-bold">{parsed.className}</div>
                      {parsed.fields.map((f, i) => (
                        <div key={`f${i}`}>
                          <span className="text-blue-600 dark:text-blue-400">{f.type}</span> {f.name}
                        </div>
                      ))}
                      {parsed.methods.map((m, i) => (
                        <div key={`m${i}`}>
                          <span className="text-green-700 dark:text-green-500">⚙ </span>
                          {m.signature}
                        </div>
                      ))}
                    </>
                  ) : (
                    <span className="italic text-gray-500">Could not parse a class definition.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Memory fields */}
          {nodeType === 'memory' && (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Base Address
                  </label>
                  <input
                    value={baseAddress}
                    onChange={(e) => setBaseAddress(e.target.value)}
                    placeholder="0x0000"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    End Address
                  </label>
                  <input
                    value={endAddress}
                    onChange={(e) => setEndAddress(e.target.value)}
                    placeholder="0x0100"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                  Unit Size (bytes)
                </label>
                <div className="flex gap-2">
                  {([4, 8, 16] as MemoryUnitSize[]).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnitSize(u)}
                      className={`flex-1 rounded-lg border-2 py-2 text-sm font-normal transition-all ${
                        unitSize === u
                          ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600'
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

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            Add Node
          </button>
        </div>
      </div>
    </div>
  );
}

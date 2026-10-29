import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import { useSearchStore } from '../../store/searchStore';
import { searchNodes } from '../../utils/search';
import { NODE_KIND_COLORS } from '../../theme/tokens';
import { useReactFlow } from '@xyflow/react';

const KINDS = ['source', 'class', 'memory', 'notepad', 'group'] as const;

export default function SearchPanel() {
  const { setCenter } = useReactFlow();
  const nodes = useGraphStore((s) => s.nodes);
  const query = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const selectNode = useGraphStore((s) => s.selectNode);
  const regex = useSearchStore((s) => s.regex);
  const setRegex = useSearchStore((s) => s.setRegex);
  const kinds = useSearchStore((s) => s.kinds);
  const toggleKind = useSearchStore((s) => s.toggleKind);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => searchNodes(nodes, query, { regex, kinds }), [nodes, query, regex, kinds]);

  useEffect(() => setActive(0), [query, regex, kinds]);

  const focusNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setCenter(node.position.x + 100, node.position.y + 80, { zoom: 1.2, duration: 500 });
    selectNode(nodeId);
  };

  // Keyboard navigation while the toolbar search input is focused.
  useEffect(() => {
    if (!query) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!t?.hasAttribute?.('data-anodi-search') || matches.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const m = matches[Math.min(active, matches.length - 1)];
        if (m) focusNode(m.nodeId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matches, active, nodes]);

  useEffect(() => {
    document.querySelector(`[data-search-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!query) return null;

  const chip = 'rounded-full border px-2 py-0.5 text-[11px] transition-colors';

  return (
    <div className="absolute left-1/2 top-14 z-30 w-96 max-w-[95vw] -translate-x-1/2 rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2 dark:border-gray-700">
        <span className="truncate text-xs font-bold text-gray-500 uppercase dark:text-gray-400">
          {matches.length} result{matches.length !== 1 ? 's' : ''} for "{query}"
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRegex(!regex)}
            title="Regular expression"
            className={`rounded px-1.5 py-0.5 font-mono text-xs ${regex ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
          >
            .*
          </button>
          <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b px-3 py-1.5 dark:border-gray-700">
        {KINDS.map((k) => {
          const on = kinds.includes(k);
          return (
            <button
              key={k}
              onClick={() => toggleKind(k)}
              className={`${chip} ${on ? 'text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
              style={on ? { backgroundColor: NODE_KIND_COLORS[k], borderColor: NODE_KIND_COLORS[k] } : undefined}
            >
              {k}
            </button>
          );
        })}
      </div>
      {matches.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">No matching nodes</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y dark:divide-gray-700">
          {matches.map((m, i) => (
            <li key={m.nodeId}>
              <button
                data-search-idx={i}
                onClick={() => focusNode(m.nodeId)}
                onMouseEnter={() => setActive(i)}
                className={`w-full px-4 py-2.5 text-left transition-colors ${i === active ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}
              >
                <div className="flex items-center gap-2">
                  <Search size={12} className="shrink-0 text-indigo-400" />
                  <span className="font-normal text-sm text-gray-800 truncate dark:text-gray-100">{m.nodeName}</span>
                  <span className="ml-auto shrink-0 text-xs text-gray-400">{m.nodeKind}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{m.context}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

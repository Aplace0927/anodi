
import { Search, X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import { searchNodes } from '../../utils/search';
import { useReactFlow } from '@xyflow/react';

export default function SearchPanel() {
  const { setCenter } = useReactFlow();
  const nodes = useGraphStore((s) => s.nodes);
  const query = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const selectNode = useGraphStore((s) => s.selectNode);

  const matches = searchNodes(nodes, query);

  const focusNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setCenter(
      node.position.x + 100,
      node.position.y + 80,
      { zoom: 1.2, duration: 500 }
    );
    selectNode(nodeId);
  };

  if (!query) return null;

  return (
    <div className="absolute left-1/2 top-14 z-30 w-96 -translate-x-1/2 rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2 dark:border-gray-700">
        <span className="text-xs font-bold text-gray-500 uppercase dark:text-gray-400">
          {matches.length} result{matches.length !== 1 ? 's' : ''} for "{query}"
        </span>
        <button
          onClick={() => setSearchQuery('')}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={14} />
        </button>
      </div>
      {matches.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">No matching nodes</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y dark:divide-gray-700">
          {matches.map((m) => (
            <li key={m.nodeId}>
              <button
                onClick={() => focusNode(m.nodeId)}
                className="w-full px-4 py-2.5 text-left hover:bg-indigo-50 transition-colors dark:hover:bg-indigo-900/30"
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

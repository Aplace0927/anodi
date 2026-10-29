import { memo, useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StickyNote, Pencil } from 'lucide-react';
import NodeHeader from './NodeHeader';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Components } from 'react-markdown';
import type { NotepadData } from '../../types';
import { useGraphStore } from '../../store/graphStore';


const MD_COMPONENTS: Components = {
  h1: (p) => <h1 className="mb-1 mt-2 text-lg font-bold first:mt-0">{p.children}</h1>,
  h2: (p) => <h2 className="mb-1 mt-2 text-base font-bold first:mt-0">{p.children}</h2>,
  h3: (p) => <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0">{p.children}</h3>,
  h4: (p) => <h4 className="mb-1 mt-1 text-sm font-semibold">{p.children}</h4>,
  p: (p) => <p className="mb-1.5 leading-snug">{p.children}</p>,
  ul: (p) => <ul className="mb-1.5 list-disc pl-5">{p.children}</ul>,
  ol: (p) => <ol className="mb-1.5 list-decimal pl-5">{p.children}</ol>,
  li: (p) => <li className="leading-snug">{p.children}</li>,
  blockquote: (p) => (
    <blockquote className="mb-1.5 border-l-2 border-gray-300 pl-2 text-gray-600 dark:border-gray-600 dark:text-gray-400">
      {p.children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-gray-300 dark:border-gray-600" />,
  a: (p) => (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline dark:text-indigo-400">
      {p.children}
    </a>
  ),
  pre: (p) => (
    <pre className="mb-1.5 overflow-x-auto rounded bg-gray-100 p-2 font-mono text-xs dark:bg-black/40">{p.children}</pre>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-gray-100 px-1 font-mono text-xs dark:bg-black/40">{children}</code>
    ),
  table: (p) => <table className="mb-1.5 border-collapse text-xs">{p.children}</table>,
  th: (p) => <th className="border border-gray-300 bg-gray-100 px-2 py-0.5 text-left dark:border-gray-600 dark:bg-gray-800">{p.children}</th>,
  td: (p) => <td className="border border-gray-300 px-2 py-0.5 dark:border-gray-600">{p.children}</td>,
  input: (p) => <input {...p} disabled className="mr-1 align-middle" />,
};

type Props = NodeProps & { data: NotepadData & { name?: string } };

const NotepadNode = memo(({ id, data, selected, dragging }: Props) => {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const edges = useGraphStore((s) => s.edges);
  const customColor = data.nodeColor;

  // Compute set of handle IDs that have a connected edge
  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);
  const [editing, setEditing] = useState(false);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { content: e.target.value });
    },
    [id, updateNodeData]
  );

  return (
    <div
      className={`anodi-export-node flex flex-col rounded-lg border-2 bg-white shadow-lg transition-all dark:bg-gray-900 dark:text-white ${
        selected
          ? customColor
            ? 'shadow-lg'
            : 'border-indigo-400 shadow-indigo-400/40 shadow-lg'
          : customColor
            ? ''
            : 'border-gray-300 dark:border-gray-600'
      }`}
      style={{
        minWidth: 200,
        minHeight: 120,
        width: '100%',
        height: '100%',
        position: 'relative',
        ...(customColor
          ? {
              borderColor: selected ? customColor : `${customColor}99`,
              boxShadow: selected ? `0 10px 15px -3px ${customColor}40` : undefined,
            }
          : {}),
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-indigo-400"
        handleClassName="!bg-indigo-400 !w-2 !h-2 !border-indigo-500"
      />

      <Handle type="target" position={Position.Top} id="top" style={{ background: '#9ca3af', width: 7, height: 7, opacity: 0 }} />
      <Handle type="source" position={Position.Top} id="top" className={connectedHandles.has('top') ? 'anodi-connected' : undefined} style={{ background: '#9ca3af', width: 7, height: 7 }} />

      <NodeHeader
        kind="notepad"
        icon={StickyNote}
        name={data.name ?? 'Untitled'}
        nodeColor={customColor}
        actions={
          <button
            className="nodrag opacity-70 hover:opacity-100"
            title={editing ? 'Done editing' : 'Edit note'}
            onClick={(e) => {
              e.stopPropagation();
              setEditing((v) => !v);
            }}
          >
            <Pencil size={13} />
          </button>
        }
      />

      {/* Content */}
      {dragging ? (
        <div className="mx-1 mb-2 flex-1 rounded bg-gray-100 dark:bg-black/40" style={{ minHeight: 24 }} />
      ) : editing ? (
        <div className="anodi-export-data flex-1 p-2">
          <textarea
            autoFocus
            value={data.content}
            onChange={handleContentChange}
            onBlur={() => setEditing(false)}
            placeholder="Write Markdown notes here…"
            className="nodrag nopan nowheel h-full w-full resize-none rounded border border-gray-200 bg-gray-50 p-2 font-mono text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
            style={{ minHeight: 60 }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setEditing(false);
            }}
            onWheel={(e) => e.stopPropagation()}
          />
        </div>
      ) : (
        <div
          className="anodi-export-data nodrag nopan nowheel min-h-0 flex-1 overflow-auto p-2 text-sm text-gray-800 dark:text-gray-200"
          style={{ minHeight: 60 }}
          onDoubleClick={() => setEditing(true)}
          onWheel={(e) => e.stopPropagation()}
        >
          {data.content?.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {data.content}
            </ReactMarkdown>
          ) : (
            <span className="text-gray-400 italic">Double-click to write Markdown…</span>
          )}
        </div>
      )}

      <Handle type="target" position={Position.Bottom} id="bottom" style={{ background: '#9ca3af', width: 7, height: 7, opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={connectedHandles.has('bottom') ? 'anodi-connected' : undefined} style={{ background: '#9ca3af', width: 7, height: 7 }} />
    </div>
  );
});

NotepadNode.displayName = 'NotepadNode';
export default NotepadNode;

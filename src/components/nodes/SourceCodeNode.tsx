import { memo, useState, useMemo, lazy, Suspense } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Edit2, Check, FileCode } from 'lucide-react';
import NodeHeader from './NodeHeader';
import type { SourceCodeData, SourceLanguage } from '../../types';
import { ELLIPSIS_MARKER, findEllipsisIndices } from '../../utils/code';
import { useGraphStore } from '../../store/graphStore';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../../hooks/useTheme';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const DEFAULT_HIGHLIGHT = '#facc15';
const NOTE_INLINE_MAX = 36;

type Props = NodeProps & { data: SourceCodeData & { name?: string } };

const LANG_COLORS: Record<string, string> = {
  c: 'bg-blue-700',
  cpp: 'bg-blue-500',
  python: 'bg-yellow-500',
  javascript: 'bg-yellow-300 text-black',
  typescript: 'bg-blue-400',
  rust: 'bg-orange-600',
  go: 'bg-cyan-500',
  ocaml: 'bg-amber-600',
  'assembly (x86-64)': 'bg-gray-400',
  'assembly (arm)': 'bg-gray-400',
};

const LANGS: SourceLanguage[] = ['c', 'cpp', 'python', 'javascript', 'typescript', 'rust', 'go', 'ocaml', 'assembly (x86-64)', 'assembly (arm)'];
const MONACO_LANG: Record<SourceLanguage, string> = {
  c: 'c',
  cpp: 'cpp',
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  rust: 'rust',
  go: 'go',
  ocaml: 'ocaml',
  'assembly (x86-64)': 'nasm', // Fallback for basic highlighting
  'assembly (arm)': 'arm-asm',
};

const SYNTAX_HIGHLIGHTER_LANG: Record<SourceLanguage, string> = {
  c: 'c',
  cpp: 'cpp',
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  rust: 'rust',
  go: 'go',
  ocaml: 'ocaml',
  'assembly (x86-64)': 'nasm',
  'assembly (arm)': 'arm-asm',
};

// Fixed pixel heights (must match the JSX inline styles below)
const HEADER_H = 40;
const CONTENT_START = HEADER_H;
const LINE_H = 20;
const ELLIPSIS_H = 16;

type LineItem = { num: number; content: string } | '...';

function parseLines(code: string, collapsedLineMap: number[]): LineItem[] {
  const rawLines = (code || '').split('\n');
  const items: LineItem[] = [];
  let lineNum = 1;
  let ellipsisIdx = 0;

  for (const raw of rawLines) {
    if (raw.trim() === ELLIPSIS_MARKER) {
      items.push('...');
      const nextStart = collapsedLineMap[ellipsisIdx];
      ellipsisIdx++;
      if (nextStart !== undefined && nextStart > lineNum) {
        lineNum = nextStart;
      }
    } else {
      items.push({ num: lineNum, content: raw });
      lineNum++;
    }
  }

  return items;
}

const SourceCodeNode = memo(({ id, data, selected, dragging }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [noteEdit, setNoteEdit] = useState<{ line: number; text: string } | null>(null);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const edges = useGraphStore((s) => s.edges);
  const { theme } = useTheme();

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const langColor = LANG_COLORS[data.language] ?? 'bg-gray-500';
  const items = dragging ? [] : parseLines(data.code, data.collapsedLineMap ?? []);
  const ellipsisIndices = dragging ? [] : findEllipsisIndices(data.code || '');
  const customColor = data.nodeColor;
  const highlights = data.highlights ?? [];
  const lineNotes = data.lineNotes ?? [];
  const hlMap = new Map(highlights.map((h) => [h.line, h.color ?? DEFAULT_HIGHLIGHT]));
  const noteMap = new Map(lineNotes.map((n) => [n.line, n.text]));

  const toggleHighlight = (line: number) => {
    updateNodeData(id, {
      highlights: hlMap.has(line)
        ? highlights.filter((h) => h.line !== line)
        : [...highlights, { line }],
    });
  };
  const saveNote = (line: number, text: string) => {
    const rest = lineNotes.filter((n) => n.line !== line);
    updateNodeData(id, { lineNotes: text.trim() ? [...rest, { line, text: text.trim() }] : rest });
  };
  const onLineNumberClick = (e: React.MouseEvent, line: number) => {
    if (e.altKey) {
      e.stopPropagation();
      toggleHighlight(line);
    } else if (e.shiftKey) {
      e.stopPropagation();
      setNoteEdit({ line, text: noteMap.get(line) ?? '' });
    }
  };

  // Compute cumulative Y positions for each visible line (for handle placement)
  let yOffset = 0;
  const linePositions: { num: number; top: number }[] = [];
  if (!dragging) {
    for (const item of items) {
      if (item === '...') {
        yOffset += ELLIPSIS_H;
      } else {
        linePositions.push({ num: item.num, top: CONTENT_START + yOffset + LINE_H / 2 });
        yOffset += LINE_H;
      }
    }
  }

  const handleMapChange = (ordinal: number, value: string) => {
    const num = parseInt(value, 10);
    const map = [...(data.collapsedLineMap ?? [])];
    if (isNaN(num)) {
      delete map[ordinal];
    } else {
      map[ordinal] = num;
    }
    updateNodeData(id, { collapsedLineMap: map });
  };

  return (
    <div
      className={`anodi-export-node font-mono rounded-lg border-2 bg-white text-gray-900 shadow-lg transition-all dark:bg-gray-900 dark:text-white ${
        selected
          ? customColor
            ? 'shadow-lg'
            : 'border-blue-400 shadow-blue-400/40 shadow-lg'
          : customColor
            ? ''
            : 'border-gray-300 dark:border-gray-600'
      }`}
      style={{
        minWidth: isEditing ? 480 : 280,
        position: 'relative',
        ...(customColor
          ? {
              borderColor: selected ? customColor : `${customColor}99`,
              boxShadow: selected ? `0 10px 15px -3px ${customColor}40` : undefined,
            }
          : {}),
      }}
    >
      {/* Left handles — target (hidden, underneath) then source (visible, on top) */}
      {isEditing ? null : linePositions.map(({ num, top }) => (
        <Handle
          key={`line-${num}-L-tgt`}
          type="target"
          position={Position.Left}
          id={`line-${num}-left`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7, opacity: 0 }}
        />
      ))}
      {isEditing ? null : linePositions.map(({ num, top }) => (
        <Handle
          key={`line-${num}-L`}
          type="source"
          position={Position.Left}
          id={`line-${num}-left`}
          className={connectedHandles.has(`line-${num}-left`) ? 'anodi-connected' : undefined}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7 }}
        />
      ))}

      {/* Right handles — target (hidden, underneath) then source (visible, on top) */}
      {isEditing ? null : linePositions.map(({ num, top }) => (
        <Handle
          key={`line-${num}-R-tgt`}
          type="target"
          position={Position.Right}
          id={`line-${num}-right`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7, opacity: 0 }}
        />
      ))}
      {isEditing ? null : linePositions.map(({ num, top }) => (
        <Handle
          key={`line-${num}-R`}
          type="source"
          position={Position.Right}
          id={`line-${num}-right`}
          className={connectedHandles.has(`line-${num}-right`) ? 'anodi-connected' : undefined}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 7, height: 7 }}
        />
      ))}

      <NodeHeader
        kind="source"
        icon={FileCode}
        name={data.name ?? 'Untitled'}
        nodeColor={customColor}
        height={HEADER_H}
        mono
        badge={
          <span
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold font-mono uppercase text-white ${langColor}`}
          >
            {data.language}
          </span>
        }
        actions={
          <button
            className="nodrag opacity-70 hover:opacity-100"
            title={isEditing ? 'Done editing' : 'Edit code'}
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing((v) => !v);
            }}
          >
            {isEditing ? <Check size={13} /> : <Edit2 size={13} />}
          </button>
        }
      />

      {dragging ? (
        /* ── Drag mode: lightweight placeholder ───────────────────── */
        <div
          className="mx-1 mb-2 rounded bg-gray-100 dark:bg-black/40"
          style={{ minHeight: 24 }}
        />
      ) : isEditing ? (
        /* ── Edit mode: inline Monaco editor ─────────────────────── */
        <div
          className="nodrag nopan nowheel mx-1 my-2 flex flex-col gap-2"
          onKeyDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Language selector */}
          <div className="flex items-center gap-2 px-1">
            <label className="shrink-0 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
              Language
            </label>
            <select
              value={data.language}
              onChange={(e) =>
                updateNodeData(id, { language: e.target.value as SourceLanguage })
              }
              className="flex-1 rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Monaco editor */}
          <div
            className="overflow-hidden rounded border border-gray-300 dark:border-gray-600"
            style={{ height: 300 }}
          >
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-gray-500">Loading editor…</div>}>
            <MonacoEditor
              height="100%"
              language={MONACO_LANG[data.language]}
              theme="vs-dark"
              value={data.code}
              onChange={(val) => updateNodeData(id, { code: val ?? '' })}
              options={{
                minimap: { enabled: false },
                // Monaco requires numeric font size values.
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'off',
              }}
            />
            </Suspense>
          </div>

          {/* Collapsed line map — one input per "..." marker */}
          {ellipsisIndices.length > 0 && (
            <div className="px-1">
              <label className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                Collapsed section start lines
              </label>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-500">
                For each <code className="text-gray-700 dark:text-gray-300">...</code> line, set the line number
                where the next section begins.
              </p>
              {ellipsisIndices.map((_, ordinal) => (
                <div key={ordinal} className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    After collapse {ordinal + 1}:
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={(data.collapsedLineMap ?? [])[ordinal] ?? ''}
                    onChange={(e) => handleMapChange(ordinal, e.target.value)}
                    placeholder="line #"
                    className="w-16 rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── View mode: Code lines ────────────────────────────────── */
        <div className="anodi-export-data mx-1 mb-2 overflow-hidden rounded bg-gray-100 dark:bg-black/40">
          {items.length === 0 && (
            <div
              className="flex items-center px-2 text-xs italic text-gray-500"
              style={{ height: LINE_H }}
            >
              empty
            </div>
          )}
          {items.map((item, idx) => {
            if (item === '...') {
              return (
                <div
                  key={`ellipsis-${idx}`}
                  className="flex items-center gap-2 px-2"
                  style={{ height: ELLIPSIS_H }}
                >
                  <span className="w-8 select-none text-right font-mono text-xs text-gray-600">
                    ···
                  </span>
                  <span className="font-mono text-xs text-gray-500">···</span>
                </div>
              );
            }
            const hl = hlMap.get(item.num);
            const note = noteMap.get(item.num);
            return (
              <div
                key={`line-${item.num}-${idx}`}
                className="relative flex items-center gap-2 px-2 hover:bg-gray-200/50 dark:hover:bg-gray-700/30"
                style={{ height: LINE_H, ...(hl ? { backgroundColor: `${hl}33` } : {}) }}
                title={note}
              >
                {note !== undefined && (
                  <span className="absolute left-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-indigo-500" />
                )}
                <span
                  className="nodrag w-8 shrink-0 cursor-pointer select-none text-right font-mono text-xs text-gray-500 hover:text-indigo-500"
                  title="Alt-click: highlight line · Shift-click: line note"
                  onClick={(e) => onLineNumberClick(e, item.num)}
                >
                  {item.num}
                </span>
                <div className="flex-1 overflow-hidden text-xs">
                  <SyntaxHighlighter
                    language={SYNTAX_HIGHLIGHTER_LANG[data.language]}
                    style={theme === 'dark' ? dracula : oneLight}
                    showLineNumbers={false}
                    wrapLines={true}
                    customStyle={{
                      backgroundColor: 'transparent',
                      margin: '0',
                      lineHeight: '1',
                      background: 'transparent'
                    }}
                    codeTagProps={{
                      style: {
                        fontFamily: 'monospace',
                        lineHeight: '1',
                        background: 'transparent'
                      },
                    }}
                  >
                    {item.content}
                  </SyntaxHighlighter>
                </div>
                {note && note.length <= NOTE_INLINE_MAX && (
                  <span className="max-w-[40%] shrink-0 truncate font-mono text-xs italic text-gray-400 dark:text-gray-500">
                    {'// '}
                    {note}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {noteEdit && !isEditing && (() => {
        const pos = linePositions.find((l) => l.num === noteEdit.line);
        if (!pos) return null;
        const commit = () => {
          saveNote(noteEdit.line, noteEdit.text);
          setNoteEdit(null);
        };
        return (
          <div
            className="nodrag nopan absolute z-20 flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1.5 shadow-lg dark:border-gray-600 dark:bg-gray-800"
            style={{ top: pos.top + LINE_H / 2 + 2, left: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="px-1 text-xs text-gray-500">L{noteEdit.line}</span>
            <input
              autoFocus
              value={noteEdit.text}
              placeholder="Note…"
              onChange={(e) => setNoteEdit({ ...noteEdit, text: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setNoteEdit(null);
              }}
              className="w-44 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <button className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white hover:bg-indigo-700" onClick={commit}>
              Save
            </button>
            {noteMap.has(noteEdit.line) && (
              <button
                className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                onClick={() => {
                  saveNote(noteEdit.line, '');
                  setNoteEdit(null);
                }}
              >
                Delete
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
});

SourceCodeNode.displayName = 'SourceCodeNode';
export default SourceCodeNode;

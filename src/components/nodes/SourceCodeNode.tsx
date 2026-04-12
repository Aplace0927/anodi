import { memo, useState, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import MonacoEditor from '@monaco-editor/react';
import { Edit2, Check } from 'lucide-react';
import type { SourceCodeData, SourceLanguage } from '../../types';
import { ELLIPSIS_MARKER, findEllipsisIndices } from '../../utils/code';
import { useGraphStore } from '../../store/graphStore';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { contrastTextColor } from '../ColorPicker';
import { useTheme } from '../../hooks/useTheme';

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
  const headerTextColor = customColor ? contrastTextColor(customColor) : undefined;

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

      {/* Header */}
      <div
        className={`anodi-export-data flex items-center gap-2 rounded-t-lg px-3 ${customColor ? '' : 'bg-gray-200 dark:bg-gray-800'}`}
        style={{ height: HEADER_H, ...(customColor ? { backgroundColor: customColor } : {}) }}
      >
        <span
          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold font-mono uppercase text-white ${langColor}`}
        >
          {data.language}
        </span>
        <span
          className={`flex-1 truncate text-sm font-bold font-mono ${headerTextColor ? '' : 'text-gray-800 dark:text-gray-100'}`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
        >
          {data.name ?? 'Untitled'}
        </span>
        <button
          className={`shrink-0 ${headerTextColor ? '' : 'text-gray-500 dark:text-gray-400'} hover:text-gray-900 dark:hover:text-white`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
          title={isEditing ? 'Done editing' : 'Edit code'}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing((v) => !v);
          }}
        >
          {isEditing ? <Check size={13} /> : <Edit2 size={13} />}
        </button>
      </div>

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
            return (
              <div
                key={`line-${item.num}-${idx}`}
                className="flex items-center gap-2 px-2 hover:bg-gray-200/50 dark:hover:bg-gray-700/30"
                style={{ height: LINE_H }}
              >
                <span className="w-8 shrink-0 select-none text-right font-mono text-xs text-gray-500">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

SourceCodeNode.displayName = 'SourceCodeNode';
export default SourceCodeNode;

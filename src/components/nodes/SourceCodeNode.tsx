import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import MonacoEditor from '@monaco-editor/react';
import { Edit2, Check } from 'lucide-react';
import type { SourceCodeData, SourceLanguage } from '../../types';
import { ELLIPSIS_MARKER, findEllipsisIndices } from '../../utils/code';
import { useGraphStore } from '../../store/graphStore';

type Props = NodeProps & { data: SourceCodeData & { name?: string } };

const LANG_COLORS: Record<string, string> = {
  c: 'bg-blue-700',
  cpp: 'bg-blue-500',
  python: 'bg-yellow-500',
  javascript: 'bg-yellow-300 text-black',
  typescript: 'bg-blue-400',
  rust: 'bg-orange-600',
  go: 'bg-cyan-500',
};

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

// Fixed pixel heights (must match the JSX inline styles below)
const HEADER_H = 40;
const BADGE_H = 24;
const CONTENT_START = HEADER_H + BADGE_H; // = 64
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

const SourceCodeNode = memo(({ id, data, selected }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);

  const langColor = LANG_COLORS[data.language] ?? 'bg-gray-500';
  const items = parseLines(data.code, data.collapsedLineMap ?? []);
  const ellipsisIndices = findEllipsisIndices(data.code || '');

  // Compute cumulative Y positions for each visible line (for handle placement)
  let yOffset = 0;
  const linePositions: { num: number; top: number }[] = [];
  for (const item of items) {
    if (item === '...') {
      yOffset += ELLIPSIS_H;
    } else {
      linePositions.push({ num: item.num, top: CONTENT_START + yOffset + LINE_H / 2 });
      yOffset += LINE_H;
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
      className={`rounded-lg border-2 bg-gray-900 text-white shadow-lg transition-all ${
        selected ? 'border-blue-400 shadow-blue-400/40 shadow-lg' : 'border-gray-600'
      }`}
      style={{ minWidth: isEditing ? 480 : 280 }}
    >
      {/* Left handles (target) — one per visible line */}
      {linePositions.map(({ num, top }) => (
        <Handle
          key={`line-${num}-L`}
          type="target"
          position={Position.Left}
          id={`line-${num}-left`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 8, height: 8 }}
        />
      ))}

      {/* Right handles (source) — one per visible line */}
      {linePositions.map(({ num, top }) => (
        <Handle
          key={`line-${num}-R`}
          type="source"
          position={Position.Right}
          id={`line-${num}-right`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 8, height: 8 }}
        />
      ))}

      {/* Header */}
      <div
        className="flex items-center gap-2 rounded-t-lg bg-gray-800 px-3"
        style={{ height: HEADER_H }}
      >
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white ${langColor}`}
        >
          {data.language}
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-gray-100">
          {data.name ?? 'Untitled'}
        </span>
        <button
          className="shrink-0 text-gray-400 hover:text-white"
          title={isEditing ? 'Done editing' : 'Edit code'}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing((v) => !v);
          }}
        >
          {isEditing ? <Check size={13} /> : <Edit2 size={13} />}
        </button>
      </div>

      {/* Badge */}
      <div className="flex items-center px-3" style={{ height: BADGE_H }}>
        <span className="rounded bg-indigo-900/60 px-2 py-0.5 text-[10px] text-indigo-300">
          source code
        </span>
      </div>

      {isEditing ? (
        /* ── Edit mode: inline Monaco editor ─────────────────────── */
        <div
          className="nodrag nopan nowheel mx-1 mb-2 flex flex-col gap-2"
          onKeyDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Language selector */}
          <div className="flex items-center gap-2 px-1">
            <label className="shrink-0 text-[10px] font-semibold uppercase text-gray-400">
              Language
            </label>
            <select
              value={data.language}
              onChange={(e) =>
                updateNodeData(id, { language: e.target.value as SourceLanguage })
              }
              className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-xs text-white focus:outline-none"
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
            className="overflow-hidden rounded border border-gray-600"
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
                fontSize: 11,
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
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">
                Collapsed section start lines
              </label>
              <p className="mb-1 text-[10px] text-gray-500">
                For each <code className="text-gray-300">...</code> line, set the line number
                where the next section begins.
              </p>
              {ellipsisIndices.map((_, ordinal) => (
                <div key={ordinal} className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    After collapse {ordinal + 1}:
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={(data.collapsedLineMap ?? [])[ordinal] ?? ''}
                    onChange={(e) => handleMapChange(ordinal, e.target.value)}
                    placeholder="line #"
                    className="w-16 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-xs text-white focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── View mode: Code lines ────────────────────────────────── */
        <div className="mx-1 mb-2 overflow-hidden rounded bg-black/40">
          {items.length === 0 && (
            <div
              className="flex items-center px-2 text-[10px] italic text-gray-500"
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
                  <span className="w-8 select-none text-right font-mono text-[9px] text-gray-600">
                    ···
                  </span>
                  <span className="font-mono text-[9px] text-gray-500">···</span>
                </div>
              );
            }
            return (
              <div
                key={`line-${item.num}-${idx}`}
                className="flex items-center gap-2 px-2 hover:bg-gray-700/30"
                style={{ height: LINE_H }}
              >
                <span className="w-8 shrink-0 select-none text-right font-mono text-[9px] text-gray-500">
                  {item.num}
                </span>
                <span className="flex-1 overflow-hidden whitespace-pre font-mono text-[10px] text-green-300">
                  {item.content}
                </span>
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

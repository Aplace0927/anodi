import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SourceCodeData } from '../../types';

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
    if (raw.trim() === '...') {
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

const SourceCodeNode = memo(({ data, selected }: Props) => {
  const langColor = LANG_COLORS[data.language] ?? 'bg-gray-500';
  const items = parseLines(data.code, data.collapsedLineMap ?? []);

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

  return (
    <div
      className={`min-w-[280px] rounded-lg border-2 bg-gray-900 text-white shadow-lg transition-all ${
        selected ? 'border-blue-400 shadow-blue-400/40 shadow-lg' : 'border-gray-600'
      }`}
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
        <span className="truncate text-sm font-semibold text-gray-100">
          {data.name ?? 'Untitled'}
        </span>
      </div>

      {/* Badge */}
      <div className="flex items-center px-3" style={{ height: BADGE_H }}>
        <span className="rounded bg-indigo-900/60 px-2 py-0.5 text-[10px] text-indigo-300">
          source code
        </span>
      </div>

      {/* Code lines */}
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
    </div>
  );
});

SourceCodeNode.displayName = 'SourceCodeNode';
export default SourceCodeNode;

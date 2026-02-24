import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MemoryLayoutData, MemoryCollapsedRange } from '../../types';

type Props = NodeProps & { data: MemoryLayoutData & { name?: string } };

// Fixed pixel heights (must match JSX inline styles below)
const HEADER_H = 44;
const BADGE_H = 24;
const CONTENT_START = HEADER_H + BADGE_H; // = 68
const UNIT_H = 20;
const ELLIPSIS_H = 16;

function parseHexAddr(s: string): number {
  const n = parseInt(s.trim(), 16);
  return isNaN(n) ? 0 : n;
}

function fmtHex(n: number, padLen: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(padLen, '0');
}

type MemItem = { addr: number; label: string } | '...';

function buildMemItems(
  baseAddress: string,
  endAddress: string,
  unitSize: number,
  collapsedRanges: MemoryCollapsedRange[],
): MemItem[] {
  const base = parseHexAddr(baseAddress);
  const end = parseHexAddr(endAddress);
  if (end <= base || unitSize <= 0) return [];

  const collapsed = collapsedRanges.map((r) => ({
    start: parseHexAddr(r.start),
    end: parseHexAddr(r.end),
  }));

  // Compute padding width from the end address so all labels are consistent
  const padLen = Math.max(4, end.toString(16).length);

  const isCollapsed = (addr: number) =>
    collapsed.some((r) => addr >= r.start && addr < r.end);

  const items: MemItem[] = [];
  let inCollapse = false;
  for (let addr = base; addr < end; addr += unitSize) {
    if (isCollapsed(addr)) {
      if (!inCollapse) {
        items.push('...');
        inCollapse = true;
      }
    } else {
      inCollapse = false;
      items.push({ addr, label: fmtHex(addr, padLen) });
    }
  }

  return items;
}

const MemoryLayoutNode = memo(({ data, selected }: Props) => {
  const unitSize = data.unitSize ?? 8;
  const items = buildMemItems(
    data.baseAddress ?? '0x0000',
    data.endAddress ?? '0x0000',
    unitSize,
    data.collapsedRanges ?? [],
  );

  // Compute Y positions for each visible unit (for handle placement)
  let yOffset = 0;
  const unitPositions: { addr: number; label: string; top: number }[] = [];
  for (const item of items) {
    if (item === '...') {
      yOffset += ELLIPSIS_H;
    } else {
      unitPositions.push({ ...item, top: CONTENT_START + yOffset + UNIT_H / 2 });
      yOffset += UNIT_H;
    }
  }

  return (
    <div
      className={`min-w-[260px] rounded-lg border-2 bg-gray-950 text-white shadow-lg transition-all ${
        selected ? 'border-orange-400 shadow-orange-400/30 shadow-lg' : 'border-gray-700'
      }`}
    >
      {/* Left handles (target) — one per visible unit */}
      {unitPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-L`}
          type="target"
          position={Position.Left}
          id={`addr-${label}-left`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 8, height: 8 }}
        />
      ))}

      {/* Right handles (source) — one per visible unit */}
      {unitPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-R`}
          type="source"
          position={Position.Right}
          id={`addr-${label}-right`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 8, height: 8 }}
        />
      ))}

      {/* Header */}
      <div className="rounded-t-lg bg-orange-800 px-3 py-2" style={{ height: HEADER_H }}>
        <div className="text-[10px] text-orange-200">memory layout</div>
        <div className="truncate font-bold text-orange-50">{data.name ?? 'Untitled'}</div>
      </div>

      {/* Badge */}
      <div className="flex items-center px-3" style={{ height: BADGE_H }}>
        <span className="truncate rounded bg-orange-900/50 px-2 py-0.5 text-[10px] text-orange-300">
          {unitSize}B / unit · {data.baseAddress ?? '?'} – {data.endAddress ?? '?'}
        </span>
      </div>

      {/* Memory units */}
      <div className="mx-1 mb-2 overflow-hidden rounded bg-black/40">
        {items.length === 0 && (
          <div
            className="flex items-center px-2 text-[10px] italic text-gray-500"
            style={{ height: UNIT_H }}
          >
            No valid range
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
                <span className="font-mono text-[9px] text-gray-500">···</span>
              </div>
            );
          }
          return (
            <div
              key={`addr-${item.addr}`}
              className="flex items-center gap-2 px-2 hover:bg-gray-700/30"
              style={{ height: UNIT_H }}
            >
              <span className="font-mono text-[10px] text-green-400">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

MemoryLayoutNode.displayName = 'MemoryLayoutNode';
export default MemoryLayoutNode;

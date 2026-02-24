import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Edit2, Check, Plus, Trash2 } from 'lucide-react';
import type { MemoryLayoutData, MemoryCollapsedRange, MemoryCell, MemoryCellType } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { v4 } from '../../utils/uuid';

type Props = NodeProps & { data: MemoryLayoutData & { name?: string } };

// ── Global settings ────────────────────────────────────────────────
/** Byte threshold above which the memory layout auto-collapses the middle. */
export const MEMORY_THRESHOLD = 0x100; // 256 bytes
/** Number of unit-rows to show at the head and tail when auto-collapsing. */
export const MEMORY_LINES = 4;

// Fixed pixel heights (must match JSX inline styles below)
const HEADER_H = 44;
const BADGE_H = 24;
const CONTENT_START = HEADER_H + BADGE_H; // = 68
const ROW_H = 20;
const ELLIPSIS_H = 16;

// Node width components (px) — used to compute min-width from unitSize
const ADDR_COL_W = 64;
const GAP_W = 4;
const BYTE_CELL_W = 20;
const ANNOTATION_COL_W = 80;

// Field-annotation colour palette (cycling)
const FIELD_COLORS = [
  { bg: 'bg-blue-800',   text: 'text-blue-200',   border: 'border-blue-500'   },
  { bg: 'bg-purple-800', text: 'text-purple-200', border: 'border-purple-500' },
  { bg: 'bg-teal-800',   text: 'text-teal-200',   border: 'border-teal-500'   },
  { bg: 'bg-pink-800',   text: 'text-pink-200',   border: 'border-pink-500'   },
  { bg: 'bg-yellow-800', text: 'text-yellow-200', border: 'border-yellow-500' },
];

// ── Byte-level utilities ───────────────────────────────────────────

function parseHexAddr(s: string): number {
  const n = parseInt(s.trim(), 16);
  return isNaN(n) ? 0 : n;
}

function fmtHex(n: number, padLen: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(padLen, '0');
}

/** Parse "41 42 43 00" → [0x41, 0x42, 0x43, 0x00] */
function parseHexBytes(hexStr: string): number[] {
  if (!hexStr.trim()) return [];
  return hexStr
    .trim()
    .split(/\s+/)
    .filter((h) => /^[0-9a-fA-F]{1,2}$/.test(h))
    .map((h) => parseInt(h, 16));
}

/** "Hello" → UTF-8 byte array */
function textToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/** Number of bytes a cell spans (used for size hints in the form). */
export function cellByteSize(cell: Pick<MemoryCell, 'type' | 'value' | 'fieldSize'>): number {
  if (cell.type === 'field') return cell.fieldSize ?? 1;
  if (cell.type === 'hex') return Math.max(1, parseHexBytes(cell.value ?? '').length);
  // text type
  return Math.max(1, textToBytes(cell.value ?? '').length);
}

// ── Byte annotation map ───────────────────────────────────────────

interface ByteAnnotation {
  value: number;        // 0-255 (0 for field bytes without a real value)
  type: 'hex' | 'text' | 'field';
  cellId: string;
  isFirst: boolean;     // first byte of this cell?
  fieldName?: string;   // only for field type
}

function buildByteMap(cells: MemoryCell[]): Map<number, ByteAnnotation> {
  const map = new Map<number, ByteAnnotation>();

  for (const cell of cells) {
    const startAddr = parseHexAddr(cell.address);

    if (cell.type === 'hex') {
      const bytes = parseHexBytes(cell.value ?? '');
      bytes.forEach((b, i) => {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, { value: b, type: 'hex', cellId: cell.id, isFirst: i === 0 });
      });
    } else if (cell.type === 'text') {
      const bytes = textToBytes(cell.value ?? '');
      bytes.forEach((b, i) => {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, { value: b, type: 'text', cellId: cell.id, isFirst: i === 0 });
      });
    } else if (cell.type === 'field') {
      const size = cell.fieldSize ?? 1;
      for (let i = 0; i < size; i++) {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, {
            value: 0,
            type: 'field',
            cellId: cell.id,
            isFirst: i === 0,
            fieldName: cell.fieldName,
          });
      }
    }
  }

  return map;
}

// ── Row items (same logic as before, one row per unitSize block) ───

type RowItem = { addr: number; label: string } | '...';

function buildRowItems(
  baseAddress: string,
  endAddress: string,
  unitSize: number,
  collapsedRanges: MemoryCollapsedRange[],
): RowItem[] {
  const base = parseHexAddr(baseAddress);
  const end = parseHexAddr(endAddress);
  if (end <= base || unitSize <= 0) return [];

  const totalBytes = end - base;

  const effectiveCollapsed = collapsedRanges.map((r) => ({
    start: parseHexAddr(r.start),
    end: parseHexAddr(r.end),
  }));

  if (totalBytes > MEMORY_THRESHOLD && effectiveCollapsed.length === 0) {
    const headEnd = base + MEMORY_LINES * unitSize;
    const tailStart = end - MEMORY_LINES * unitSize;
    if (headEnd < tailStart) {
      effectiveCollapsed.push({ start: headEnd, end: tailStart });
    }
  }

  const padLen = Math.max(4, end.toString(16).length);
  const isCollapsed = (addr: number) =>
    effectiveCollapsed.some((r) => addr >= r.start && addr < r.end);

  const items: RowItem[] = [];
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

// ── Inline add-cell form ──────────────────────────────────────────

interface CellFormProps {
  unitSize: number;
  padLen: number;
  onAdd: (cell: Omit<MemoryCell, 'id'>) => void;
  onCancel: () => void;
}

function CellForm({ unitSize, padLen, onAdd, onCancel }: CellFormProps) {
  const [type, setType] = useState<MemoryCellType>('hex');
  const [address, setAddress] = useState('');
  const [value, setValue] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldSize, setFieldSize] = useState(unitSize);

  // Computed byte size for hex/text so user can see the footprint
  const computedSize =
    type === 'field'
      ? fieldSize
      : type === 'hex'
        ? parseHexBytes(value).length
        : textToBytes(value).length;

  const handleAdd = () => {
    const addrTrimmed = address.trim() || '0x' + '0'.repeat(padLen);
    if (type === 'field') {
      onAdd({ type, address: addrTrimmed, fieldName: fieldName.trim() || 'field', fieldSize });
    } else {
      onAdd({ type, address: addrTrimmed, value });
    }
  };

  return (
    <div className="rounded border border-gray-600 bg-gray-800/80 p-2 text-xs text-white">
      {/* Type selector */}
      <div className="mb-2 flex gap-1">
        {(['hex', 'text', 'field'] as MemoryCellType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 rounded border py-0.5 text-[10px] font-semibold uppercase transition-all ${
              type === t
                ? 'border-orange-500 bg-orange-900/40 text-orange-300'
                : 'border-gray-600 text-gray-400 hover:border-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Address */}
      <div className="mb-1 flex items-center gap-1">
        <span className="w-14 shrink-0 text-[10px] text-gray-400">Address</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={`0x${'0'.repeat(padLen)}`}
          className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 font-mono text-[10px] text-green-300 focus:outline-none"
        />
      </div>

      {type === 'field' ? (
        <>
          <div className="mb-1 flex items-center gap-1">
            <span className="w-14 shrink-0 text-[10px] text-gray-400">Name</span>
            <input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="field name"
              className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-[10px] text-white focus:outline-none"
            />
          </div>
          <div className="mb-2 flex items-center gap-1">
            <span className="w-14 shrink-0 text-[10px] text-gray-400">Size (B)</span>
            <input
              type="number"
              min={1}
              value={fieldSize}
              onChange={(e) => setFieldSize(parseInt(e.target.value, 10) || 1)}
              className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-[10px] text-white focus:outline-none"
            />
          </div>
        </>
      ) : (
        <div className="mb-2 flex items-center gap-1">
          <span className="w-14 shrink-0 text-[10px] text-gray-400">
            {type === 'hex' ? 'Hex bytes' : 'Text'}
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === 'hex' ? '41 42 43 00' : 'Hello, world'}
            className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-0.5 font-mono text-[10px] text-gray-200 focus:outline-none"
          />
        </div>
      )}

      {/* Computed size hint */}
      {computedSize > 0 && (
        <p className="mb-1 text-right text-[10px] text-gray-500">
          {computedSize} byte{computedSize !== 1 ? 's' : ''} consumed
        </p>
      )}

      <div className="flex justify-end gap-1">
        <button
          onClick={onCancel}
          className="rounded border border-gray-600 px-2 py-0.5 text-[10px] text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          className="rounded bg-orange-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-orange-600"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

const MemoryLayoutNode = memo(({ id, data, selected }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);

  const unitSize = data.unitSize ?? 8;
  const cells: MemoryCell[] = data.cells ?? [];

  const base = parseHexAddr(data.baseAddress ?? '0x0000');
  const end = parseHexAddr(data.endAddress ?? '0x0000');
  const padLen = Math.max(4, end.toString(16).length);

  const isAutoCollapsed =
    (end - base) > MEMORY_THRESHOLD && (data.collapsedRanges ?? []).length === 0;

  const rowItems = buildRowItems(
    data.baseAddress ?? '0x0000',
    data.endAddress ?? '0x0000',
    unitSize,
    data.collapsedRanges ?? [],
  );

  const byteMap = buildByteMap(cells);

  // Build field colour index map (stable ordering by insertion)
  const fieldColorMap = new Map<string, number>();
  let fieldColorCounter = 0;
  for (const c of cells) {
    if (c.type === 'field') {
      fieldColorMap.set(c.id, fieldColorCounter % FIELD_COLORS.length);
      fieldColorCounter++;
    }
  }

  // Compute Y positions for each visible row (for handle placement)
  let yOffset = 0;
  const rowPositions: { addr: number; label: string; top: number }[] = [];
  for (const item of rowItems) {
    if (item === '...') {
      yOffset += ELLIPSIS_H;
    } else {
      rowPositions.push({ ...item, top: CONTENT_START + yOffset + ROW_H / 2 });
      yOffset += ROW_H;
    }
  }

  const addCell = (partial: Omit<MemoryCell, 'id'>) => {
    updateNodeData(id, { cells: [...cells, { id: v4(), ...partial }] });
    setShowForm(false);
  };

  const removeCell = (cellId: string) => {
    updateNodeData(id, { cells: cells.filter((c) => c.id !== cellId) });
  };

  // ── Render a single byte cell in the hex table ─────────────────
  const renderByteCell = (byteAddr: number) => {
    const ann = byteMap.get(byteAddr);
    if (!ann) {
      return (
        <span
          key={byteAddr}
          className="inline-block w-[18px] text-center font-mono text-[9px] text-gray-700"
        >
          --
        </span>
      );
    }

    if (ann.type === 'hex') {
      return (
        <span
          key={byteAddr}
          className="inline-block w-[18px] text-center font-mono text-[9px] text-amber-300"
          title={`0x${ann.value.toString(16).toUpperCase().padStart(2, '0')} (hex)`}
        >
          {ann.value.toString(16).toUpperCase().padStart(2, '0')}
        </span>
      );
    }

    if (ann.type === 'text') {
      return (
        <span
          key={byteAddr}
          className="inline-block w-[18px] text-center font-mono text-[9px] text-cyan-300"
          title={`0x${ann.value.toString(16).toUpperCase().padStart(2, '0')} (text)`}
        >
          {ann.value.toString(16).toUpperCase().padStart(2, '0')}
        </span>
      );
    }

    // field type
    const col = FIELD_COLORS[fieldColorMap.get(ann.cellId) ?? 0];
    return (
      <span
        key={byteAddr}
        className={`inline-block w-[18px] rounded-sm text-center font-mono text-[9px] ${col.bg} ${col.text}`}
        title={ann.fieldName ?? 'field'}
      >
        {ann.isFirst ? '▶' : '─'}
      </span>
    );
  };

  // ── Render the ASCII/annotation column for a row ───────────────
  const renderRowAnnotation = (rowAddr: number) => {
    // Collect field annotations that start in this row
    const fieldStarts: { name: string; colorIdx: number }[] = [];
    for (let i = 0; i < unitSize; i++) {
      const ann = byteMap.get(rowAddr + i);
      if (ann?.type === 'field' && ann.isFirst) {
        fieldStarts.push({
          name: ann.fieldName ?? 'field',
          colorIdx: fieldColorMap.get(ann.cellId) ?? 0,
        });
      }
    }

    if (fieldStarts.length > 0) {
      return (
        <span className="flex flex-wrap gap-0.5">
          {fieldStarts.map((f, i) => {
            const col = FIELD_COLORS[f.colorIdx];
            return (
              <span
                key={i}
                className={`rounded px-1 text-[9px] font-semibold ${col.bg} ${col.text}`}
              >
                {f.name}
              </span>
            );
          })}
        </span>
      );
    }

    // ASCII representation (like xxd) for hex/text bytes
    let ascii = '';
    for (let i = 0; i < unitSize; i++) {
      const ann = byteMap.get(rowAddr + i);
      if (!ann) {
        ascii += '.';
      } else if (ann.type === 'hex' || ann.type === 'text') {
        const ch = ann.value >= 0x20 && ann.value < 0x7f ? String.fromCharCode(ann.value) : '.';
        ascii += ch;
      } else {
        ascii += '·';
      }
    }
    // Only show if non-trivially empty
    if (ascii.replace(/\./g, '') === '') return null;
    return (
      <span className="font-mono text-[9px] text-gray-400">{ascii}</span>
    );
  };

  // ── Node width based on unitSize ───────────────────────────────
  const viewMinWidth = ADDR_COL_W + GAP_W + unitSize * BYTE_CELL_W + GAP_W + ANNOTATION_COL_W;

  return (
    <div
      className={`rounded-lg border-2 bg-gray-950 text-white shadow-lg transition-all ${
        selected ? 'border-orange-400 shadow-orange-400/30 shadow-lg' : 'border-gray-700'
      }`}
      style={{ minWidth: isEditing ? Math.max(340, viewMinWidth) : viewMinWidth, position: 'relative' }}
    >
      {/* Left handles (target) — one per visible row */}
      {rowPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-L`}
          type="target"
          position={Position.Left}
          id={`addr-${label}-left`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 8, height: 8 }}
        />
      ))}

      {/* Right handles (source) — one per visible row */}
      {rowPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-R`}
          type="source"
          position={Position.Right}
          id={`addr-${label}-right`}
          style={{ top, transform: 'translateY(-50%)', background: '#6b7280', width: 8, height: 8 }}
        />
      ))}

      {/* Header */}
      <div className="flex items-center rounded-t-lg bg-orange-800 px-3" style={{ height: HEADER_H }}>
        <div className="flex-1 overflow-hidden">
          <div className="text-[10px] text-orange-200">memory layout</div>
          <div className="truncate font-bold text-orange-50">{data.name ?? 'Untitled'}</div>
        </div>
        <button
          className="shrink-0 text-orange-200 hover:text-white"
          title={isEditing ? 'Done editing' : 'Edit content'}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing((v) => !v);
            setShowForm(false);
          }}
        >
          {isEditing ? <Check size={13} /> : <Edit2 size={13} />}
        </button>
      </div>

      {/* Badge */}
      <div className="flex items-center px-2" style={{ height: BADGE_H }}>
        <span className="truncate rounded bg-orange-900/50 px-2 py-0.5 text-[10px] text-orange-300">
          {unitSize}B / row · {data.baseAddress ?? '?'} – {data.endAddress ?? '?'}
          {isAutoCollapsed ? ' · auto-collapsed' : ''}
        </span>
      </div>

      {/* Hex table */}
      <div className="mx-1 mb-1 overflow-hidden rounded bg-black/40">
        {rowItems.length === 0 && (
          <div className="px-2 text-[10px] italic text-gray-500" style={{ height: ROW_H }}>
            No valid range
          </div>
        )}

        {rowItems.map((item, idx) => {
          if (item === '...') {
            return (
              <div
                key={`ellipsis-${idx}`}
                className="flex items-center gap-2 px-2"
                style={{ height: ELLIPSIS_H }}
              >
                <span className="font-mono text-[9px] text-gray-500">···</span>
                {isAutoCollapsed && (
                  <span className="text-[9px] italic text-gray-600">
                    ({fmtHex(base + MEMORY_LINES * unitSize, padLen)} –{' '}
                    {fmtHex(end - MEMORY_LINES * unitSize, padLen)})
                  </span>
                )}
              </div>
            );
          }

          return (
            <div
              key={`row-${item.addr}`}
              className="flex items-center px-1 hover:bg-gray-800/50"
              style={{ height: ROW_H }}
            >
              {/* Address */}
              <span className="w-[60px] shrink-0 font-mono text-[9px] text-green-400">
                {item.label}
              </span>

              {/* Separator */}
              <span className="mx-1 text-gray-700 text-[9px]">│</span>

              {/* Byte cells */}
              <div className="flex shrink-0 gap-0.5">
                {Array.from({ length: unitSize }, (_, i) => renderByteCell(item.addr + i))}
              </div>

              {/* Separator */}
              <span className="mx-1 text-gray-700 text-[9px]">│</span>

              {/* Annotation */}
              <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                {renderRowAnnotation(item.addr)}
              </div>

              {/* Delete button (edit mode) */}
              {isEditing && (() => {
                // Find cell(s) starting in this row
                const startingCell = cells.find((c) => {
                  const a = parseHexAddr(c.address);
                  return a >= item.addr && a < item.addr + unitSize;
                });
                return startingCell ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCell(startingCell.id);
                    }}
                    className="ml-1 shrink-0 text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={9} />
                  </button>
                ) : null;
              })()}
            </div>
          );
        })}
      </div>

      {/* Edit mode panel */}
      {isEditing && (
        <div
          className="nodrag nopan nowheel mx-1 mb-2 flex flex-col gap-1"
          onKeyDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {cells.length > 0 && (
            <div className="rounded border border-gray-700 bg-gray-800/60 px-2 py-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">
                Content ({cells.length})
              </span>
              {cells.map((c) => (
                <div key={c.id} className="flex items-center gap-1 py-0.5 text-[10px]">
                  <span className="w-5 shrink-0 rounded bg-gray-700 px-0.5 text-center font-mono text-[9px] text-gray-300">
                    {c.type === 'hex' ? 'H' : c.type === 'text' ? 'T' : 'F'}
                  </span>
                  <span className="font-mono text-green-400">{c.address}</span>
                  <span className="flex-1 truncate text-gray-300">
                    {c.type === 'field'
                      ? `${c.fieldName} (${c.fieldSize}B)`
                      : `${c.value} (${cellByteSize(c)}B)`}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCell(c.id); }}
                    className="shrink-0 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <CellForm
              unitSize={unitSize}
              padLen={padLen}
              onAdd={addCell}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowForm(true); }}
              className="flex items-center justify-center gap-1 rounded border border-dashed border-gray-600 py-1 text-[10px] text-gray-400 hover:border-orange-500 hover:text-orange-300"
            >
              <Plus size={10} /> Add content
            </button>
          )}
        </div>
      )}
    </div>
  );
});

MemoryLayoutNode.displayName = 'MemoryLayoutNode';
export default MemoryLayoutNode;

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
const UNIT_H = 22;
const ELLIPSIS_H = 16;

// Field-annotation colour palette (cycling)
const FIELD_COLORS = [
  { bg: 'bg-blue-900/50',   border: 'border-blue-500',   text: 'text-blue-300'   },
  { bg: 'bg-purple-900/50', border: 'border-purple-500', text: 'text-purple-300' },
  { bg: 'bg-teal-900/50',   border: 'border-teal-500',   text: 'text-teal-300'   },
  { bg: 'bg-pink-900/50',   border: 'border-pink-500',   text: 'text-pink-300'   },
  { bg: 'bg-yellow-900/40', border: 'border-yellow-500', text: 'text-yellow-300' },
];

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

  const totalBytes = end - base;

  // Compute effective collapsed ranges: merge user-defined + auto threshold collapse
  const effectiveCollapsed = collapsedRanges.map((r) => ({
    start: parseHexAddr(r.start),
    end: parseHexAddr(r.end),
  }));

  if (totalBytes > MEMORY_THRESHOLD && effectiveCollapsed.length === 0) {
    // Auto-collapse the middle: keep first MEMORY_LINES * unitSize bytes and last MEMORY_LINES * unitSize bytes
    const headEnd = base + MEMORY_LINES * unitSize;
    const tailStart = end - MEMORY_LINES * unitSize;
    if (headEnd < tailStart) {
      effectiveCollapsed.push({ start: headEnd, end: tailStart });
    }
  }

  const padLen = Math.max(4, end.toString(16).length);

  const isCollapsed = (addr: number) =>
    effectiveCollapsed.some((r) => addr >= r.start && addr < r.end);

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

/** Returns the cell (if any) whose address matches, parsed to a number. */
function cellAt(cells: MemoryCell[], addr: number): MemoryCell | undefined {
  return cells.find((c) => parseHexAddr(c.address) === addr);
}

/** Returns a field cell that spans the given address (started earlier). */
function spanningField(cells: MemoryCell[], addr: number): { cell: MemoryCell; colorIdx: number } | undefined {
  const fields = cells.filter((c) => c.type === 'field');
  for (let i = 0; i < fields.length; i++) {
    const c = fields[i];
    const start = parseHexAddr(c.address);
    const size = c.fieldSize ?? 1;
    if (addr > start && addr < start + size) {
      return { cell: c, colorIdx: i % FIELD_COLORS.length };
    }
  }
  return undefined;
}

// ── Inline edit form ───────────────────────────────────────────────

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

  const handleAdd = () => {
    const addrTrimmed = address.trim() || '0x' + '0'.repeat(padLen);
    if (type === 'field') {
      onAdd({ type, address: addrTrimmed, fieldName: fieldName.trim() || 'field', fieldSize });
    } else {
      onAdd({ type, address: addrTrimmed, value: value });
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

  const items = buildMemItems(
    data.baseAddress ?? '0x0000',
    data.endAddress ?? '0x0000',
    unitSize,
    data.collapsedRanges ?? [],
  );

  const base = parseHexAddr(data.baseAddress ?? '0x0000');
  const end = parseHexAddr(data.endAddress ?? '0x0000');
  const padLen = Math.max(4, end.toString(16).length);

  /** True when the middle is being auto-collapsed due to the THRESHOLD rule. */
  const isAutoCollapsed =
    (end - base) > MEMORY_THRESHOLD && (data.collapsedRanges ?? []).length === 0;

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

  const addCell = (partial: Omit<MemoryCell, 'id'>) => {
    const newCell: MemoryCell = { id: v4(), ...partial };
    updateNodeData(id, { cells: [...cells, newCell] });
    setShowForm(false);
  };

  const removeCell = (cellId: string) => {
    updateNodeData(id, { cells: cells.filter((c) => c.id !== cellId) });
  };

  // Build field colour index map (stable ordering by insertion)
  const fieldColorMap = new Map<string, number>();
  let fieldColorCounter = 0;
  for (const c of cells) {
    if (c.type === 'field') {
      fieldColorMap.set(c.id, fieldColorCounter % FIELD_COLORS.length);
      fieldColorCounter++;
    }
  }

  const renderCellContent = (addr: number) => {
    const cell = cellAt(cells, addr);
    if (!cell) {
      // Check if this address is spanned by a field that started earlier
      const span = spanningField(cells, addr);
      if (span) {
        const col = FIELD_COLORS[fieldColorMap.get(span.cell.id) ?? 0];
        return (
          <span
            className={`ml-1 border-l-2 pl-1 font-mono text-[9px] ${col.border} ${col.text} opacity-60`}
            title={`Continuation of ${span.cell.fieldName ?? 'field'}`}
          >
            ╌
          </span>
        );
      }
      return null;
    }

    if (cell.type === 'hex') {
      return (
        <span className="ml-1 font-mono text-[10px] text-amber-300">
          {cell.value || '??'}
        </span>
      );
    }
    if (cell.type === 'text') {
      return (
        <span className="ml-1 font-mono text-[10px] text-cyan-300">
          &quot;{cell.value}&quot;
        </span>
      );
    }
    if (cell.type === 'field') {
      const col = FIELD_COLORS[fieldColorMap.get(cell.id) ?? 0];
      return (
        <span
          className={`ml-1 rounded border px-1 font-mono text-[9px] font-semibold ${col.bg} ${col.border} ${col.text}`}
        >
          {cell.fieldName ?? 'field'}{cell.fieldSize ? ` (${cell.fieldSize}B)` : ''}
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className={`rounded-lg border-2 bg-gray-950 text-white shadow-lg transition-all ${
        selected ? 'border-orange-400 shadow-orange-400/30 shadow-lg' : 'border-gray-700'
      }`}
      style={{ minWidth: isEditing ? 340 : 260 }}
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
      <div className="flex items-center px-3" style={{ height: BADGE_H }}>
        <span className="truncate rounded bg-orange-900/50 px-2 py-0.5 text-[10px] text-orange-300">
          {unitSize}B / unit · {data.baseAddress ?? '?'} – {data.endAddress ?? '?'}
          {isAutoCollapsed ? ' · auto-collapsed' : ''}
        </span>
      </div>

      {/* Memory units */}
      <div className="mx-1 mb-1 overflow-hidden rounded bg-black/40">
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
                <span className="text-[9px] text-gray-600 italic">
                  {isAutoCollapsed
                    ? `(${fmtHex(base + MEMORY_LINES * unitSize, padLen)} – ${fmtHex(end - MEMORY_LINES * unitSize, padLen)})`
                    : ''}
                </span>
              </div>
            );
          }
          return (
            <div
              key={`addr-${item.addr}`}
              className="flex items-center gap-1 px-2 hover:bg-gray-800/50"
              style={{ height: UNIT_H }}
            >
              <span className="w-20 shrink-0 font-mono text-[10px] text-green-400">
                {item.label}
              </span>
              <div className="flex flex-1 items-center overflow-hidden">
                {renderCellContent(item.addr)}
              </div>
              {/* Delete button for a cell at this address, visible in edit mode */}
              {isEditing && cellAt(cells, item.addr) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const c = cellAt(cells, item.addr);
                    if (c) removeCell(c.id);
                  }}
                  className="ml-auto shrink-0 text-gray-600 hover:text-red-400"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit mode: cell list + add form */}
      {isEditing && (
        <div
          className="nodrag nopan nowheel mx-1 mb-2 flex flex-col gap-1"
          onKeyDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Existing cells summary */}
          {cells.length > 0 && (
            <div className="rounded border border-gray-700 bg-gray-800/60 px-2 py-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">
                Content ({cells.length})
              </span>
              {cells.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-1 py-0.5 text-[10px]"
                >
                  <span className="w-5 shrink-0 rounded bg-gray-700 px-0.5 text-center font-mono text-[9px] text-gray-300">
                    {c.type === 'hex' ? 'H' : c.type === 'text' ? 'T' : 'F'}
                  </span>
                  <span className="font-mono text-green-400">{c.address}</span>
                  <span className="flex-1 truncate text-gray-300">
                    {c.type === 'field'
                      ? `${c.fieldName} (${c.fieldSize}B)`
                      : c.value}
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

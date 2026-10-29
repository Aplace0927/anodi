import { memo, useState, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Edit2, Check, Plus, Trash2, MemoryStick, Upload } from "lucide-react";
import type { MemoryLayoutData, MemoryCell } from "../../types";
import { useGraphStore } from "../../store/graphStore";
import { v4 } from "../../utils/uuid";
import { contrastTextColor } from "../ColorPicker";
import {
  MEMORY_THRESHOLD,
  MEMORY_LINES,
  FIELD_COLORS,
  parseHexAddr,
  fmtHex,
  cellByteSize,
  numberCellMetaLabel,
  buildByteMap,
  buildRowItems,
} from "../../utils/memory";
import CellForm from "./memory/CellForm";
import ImportPanel from "./memory/ImportPanel";

export { MEMORY_THRESHOLD, MEMORY_LINES, cellByteSize };

type Props = NodeProps & { data: MemoryLayoutData & { name?: string } };

// Fixed pixel heights
const HEADER_H = 44;
const BADGE_H = 24;
const CONTENT_START = HEADER_H + BADGE_H; // 68
const ROW_H = 20;
const ELLIPSIS_H = 16;

// Node width components (px)
const ADDR_COL_W_BASE = 64;
const GAP_W = 4;
const BYTE_CELL_W = 20;
const ANNOTATION_COL_W = 100;

/** Compute address column width from hex-digit count so long addresses don't overlap. */
function addrColWidth(padLen: number): number {
  // "0x" prefix (2 chars) + padLen hex digits, each ~6px at mono 9px font, plus 12px padding
  return Math.max(ADDR_COL_W_BASE, (padLen + 2) * 6 + 12);
}
// ── Main component ─────────────────────────────────────────────────

const MemoryLayoutNode = memo(({ id, data, selected, dragging }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const edges = useGraphStore((s) => s.edges);

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);
  const unitSize = data.unitSize ?? 8;
  const cells: MemoryCell[] = data.cells ?? [];
  const base = parseHexAddr(data.baseAddress ?? "0x0000");
  const end = parseHexAddr(data.endAddress ?? "0x0000");
  const customColor = data.nodeColor;
  const headerTextColor = customColor ? contrastTextColor(customColor) : undefined;
  const padLen = Math.max(4, end.toString(16).length);
  const addrW = addrColWidth(padLen);
  const viewMinWidth =
    addrW + GAP_W + unitSize * BYTE_CELL_W + GAP_W + ANNOTATION_COL_W;

  const isAutoCollapsed =
    end - base > MEMORY_THRESHOLD && (data.collapsedRanges ?? []).length === 0;

  const rowItems = dragging ? [] : buildRowItems(
    data.baseAddress ?? "0x0000",
    data.endAddress ?? "0x0000",
    unitSize,
    data.collapsedRanges ?? [],
  );

  const byteMap = dragging ? new Map() : buildByteMap(cells);

  // Stable field colour index (by insertion order)
  const fieldColorMap = new Map<string, number>();

  let fieldColorCounter = 0;

  for (const c of cells) {
    if (c.type === "field") {
      fieldColorMap.set(c.id, fieldColorCounter % FIELD_COLORS.length);
      fieldColorCounter++;
    }
  }

  // Y positions for handles (one per visible row)
  let yOffset = 0;

  const rowPositions: { addr: number; label: string; top: number }[] = [];

  if (!dragging) {
    for (const item of rowItems) {
      if ("ellipsis" in item) {
        yOffset += ELLIPSIS_H;
      } else {
        rowPositions.push({ ...item, top: CONTENT_START + yOffset + ROW_H / 2 });
        yOffset += ROW_H;
      }
    }
  }

  const addCell = (partial: Omit<MemoryCell, "id">) => {
    updateNodeData(id, { cells: [...cells, { id: v4(), ...partial }] });
    setShowAddForm(false);
  };

  const updateCell = (cellId: string, updatedData: Omit<MemoryCell, "id">) => {
    const updatedCells = cells.map((c) =>
      c.id === cellId ? { ...c, ...updatedData } : c,
    );

    updateNodeData(id, { cells: updatedCells });
    setEditingCellId(null);
  };

  const removeCell = (cellId: string) => {
    updateNodeData(id, { cells: cells.filter((c) => c.id !== cellId) });
  };

  const sortedCells = useMemo(
    () => [...cells].sort((a, b) => parseHexAddr(a.address) - parseHexAddr(b.address)),
    [cells],
  );

  // ── Render one byte cell in the hex area ───────────────────────

  const renderByteCell = (byteAddr: number) => {
    const ann = byteMap.get(byteAddr);

    if (!ann) {
      return (
        <span
          key={byteAddr}
          className="inline-block w-[18px] text-center font-mono text-xs text-gray-700"
        >
          --
        </span>
      );
    }

    if (ann.type === "hex") {
      const cell = cells.find((c) => c.id === ann.cellId);
      const customColor = cell?.fieldColor;
      return (
        <span
          key={byteAddr}
          className={`inline-block w-[18px] text-center font-mono text-xs ${customColor ? "" : "text-amber-300"}`}
          style={customColor ? { color: customColor } : undefined}
          title={`0x${ann.value.toString(16).toUpperCase().padStart(2, "0")} (hex)`}
        >
          {ann.value.toString(16).toUpperCase().padStart(2, "0")}
        </span>
      );
    }

    if (ann.type === "text") {
      const cell = cells.find((c) => c.id === ann.cellId);
      const customColor = cell?.fieldColor;
      return (
        <span
          key={byteAddr}
          className={`inline-block w-[18px] text-center font-mono text-xs ${customColor ? "" : "text-cyan-300"}`}
          style={customColor ? { color: customColor } : undefined}
          title={`0x${ann.value.toString(16).toUpperCase().padStart(2, "0")} (text "${ann.value >= 0x20 && ann.value < 0x7f ? String.fromCharCode(ann.value) : "."}")`}
        >
          {ann.value.toString(16).toUpperCase().padStart(2, "0")}
        </span>
      );
    }

    if (ann.type === "number") {
      const cell = cells.find((c) => c.id === ann.cellId);
      const customColor = cell?.fieldColor;
      return (
        <span
          key={byteAddr}
          className={`inline-block w-[18px] text-center font-mono text-xs ${customColor ? "" : "text-green-700 dark:text-green-300"}`}
          style={customColor ? { color: customColor } : undefined}
          title={`0x${ann.value.toString(16).toUpperCase().padStart(2, "0")} (number)`}
        >
          {ann.value.toString(16).toUpperCase().padStart(2, "0")}
        </span>
      );
    }

    // ── field type: draw a "long line" style border ─────────

    const cell = cells.find((c) => c.id === ann.cellId);
    const customFieldColor = cell?.fieldColor;
    const col = FIELD_COLORS[fieldColorMap.get(ann.cellId) ?? 0];
    const fieldStart = ann.fieldStartAddr ?? 0;
    const borderT = "border-t-2";
    const borderB = "border-b-2";
    const borderL = ann.isFirst ? "border-l-2" : "";
    const borderR = ann.isLast ? "border-r-2" : "";

    if (customFieldColor) {
      return (
        <span
          key={byteAddr}
          className={`inline-block w-[18px] h-[18px] text-center font-mono text-xs ${borderT} ${borderB} ${borderL} ${borderR}`}
          style={{
            backgroundColor: `${customFieldColor}33`,
            color: customFieldColor,
            borderColor: customFieldColor,
          }}
          title={`${ann.fieldName ?? "field"} (+${byteAddr - fieldStart})`}
        >
          {ann.isFirst ? "▶" : ""}
        </span>
      );
    }

    return (
      <span
        key={byteAddr}
        className={`inline-block w-[18px] h-[18px] text-center font-mono text-xs ${col.bg} ${col.text} ${col.border} ${borderT} ${borderB} ${borderL} ${borderR}`}
        title={`${ann.fieldName ?? "field"} (+${byteAddr - fieldStart})`}
      >
        {ann.isFirst ? "▶" : ""}
      </span>
    );
  };

  // ── Render annotation column (right of │) ─────────────────────

  const renderRowAnnotation = (rowAddr: number) => {
    const rowEndAddr = rowAddr + unitSize;

    const segments: {
      fieldId: string | null;
      length: number;
      startAddr: number;
    }[] = [];

    let currentSegment: {
      fieldId: string | null;
      length: number;
      startAddr: number;
    } | null = null;

    for (let addr = rowAddr; addr < rowEndAddr; addr++) {
      const ann = byteMap.get(addr);

      const fieldId = ann?.type === "field" ? ann.cellId : null;

      if (!currentSegment) {
        currentSegment = { fieldId, length: 1, startAddr: addr };
      } else if (currentSegment.fieldId === fieldId) {
        currentSegment.length++;
      } else {
        segments.push(currentSegment);

        currentSegment = { fieldId, length: 1, startAddr: addr };
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    const hasFields = segments.some((s) => s.fieldId);

    if (hasFields) {
      return (
        <div
          className="group relative flex min-w-0 w-full items-stretch"
          style={{ height: ROW_H - 2 }}
        >
          {segments.map((seg, i) => {
            if (!seg.fieldId) {
              return (
                <div
                  key={i}
                  className="flex items-center"
                  style={{ width: `${(seg.length / unitSize) * 100}%` }}
                >
                  {Array.from({ length: seg.length }, (_, j) => {
                    const addr = seg.startAddr + j;
                    const ann = byteMap.get(addr);
                    let ch = ".";
                    if (ann && (ann.type === "hex" || ann.type === "text" || ann.type === "number")) {
                      ch = ann.value >= 0x20 && ann.value < 0x7f
                        ? String.fromCharCode(ann.value)
                        : ".";
                    }
                    return (
                      <span
                        key={addr}
                        className="text-center font-mono text-xs text-gray-500 dark:text-gray-400"
                        style={{ width: `${(1 / seg.length) * 100}%` }}
                      >
                        {ch}
                      </span>
                    );
                  })}
                </div>
              );
            }

            const cell = cells.find((c) => c.id === seg.fieldId);

            if (!cell || cell.type !== "field") return null;
            const s = parseHexAddr(cell.address);
            const e = s + (cell.fieldSize ?? 1);

            const col = FIELD_COLORS[fieldColorMap.get(cell.id) ?? 0];
            const customFieldColor = cell.fieldColor;
            const fieldName = cell.fieldName ?? "field";

            const title = `${fieldName} (${cell.fieldSize}B @ ${cell.address}, offset ${s - base})`;
            const borderT = "border-t-2";
            const borderB = "border-b-2";

            // Left border if the field starts within this segment

            const borderL =
              s >= seg.startAddr && s < seg.startAddr + seg.length
                ? "border-l-2"
                : "";

            // Right border if the field ends within this segment

            const borderR =
              e - 1 >= seg.startAddr && e - 1 < seg.startAddr + seg.length
                ? "border-r-2"
                : "";

            if (customFieldColor) {
              return (
                <div
                  key={i}
                  className={[
                    "flex items-center overflow-hidden px-1",
                    borderT,
                    borderB,
                    borderL,
                    borderR,
                  ].join(" ")}
                  style={{
                    width: `${(seg.length / unitSize) * 100}%`,
                    borderColor: customFieldColor,
                  }}
                  title={title}
                >
                  {s >= rowAddr &&
                    s < rowEndAddr && (
                      <span
                        className="w-full truncate text-center text-xs font-bold"
                        style={{ color: customFieldColor }}
                      >
                        {cell.fieldName}
                      </span>
                    )}
                </div>
              );
            }

            return (
              <div
                key={i}
                className={[
                  "flex items-center overflow-hidden px-1",
                  col.border,
                  borderT,
                  borderB,
                  borderL,
                  borderR,
                ].join(" ")}
                style={{ width: `${(seg.length / unitSize) * 100}%` }}
                title={title}
              >
                {s >= rowAddr &&
                  s < rowEndAddr && ( // Only show name if the field starts in this row
                    <span
                      className={`w-full truncate text-center text-xs font-bold ${col.text}`}
                    >
                      {cell.fieldName}
                    </span>
                  )}
              </div>
            );
          })}
        </div>
      );
    }

    // ASCII for hex/text – use proportional-width cells so that N bytes of
    // text/hex occupy the same visual width as N bytes of a field annotation.

    const chars: string[] = [];

    for (let i = 0; i < unitSize; i++) {
      const ann = byteMap.get(rowAddr + i);

      if (!ann) {
        chars.push(".");
      } else if (ann.type === "hex" || ann.type === "text" || ann.type === "number") {
        chars.push(
          ann.value >= 0x20 && ann.value < 0x7f
            ? String.fromCharCode(ann.value)
            : ".",
        );
      } else {
        chars.push("·");
      }
    }

    if (chars.every((ch) => ch === ".")) return null;

    return (
      <div
        className="flex w-full items-center"
        style={{ height: ROW_H - 2 }}
      >
        {chars.map((ch, i) => (
          <span
            key={rowAddr + i}
            className="text-center font-mono text-xs text-gray-500 dark:text-gray-400"
            style={{ width: `${(1 / unitSize) * 100}%` }}
          >
            {ch}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div
      className={`anodi-export-node font-mono rounded-lg border-2 bg-white dark:bg-gray-950 text-gray-900 dark:text-white shadow-lg transition-all ${
        selected
          ? customColor
            ? "shadow-lg"
            : "border-orange-400 shadow-orange-400/30 shadow-lg"
          : customColor
            ? ""
            : "border-gray-300 dark:border-gray-700"
      }`}
      style={{
        minWidth: isEditing ? Math.max(340, viewMinWidth) : viewMinWidth,
        position: "relative",
        ...(customColor
          ? {
              borderColor: selected ? customColor : `${customColor}99`,
              boxShadow: selected ? `0 10px 15px -3px ${customColor}40` : undefined,
            }
          : {}),
      }}
    >
      {/* Left handles — target (hidden, underneath) then source (visible, on top) */}

      {!dragging && rowPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-L-tgt`}
          type="target"
          position={Position.Left}
          id={`addr-${label}-left`}
          style={{
            top,
            transform: "translateY(-50%)",
            background: "#6b7280",
            width: 7,
            height: 7,
            opacity: 0,
          }}
        />
      ))}
      {!dragging && rowPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-L`}
          type="source"
          position={Position.Left}
          id={`addr-${label}-left`}
          className={connectedHandles.has(`addr-${label}-left`) ? 'anodi-connected' : undefined}
          style={{
            top,
            transform: "translateY(-50%)",
            background: "#6b7280",
            width: 7,
            height: 7,
          }}
        />
      ))}

      {/* Right handles — target (hidden, underneath) then source (visible, on top) */}

      {!dragging && rowPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-R-tgt`}
          type="target"
          position={Position.Right}
          id={`addr-${label}-right`}
          style={{
            top,
            transform: "translateY(-50%)",
            background: "#6b7280",
            width: 7,
            height: 7,
            opacity: 0,
          }}
        />
      ))}
      {!dragging && rowPositions.map(({ label, top }) => (
        <Handle
          key={`addr-${label}-R`}
          type="source"
          position={Position.Right}
          id={`addr-${label}-right`}
          className={connectedHandles.has(`addr-${label}-right`) ? 'anodi-connected' : undefined}
          style={{
            top,
            transform: "translateY(-50%)",
            background: "#6b7280",
            width: 7,
            height: 7,
          }}
        />
      ))}

      {/* Header */}

      <div
        className={`anodi-export-data flex items-center rounded-t-lg px-3 ${customColor ? '' : 'bg-orange-800'}`}
        style={{ height: HEADER_H, ...(customColor ? { backgroundColor: customColor } : {}) }}
      >
        <MemoryStick
          size={14}
          className={`mr-2 shrink-0 ${headerTextColor ? '' : 'text-orange-200'}`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className={`truncate font-mono font-bold text-sm ${headerTextColor ? '' : 'text-orange-50'}`}
            style={headerTextColor ? { color: headerTextColor } : undefined}
          >
            {data.name ?? "Untitled"}
          </div>
          <div
            className={`truncate text-xs ${headerTextColor ? '' : 'text-orange-300'}`}
            style={headerTextColor ? { color: headerTextColor } : undefined}
          >
            <span className="font-mono">{data.baseAddress ?? "?"} –{" "}{data.endAddress ?? "?"}</span>
            {isAutoCollapsed ? " · auto-collapsed" : " "} · {" "}
            {unitSize}B
          </div>
        </div>

        <button
          className={`nodrag shrink-0 p-0.5 ${headerTextColor ? '' : 'text-orange-200'} hover:text-white`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
          title="Import hexdump / binary / C struct"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
            setShowAddForm(false);
            setEditingCellId(null);
            setShowImport((v) => !v);
          }}
        >
          <Upload size={13} />
        </button>
        <button
          className={`shrink-0 p-0.5 ${headerTextColor ? '' : 'text-orange-200'} hover:text-white`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
          title={isEditing ? "Done editing" : "Edit content"}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing((v) => !v);
            setShowAddForm(false);
            setShowImport(false);
            setEditingCellId(null);
          }}
        >
          {isEditing ? <Check size={13} /> : <Edit2 size={13} />}
        </button>
      </div>

      {/* Badge */}

      <div className="flex items-center px-2" style={{ height: BADGE_H }}></div>

      {dragging ? (
        /* ── Drag mode: lightweight placeholder ───────────────────── */
        <div
          className="mx-1 mb-1 rounded bg-gray-100 dark:bg-black/40"
          style={{ minHeight: 24 }}
        />
      ) : (
        <>
          {/* Hex table */}

          <div className="anodi-export-data mx-1 mb-1 overflow-hidden rounded bg-gray-100 dark:bg-black/40">
        {rowItems.length === 0 && (
          <div
            className="px-2 text-xs italic text-gray-500"
            style={{ height: ROW_H }}
          >
            No valid range
          </div>
        )}

        {rowItems.map((item, idx) => {
          if ("ellipsis" in item) {
            return (
              <div
                key={`ellipsis-${idx}`}
                className="flex items-center gap-2 border-y border-gray-200 dark:border-gray-700 bg-gray-200/40 dark:bg-gray-900/40 px-2"
                style={{ height: ELLIPSIS_H }}
              >
                <span className="font-mono text-xs text-gray-500">···</span>

                <span className="font-mono text-xs italic text-gray-600">
                  ({fmtHex(item.fromAddr, padLen)} –{" "}
                  {fmtHex(item.toAddr, padLen)})
                </span>
              </div>
            );
          }

          return (
            <div
              key={`row-${item.addr}`}
              className="flex items-center px-1 hover:bg-gray-200/50 dark:hover:bg-gray-800/50"
              style={{ height: ROW_H }}
            >
              {/* Address */}

              <span
                className="shrink-0 pl-2 font-mono text-xs text-gray-700 dark:text-gray-300"
                style={{ width: addrW - 4 }}
              >
                {item.label}
              </span>

              <span className="mx-0.5 text-xs text-gray-700">│</span>

              {/* Byte cells */}

              <div className="flex shrink-0 gap-px">
                {Array.from({ length: unitSize }, (_, i) =>
                  renderByteCell(item.addr + i),
                )}
              </div>

              <span className="mx-0.5 text-xs text-gray-700">│</span>

              {/* Annotation */}

              <div
                className="flex flex-1 min-w-0 items-center overflow-hidden"
                style={{ height: ROW_H }}
              >
                {renderRowAnnotation(item.addr)}
              </div>

              {/* Delete button (edit mode) – always reserve space for consistent row width */}

              {isEditing &&
                (() => {
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
                      style={{ width: 9 }}
                    >
                      <Trash2 size={9} />
                    </button>
                  ) : (
                    <span
                      className="ml-1 shrink-0"
                      style={{ width: 9 }}
                    />
                  );
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
            <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/60 px-2 py-1">
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                Content ({cells.length})
              </span>

              {sortedCells.map((c) => (
                <div key={c.id}>
                  {editingCellId === c.id ? (
                    <CellForm
                      cells={cells}
                      unitSize={unitSize}
                      padLen={padLen}
                      onSave={(data) => updateCell(c.id, data)}
                      onCancel={() => setEditingCellId(null)}
                      cellToEdit={c}
                    />
                  ) : (
                    <div
                      className="flex items-center gap-1 py-0.5 text-xs cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded px-1"
                      onClick={() => setEditingCellId(c.id)}
                    >
                      <span className="w-5 shrink-0 rounded bg-gray-200 dark:bg-gray-700 px-0.5 text-center font-mono text-xs text-gray-700 dark:text-gray-300">
                        {c.type === "hex" ? "H" : c.type === "text" ? "T" : (c.type === "number" || c.type === "integer") ? "N" : "F"}
                      </span>

                      <span className="font-mono text-green-700 dark:text-green-300">
                        {fmtHex(parseHexAddr(c.address), padLen)}
                      </span>

                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                        {c.type === "field"
                          ? `${c.fieldName} (${c.fieldSize}B)`
                          : c.type === "number" || c.type === "integer"
                            ? `${c.value} (${numberCellMetaLabel(c)})`
                            : `${c.value} (${cellByteSize(c)}B)`}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();

                          removeCell(c.id);
                        }}
                        className="shrink-0 text-gray-500 hover:text-red-400"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showImport && (
            <ImportPanel
              baseAddress={data.baseAddress ?? "0x0000"}
              endAddress={data.endAddress ?? "0x0000"}
              unitSize={unitSize}
              cells={cells}
              onApply={(next) => {
                updateNodeData(id, { cells: next });
                setShowImport(false);
              }}
              onClose={() => setShowImport(false)}
            />
          )}

          {showAddForm ? (
            <CellForm
              cells={cells}
              unitSize={unitSize}
              padLen={padLen}
              onSave={addCell}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddForm(true);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-gray-300 dark:border-gray-600 py-1 text-xs text-gray-500 dark:text-gray-400 hover:border-orange-500 hover:text-orange-300"
              >
                <Plus size={10} /> Add content
              </button>
              {!showImport && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowImport(true);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-gray-300 dark:border-gray-600 py-1 text-xs text-gray-500 dark:text-gray-400 hover:border-orange-500 hover:text-orange-300"
                >
                  <Upload size={10} /> Import
                </button>
              )}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
});

MemoryLayoutNode.displayName = "MemoryLayoutNode";
export default MemoryLayoutNode;

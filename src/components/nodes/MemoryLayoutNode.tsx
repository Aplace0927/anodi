import { memo, useState, useMemo, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Edit2, Check, Plus, Trash2, MemoryStick, Upload, ChevronRight, ChevronDown, ListTree } from "lucide-react";
import type { MemoryLayoutData, MemoryCell, MemoryState } from "../../types";
import { toast } from "../../store/toastStore";
import { useGraphStore } from "../../store/graphStore";
import { v4 } from "../../utils/uuid";
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
  rawByteMap,
  visibleCells,
  cellTreeOrder,
  hasChildren,
  removeCellTree,
  placeCell,
  carveRange,
  diffBytes,
  resolvePointerTarget,
  pointerTargetLabel,
} from "../../utils/memory";
import type { ByteAnnotation } from "../../utils/memory";
import NodeHeader from "./NodeHeader";
import CellForm, { CELL_TYPE_COLORS } from "./memory/CellForm";
import ImportPanel from "./memory/ImportPanel";
import type { Tab as ImportTab } from "./memory/ImportPanel";
import InspectorPanel from "./memory/InspectorPanel";
import StateBar from "./memory/StateBar";

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

/** Field label in the annotation column: arrays as name[n], ▸ when folded. */
function fieldLabel(cell: MemoryCell, folded: boolean): string {
  const name = cell.fieldName ?? "field";
  const arr = cell.elemSize ? `[${Math.round((cell.fieldSize ?? 0) / cell.elemSize)}]` : "";
  return `${folded ? "▸ " : ""}${name}${arr}`;
}

/** Pointer cell value as a number (-1 when unparsable). */
function ptrAddr(v: string | undefined): number {
  try {
    return Number(BigInt(v || "0"));
  } catch {
    return -1;
  }
}

const BYTE_TONE: Record<"hex" | "text" | "number" | "pointer", string> = {
  hex: "text-amber-300",
  text: "text-cyan-300",
  number: "text-green-700 dark:text-green-300",
  pointer: "text-pink-500 dark:text-pink-300",
};
// ── Main component ─────────────────────────────────────────────────

const MemoryLayoutNode = memo(({ id, data, selected, dragging }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [importInit, setImportInit] = useState<{ tab: ImportTab; start?: string; length?: number } | null>(null);
  // Byte selection (anchor = where the drag started)
  const [sel, setSel] = useState<{ anchor: number; focus: number } | null>(null);
  const selecting = useRef(false);
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

  const endianness = data.defaultEndianness ?? "little";
  const pointerSize = data.pointerSize ?? 8;
  const shown = useMemo(() => visibleCells(cells), [cells]);
  // Hex column: concrete bytes win over fields. Annotation column: innermost field.
  const byteMap = useMemo(
    () =>
      dragging
        ? new Map<number, ByteAnnotation>()
        : buildByteMap([...shown.filter((c) => c.type !== "field"), ...shown.filter((c) => c.type === "field")]),
    [dragging, shown],
  );
  const fieldMap = useMemo(
    () => (dragging ? new Map<number, ByteAnnotation>() : buildByteMap(shown.filter((c) => c.type === "field"))),
    [dragging, shown],
  );
  const rawBytes = useMemo(() => rawByteMap(cells), [cells]);
  const cellById = useMemo(() => new Map(cells.map((c) => [c.id, c])), [cells]);

  // Snapshots: the active state's live content is `cells`
  const states = data.states ?? [];
  const activeIdx = states.findIndex((st) => st.id === data.activeStateId);
  const prevState = activeIdx > 0 ? states[activeIdx - 1] : undefined;
  const diffSet = useMemo(
    () => (data.showDiff && prevState ? diffBytes(cells, prevState.cells) : null),
    [data.showDiff, prevState, cells],
  );

  const selRange: [number, number] | null = sel
    ? [Math.min(sel.anchor, sel.focus), Math.max(sel.anchor, sel.focus) + 1]
    : null;

  useEffect(() => {
    const up = () => {
      selecting.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const describePointer = (addr: number) =>
    pointerTargetLabel(resolvePointerTarget(useGraphStore.getState().nodes, addr, id));

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

  const setCells = (next: MemoryCell[]) => updateNodeData(id, { cells: next });

  const removeCell = (cellId: string) => setCells(removeCellTree(cells, cellId));

  const patchCell = (cellId: string, patch: Partial<MemoryCell>) =>
    setCells(cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c)));

  /** Split an array field into one child field per element. */
  const splitArray = (cell: MemoryCell) => {
    if (!cell.elemSize) return;
    const start = parseHexAddr(cell.address);
    const n = Math.round((cell.fieldSize ?? 0) / cell.elemSize);
    const name = (cell.fieldName ?? "field").replace(/\[.*$/, "");
    const kids: MemoryCell[] = Array.from({ length: n }, (_, i) => ({
      id: v4(),
      type: "field",
      address: fmtHex(start + i * cell.elemSize!, padLen),
      fieldName: `${name}[${i}]`,
      fieldSize: cell.elemSize,
      fieldColor: cell.fieldColor,
      parentId: cell.id,
    }));
    setCells([...cells.map((c) => (c.id === cell.id ? { ...c, collapsed: false } : c)), ...kids]);
  };

  /** Create a cell from the byte selection, splitting/nesting existing content. */
  const createFromSelection = (partial: Omit<MemoryCell, "id">) => {
    const s = parseHexAddr(partial.address);
    const e = s + cellByteSize(partial);
    const carved = carveRange(cells, s, e, v4, padLen, partial.type === "field");
    const next = placeCell(carved, { ...partial, id: v4() });
    if (!next) {
      toast.error("Selection partially overlaps an existing field.");
      return;
    }
    setCells(next);
    setSel(null);
  };

  const openImport = (init: { tab: ImportTab; start?: string; length?: number } | null) => {
    setIsEditing(true);
    setShowAddForm(false);
    setEditingCellId(null);
    setImportInit(init);
    setShowImport(true);
  };

  // ── Snapshots ─────────────────────────────────────────────────
  const syncedStates = (): MemoryState[] =>
    states.map((st) => (st.id === data.activeStateId ? { ...st, cells } : st));

  const addState = () => {
    const copy = { id: v4(), name: `State ${Math.max(states.length, 1) + 1}`, cells: cells.map((c) => ({ ...c })) };
    const base = states.length === 0 ? [{ id: v4(), name: "State 1", cells }] : syncedStates();
    updateNodeData(id, { states: [...base, copy], activeStateId: copy.id });
  };

  const switchState = (stateId: string) => {
    if (stateId === data.activeStateId) return;
    const synced = syncedStates();
    const target = synced.find((st) => st.id === stateId);
    if (!target) return;
    setSel(null);
    setEditingCellId(null);
    updateNodeData(id, { states: synced, activeStateId: stateId, cells: target.cells });
  };

  const tree = useMemo(() => {
    const ordered = cellTreeOrder(cells);
    // Hide rows under folded parents
    const hidden = new Set<string>();
    return ordered.filter(({ cell }) => {
      if (cell.parentId && hidden.has(cell.parentId)) {
        hidden.add(cell.id);
        return false;
      }
      if (cell.collapsed) hidden.add(cell.id);
      return true;
    });
  }, [cells]);

  // ── Render one byte cell in the hex area ───────────────────────

  const renderByteCell = (byteAddr: number) => {
    const ann = byteMap.get(byteAddr);
    const inSel = !!selRange && byteAddr >= selRange[0] && byteAddr < selRange[1];
    const changed = !!diffSet?.has(byteAddr);
    const overlay = `${inSel ? "ring-1 ring-inset ring-indigo-500 bg-indigo-500/25" : ""} ${changed ? "bg-rose-500/30" : ""}`;
    const base = "inline-block w-[18px] text-center font-mono text-xs";
    const changedNote = changed ? ` · changed since ${prevState?.name}` : "";

    if (!ann) {
      return (
        <span key={byteAddr} data-addr={byteAddr} className={`${base} text-gray-700 ${overlay}`} title={changed ? `removed${changedNote}` : undefined}>
          --
        </span>
      );
    }

    const cell = cellById.get(ann.cellId);
    const customColor = cell?.fieldColor;

    if (ann.type !== "field") {
      const hx = ann.value.toString(16).toUpperCase().padStart(2, "0");
      const detail =
        ann.type === "text"
          ? `text "${ann.value >= 0x20 && ann.value < 0x7f ? String.fromCharCode(ann.value) : "."}"`
          : ann.type === "pointer"
            ? `pointer → ${describePointer(ptrAddr(cell?.value))}`
            : ann.type;
      // Bytes inside a field get an underline in the field's color
      const owner = fieldMap.get(byteAddr);
      const ownerCell = owner ? cellById.get(owner.cellId) : undefined;
      const ownerCol = owner ? FIELD_COLORS[fieldColorMap.get(owner.cellId) ?? 0] : undefined;
      return (
        <span
          key={byteAddr}
          data-addr={byteAddr}
          className={`${base} ${customColor ? "" : BYTE_TONE[ann.type]} ${owner ? `border-b-2 ${ownerCell?.fieldColor ? "" : ownerCol?.border}` : ""} ${overlay}`}
          style={{
            ...(customColor ? { color: customColor } : {}),
            ...(ownerCell?.fieldColor ? { borderColor: ownerCell.fieldColor } : {}),
          }}
          title={`0x${hx} (${detail})${owner ? ` in ${owner.fieldName ?? "field"} +${byteAddr - (owner.fieldStartAddr ?? 0)}` : ""}${changedNote}`}
        >
          {hx}
        </span>
      );
    }

    // ── field type: draw a "long line" style border ─────────
    const col = FIELD_COLORS[fieldColorMap.get(ann.cellId) ?? 0];
    const fieldStart = ann.fieldStartAddr ?? 0;
    const rel = byteAddr - fieldStart;
    const elemEdge = !!cell?.elemSize && !ann.isFirst && rel % cell.elemSize === 0;
    const borders = `border-t-2 border-b-2 ${ann.isFirst ? "border-l-2" : elemEdge ? "border-l" : ""} ${ann.isLast ? "border-r-2" : ""}`;
    const title = `${ann.fieldName ?? "field"} (+${rel}${cell?.elemSize ? `, [${Math.floor(rel / cell.elemSize)}]` : ""})${changedNote}`;

    return (
      <span
        key={byteAddr}
        data-addr={byteAddr}
        className={`${base} h-[18px] ${customColor ? "" : `${col.bg} ${col.text} ${col.border}`} ${borders} ${overlay}`}
        style={customColor ? { backgroundColor: `${customColor}33`, color: customColor, borderColor: customColor } : undefined}
        title={title}
      >
        {ann.isFirst ? "▶" : ""}
      </span>
    );
  };

  const addrFromEvent = (e: React.MouseEvent): number | null => {
    const el = (e.target as HTMLElement).closest("[data-addr]");
    return el ? Number(el.getAttribute("data-addr")) : null;
  };

  const onBytesMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const addr = addrFromEvent(e);
    if (addr === null) return;
    e.stopPropagation();
    selecting.current = true;
    if (e.shiftKey && sel) setSel({ anchor: sel.anchor, focus: addr });
    else if (sel && sel.anchor === addr && sel.focus === addr) {
      setSel(null);
      selecting.current = false;
    } else setSel({ anchor: addr, focus: addr });
  };

  const onBytesMouseOver = (e: React.MouseEvent) => {
    if (!selecting.current) return;
    const addr = addrFromEvent(e);
    if (addr !== null && sel && addr !== sel.focus) setSel({ anchor: sel.anchor, focus: addr });
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
      const fieldId = fieldMap.get(addr)?.cellId ?? null;

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
                    if (ann && ann.type !== "field") {
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

            const cell = cellById.get(seg.fieldId);

            if (!cell || cell.type !== "field") return null;
            const label = fieldLabel(cell, !!cell.collapsed && hasChildren(cells, cell.id));
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
                        {label}
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
                      {label}
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
      } else if (ann.type !== "field") {
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
      className={`anodi-export-node group/mem font-mono rounded-lg border-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-lg transition-all ${
        selected
          ? customColor
            ? "shadow-lg"
            : "border-indigo-400 shadow-indigo-400/40 shadow-lg"
          : customColor
            ? ""
            : "border-gray-300 dark:border-gray-600"
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

      <NodeHeader
        kind="memory"
        icon={MemoryStick}
        name={data.name ?? "Untitled"}
        nodeColor={customColor}
        height={HEADER_H}
        mono
        subtitle={
          <>
            <span className="font-mono">{data.baseAddress ?? "?"} – {data.endAddress ?? "?"}</span>
            {isAutoCollapsed ? " · auto-collapsed" : ""} · {unitSize}B
          </>
        }
        actions={
          <>
            <button
              className="nodrag opacity-70 hover:opacity-100"
              title="Import hexdump / binary / C struct"
              onClick={(e) => {
                e.stopPropagation();
                if (showImport) setShowImport(false);
                else openImport(null);
              }}
            >
              <Upload size={13} />
            </button>
            <button
              className="nodrag opacity-70 hover:opacity-100"
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
          </>
        }
      />

      {/* Badge */}

      <div className="flex items-center px-2" style={{ height: BADGE_H }}>
        {!dragging && (
          <StateBar
            states={states}
            activeId={data.activeStateId}
            showDiff={!!data.showDiff}
            onSwitch={switchState}
            onAdd={addState}
            onToggleDiff={() => updateNodeData(id, { showDiff: !data.showDiff })}
          />
        )}
      </div>

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

              <div
                className="nodrag flex shrink-0 cursor-cell select-none gap-px"
                onMouseDown={onBytesMouseDown}
                onMouseOver={onBytesMouseOver}
              >
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
                  // Deepest visible cell starting in this row
                  const startingCell = shown.find((c) => {
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

      {selRange && (
        <InspectorPanel
          key={`${selRange[0]}-${selRange[1]}`}
          start={selRange[0]}
          end={selRange[1]}
          rawBytes={rawBytes}
          padLen={padLen}
          defaultEndianness={endianness}
          pointerSize={pointerSize}
          describePointer={describePointer}
          onCreate={createFromSelection}
          onFill={() =>
            openImport({ tab: "fill", start: fmtHex(selRange[0], padLen), length: selRange[1] - selRange[0] })
          }
          onClose={() => setSel(null)}
        />
      )}

      {/* Edit mode panel */}

      {isEditing && (
        <div
          className="nodrag nopan nowheel mx-1 mb-2 flex flex-col gap-1"
          onKeyDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {cells.length > 0 && (
            <div className="rounded-md border border-gray-200 bg-white p-1 font-sans shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between px-1 pb-1 pt-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Content
                </span>
                <span className="rounded bg-gray-100 px-1.5 text-[10px] font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {cells.length}
                </span>
              </div>

              {tree.map(({ cell: c, depth }) => {
                const kids = hasChildren(cells, c.id);
                const isPtr = c.type === "pointer";
                const meta =
                  c.type === "number" || c.type === "integer"
                    ? numberCellMetaLabel(c)
                    : isPtr
                      ? `ptr${(c.pointerSize ?? 8) * 8}`
                      : c.type === "field" && c.elemSize
                        ? `${Math.round((c.fieldSize ?? 0) / c.elemSize)}×${c.elemSize}B`
                        : `${cellByteSize(c)}B`;
                return (
                <div key={c.id}>
                  {editingCellId === c.id ? (
                    <CellForm
                      cells={cells}
                      unitSize={unitSize}
                      padLen={padLen}
                      range={{ start: base, end }}
                      defaultEndianness={endianness}
                      pointerSize={pointerSize}
                      describePointer={describePointer}
                      onSave={(next) => {
                        setCells(next);
                        setEditingCellId(null);
                      }}
                      onCancel={() => setEditingCellId(null)}
                      cellToEdit={c}
                    />
                  ) : (
                    <div
                      className="group/cell flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                      style={{ paddingLeft: 4 + depth * 10 }}
                      onClick={() => setEditingCellId(c.id)}
                      title="Click to edit"
                    >
                      {kids ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            patchCell(c.id, { collapsed: !c.collapsed });
                          }}
                          title={c.collapsed ? "Expand" : "Collapse"}
                          className="-ml-1 shrink-0 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
                        >
                          {c.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                        </button>
                      ) : (
                        <span
                          className="h-3 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: c.fieldColor ?? CELL_TYPE_COLORS[c.type] }}
                        />
                      )}
                      <span className="w-11 shrink-0 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
                        {c.type === "integer" ? "number" : c.type === "pointer" ? "ptr" : c.type}
                      </span>

                      <span className="shrink-0 font-mono text-green-700 dark:text-green-300">
                        {fmtHex(parseHexAddr(c.address), padLen)}
                      </span>

                      <span className="min-w-0 flex-1 truncate font-mono text-gray-700 dark:text-gray-300">
                        {c.type === "field" ? fieldLabel(c, false) : c.value}
                        {isPtr && (
                          <span className="text-pink-600 dark:text-pink-300">
                            {" → "}
                            {describePointer(ptrAddr(c.value))}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">{meta}</span>

                      {c.type === "field" && c.elemSize && !kids && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            splitArray(c);
                          }}
                          title="Split into element fields"
                          className="shrink-0 text-gray-400 opacity-0 hover:text-indigo-500 group-hover/cell:opacity-100 dark:text-gray-500 dark:hover:text-indigo-300"
                        >
                          <ListTree size={11} />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCell(c.id);
                        }}
                        title={kids ? "Remove (with nested content)" : "Remove"}
                        className="shrink-0 text-gray-400 opacity-0 hover:text-red-500 group-hover/cell:opacity-100 dark:text-gray-500 dark:hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {showImport && (
            <ImportPanel
              baseAddress={data.baseAddress ?? "0x0000"}
              endAddress={data.endAddress ?? "0x0000"}
              key={JSON.stringify(importInit)}
              unitSize={unitSize}
              cells={cells}
              defaultEndianness={endianness}
              initialTab={importInit?.tab}
              initialStart={importInit?.start}
              initialLength={importInit?.length}
              onApply={(next) => {
                setCells(next);
                setShowImport(false);
                setSel(null);
              }}
              onClose={() => setShowImport(false)}
            />
          )}

          {showAddForm ? (
            <CellForm
              cells={cells}
              unitSize={unitSize}
              padLen={padLen}
              range={{ start: base, end }}
              defaultEndianness={endianness}
              pointerSize={pointerSize}
              describePointer={describePointer}
              onSave={(next) => {
                setCells(next);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddForm(true);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 py-1 font-sans text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                <Plus size={12} /> Add content
              </button>
              {!showImport && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openImport(null);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 py-1 font-sans text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                >
                  <Upload size={12} /> Import
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

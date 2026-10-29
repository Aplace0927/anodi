import type {
  MemoryCollapsedRange,
  MemoryCell,
  IntegerSize,
  Endianness,
  MemoryNumberKind,
  MemoryLayoutData,
  AnodiNode,
} from "../types";

// ── Global settings ────────────────────────────────────────────────
export const MEMORY_THRESHOLD = 0x100;
export const MEMORY_LINES = 4;
// Field colour palette (cycling)
export const FIELD_COLORS = [
  { bg: "bg-blue-800", text: "text-blue-200", border: "border-blue-500" },
  { bg: "bg-purple-800", text: "text-purple-200", border: "border-purple-500" },
  { bg: "bg-teal-800", text: "text-teal-200", border: "border-teal-500" },
  { bg: "bg-pink-800", text: "text-pink-200", border: "border-pink-500" },
  { bg: "bg-yellow-800", text: "text-yellow-200", border: "border-yellow-500" },
];

// ── Byte-level utilities ───────────────────────────────────────────

export function parseHexAddr(s: string): number {
  const trimmed = s.trim().toLowerCase();
  if (trimmed.startsWith("0x")) {
    return parseInt(trimmed, 16) || 0;
  }
  if (/[a-f]/.test(trimmed)) {
    return parseInt(trimmed, 16) || 0;
  }
  return parseInt(trimmed, 10) || 0;
}

export function fmtHex(n: number, padLen: number): string {
  return "0x" + n.toString(16).toUpperCase().padStart(padLen, "0");
}

export function parseHexBytes(hexStr: string): number[] {
  if (!hexStr.trim()) return [];
  return hexStr
    .trim()
    .split(/\s+/)
    .filter((h) => /^[0-9a-fA-F]{1,2}$/.test(h))
    .map((h) => parseInt(h, 16));
}

export function textToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/** Parse an integer string supporting decimal, 0b (binary), 0x (hex), 0o (octal). */
export function parseIntegerValue(str: string): bigint {
  const s = str.trim();
  if (!s) return 0n;
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1).trim() : s;
  let val: bigint;
  if (abs.startsWith("0b") || abs.startsWith("0B")) {
    val = BigInt("0b" + abs.slice(2));
  } else if (abs.startsWith("0x") || abs.startsWith("0X")) {
    val = BigInt("0x" + abs.slice(2));
  } else if (abs.startsWith("0o") || abs.startsWith("0O")) {
    val = BigInt("0o" + abs.slice(2));
  } else {
    val = BigInt(abs);
  }
  return negative ? -val : val;
}

/** Convert an integer to bytes with the given size and endianness. */
export function integerToBytes(
  value: string,
  size: IntegerSize,
  endianness: Endianness,
  signed: boolean,
): number[] {
  try {
    let n = parseIntegerValue(value);
    if (!signed && n < 0n) throw new Error("unsigned integers cannot be negative");
    const mask = (1n << BigInt(size * 8)) - 1n;
    n = n & mask; // truncate to size
    const bytes: number[] = [];
    for (let i = 0; i < size; i++) {
      bytes.push(Number((n >> BigInt(i * 8)) & 0xFFn));
    }
    // bytes is little-endian; reverse for big-endian
    if (endianness === "big") bytes.reverse();
    return bytes;
  } catch {
    return Array(size).fill(0);
  }
}

export function isIntegerKind(
  kind: MemoryNumberKind,
): kind is "int8_t" | "int16_t" | "int32_t" | "int64_t" {
  return kind === "int8_t" || kind === "int16_t" || kind === "int32_t" || kind === "int64_t";
}

export function numberKindSize(kind: MemoryNumberKind): IntegerSize {
  switch (kind) {
    case "int8_t":
      return 1;
    case "int16_t":
      return 2;
    case "int32_t":
    case "float":
      return 4;
    case "int64_t":
    case "double":
      return 8;
  }
}

export function integerSizeToKind(size?: IntegerSize): MemoryNumberKind {
  switch (size) {
    case 1:
      return "int8_t";
    case 2:
      return "int16_t";
    case 8:
      return "int64_t";
    case 4:
    default:
      return "int32_t";
  }
}

export function numberToBytes(
  value: string,
  kind: MemoryNumberKind,
  endianness: Endianness,
  signed: boolean,
): number[] {
  if (kind === "float") {
    const n = Number(value.trim() || "0");
    if (!Number.isFinite(n)) throw new Error("invalid float value");
    const buf = new ArrayBuffer(4);
    const dv = new DataView(buf);
    dv.setFloat32(0, n, endianness === "little");
    return Array.from(new Uint8Array(buf));
  }
  if (kind === "double") {
    const n = Number(value.trim() || "0");
    if (!Number.isFinite(n)) throw new Error("invalid double value");
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setFloat64(0, n, endianness === "little");
    return Array.from(new Uint8Array(buf));
  }

  return integerToBytes(value, numberKindSize(kind), endianness, signed);
}

export function getCellNumberKind(cell: MemoryCell): MemoryNumberKind {
  if (cell.type === "number") return cell.numberKind ?? "int32_t";
  return integerSizeToKind(cell.integerSize);
}

export function getCellNumberSigned(cell: MemoryCell): boolean {
  const kind = getCellNumberKind(cell);
  if (!isIntegerKind(kind)) return true;
  if (cell.type === "number") return cell.numberSigned ?? true;
  return true;
}

export function numberKindShortLabel(kind: MemoryNumberKind, signed: boolean): string {
  if (kind === "float") return "f32";
  if (kind === "double") return "f64";
  if (kind === "int8_t") return signed ? "i8" : "u8";
  if (kind === "int16_t") return signed ? "i16" : "u16";
  if (kind === "int32_t") return signed ? "i32" : "u32";
  return signed ? "i64" : "u64";
}

export function numberCellMetaLabel(cell: MemoryCell): string {
  const kind = getCellNumberKind(cell);
  const endianLabel = (cell.endianness ?? "little") === "big" ? "BE" : "LE";
  return `${numberKindShortLabel(kind, getCellNumberSigned(cell))} ${endianLabel}`;
}

export function cellByteSize(
  cell: Pick<MemoryCell, "type" | "value" | "fieldSize" | "integerSize" | "numberKind" | "pointerSize">,
): number {
  if (cell.type === "field") return cell.fieldSize ?? 1;
  if (cell.type === "pointer") return cell.pointerSize ?? 8;
  if (cell.type === "number") return numberKindSize(cell.numberKind ?? "int32_t");
  if (cell.type === "integer") return cell.integerSize ?? 4;
  if (cell.type === "hex")
    return Math.max(1, parseHexBytes(cell.value ?? "").length);
  return Math.max(1, textToBytes(cell.value ?? "").length);
}

// ── Byte annotation map ───────────────────────────────────────────

export interface ByteAnnotation {
  value: number;
  type: "hex" | "text" | "field" | "number" | "pointer";
  cellId: string;
  isFirst: boolean;
  isLast: boolean;
  fieldName?: string;
  fieldStartAddr?: number;
  fieldEndAddr?: number; // exclusive
}

/** Encoded bytes of a byte-carrying cell; null for fields. */
export function cellBytes(cell: MemoryCell): number[] | null {
  switch (cell.type) {
    case "hex":
      return parseHexBytes(cell.value ?? "");
    case "text":
      return textToBytes(cell.value ?? "");
    case "number":
    case "integer":
      return numberToBytes(
        cell.value ?? "0",
        getCellNumberKind(cell),
        cell.endianness ?? "little",
        getCellNumberSigned(cell),
      );
    case "pointer":
      return integerToBytes(cell.value ?? "0", cell.pointerSize ?? 8, cell.endianness ?? "little", false);
    default:
      return null;
  }
}

/** First cell claiming a byte wins — pass `visibleCells()` so nested cells take precedence. */
export function buildByteMap(cells: MemoryCell[]): Map<number, ByteAnnotation> {
  const map = new Map<number, ByteAnnotation>();

  for (const cell of cells) {
    const startAddr = parseHexAddr(cell.address);

    if (cell.type === "field") {
      const size = cell.fieldSize ?? 1;
      for (let i = 0; i < size; i++) {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, {
            value: 0,
            type: "field",
            cellId: cell.id,
            isFirst: i === 0,
            isLast: i === size - 1,
            fieldName: cell.fieldName,
            fieldStartAddr: startAddr,
            fieldEndAddr: startAddr + size,
          });
      }
      continue;
    }

    const bytes = cellBytes(cell) ?? [];
    const type = cell.type === "integer" ? "number" : cell.type;
    bytes.forEach((b, i) => {
      if (!map.has(startAddr + i))
        map.set(startAddr + i, {
          value: b,
          type,
          cellId: cell.id,
          isFirst: i === 0,
          isLast: i === bytes.length - 1,
        });
    });
  }

  return map;
}

/** Concrete byte values from every byte-carrying cell (ignores fields and collapse state). */
export function rawByteMap(cells: MemoryCell[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const cell of cells) {
    const bytes = cellBytes(cell);
    if (!bytes) continue;
    const start = parseHexAddr(cell.address);
    bytes.forEach((b, i) => {
      if (!map.has(start + i)) map.set(start + i, b);
    });
  }
  return map;
}

/** Addresses whose byte value (or presence) differs between two cell sets. */
export function diffBytes(a: MemoryCell[], b: MemoryCell[]): Set<number> {
  const ma = rawByteMap(a);
  const mb = rawByteMap(b);
  const out = new Set<number>();
  for (const [addr, v] of ma) if (mb.get(addr) !== v) out.add(addr);
  for (const addr of mb.keys()) if (!ma.has(addr)) out.add(addr);
  return out;
}

// ── Cell tree (nested fields / arrays) ────────────────────────────

function cellRange(c: Pick<MemoryCell, "address"> & Parameters<typeof cellByteSize>[0]): [number, number] {
  const s = parseHexAddr(c.address);
  return [s, s + cellByteSize(c)];
}

export function cellDepth(cells: MemoryCell[], cell: MemoryCell): number {
  const byId = new Map(cells.map((c) => [c.id, c]));
  let depth = 0;
  let cur = cell.parentId ? byId.get(cell.parentId) : undefined;
  while (cur && depth < 32) {
    depth++;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return depth;
}

/** Cells whose ancestors are all expanded, deepest first (so children claim bytes before parents). */
export function visibleCells(cells: MemoryCell[]): MemoryCell[] {
  if (!cells.some((c) => c.parentId)) return cells;
  const byId = new Map(cells.map((c) => [c.id, c]));
  const depth = new Map<string, number>();
  const visible: MemoryCell[] = [];
  for (const c of cells) {
    let d = 0;
    let hidden = false;
    let cur = c.parentId ? byId.get(c.parentId) : undefined;
    while (cur && d < 32) {
      if (cur.collapsed) hidden = true;
      d++;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (hidden) continue;
    depth.set(c.id, d);
    visible.push(c);
  }
  return visible.sort((x, y) => (depth.get(y.id) ?? 0) - (depth.get(x.id) ?? 0));
}

export function hasChildren(cells: MemoryCell[], id: string): boolean {
  return cells.some((c) => c.parentId === id);
}

function descendantIds(cells: MemoryCell[], id: string): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const c of cells) {
      if (c.parentId && frontier.includes(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  return out;
}

/** Remove a cell together with everything nested inside it. */
export function removeCellTree(cells: MemoryCell[], id: string): MemoryCell[] {
  const gone = descendantIds(cells, id);
  gone.add(id);
  return cells.filter((c) => !gone.has(c.id));
}

/** Depth-first order (roots by address, children under their parent) with depth. */
export function cellTreeOrder(cells: MemoryCell[]): { cell: MemoryCell; depth: number }[] {
  const ids = new Set(cells.map((c) => c.id));
  const byAddr = (a: MemoryCell, b: MemoryCell) => parseHexAddr(a.address) - parseHexAddr(b.address);
  const out: { cell: MemoryCell; depth: number }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    const kids = cells
      .filter((c) => (parent ? c.parentId === parent : !c.parentId || !ids.has(c.parentId)))
      .sort(byAddr);
    for (const k of kids) {
      out.push({ cell: k, depth });
      if (depth < 32) walk(k.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

/**
 * Insert or update a cell, nesting it into the innermost field that fully
 * contains it. A new field adopts same-level cells it fully contains.
 * Returns null when it would partially overlap other content.
 */
export function placeCell(
  cells: MemoryCell[],
  cell: MemoryCell,
  editingId?: string,
): MemoryCell[] | null {
  const [start, end] = cellRange(cell);
  const ownDesc = editingId ? descendantIds(cells, editingId) : new Set<string>();
  const others = cells.filter((c) => c.id !== editingId && !ownDesc.has(c.id));

  let parent: MemoryCell | undefined;
  for (const c of others) {
    if (c.type !== "field") continue;
    const [s, e] = cellRange(c);
    if (s <= start && end <= e && (!parent || e - s <= cellByteSize(parent))) parent = c;
  }

  const byId = new Map(cells.map((c) => [c.id, c]));
  const ancestors = new Set<string>();
  for (let p = parent; p && ancestors.size < 32; p = p.parentId ? byId.get(p.parentId) : undefined) {
    ancestors.add(p.id);
  }

  const level = (c: MemoryCell) => (c.parentId && byId.has(c.parentId) ? c.parentId : undefined);
  const adopted = new Set<string>();
  if (cell.type === "field") {
    for (const c of others) {
      if (level(c) !== parent?.id) continue;
      const [s, e] = cellRange(c);
      if (start <= s && e <= end) adopted.add(c.id);
    }
  }
  const adoptedDesc = new Set<string>();
  for (const id of adopted) for (const d of descendantIds(cells, id)) adoptedDesc.add(d);

  for (const c of others) {
    if (ancestors.has(c.id) || adopted.has(c.id) || adoptedDesc.has(c.id)) continue;
    const [s, e] = cellRange(c);
    if (start < e && end > s) return null;
  }

  const placed: MemoryCell = { ...cell, parentId: parent?.id };
  const exists = !!editingId && cells.some((c) => c.id === editingId);
  const next = cells.map((c) => {
    if (c.id === editingId) return placed;
    if (adopted.has(c.id)) return { ...c, parentId: placed.id };
    return c;
  });
  return exists ? next : [...next, placed];
}

/**
 * Split byte-carrying cells at the [start, end) boundaries; remainders become
 * hex cells. The inside part is dropped (to make room) unless `keepInside`
 * (to nest it under a new field). Fields are kept.
 */
export function carveRange(
  cells: MemoryCell[],
  start: number,
  end: number,
  newId: () => string,
  padLen: number,
  keepInside = false,
): MemoryCell[] {
  const out: MemoryCell[] = [];
  const hex = (bytes: number[]) =>
    bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  for (const c of cells) {
    const bytes = cellBytes(c);
    const [s, e] = cellRange(c);
    if (!bytes || e <= start || s >= end) {
      out.push(c);
      continue;
    }
    if (keepInside && s >= start && e <= end) {
      out.push(c);
      continue;
    }
    const keep = { fieldColor: c.fieldColor, parentId: c.parentId };
    if (keepInside) {
      const [a, b] = [Math.max(s, start), Math.min(e, end)];
      out.push({ id: newId(), type: "hex", address: fmtHex(a, padLen), value: hex(bytes.slice(a - s, b - s)), ...keep });
    }
    if (s < start) {
      out.push({ id: newId(), type: "hex", address: fmtHex(s, padLen), value: hex(bytes.slice(0, start - s)), ...keep });
    }
    if (e > end) {
      out.push({ id: newId(), type: "hex", address: fmtHex(end, padLen), value: hex(bytes.slice(end - s)), ...keep });
    }
  }
  return out;
}

// ── Pointers ──────────────────────────────────────────────────────

export interface PointerTarget {
  nodeId: string;
  name: string;
  offset: number;
}

/** Find the memory node whose range contains `addr` (prefers `preferId`). */
export function resolvePointerTarget(
  nodes: AnodiNode[],
  addr: number,
  preferId?: string,
): PointerTarget | null {
  let found: PointerTarget | null = null;
  for (const n of nodes) {
    const d = n.data;
    if (d.kind !== "memory") continue;
    const md = d as MemoryLayoutData;
    const base = parseHexAddr(md.baseAddress ?? "0");
    const end = parseHexAddr(md.endAddress ?? "0");
    if (addr < base || addr >= end) continue;
    const t = { nodeId: n.id, name: md.name ?? "memory", offset: addr - base };
    if (n.id === preferId) return t;
    found ??= t;
  }
  return found;
}

export function pointerTargetLabel(t: PointerTarget | null): string {
  if (!t) return "unmapped";
  return t.offset ? `${t.name}+0x${t.offset.toString(16).toUpperCase()}` : t.name;
}

// ── Row items ─────────────────────────────────────────────────────

/** A visible row, or a collapsed range marker. */
export type RowItem =
  | { addr: number; label: string }
  | { ellipsis: true; fromAddr: number; toAddr: number };

/** Maximum memory range per node: 4 KB (one page). */
export const MAX_MEMORY_RANGE = 0x1000;

export function buildRowItems(
  baseAddress: string,
  endAddress: string,
  unitSize: number,
  collapsedRanges: MemoryCollapsedRange[],
): RowItem[] {
  const base = parseHexAddr(baseAddress);
  const end = parseHexAddr(endAddress);
  if (end <= base || unitSize <= 0) return [];

  // Safety: clamp to maximum 4 KB range to avoid freezes
  const clampedEnd = Math.min(end, base + MAX_MEMORY_RANGE);

  const totalBytes = clampedEnd - base;

  const effectiveCollapsed = collapsedRanges.map((r) => ({
    start: parseHexAddr(r.start),
    end: parseHexAddr(r.end),
  }));

  if (totalBytes > MEMORY_THRESHOLD && effectiveCollapsed.length === 0) {
    const headEnd = base + MEMORY_LINES * unitSize;
    const tailStart = clampedEnd - MEMORY_LINES * unitSize;
    if (headEnd < tailStart) {
      effectiveCollapsed.push({ start: headEnd, end: tailStart });
    }
  }

  const padLen = Math.max(4, clampedEnd.toString(16).length);
  const isCollapsed = (addr: number) =>
    effectiveCollapsed.some((r) => addr >= r.start && addr < r.end);

  const items: RowItem[] = [];
  let inCollapse = false;
  let collapseStart = 0;

  for (let addr = base; addr < clampedEnd; addr += unitSize) {
    if (isCollapsed(addr)) {
      if (!inCollapse) {
        collapseStart = addr;
        inCollapse = true;
      }
    } else {
      if (inCollapse) {
        // Emit the ellipsis now that we know where the collapse ends
        items.push({ ellipsis: true, fromAddr: collapseStart, toAddr: addr });
        inCollapse = false;
      }
      items.push({ addr, label: fmtHex(addr, padLen) });
    }
  }
  // Handle collapse that extends to the end
  if (inCollapse) {
    items.push({ ellipsis: true, fromAddr: collapseStart, toAddr: clampedEnd });
  }

  return items;
}

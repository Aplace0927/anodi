import type {
  MemoryCollapsedRange,
  MemoryCell,
  IntegerSize,
  Endianness,
  MemoryNumberKind,
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
  cell: Pick<MemoryCell, "type" | "value" | "fieldSize" | "integerSize" | "numberKind">,
): number {
  if (cell.type === "field") return cell.fieldSize ?? 1;
  if (cell.type === "number") return numberKindSize(cell.numberKind ?? "int32_t");
  if (cell.type === "integer") return cell.integerSize ?? 4;
  if (cell.type === "hex")
    return Math.max(1, parseHexBytes(cell.value ?? "").length);
  return Math.max(1, textToBytes(cell.value ?? "").length);
}

// ── Byte annotation map ───────────────────────────────────────────

export interface ByteAnnotation {
  value: number;
  type: "hex" | "text" | "field" | "number";
  cellId: string;
  isFirst: boolean;
  isLast: boolean;
  fieldName?: string;
  fieldStartAddr?: number;
  fieldEndAddr?: number; // exclusive
}

export function buildByteMap(cells: MemoryCell[]): Map<number, ByteAnnotation> {
  const map = new Map<number, ByteAnnotation>();

  for (const cell of cells) {
    const startAddr = parseHexAddr(cell.address);

    if (cell.type === "hex") {
      const bytes = parseHexBytes(cell.value ?? "");
      bytes.forEach((b, i) => {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, {
            value: b,
            type: "hex",
            cellId: cell.id,
            isFirst: i === 0,
            isLast: i === bytes.length - 1,
          });
      });
    } else if (cell.type === "text") {
      const bytes = textToBytes(cell.value ?? "");
      bytes.forEach((b, i) => {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, {
            value: b,
            type: "text",
            cellId: cell.id,
            isFirst: i === 0,
            isLast: i === bytes.length - 1,
          });
      });
    } else if (cell.type === "field") {
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
    } else if (cell.type === "number" || cell.type === "integer") {
      const numberKind = getCellNumberKind(cell);
      const signed = getCellNumberSigned(cell);
      const endianness = cell.endianness ?? "little";
      const bytes = numberToBytes(cell.value ?? "0", numberKind, endianness, signed);
      bytes.forEach((b, i) => {
        if (!map.has(startAddr + i))
          map.set(startAddr + i, {
            value: b,
            type: "number",
            cellId: cell.id,
            isFirst: i === 0,
            isLast: i === bytes.length - 1,
          });
      });
    }
  }

  return map;
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

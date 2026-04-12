import { memo, useState, useEffect, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Edit2, Check, Plus, Trash2 } from "lucide-react";
import type {
  MemoryLayoutData,
  MemoryCollapsedRange,
  MemoryCell,
  MemoryCellType,
  IntegerSize,
  Endianness,
  MemoryNumberKind,
} from "../../types";
import { useGraphStore } from "../../store/graphStore";
import { v4 } from "../../utils/uuid";
import ColorPicker, { contrastTextColor } from "../ColorPicker";

type Props = NodeProps & { data: MemoryLayoutData & { name?: string } };

// ── Global settings ────────────────────────────────────────────────
export const MEMORY_THRESHOLD = 0x100;
export const MEMORY_LINES = 4;

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

// Field colour palette (cycling)
const FIELD_COLORS = [
  { bg: "bg-blue-800", text: "text-blue-200", border: "border-blue-500" },
  { bg: "bg-purple-800", text: "text-purple-200", border: "border-purple-500" },
  { bg: "bg-teal-800", text: "text-teal-200", border: "border-teal-500" },
  { bg: "bg-pink-800", text: "text-pink-200", border: "border-pink-500" },
  { bg: "bg-yellow-800", text: "text-yellow-200", border: "border-yellow-500" },
];

// ── Byte-level utilities ───────────────────────────────────────────

function parseHexAddr(s: string): number {
  const trimmed = s.trim().toLowerCase();
  if (trimmed.startsWith("0x")) {
    return parseInt(trimmed, 16) || 0;
  }
  if (/[a-f]/.test(trimmed)) {
    return parseInt(trimmed, 16) || 0;
  }
  return parseInt(trimmed, 10) || 0;
}

function fmtHex(n: number, padLen: number): string {
  return "0x" + n.toString(16).toUpperCase().padStart(padLen, "0");
}

function parseHexBytes(hexStr: string): number[] {
  if (!hexStr.trim()) return [];
  return hexStr
    .trim()
    .split(/\s+/)
    .filter((h) => /^[0-9a-fA-F]{1,2}$/.test(h))
    .map((h) => parseInt(h, 16));
}

function textToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/** Parse an integer string supporting decimal, 0b (binary), 0x (hex), 0o (octal). */
function parseIntegerValue(str: string): bigint {
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
function integerToBytes(
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

function isIntegerKind(
  kind: MemoryNumberKind,
): kind is "int8_t" | "int16_t" | "int32_t" | "int64_t" {
  return kind === "int8_t" || kind === "int16_t" || kind === "int32_t" || kind === "int64_t";
}

function numberKindSize(kind: MemoryNumberKind): IntegerSize {
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

function integerSizeToKind(size?: IntegerSize): MemoryNumberKind {
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

function numberToBytes(
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

function getCellNumberKind(cell: MemoryCell): MemoryNumberKind {
  if (cell.type === "number") return cell.numberKind ?? "int32_t";
  return integerSizeToKind(cell.integerSize);
}

function getCellNumberSigned(cell: MemoryCell): boolean {
  const kind = getCellNumberKind(cell);
  if (!isIntegerKind(kind)) return true;
  if (cell.type === "number") return cell.numberSigned ?? true;
  return true;
}

function numberKindShortLabel(kind: MemoryNumberKind, signed: boolean): string {
  if (kind === "float") return "f32";
  if (kind === "double") return "f64";
  if (kind === "int8_t") return signed ? "i8" : "u8";
  if (kind === "int16_t") return signed ? "i16" : "u16";
  if (kind === "int32_t") return signed ? "i32" : "u32";
  return signed ? "i64" : "u64";
}

function numberCellMetaLabel(cell: MemoryCell): string {
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

interface ByteAnnotation {
  value: number;
  type: "hex" | "text" | "field" | "number";
  cellId: string;
  isFirst: boolean;
  isLast: boolean;
  fieldName?: string;
  fieldStartAddr?: number;
  fieldEndAddr?: number; // exclusive
}

function buildByteMap(cells: MemoryCell[]): Map<number, ByteAnnotation> {
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
type RowItem =
  | { addr: number; label: string }
  | { ellipsis: true; fromAddr: number; toAddr: number };

/** Maximum memory range per node: 4 KB (one page). */
const MAX_MEMORY_RANGE = 0x1000;

function buildRowItems(
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

// ── Inline add-cell form ──────────────────────────────────────────

interface CellFormProps {
  cells: MemoryCell[];
  unitSize: number;
  padLen: number;
  onSave: (cellData: Omit<MemoryCell, "id">) => void;
  onCancel: () => void;
  cellToEdit?: MemoryCell;
}

function CellForm({
  cells,
  unitSize,
  padLen,
  onSave,
  onCancel,
  cellToEdit,
}: CellFormProps) {
  const [type, setType] = useState<MemoryCellType>("hex");
  const [address, setAddress] = useState("");
  const [value, setValue] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldSize, setFieldSize] = useState<number | "">(unitSize);
  const [numberKind, setNumberKind] = useState<MemoryNumberKind>("int32_t");
  const [numberSigned, setNumberSigned] = useState(true);
  const [endianness, setEndianness] = useState<Endianness>("little");
  const [fieldColor, setFieldColor] = useState<string | undefined>(undefined);
  const [sizeError, setSizeError] = useState(false);
  const [overlapError, setOverlapError] = useState(false);
  const [numberValueError, setNumberValueError] = useState(false);

  useEffect(() => {
    if (cellToEdit) {
      setType(cellToEdit.type === "integer" ? "number" : cellToEdit.type);
      setAddress(cellToEdit.address);
      setValue(cellToEdit.value ?? "");
      setFieldName(cellToEdit.fieldName ?? "");
      setFieldSize(cellToEdit.fieldSize ?? "");
      setNumberKind(getCellNumberKind(cellToEdit));
      setNumberSigned(getCellNumberSigned(cellToEdit));
      setEndianness(cellToEdit.endianness ?? "little");
      setFieldColor(cellToEdit.fieldColor);
    }
  }, [cellToEdit]);

  const computedSize =
    type === "field"
      ? typeof fieldSize === "number"
        ? fieldSize
        : 0
      : type === "number"
        ? numberKindSize(numberKind)
        : type === "hex"
          ? parseHexBytes(value).length
          : textToBytes(value).length;

  const handleSave = () => {
    setSizeError(false);
    setOverlapError(false);
    setNumberValueError(false);

    const addr = address.trim();
    const normalizedAddress = fmtHex(parseHexAddr(addr), padLen);

    let newCellData: Omit<MemoryCell, "id">;
    if (type === "field") {
      const sz = typeof fieldSize === "number" && fieldSize > 0 ? fieldSize : 0;
      if (sz <= 0) {
        setSizeError(true);
        return;
      }
      newCellData = {
        type,
        address: normalizedAddress,
        fieldName: fieldName.trim() || "field",
        fieldSize: sz,
        fieldColor,
      };
    } else if (type === "number") {
      try {
        if (isIntegerKind(numberKind)) {
          const parsed = parseIntegerValue(value);
          if (!numberSigned && parsed < 0n) {
            throw new Error("unsigned integers cannot be negative");
          }
        } else {
          const parsed = Number(value.trim() || "0");
          if (!Number.isFinite(parsed)) throw new Error("invalid floating value");
        }
      } catch {
        setNumberValueError(true);
        return;
      }
      newCellData = {
        type,
        address: normalizedAddress,
        value,
        numberKind,
        numberSigned: isIntegerKind(numberKind) ? numberSigned : undefined,
        endianness,
        fieldColor,
      };
    } else {
      newCellData = { type, address: normalizedAddress, value, fieldColor };
    }

    // Check for overlap, excluding the cell being edited
    const newCellStart = parseHexAddr(newCellData.address);
    const newCellSize = cellByteSize(newCellData);
    const newCellEnd = newCellStart + newCellSize;
    const otherCells = cellToEdit
      ? cells.filter((c) => c.id !== cellToEdit.id)
      : cells;

    for (const existingCell of otherCells) {
      const existingStart = parseHexAddr(existingCell.address);
      const existingSize = cellByteSize(existingCell);
      const existingEnd = existingStart + existingSize;

      if (newCellStart < existingEnd && newCellEnd > existingStart) {
        setOverlapError(true);
        return;
      }
    }

    onSave(newCellData);
  };

  return (
    <div className="rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800/80 p-2 text-xs text-gray-900 dark:text-white">
      {/* Type selector (disabled when editing) */}
      <div className="mb-2 flex gap-1">
        {(["hex", "text", "field", "number"] as MemoryCellType[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              if (cellToEdit) return; // Cannot change type when editing
              setType(t);
              setSizeError(false);
            }}
            className={`flex-1 rounded border py-0.5 text-xs font-bold uppercase transition-all ${
              type === t
                ? "border-orange-500 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400"
            } ${cellToEdit ? "cursor-not-allowed opacity-60" : "hover:border-gray-500"}`}
            disabled={!!cellToEdit}
          >
            {t === "number" ? "Number" : t}
          </button>
        ))}
      </div>

      {/* Address */}
      <div className="mb-1 flex items-center gap-1">
        <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">Address</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={`0x${"0".repeat(padLen)}`}
          className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 font-mono text-xs text-green-700 dark:text-green-300 focus:outline-none"
        />
      </div>

      {type === "field" ? (
        <>
          <div className="mb-1 flex items-center gap-1">
            <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
              Name
            </span>
            <input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="int variable"
              className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-900 dark:text-white focus:outline-none"
            />
          </div>
          <div className="mb-1 flex items-center gap-1">
            <span className="w-16 shrink-0 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Size (B)</span>
              <span className="ml-0.5 text-red-400">*</span>
            </span>
            <input
              type="number"
              min={1}
              value={fieldSize}
              onChange={(e) => {
                setSizeError(false);
                const v = parseInt(e.target.value, 10);
                setFieldSize(isNaN(v) ? "" : v);
              }}
              className={`flex-1 rounded border bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-900 dark:text-white focus:outline-none ${
                sizeError
                  ? "border-red-500 ring-1 ring-red-500"
                  : "border-gray-300 dark:border-gray-600"
              }`}
            />
          </div>
          {sizeError && (
            <p className="mb-1 text-xs text-red-400">
              Size must be ≥ 1 byte.
            </p>
          )}
        </>
      ) : type === "number" ? (
        <>
          <div className="mb-1 flex items-center gap-1">
            <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
              Type
            </span>
            <div className="mr-1 flex items-center gap-1">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {numberSigned ? "Signed" : "Unsigned"}
              </span>
              <button
                type="button"
                onClick={() => setNumberSigned((v) => !v)}
                className={`relative h-4 w-8 rounded-full border transition-all ${
                  numberSigned
                    ? "border-green-500 bg-green-500/30"
                    : "border-orange-500 bg-orange-500/30"
                }`}
                title={numberSigned ? "Switch to unsigned" : "Switch to signed"}
              >
                <span
                  className={`absolute top-[1px] h-3 w-3 rounded-full transition-all ${
                    numberSigned
                      ? "left-[1px] bg-green-600 dark:bg-green-400"
                      : "left-[15px] bg-orange-600 dark:bg-orange-400"
                  }`}
                />
              </button>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-1">
              {(["int8_t", "int16_t", "int32_t", "int64_t", "float", "double"] as MemoryNumberKind[]).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setNumberKind(kind)}
                  className={`flex-1 rounded border py-0.5 text-xs font-bold transition-all ${
                    numberKind === kind
                      ? "border-green-500 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {numberKindShortLabel(kind, numberSigned)}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-1 flex items-center gap-1">
            <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
              Endianness
            </span>
            <div className="flex flex-1 gap-1">
              {(["little", "big"] as Endianness[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setEndianness(e)}
                  className={`flex-1 rounded border py-0.5 text-xs font-bold transition-all ${
                    endianness === e
                      ? "border-green-500 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {e === "little" ? "Little" : "Big"}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-1 flex items-center gap-1">
            <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
              Value
            </span>
            <input
              value={value}
              onChange={(e) => {
                setNumberValueError(false);
                setValue(e.target.value);
              }}
              placeholder={isIntegerKind(numberKind) ? "255, 0xFF, 0b11111111, 0o377" : "3.14, -2.5e3"}
              className={`flex-1 rounded border bg-gray-100 dark:bg-gray-700 px-2 py-0.5 font-mono text-xs text-green-700 dark:text-green-300 focus:outline-none ${
                numberValueError
                  ? "border-red-500 ring-1 ring-red-500"
                  : "border-gray-300 dark:border-gray-600"
              }`}
            />
          </div>
          {numberValueError && (
            <p className="mb-1 text-xs text-red-400">
              Invalid number value.
            </p>
          )}
        </>
      ) : (
        <div className="mb-1 flex items-center gap-1">
          <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {type === "hex" ? "Hex bytes" : "Text"}
          </span>
          <input
            value={value}
            onChange={(e) => {
              if (type === "hex") {
                const sanitized = e.target.value.replace(/[^0-9a-fA-F\s]/g, "");
                setValue(sanitized);
              } else {
                setValue(e.target.value);
              }
            }}
            placeholder={type === "hex" ? "41 42 43 00" : "Hello, world"}
            className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 font-mono text-xs text-gray-700 dark:text-gray-200 focus:outline-none"
          />
        </div>
      )}

      <div className="mb-1 flex items-center gap-1">
        <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
          Color
        </span>
        <ColorPicker
          value={fieldColor}
          onChange={(c) => setFieldColor(c)}
        />
      </div>

      {computedSize > 0 && (
        <p className="mb-1 text-right text-xs text-gray-500">
          {computedSize} byte{computedSize !== 1 ? "s" : ""} consumed
        </p>
      )}

      {overlapError && (
        <p className="mb-1 text-red-400 text-xs">
          Memory overlaps with existing content.
        </p>
      )}

      <div className="flex justify-end gap-1">
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="rounded bg-orange-700 px-2 py-0.5 text-xs font-bold text-white hover:bg-orange-600"
        >
          {cellToEdit ? "Save" : "Add"}
        </button>
      </div>
    </div>
  );
}
// ── Main component ─────────────────────────────────────────────────

const MemoryLayoutNode = memo(({ id, data, selected, dragging }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
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
        <div className="flex-1 overflow-hidden">
          <div
            className={`truncate font-mono font-bold text-sm  ${headerTextColor ? '' : 'text-orange-50'}`}
            style={headerTextColor ? { color: headerTextColor } : undefined}
          >
            {data.name ?? "Untitled"}
            
          </div>
          <div
            className={`text-xs ${headerTextColor ? '' : 'text-orange-200'}`}
            style={headerTextColor ? { color: headerTextColor } : undefined}
          >
            <span
              className={`truncate rounded py-0.5 ${headerTextColor ? '' : 'text-orange-300'}`}
              style={headerTextColor ? { color: headerTextColor } : undefined}
            >
              <span className="font-mono">{data.baseAddress ?? "?"} –{" "}{data.endAddress ?? "?"}</span>
              {isAutoCollapsed ? " · auto-collapsed" : " "} · {" "}
              {unitSize}B
            </span>
          </div>
        </div>

        <button
          className={`shrink-0 ${headerTextColor ? '' : 'text-orange-200'} hover:text-white`}
          style={headerTextColor ? { color: headerTextColor } : undefined}
          title={isEditing ? "Done editing" : "Edit content"}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing((v) => !v);
            setShowAddForm(false);
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

          {showAddForm ? (
            <CellForm
              cells={cells}
              unitSize={unitSize}
              padLen={padLen}
              onSave={addCell}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAddForm(true);
              }}
              className="flex items-center justify-center gap-1 rounded border border-dashed border-gray-300 dark:border-gray-600 py-1 text-xs text-gray-500 dark:text-gray-400 hover:border-orange-500 hover:text-orange-300"
            >
              <Plus size={10} /> Add content
            </button>
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

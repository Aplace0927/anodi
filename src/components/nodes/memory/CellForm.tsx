import { useState, useEffect, useRef, type ReactNode } from "react";
import type {
  MemoryCell,
  MemoryCellType,
  Endianness,
  MemoryNumberKind,
  PointerSize,
} from "../../../types";
import { v4 } from "../../../utils/uuid";
import Segmented from "../../ui/Segmented";
import SwatchRow from "../../ui/SwatchRow";
import {
  parseHexAddr,
  fmtHex,
  parseHexBytes,
  textToBytes,
  parseIntegerValue,
  isIntegerKind,
  numberKindSize,
  numberToBytes,
  integerToBytes,
  placeCell,
  getCellNumberKind,
  getCellNumberSigned,
  numberKindShortLabel,
  cellByteSize,
} from "../../../utils/memory";

// ── Inline add-cell form ──────────────────────────────────────────

export interface CellFormProps {
  cells: MemoryCell[];
  unitSize: number;
  padLen: number;
  /** Valid address range [start, end) of the node. */
  range: { start: number; end: number };
  defaultEndianness: Endianness;
  pointerSize: PointerSize;
  /** Human label for a pointer target, e.g. "heap+0x10". */
  describePointer: (addr: number) => string;
  /** Receives the full next cell list (placement / nesting already applied). */
  onSave: (cells: MemoryCell[]) => void;
  onCancel: () => void;
  cellToEdit?: MemoryCell;
}

const CELL_TYPES: { id: Exclude<MemoryCellType, "integer">; label: string; title?: string }[] = [
  { id: "hex", label: "Hex" },
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "pointer", label: "Ptr", title: "Pointer" },
  { id: "field", label: "Field" },
];

/** Default render color per type — shown on the SwatchRow reset chip. */
export const CELL_TYPE_COLORS: Record<MemoryCellType, string> = {
  hex: "#fcd34d",
  text: "#67e8f9",
  number: "#86efac",
  integer: "#86efac",
  pointer: "#f9a8d4",
  field: "#3b82f6",
};

const INT_KINDS: MemoryNumberKind[] = ["int8_t", "int16_t", "int32_t", "int64_t"];
const FLOAT_KINDS: MemoryNumberKind[] = ["float", "double"];
const PREVIEW_MAX = 16;

const inputCls =
  "w-full min-w-0 rounded border bg-gray-100 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700";
const okBorder = "border-gray-300 dark:border-gray-600";
const errBorder = "border-red-500 ring-1 ring-red-500";

type ErrorKey = "address" | "range" | "size" | "value" | "overlap";

const ERROR_TEXT: Record<ErrorKey, string> = {
  address: "Invalid address.",
  range: "Address is outside this node's range.",
  size: "Size must be ≥ 1 byte.",
  value: "Invalid value.",
  overlap: "Overlaps existing content.",
};

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Pointer value as hex (bare digits are read as hex); null when invalid. */
function parsePointer(v: string): bigint | null {
  const t = v.trim();
  if (!t) return null;
  try {
    const n = BigInt(/^0x/i.test(t) ? t : `0x${t}`);
    return n >= 0n ? n : null;
  } catch {
    return null;
  }
}

function normalizePointer(v: string): string {
  const n = parsePointer(v);
  return n === null ? v : `0x${n.toString(16).toUpperCase()}`;
}

/** First free address after the highest cell, clamped into range. */
function nextFreeAddress(cells: MemoryCell[], start: number): number {
  let next = start;
  for (const c of cells) {
    next = Math.max(next, parseHexAddr(c.address) + cellByteSize(c));
  }
  return next;
}

export default function CellForm({
  cells,
  unitSize,
  padLen,
  range,
  defaultEndianness,
  pointerSize,
  describePointer,
  onSave,
  onCancel,
  cellToEdit,
}: CellFormProps) {
  const [type, setType] = useState<MemoryCellType>("hex");
  const [address, setAddress] = useState(() => {
    const next = nextFreeAddress(cells, range.start);
    return next < range.end ? fmtHex(next, padLen) : "";
  });
  const [value, setValue] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldSize, setFieldSize] = useState<number | "">(unitSize);
  const [count, setCount] = useState<number | "">(1);
  const [ptrSize, setPtrSize] = useState<PointerSize>(pointerSize);
  const [numberKind, setNumberKind] = useState<MemoryNumberKind>("int32_t");
  const [numberSigned, setNumberSigned] = useState(true);
  const [endianness, setEndianness] = useState<Endianness>(defaultEndianness);
  const [fieldColor, setFieldColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<ErrorKey | null>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cellToEdit) {
      setType(cellToEdit.type === "integer" ? "number" : cellToEdit.type);
      setAddress(cellToEdit.address);
      setValue(cellToEdit.value ?? "");
      setFieldName(cellToEdit.fieldName ?? "");
      const elem = cellToEdit.elemSize;
      setFieldSize(elem ?? cellToEdit.fieldSize ?? "");
      setCount(elem ? Math.round((cellToEdit.fieldSize ?? elem) / elem) : 1);
      setPtrSize(cellToEdit.pointerSize ?? pointerSize);
      setNumberKind(getCellNumberKind(cellToEdit));
      setNumberSigned(getCellNumberSigned(cellToEdit));
      setEndianness(cellToEdit.endianness ?? "little");
      setFieldColor(cellToEdit.fieldColor);
    }
  }, [cellToEdit, pointerSize]);

  // Focus the main input whenever the type changes (address is usually prefilled)
  useEffect(() => {
    valueRef.current?.focus();
  }, [type]);

  const elemCount = typeof count === "number" && count > 0 ? count : 1;
  const computedSize =
    type === "field"
      ? typeof fieldSize === "number"
        ? fieldSize * elemCount
        : 0
      : type === "pointer"
        ? ptrSize
        : type === "number"
        ? numberKindSize(numberKind)
        : type === "hex"
          ? parseHexBytes(value).length
          : textToBytes(value).length;

  // Encoded bytes for the live preview (null for fields / unparsable numbers)
  let previewBytes: number[] | null = null;
  if (type === "hex") previewBytes = parseHexBytes(value);
  else if (type === "text") previewBytes = textToBytes(value);
  else if (type === "number" && value.trim()) {
    try {
      previewBytes = numberToBytes(value, numberKind, endianness, numberSigned);
    } catch {
      previewBytes = null;
    }
  } else if (type === "pointer" && parsePointer(value) !== null) {
    previewBytes = integerToBytes(normalizePointer(value), ptrSize, endianness, false);
  }
  const ptrValue = type === "pointer" ? parsePointer(value) : null;

  const addrValid = /^(0x)?[0-9a-f]+$/i.test(address.trim());
  const startAddr = addrValid ? parseHexAddr(address) : null;

  const handleSave = () => {
    setError(null);

    if (startAddr === null) return setError("address");
    if (startAddr < range.start || startAddr >= range.end) return setError("range");
    const normalizedAddress = fmtHex(startAddr, padLen);

    let newCellData: Omit<MemoryCell, "id">;
    if (type === "field") {
      const sz = typeof fieldSize === "number" && fieldSize > 0 ? fieldSize : 0;
      if (sz <= 0) return setError("size");
      newCellData = {
        type,
        address: normalizedAddress,
        fieldName: fieldName.trim() || "field",
        fieldSize: sz * elemCount,
        elemSize: elemCount > 1 ? sz : undefined,
        fieldColor,
      };
    } else if (type === "pointer") {
      const v = parsePointer(value);
      if (v === null || v >= 1n << BigInt(ptrSize * 8)) return setError("value");
      newCellData = {
        type,
        address: normalizedAddress,
        value: normalizePointer(value),
        pointerSize: ptrSize,
        endianness,
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
        return setError("value");
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

    // Nest into an enclosing field when fully inside one; reject partial overlap
    const next = placeCell(
      cells,
      { ...cellToEdit, ...newCellData, id: cellToEdit?.id ?? v4() },
      cellToEdit?.id,
    );
    if (!next) return setError("overlap");
    onSave(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const border = (keys: ErrorKey[]) =>
    error && keys.includes(error) ? errBorder : okBorder;

  return (
    <div
      className="space-y-1.5 rounded-md border border-gray-200 bg-white p-2 font-sans text-xs text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      onKeyDown={onKeyDown}
    >
      {/* Type selector (fixed when editing) */}
      {cellToEdit ? (
        <Row label="Type">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-bold dark:bg-gray-800">
            {CELL_TYPES.find((t) => t.id === type)?.label}
          </span>
        </Row>
      ) : (
        <Segmented
          options={CELL_TYPES}
          value={type === "integer" ? "number" : type}
          onChange={(t) => {
            setType(t);
            setError(null);
          }}
        />
      )}

      <Row label="Address">
        <input
          value={address}
          onChange={(e) => {
            setError(null);
            setAddress(e.target.value);
          }}
          placeholder={fmtHex(range.start, padLen)}
          className={`${inputCls} ${border(["address", "range", "overlap"])} text-green-700 dark:text-green-300`}
        />
      </Row>

      {type === "field" ? (
        <>
          <Row label="Name">
            <input
              ref={valueRef}
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="field"
              className={`${inputCls} ${okBorder} font-sans`}
            />
          </Row>
          <Row label={elemCount > 1 ? "Elem size" : "Size"}>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={fieldSize}
                onChange={(e) => {
                  setError(null);
                  const v = parseInt(e.target.value, 10);
                  setFieldSize(isNaN(v) ? "" : v);
                }}
                className={`${inputCls} ${border(["size"])} w-16 flex-none`}
              />
              <div className="flex-1">
                <Segmented
                  options={[1, 2, 4, 8, 16].map((n) => ({ id: n, label: n, title: `${n} bytes` }))}
                  value={typeof fieldSize === "number" ? fieldSize : undefined}
                  onChange={(n) => {
                    setError(null);
                    setFieldSize(n);
                  }}
                />
              </div>
            </div>
          </Row>
          <Row label="Count">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setCount(isNaN(v) ? "" : v);
                }}
                className={`${inputCls} ${okBorder} w-16 flex-none`}
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {elemCount > 1 ? `array: ${fieldName.trim() || "field"}[${elemCount}]` : "1 = single field"}
              </span>
            </div>
          </Row>
        </>
      ) : type === "pointer" ? (
        <>
          <Row label="Width">
            <div className="flex gap-1">
              <Segmented
                options={[
                  { id: 4, label: "32-bit" },
                  { id: 8, label: "64-bit" },
                ]}
                value={ptrSize}
                onChange={(v: PointerSize) => setPtrSize(v)}
              />
              <Segmented
                options={[
                  { id: "little", label: "LE", title: "Little endian" },
                  { id: "big", label: "BE", title: "Big endian" },
                ]}
                value={endianness}
                onChange={(v: Endianness) => setEndianness(v)}
              />
            </div>
          </Row>
          <Row label="Target">
            <input
              ref={valueRef}
              value={value}
              onChange={(e) => {
                setError(null);
                setValue(e.target.value);
              }}
              placeholder={fmtHex(range.start, padLen)}
              className={`${inputCls} ${border(["value"])} text-pink-600 dark:text-pink-300`}
            />
          </Row>
          {ptrValue !== null && (
            <p className="pl-16 text-[10px] text-gray-500 dark:text-gray-400">
              → {ptrValue > BigInt(Number.MAX_SAFE_INTEGER) ? "unmapped" : describePointer(Number(ptrValue))}
            </p>
          )}
        </>
      ) : type === "number" ? (
        <>
          <Row label="Kind">
            <div className="flex gap-1">
              <div className="w-14 shrink-0">
                <Segmented
                  options={[
                    { id: "i", label: "i", title: "Signed" },
                    { id: "u", label: "u", title: "Unsigned" },
                  ]}
                  value={isIntegerKind(numberKind) ? (numberSigned ? "i" : "u") : undefined}
                  onChange={(s) => {
                    setNumberSigned(s === "i");
                    if (!isIntegerKind(numberKind)) setNumberKind("int32_t");
                  }}
                />
              </div>
              <Segmented
                options={[...INT_KINDS, ...FLOAT_KINDS].map((k) => ({
                  id: k,
                  label: numberKindShortLabel(k, numberSigned),
                  title: k,
                }))}
                value={numberKind}
                onChange={(k) => {
                  setError(null);
                  setNumberKind(k);
                }}
              />
            </div>
          </Row>
          <Row label="Endian">
            <Segmented
              options={[
                { id: "little", label: "Little" },
                { id: "big", label: "Big" },
              ]}
              value={endianness}
              onChange={(v: Endianness) => setEndianness(v)}
            />
          </Row>
          <Row label="Value">
            <input
              ref={valueRef}
              value={value}
              onChange={(e) => {
                setError(null);
                setValue(e.target.value);
              }}
              placeholder={isIntegerKind(numberKind) ? "255, 0xFF, 0b1111, 0o377" : "3.14, -2.5e3"}
              className={`${inputCls} ${border(["value"])} text-green-700 dark:text-green-300`}
            />
          </Row>
        </>
      ) : (
        <Row label={type === "hex" ? "Bytes" : "Text"}>
          <input
            ref={valueRef}
            value={value}
            onChange={(e) => {
              setError(null);
              setValue(
                type === "hex"
                  ? e.target.value.replace(/[^0-9a-fA-F\s]/g, "")
                  : e.target.value,
              );
            }}
            placeholder={type === "hex" ? "41 42 43 00" : "Hello, world"}
            className={`${inputCls} ${okBorder} text-gray-700 dark:text-gray-200`}
          />
        </Row>
      )}

      <Row label="Color">
        <SwatchRow
          value={fieldColor}
          fallback={CELL_TYPE_COLORS[type]}
          onChange={setFieldColor}
        />
      </Row>

      {/* Live preview: address span + encoded bytes */}
      {(computedSize > 0 || error) && (
        <div className="flex items-center gap-2 rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {error ? (
            <span className="font-sans text-xs text-red-500 dark:text-red-400">{ERROR_TEXT[error]}</span>
          ) : (
            <>
              {startAddr !== null && (
                <span className="shrink-0 text-green-700 dark:text-green-300">
                  {fmtHex(startAddr, padLen)}–{fmtHex(startAddr + computedSize - 1, padLen)}
                </span>
              )}
              {previewBytes && previewBytes.length > 0 && (
                <span className="min-w-0 flex-1 truncate">
                  {previewBytes
                    .slice(0, PREVIEW_MAX)
                    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
                    .join(" ")}
                  {previewBytes.length > PREVIEW_MAX && " …"}
                </span>
              )}
              <span className="ml-auto shrink-0">{computedSize} B</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1 pt-0.5">
        <span className="mr-auto text-[10px] text-gray-400 dark:text-gray-500">
          ↵ save · esc cancel
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700"
        >
          {cellToEdit ? "Save" : "Add"}
        </button>
      </div>
    </div>
  );
}

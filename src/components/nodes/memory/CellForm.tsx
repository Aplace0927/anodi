import { useState, useEffect } from "react";
import type {
  MemoryCell,
  MemoryCellType,
  Endianness,
  MemoryNumberKind,
} from "../../../types";
import ColorPicker from "../../ColorPicker";
import {
  parseHexAddr,
  fmtHex,
  parseHexBytes,
  textToBytes,
  parseIntegerValue,
  isIntegerKind,
  numberKindSize,
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
  onSave: (cellData: Omit<MemoryCell, "id">) => void;
  onCancel: () => void;
  cellToEdit?: MemoryCell;
}

export default function CellForm({
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
                  className={`absolute -top-[0.5px] h-4 w-4 rounded-full transition-all text-xs text-gray-200 dark:text-gray-800 ${
                  numberSigned
                  ? "-left-[1px] bg-green-600 dark:bg-green-400"
                  : "left-[17px] bg-orange-600 dark:bg-orange-400"
                  }`}
                >
                  {numberSigned ? "i" : "u"}
                </span>
              </button>
            </div>
            <div className="grid flex-1 grid-cols-[repeat(4,minmax(0,1fr))_auto_repeat(2,minmax(0,1fr))] gap-x-1">
              {(["int8_t", "int16_t", "int32_t", "int64_t"] as MemoryNumberKind[]).map((kind) => (
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
              <span className="py-0.5 text-center text-xs text-gray-400 dark:text-gray-500">|</span>
              {(["float", "double"] as MemoryNumberKind[]).map((kind) => (
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
              Endian
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

import { useState } from "react";
import { Plus, X, PaintBucket } from "lucide-react";
import type { Endianness, MemoryCell, PointerSize } from "../../../types";
import Segmented from "../../ui/Segmented";
import { fmtHex, isIntegerKind, numberKindShortLabel } from "../../../utils/memory";
import { asciiString, inspectBytes, readUint } from "../../../utils/memoryTools";

interface Props {
  start: number;
  end: number; // exclusive
  rawBytes: Map<number, number>;
  padLen: number;
  defaultEndianness: Endianness;
  pointerSize: PointerSize;
  describePointer: (addr: number) => string;
  /** Create a cell over the selection start; returns false on conflict. */
  onCreate: (cell: Omit<MemoryCell, "id">) => void;
  onFill: () => void;
  onClose: () => void;
}

/** Hex-editor style data inspector for the selected byte range. */
export default function InspectorPanel({
  start,
  end,
  rawBytes,
  padLen,
  defaultEndianness,
  pointerSize,
  describePointer,
  onCreate,
  onFill,
  onClose,
}: Props) {
  const [endianness, setEndianness] = useState<Endianness>(defaultEndianness);
  const [fieldName, setFieldName] = useState("");

  const len = end - start;
  const bytes: number[] = [];
  let unknown = 0;
  for (let a = start; a < end; a++) {
    const b = rawBytes.get(a);
    if (b === undefined) unknown++;
    bytes.push(b ?? 0);
  }
  const address = fmtHex(start, padLen);
  const rows = inspectBytes(bytes, endianness);
  const str = asciiString(bytes);
  const ptr = len >= pointerSize ? readUint(bytes.slice(0, pointerSize), endianness) : null;

  const addBtn = (title: string, onClick: () => void) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-indigo-100 hover:text-indigo-600 group-hover/row:opacity-100 dark:text-gray-500 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-300"
    >
      <Plus size={11} />
    </button>
  );

  const row = (label: string, primary: string, secondary: string | undefined, action: () => void, title: string) => (
    <div key={label} className="group/row flex items-center gap-2 rounded px-1 hover:bg-gray-100 dark:hover:bg-gray-800">
      <span className="w-7 shrink-0 font-mono text-[10px] font-bold text-gray-500 dark:text-gray-400">{label}</span>
      <span className="min-w-0 truncate font-mono text-gray-900 dark:text-gray-100">{primary}</span>
      {secondary && (
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-gray-400 dark:text-gray-500">
          {secondary}
        </span>
      )}
      {!secondary && <span className="flex-1" />}
      {addBtn(title, action)}
    </div>
  );

  return (
    <div
      className="nodrag nopan nowheel mx-1 mb-1 rounded-md border border-indigo-200 bg-white p-1.5 font-sans text-xs shadow-sm dark:border-indigo-900/60 dark:bg-gray-900"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          Selection
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-gray-500 dark:text-gray-400">
          {address}–{fmtHex(end - 1, padLen)} · {len} B
          {unknown > 0 && ` · ${unknown} unset`}
        </span>
        <div className="w-16 shrink-0">
          <Segmented
            options={[
              { id: "little", label: "LE", title: "Little endian" },
              { id: "big", label: "BE", title: "Big endian" },
            ]}
            value={endianness}
            onChange={(v: Endianness) => setEndianness(v)}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Clear selection (Esc)"
          className="shrink-0 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
        >
          <X size={12} />
        </button>
      </div>

      <div className="space-y-px">
        {rows.map((r) =>
          row(
            isIntegerKind(r.kind) ? `u${r.size * 8}` : numberKindShortLabel(r.kind, true),
            r.primary,
            r.secondary,
            () =>
              onCreate({
                type: "number",
                address,
                value: r.primary,
                numberKind: r.kind,
                numberSigned: isIntegerKind(r.kind) ? false : undefined,
                endianness,
              }),
            `Create ${r.kind} cell`,
          ),
        )}
        {ptr !== null &&
          row(
            "ptr",
            `0x${ptr.toString(16).toUpperCase()}`,
            `→ ${ptr > BigInt(Number.MAX_SAFE_INTEGER) ? "unmapped" : describePointer(Number(ptr))}`,
            () =>
              onCreate({
                type: "pointer",
                address,
                value: `0x${ptr.toString(16).toUpperCase()}`,
                pointerSize,
                endianness,
              }),
            "Create pointer cell",
          )}
        {str !== null &&
          row("str", JSON.stringify(str), `${str.length} chars`, () => onCreate({ type: "text", address, value: str }), "Create text cell")}
      </div>

      <div className="mt-1.5 flex items-center gap-1 border-t border-gray-100 px-1 pt-1.5 dark:border-gray-800">
        <input
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              onCreate({ type: "field", address, fieldName: fieldName.trim() || "field", fieldSize: len });
            }
          }}
          placeholder="field name"
          className="min-w-0 flex-1 rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
        />
        <button
          type="button"
          onClick={() => onCreate({ type: "field", address, fieldName: fieldName.trim() || "field", fieldSize: len })}
          className="flex shrink-0 items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <Plus size={11} /> Field
        </button>
        <button
          type="button"
          onClick={onFill}
          title="Fill selection with a byte or cyclic pattern"
          className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <PaintBucket size={11} /> Fill
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { Endianness, MemoryCell } from "../../../types";
import { v4 } from "../../../utils/uuid";
import { fmtHex, parseHexAddr } from "../../../utils/memory";
import {
  parseDumpText,
  resolveSegments,
  buildImportCells,
  parseCStruct,
  buildStructCells,
} from "../../../utils/memoryImport";
import type { ImportSegment } from "../../../utils/memoryImport";
import Segmented from "../../ui/Segmented";
import { cyclic, cyclicFind } from "../../../utils/memoryTools";

interface Props {
  baseAddress: string;
  endAddress: string;
  unitSize: number;
  cells: MemoryCell[];
  defaultEndianness: Endianness;
  /** Prefill (e.g. from a byte selection). */
  initialTab?: Tab;
  initialStart?: string;
  initialLength?: number;
  onApply: (cells: MemoryCell[]) => void;
  onClose: () => void;
}

export type Tab = "dump" | "file" | "struct" | "fill";

const MAX_FILL = 0x1000;

const MAX_FILE_BYTES = 0x10000;

const inputCls =
  "flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function ImportPanel({
  baseAddress,
  endAddress,
  unitSize,
  cells,
  defaultEndianness,
  initialTab,
  initialStart,
  initialLength,
  onApply,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "dump");
  const [text, setText] = useState("");
  const [absolute, setAbsolute] = useState(false);
  const [startAddr, setStartAddr] = useState(initialStart ?? baseAddress);
  const [skipZero, setSkipZero] = useState(false);
  const [fileBytes, setFileBytes] = useState<number[] | null>(null);
  const [fileInfo, setFileInfo] = useState("");
  const [structSrc, setStructSrc] = useState("");
  const [includePad, setIncludePad] = useState(true);
  const [groupStruct, setGroupStruct] = useState(true);
  const [fillMode, setFillMode] = useState<"byte" | "cyclic">("cyclic");
  const [fillLen, setFillLen] = useState(String(initialLength ?? 0x40));
  const [fillByte, setFillByte] = useState("41");
  const [cyclicN, setCyclicN] = useState<4 | 8>(4);
  const [findQuery, setFindQuery] = useState("");

  const common = { baseAddress, endAddress, unitSize, existing: cells, newId: v4 };

  const dump = useMemo(() => parseDumpText(text), [text]);
  const dumpResult = useMemo(() => {
    if (tab === "dump" && dump.segments.length > 0) {
      return buildImportCells(
        resolveSegments(dump.segments, { baseAddress, startAddress: startAddr, absolute }),
        { ...common, skipZero },
      );
    }
    if (tab === "fill") {
      const len = Math.min(parseHexAddr(fillLen), MAX_FILL);
      const b = parseInt(fillByte, 16);
      if (len <= 0 || (fillMode === "byte" && !(b >= 0 && b <= 0xff))) return null;
      const bytes = fillMode === "cyclic" ? cyclic(len, cyclicN) : new Array<number>(len).fill(b);
      return buildImportCells(
        resolveSegments([{ address: null, bytes }], { baseAddress, startAddress: startAddr, absolute: false }),
        { ...common, skipZero: false },
      );
    }
    if (tab === "file" && fileBytes && fileBytes.length > 0) {
      const seg: ImportSegment[] = [{ address: null, bytes: fileBytes }];
      return buildImportCells(
        resolveSegments(seg, { baseAddress, startAddress: startAddr, absolute: false }),
        { ...common, skipZero },
      );
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dump, fileBytes, startAddr, absolute, skipZero, baseAddress, endAddress, unitSize, cells, fillMode, fillLen, fillByte, cyclicN]);

  const struct = useMemo(
    () => (structSrc.trim() ? parseCStruct(structSrc, includePad) : null),
    [structSrc, includePad],
  );
  const structResult = useMemo(
    () =>
      struct && !struct.error
        ? buildStructCells(struct, startAddr, {
            baseAddress,
            endAddress,
            existing: cells,
            newId: v4,
            group: groupStruct,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [struct, startAddr, baseAddress, endAddress, cells, groupStruct],
  );

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const buf = await f.slice(0, MAX_FILE_BYTES).arrayBuffer();
    setFileBytes(Array.from(new Uint8Array(buf)));
    setFileInfo(
      `${f.name} (${f.size} B${f.size > MAX_FILE_BYTES ? `, first ${MAX_FILE_BYTES} read` : ""})`,
    );
  };

  const padLen = Math.max(4, parseHexAddr(endAddress).toString(16).length);
  const needsStart = tab !== "dump" || (dump.format !== "xxd" && dump.format !== "hexdump");

  const result = tab === "struct" ? structResult : dumpResult;
  const canApply = !!result && result.created > 0;

  const apply = () => {
    if (result && canApply) onApply(result.cells);
  };

  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div
      className="nodrag nopan nowheel rounded-md border border-gray-200 bg-white p-2 font-sans text-xs text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="mb-2">
        <Segmented
          options={[
            { id: "dump", label: "Hexdump" },
            { id: "file", label: "File" },
            { id: "struct", label: "C struct" },
            { id: "fill", label: "Fill" },
          ]}
          value={tab}
          onChange={(t: Tab) => setTab(t)}
        />
      </div>

      {tab === "dump" && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={'xxd / hexdump -C / "41 42 43" / b"\\x41\\x42"'}
            className={`${inputCls} mb-1 w-full resize-y font-mono`}
          />
          <div className="mb-1 text-gray-500 dark:text-gray-400">
            {dump.error
              ? <span className="text-red-400">{dump.error}</span>
              : dump.format
                ? `Detected: ${dump.format}, ${dump.segments.reduce((n, s) => n + s.bytes.length, 0)} bytes`
                : "Paste a dump above."}
          </div>
          {(dump.format === "xxd" || dump.format === "hexdump") &&
            check("Offsets are absolute", absolute, setAbsolute)}
        </>
      )}

      {tab === "file" && (
        <div className="mb-1 flex flex-col gap-1">
          <input
            type="file"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-xs"
          />
          {fileInfo && <span className="text-gray-500 dark:text-gray-400">{fileInfo}</span>}
        </div>
      )}

      {tab === "struct" && (
        <>
          <textarea
            value={structSrc}
            onChange={(e) => setStructSrc(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="struct foo { int a; char b[3]; uint64_t c; void *p; };"
            className={`${inputCls} mb-1 w-full resize-y font-mono`}
          />
          {struct?.error && <p className="mb-1 text-red-400">{struct.error}</p>}
          {struct && !struct.error && (
            <div className="mb-1 rounded bg-gray-200/60 dark:bg-gray-900/50 px-1 py-0.5 font-mono">
              <div className="mb-0.5 text-gray-600 dark:text-gray-300">
                {struct.name ? `struct ${struct.name}: ` : ""}size {struct.size} B, align {struct.align}
              </div>
              {struct.fields.map((f, i) => (
                <div key={i} className={`flex gap-2 ${f.isPad ? "text-gray-500" : ""}`}>
                  <span className="w-10 shrink-0 text-green-700 dark:text-green-300">+{f.offset}</span>
                  <span className="flex-1 truncate">{f.label}</span>
                  <span className="shrink-0">{f.size}B</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            {check("Include (pad) cells", includePad, setIncludePad)}
            {check("Group as struct", groupStruct, setGroupStruct)}
          </div>
          {groupStruct && (
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
              Existing bytes are kept and nested under members.
            </p>
          )}
        </>
      )}

      {tab === "fill" && (
        <div className="space-y-1.5">
          <Segmented
            options={[
              { id: "cyclic", label: "Cyclic pattern", title: "pwntools-compatible de Bruijn sequence" },
              { id: "byte", label: "Repeat byte" },
            ]}
            value={fillMode}
            onChange={(m) => setFillMode(m)}
          />
          <div className="flex items-center gap-1">
            <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Length</span>
            <input
              value={fillLen}
              onChange={(e) => setFillLen(e.target.value)}
              placeholder="64 or 0x40"
              className={`${inputCls} font-mono`}
            />
            {fillMode === "byte" ? (
              <input
                value={fillByte}
                onChange={(e) => setFillByte(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 2))}
                title="Byte value (hex)"
                className={`${inputCls} w-12 flex-none font-mono`}
              />
            ) : (
              <div className="w-20 shrink-0">
                <Segmented
                  options={[
                    { id: 4, label: "n=4" },
                    { id: 8, label: "n=8" },
                  ]}
                  value={cyclicN}
                  onChange={(n) => setCyclicN(n)}
                />
              </div>
            )}
          </div>
          {fillMode === "cyclic" && (
            <div className="flex items-center gap-1">
              <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Find</span>
              <input
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="0x6161616c or laaa"
                className={`${inputCls} font-mono`}
              />
            </div>
          )}
          {fillMode === "cyclic" && findQuery.trim() && (() => {
            const off = cyclicFind(findQuery, cyclicN, defaultEndianness);
            const at = parseHexAddr(startAddr || baseAddress) + off;
            return (
              <p className="pl-[68px] font-mono text-[10px] text-gray-500 dark:text-gray-400">
                {off < 0
                  ? <span className="text-red-500 dark:text-red-400">not found in pattern (n={cyclicN})</span>
                  : <>offset <b className="text-gray-900 dark:text-white">{off}</b> (0x{off.toString(16).toUpperCase()}) → {fmtHex(at, padLen)}</>}
              </p>
            );
          })()}
        </div>
      )}

      {(tab === "dump" || tab === "file") && <div className="mb-1">{check("Skip all-zero cells", skipZero, setSkipZero)}</div>}

      {needsStart && (
        <div className="mb-1 mt-1 flex items-center gap-1">
          <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Start</span>
          <input
            value={startAddr}
            onChange={(e) => setStartAddr(e.target.value)}
            placeholder={fmtHex(parseHexAddr(baseAddress), padLen)}
            className={`${inputCls} font-mono text-green-700 dark:text-green-300`}
          />
        </div>
      )}

      {result && (
        <p className="mb-1 text-right text-gray-500 dark:text-gray-400">
          {"bytesImported" in result
            ? `${result.bytesImported} B in ${result.created} cells`
            : `${result.created} field cells`}
          {result.clamped > 0 && ` · ${result.clamped} outside range dropped`}
          {result.replaced > 0 && ` · replaces ${result.replaced} existing`}
        </p>
      )}

      <div className="flex justify-end gap-1">
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={apply}
          disabled={!canApply}
          className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

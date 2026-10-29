import { useMemo, useState } from "react";
import type { MemoryCell } from "../../../types";
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

interface Props {
  baseAddress: string;
  endAddress: string;
  unitSize: number;
  cells: MemoryCell[];
  onApply: (cells: MemoryCell[]) => void;
  onClose: () => void;
}

type Tab = "dump" | "file" | "struct";

const MAX_FILE_BYTES = 0x10000;

const inputCls =
  "flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-900 dark:text-white focus:outline-none";

export default function ImportPanel({
  baseAddress,
  endAddress,
  unitSize,
  cells,
  onApply,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("dump");
  const [text, setText] = useState("");
  const [absolute, setAbsolute] = useState(false);
  const [startAddr, setStartAddr] = useState(baseAddress);
  const [skipZero, setSkipZero] = useState(false);
  const [fileBytes, setFileBytes] = useState<number[] | null>(null);
  const [fileInfo, setFileInfo] = useState("");
  const [structSrc, setStructSrc] = useState("");
  const [includePad, setIncludePad] = useState(true);

  const common = { baseAddress, endAddress, unitSize, existing: cells, newId: v4 };

  const dump = useMemo(() => parseDumpText(text), [text]);
  const dumpResult = useMemo(() => {
    if (tab === "dump" && dump.segments.length > 0) {
      return buildImportCells(
        resolveSegments(dump.segments, { baseAddress, startAddress: startAddr, absolute }),
        { ...common, skipZero },
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
  }, [tab, dump, fileBytes, startAddr, absolute, skipZero, baseAddress, endAddress, unitSize, cells]);

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
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [struct, startAddr, baseAddress, endAddress, cells],
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

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      className={`flex-1 rounded border py-0.5 text-xs font-bold ${
        tab === t
          ? "border-orange-500 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
          : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-500"
      }`}
    >
      {label}
    </button>
  );

  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div
      className="nodrag nopan nowheel rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800/80 p-2 text-xs text-gray-900 dark:text-white"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex gap-1">
        {tabBtn("dump", "Hexdump")}
        {tabBtn("file", "Binary file")}
        {tabBtn("struct", "C struct")}
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
          {check("Include (pad) cells", includePad, setIncludePad)}
        </>
      )}

      {tab !== "struct" && <div className="mb-1">{check("Skip all-zero cells", skipZero, setSkipZero)}</div>}

      {needsStart && (
        <div className="mb-1 mt-1 flex items-center gap-1">
          <span className="w-16 shrink-0 text-gray-500 dark:text-gray-400">Start addr</span>
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
          className="rounded border border-gray-300 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={apply}
          disabled={!canApply}
          className="rounded bg-orange-700 px-2 py-0.5 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

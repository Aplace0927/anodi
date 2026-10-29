import type { MemoryCell } from "../types";
import {
  parseHexAddr,
  fmtHex,
  cellByteSize,
  MAX_MEMORY_RANGE,
} from "./memory";

// ── Hexdump / binary parsing ──────────────────────────────────────

export type DumpFormat = "xxd" | "hexdump" | "pybytes" | "plain" | "binary";

/** A run of bytes. `address` is the parsed offset (relative or absolute), or null if unknown. */
export interface ImportSegment {
  address: number | null;
  bytes: number[];
}

export interface ParsedDump {
  format: DumpFormat | null;
  segments: ImportSegment[];
  error?: string;
}

const PY_SIMPLE_ESCAPES: Record<string, number> = {
  n: 10, r: 13, t: 9, "0": 0, a: 7, b: 8, f: 12, v: 11,
  "\\": 0x5c, "'": 0x27, '"': 0x22,
};

function parsePyBytes(text: string): number[] | null {
  const re = /\bb(["'])((?:\\.|(?!\1)[^\\])*)\1/gs;
  const out: number[] = [];
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    found = true;
    const body = m[2];
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "\\" && i + 1 < body.length) {
        const nx = body[i + 1];
        if (nx === "x" && /^[0-9a-fA-F]{2}$/.test(body.slice(i + 2, i + 4))) {
          out.push(parseInt(body.slice(i + 2, i + 4), 16));
          i += 3;
        } else if (nx in PY_SIMPLE_ESCAPES) {
          out.push(PY_SIMPLE_ESCAPES[nx]);
          i += 1;
        } else {
          out.push(0x5c);
        }
      } else {
        out.push(ch.charCodeAt(0) & 0xff);
      }
    }
  }
  return found ? out : null;
}

const DUMP_LINE_RE = /^\s*(?:0x)?([0-9a-fA-F]{2,16})(:)?\s+(.*)$/;

function parseDumpLine(line: string): ImportSegment | null {
  const m = DUMP_LINE_RE.exec(line);
  if (!m) return null;
  const hasColon = !!m[2];
  let rest = m[3];
  const hasPipe = rest.includes("|");
  if (!hasColon && !hasPipe) return null;
  let hexPart: string;
  if (hasPipe) {
    hexPart = rest.slice(0, rest.indexOf("|"));
  } else {
    // xxd: hex groups separated by one space, ascii after 2+ spaces
    rest = rest.replace(/^\s+/, "");
    hexPart = rest.split(/\s{2,}/)[0];
  }
  const bytes: number[] = [];
  for (const tok of hexPart.split(/\s+/).filter(Boolean)) {
    if (!/^[0-9a-fA-F]+$/.test(tok) || tok.length % 2) return null;
    for (let i = 0; i < tok.length; i += 2) bytes.push(parseInt(tok.slice(i, i + 2), 16));
  }
  if (bytes.length === 0) return null;
  return { address: parseInt(m[1], 16), bytes };
}

/** Parse pasted text in xxd / hexdump -C / plain hex / Python bytes format. */
export function parseDumpText(text: string): ParsedDump {
  const trimmed = text.trim();
  if (!trimmed) return { format: null, segments: [] };

  const py = /\bb["']/.test(trimmed) ? parsePyBytes(trimmed) : null;
  if (py) return { format: "pybytes", segments: [{ address: null, bytes: py }] };

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && l.trim() !== "*");
  const parsed = lines.map(parseDumpLine);
  const matched = parsed.filter((p): p is ImportSegment => p !== null);
  if (matched.length > 0 && matched.length >= lines.length / 2) {
    const format: DumpFormat = trimmed.includes("|") && !/^\s*[0-9a-fA-F]+:/m.test(trimmed)
      ? "hexdump"
      : "xxd";
    // merge contiguous lines
    const segs: ImportSegment[] = [];
    for (const p of matched) {
      const last = segs[segs.length - 1];
      if (last && last.address !== null && last.address + last.bytes.length === p.address) {
        last.bytes.push(...p.bytes);
      } else {
        segs.push({ address: p.address, bytes: [...p.bytes] });
      }
    }
    return { format, segments: segs };
  }

  // plain hex
  const cleaned = trimmed.replace(/0x/gi, " ").replace(/[,;]/g, " ");
  const bytes: number[] = [];
  for (const tok of cleaned.split(/\s+/).filter(Boolean)) {
    if (!/^[0-9a-fA-F]+$/.test(tok) || tok.length % 2) {
      return { format: null, segments: [], error: `Unrecognized token "${tok.slice(0, 12)}"` };
    }
    for (let i = 0; i < tok.length; i += 2) bytes.push(parseInt(tok.slice(i, i + 2), 16));
  }
  return { format: "plain", segments: [{ address: null, bytes }] };
}

export interface ResolveOptions {
  baseAddress: string;
  /** Start address text for plain / binary data. Defaults to baseAddress. */
  startAddress?: string;
  /** Dump offsets are absolute addresses (otherwise relative to baseAddress). */
  absolute: boolean;
}

export interface AddressedBytes {
  address: number;
  bytes: number[];
}

export function resolveSegments(
  segments: ImportSegment[],
  opts: ResolveOptions,
): AddressedBytes[] {
  const base = parseHexAddr(opts.baseAddress);
  const start = opts.startAddress?.trim() ? parseHexAddr(opts.startAddress) : base;
  return segments.map((s) => ({
    address: s.address === null ? start : opts.absolute ? s.address : base + s.address,
    bytes: s.bytes,
  }));
}

// ── Build cells ───────────────────────────────────────────────────

export interface BuildCellsOptions {
  baseAddress: string;
  endAddress: string;
  unitSize: number;
  skipZero: boolean;
  existing: MemoryCell[];
  newId: () => string;
}

export interface BuildCellsResult {
  cells: MemoryCell[];
  /** Number of new cells created. */
  created: number;
  /** Bytes imported into cells. */
  bytesImported: number;
  /** Bytes dropped because they fall outside the node range. */
  clamped: number;
  /** Existing cells replaced. */
  replaced: number;
}

function effectiveRange(baseAddress: string, endAddress: string): [number, number] {
  const base = parseHexAddr(baseAddress);
  const end = Math.min(parseHexAddr(endAddress), base + MAX_MEMORY_RANGE);
  return [base, end];
}

/** Turn addressed bytes into row-aligned `hex` cells merged into the existing cell list. */
export function buildImportCells(
  data: AddressedBytes[],
  opts: BuildCellsOptions,
): BuildCellsResult {
  const [base, end] = effectiveRange(opts.baseAddress, opts.endAddress);
  const unit = opts.unitSize;
  const padLen = Math.max(4, parseHexAddr(opts.endAddress).toString(16).length);
  const byteAt = new Map<number, number>();
  let clamped = 0;
  for (const seg of data) {
    seg.bytes.forEach((b, i) => {
      const a = seg.address + i;
      if (a < base || a >= end) clamped++;
      else byteAt.set(a, b);
    });
  }

  const created: MemoryCell[] = [];
  const footprint = new Set<number>();
  let bytesImported = 0;
  if (byteAt.size > 0 && unit > 0) {
    const addrs = Array.from(byteAt.keys());
    const lo = Math.min(...addrs);
    const hi = Math.max(...addrs);
    const firstRow = base + Math.floor((lo - base) / unit) * unit;
    for (let row = firstRow; row <= hi; row += unit) {
      let run: number[] = [];
      let runStart = row;
      const flush = () => {
        if (run.length === 0) return;
        if (!(opts.skipZero && run.every((b) => b === 0))) {
          created.push({
            id: opts.newId(),
            type: "hex",
            address: fmtHex(runStart, padLen),
            value: run.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" "),
          });
          for (let i = 0; i < run.length; i++) footprint.add(runStart + i);
          bytesImported += run.length;
        }
        run = [];
      };
      for (let a = row; a < row + unit; a++) {
        const b = byteAt.get(a);
        if (b === undefined) {
          flush();
        } else {
          if (run.length === 0) runStart = a;
          run.push(b);
        }
      }
      flush();
    }
  }

  const kept = opts.existing.filter((c) => {
    const s = parseHexAddr(c.address);
    const n = cellByteSize(c);
    for (let i = 0; i < n; i++) if (footprint.has(s + i)) return false;
    return true;
  });
  return {
    cells: [...kept, ...created],
    created: created.length,
    bytesImported,
    clamped,
    replaced: opts.existing.length - kept.length,
  };
}

// ── C struct parsing ──────────────────────────────────────────────

export interface StructField {
  /** Display name, e.g. `int a` or `char b[3]`. */
  label: string;
  offset: number;
  size: number;
  align: number;
  unknown: boolean;
  isPad?: boolean;
}

export interface ParsedStruct {
  name: string;
  fields: StructField[];
  size: number;
  align: number;
  error?: string;
}

interface TypeInfo {
  size: number;
  align: number;
  unknown: boolean;
}

const NAMED_TYPES: Record<string, number> = {
  bool: 1, _Bool: 1, int8_t: 1, uint8_t: 1,
  int16_t: 2, uint16_t: 2,
  int32_t: 4, uint32_t: 4, wchar_t: 4, char32_t: 4, char16_t: 2,
  int64_t: 8, uint64_t: 8, size_t: 8, ssize_t: 8, ptrdiff_t: 8,
  intptr_t: 8, uintptr_t: 8, off_t: 8, time_t: 8, intmax_t: 8, uintmax_t: 8,
  float: 4, double: 8,
};

function resolveType(words: string[]): TypeInfo {
  const ws = words.filter(
    (w) => !["const", "volatile", "static", "register", "restrict", "signed", "unsigned", "extern"].includes(w),
  );
  const had = (w: string) => ws.includes(w);
  const sized = (n: number): TypeInfo => ({ size: n, align: n, unknown: false });
  if (had("struct") || had("union")) return { size: 8, align: 8, unknown: true };
  if (had("enum")) return sized(4);
  if (had("double")) return had("long") ? sized(16) : sized(8);
  if (had("float")) return sized(4);
  if (had("char")) return sized(1);
  if (had("short")) return sized(2);
  if (had("long")) return sized(8);
  if (had("int")) return sized(4);
  if (ws.length === 0) return sized(4); // bare `unsigned` / `signed`
  if (ws.length === 1 && ws[0] in NAMED_TYPES) return sized(NAMED_TYPES[ws[0]]);
  return { size: 8, align: 8, unknown: true };
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function arrayCount(dims: string[]): { count: number; unknown: boolean } {
  let count = 1;
  let unknown = false;
  for (const d of dims) {
    const t = d.trim();
    if (/^0x[0-9a-fA-F]+$/.test(t)) count *= parseInt(t, 16);
    else if (/^\d+$/.test(t)) count *= parseInt(t, 10);
    else unknown = true;
  }
  return { count, unknown };
}

/** Parse a C struct definition using x86-64 LP64 natural alignment. */
export function parseCStruct(src: string, includePad: boolean): ParsedStruct {
  const empty: ParsedStruct = { name: "", fields: [], size: 0, align: 1 };
  const text = stripComments(src);
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open < 0 || close < open) return { ...empty, error: "Expected `struct name { ... }`." };
  const head = text.slice(0, open).replace(/\b(typedef|struct|union)\b/g, "").trim();
  const name = head.split(/\s+/).filter(Boolean)[0] ?? "";
  const body = text.slice(open + 1, close);

  const fields: StructField[] = [];
  let offset = 0;
  let maxAlign = 1;
  const pushPad = (n: number) => {
    if (includePad && n > 0) {
      fields.push({ label: "(pad)", offset, size: n, align: 1, unknown: false, isPad: true });
    }
  };

  for (const rawDecl of body.split(";")) {
    const decl = rawDecl
      .replace(/__attribute__\s*\(\([^)]*\)\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!decl) continue;

    // function pointer: `ret (*name)(args)`
    const fp = /\(\s*\*\s*(\w+)\s*\)\s*\(/.exec(decl);
    let declarators: string[];
    let typeWords: string[];
    let displayType: string;
    if (fp) {
      typeWords = ["void"];
      displayType = decl.slice(0, decl.indexOf("(")).trim() || "void";
      declarators = [`(*${fp[1]})()`];
    } else {
      // split off the base type: words before the first declarator
      const parts = decl.split(",");
      const first = parts[0].trim();
      const m = /^(.*?)([*\s]*)(\w+)\s*((?:\[[^\]]*\]\s*)*)(?::\s*\d+)?$/.exec(first);
      if (!m) return { ...empty, error: `Cannot parse declaration: "${decl}"` };
      const typePart = m[1].trim();
      typeWords = typePart.split(/\s+/).filter(Boolean);
      if (typeWords.length === 0) return { ...empty, error: `Missing type in: "${decl}"` };
      displayType = typePart;
      declarators = [first.slice(typePart.length).trim(), ...parts.slice(1).map((p) => p.trim())];
    }
    const baseInfo = resolveType(typeWords);

    for (const d of declarators) {
      const dm = fp
        ? { stars: "*", id: fp[1], dims: "" }
        : (() => {
            const x = /^([*\s]*)(\w+)\s*((?:\[[^\]]*\]\s*)*)(?::\s*\d+)?$/.exec(d);
            return x ? { stars: x[1], id: x[2], dims: x[3] } : null;
          })();
      if (!dm) return { ...empty, error: `Cannot parse declarator: "${d}"` };
      const isPtr = dm.stars.includes("*");
      const dims = Array.from(dm.dims.matchAll(/\[([^\]]*)\]/g)).map((x) => x[1]);
      const { count, unknown: dimUnknown } = arrayCount(dims);
      const elem: TypeInfo = isPtr ? { size: 8, align: 8, unknown: false } : baseInfo;
      const unknown = (!isPtr && elem.unknown) || dimUnknown;
      const size = elem.size * count;
      const stars = isPtr ? " " + dm.stars.replace(/\s/g, "") : "";
      const label = fp
        ? `${displayType} (*${dm.id})()`
        : `${displayType}${unknown ? "?" : ""}${stars ? stars : ""} ${dm.id}${dims.map((x) => `[${x.trim()}]`).join("")}`
            .replace(/\*\s/, "*");
      const aligned = Math.ceil(offset / elem.align) * elem.align;
      pushPad(aligned - offset);
      offset = aligned;
      fields.push({ label, offset, size, align: elem.align, unknown });
      offset += size;
      maxAlign = Math.max(maxAlign, elem.align);
    }
  }
  const total = Math.ceil(offset / maxAlign) * maxAlign;
  pushPad(total - offset);
  if (fields.filter((f) => !f.isPad).length === 0) {
    return { ...empty, name, error: "No members found." };
  }
  return { name, fields, size: total, align: maxAlign };
}

export const PAD_COLOR = "#6b7280";

export interface StructCellsResult {
  cells: MemoryCell[];
  created: number;
  clamped: number;
  replaced: number;
}

/** Create `field` cells for a parsed struct starting at `startAddress`. */
export function buildStructCells(
  st: ParsedStruct,
  startAddress: string,
  opts: Omit<BuildCellsOptions, "unitSize" | "skipZero">,
): StructCellsResult {
  const [base, end] = effectiveRange(opts.baseAddress, opts.endAddress);
  const padLen = Math.max(4, parseHexAddr(opts.endAddress).toString(16).length);
  const start = startAddress.trim() ? parseHexAddr(startAddress) : base;
  const created: MemoryCell[] = [];
  let clamped = 0;
  for (const f of st.fields) {
    const a = start + f.offset;
    if (a < base || a + f.size > end) {
      clamped++;
      continue;
    }
    created.push({
      id: opts.newId(),
      type: "field",
      address: fmtHex(a, padLen),
      fieldName: f.label,
      fieldSize: f.size,
      fieldColor: f.isPad ? PAD_COLOR : undefined,
    });
  }
  const footprint = new Set<number>();
  for (const c of created) {
    const s = parseHexAddr(c.address);
    for (let i = 0; i < (c.fieldSize ?? 1); i++) footprint.add(s + i);
  }
  const kept = opts.existing.filter((c) => {
    const s = parseHexAddr(c.address);
    const n = cellByteSize(c);
    for (let i = 0; i < n; i++) if (footprint.has(s + i)) return false;
    return true;
  });
  return {
    cells: [...kept, ...created],
    created: created.length,
    clamped,
    replaced: opts.existing.length - kept.length,
  };
}

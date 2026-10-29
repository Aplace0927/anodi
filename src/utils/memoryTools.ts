import type { Endianness, MemoryCell, MemoryNumberKind } from "../types";
import {
  cellBytes,
  getCellNumberKind,
  isIntegerKind,
  parseHexAddr,
  rawByteMap,
} from "./memory";

const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");

/** Read `size` bytes as an unsigned integer. */
export function readUint(bytes: number[], endianness: Endianness): bigint {
  const ordered = endianness === "little" ? [...bytes].reverse() : bytes;
  return ordered.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
}

function toSigned(v: bigint, bits: number): bigint {
  const sign = 1n << BigInt(bits - 1);
  return v & sign ? v - (1n << BigInt(bits)) : v;
}

// ── Data inspector ────────────────────────────────────────────────

export interface InspectRow {
  kind: MemoryNumberKind;
  size: number;
  /** Unsigned value as hex (integers) or the float value. */
  primary: string;
  /** Decimal unsigned / signed (integers only). */
  secondary?: string;
}

/** Interpret the leading bytes as each scalar type that fits. */
export function inspectBytes(bytes: number[], endianness: Endianness): InspectRow[] {
  const rows: InspectRow[] = [];
  for (const [kind, size] of [
    ["int8_t", 1],
    ["int16_t", 2],
    ["int32_t", 4],
    ["int64_t", 8],
  ] as const) {
    if (bytes.length < size) break;
    const u = readUint(bytes.slice(0, size), endianness);
    const sgn = toSigned(u, size * 8);
    rows.push({
      kind,
      size,
      primary: `0x${u.toString(16).toUpperCase()}`,
      secondary: sgn === u ? u.toString() : `${u} / ${sgn}`,
    });
  }
  for (const [kind, size] of [
    ["float", 4],
    ["double", 8],
  ] as const) {
    if (bytes.length < size) continue;
    const dv = new DataView(new Uint8Array(bytes.slice(0, size)).buffer);
    const v = size === 4 ? dv.getFloat32(0, endianness === "little") : dv.getFloat64(0, endianness === "little");
    rows.push({ kind, size, primary: Number.isFinite(v) ? String(size === 4 ? Math.fround(v) : v) : String(v) });
  }
  return rows;
}

/** Printable ASCII prefix up to the first NUL; null if any other byte is non-printable. */
export function asciiString(bytes: number[]): string | null {
  let out = "";
  for (const b of bytes) {
    if (b === 0) break;
    if (b < 0x20 || b >= 0x7f) return null;
    out += String.fromCharCode(b);
  }
  return out || null;
}

// ── Payload export ────────────────────────────────────────────────

function pyBytesLiteral(bytes: number[]): string {
  let s = "";
  for (const b of bytes) {
    if (b === 0x5c) s += "\\\\";
    else if (b === 0x22) s += '\\"';
    else if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
    else s += `\\x${b.toString(16).padStart(2, "0")}`;
  }
  return `b"${s}"`;
}

/** Bytes from `base` up to the last known byte, gaps filled with 0x00. */
function contiguous(cells: MemoryCell[], base: number): number[] {
  const map = rawByteMap(cells);
  if (map.size === 0) return [];
  const last = Math.max(...map.keys());
  const out: number[] = [];
  for (let a = base; a <= last; a++) out.push(map.get(a) ?? 0);
  return out;
}

export function exportPyBytes(cells: MemoryCell[], base: number): string {
  return `payload = ${pyBytesLiteral(contiguous(cells, base))}`;
}

export function exportCArray(cells: MemoryCell[], base: number, name = "buf"): string {
  const bytes = contiguous(cells, base);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 12) {
    lines.push("  " + bytes.slice(i, i + 12).map((b) => `0x${hex2(b)}`).join(", ") + ",");
  }
  const ident = name.replace(/\W+/g, "_").replace(/^(\d)/, "_$1") || "buf";
  return `unsigned char ${ident}[${bytes.length}] = {\n${lines.join("\n")}\n};`;
}

/** pwntools `flat({offset: value})`, one entry per byte-carrying cell. */
export function exportPwntools(cells: MemoryCell[], base: number): string {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const entries: { off: number; expr: string; note?: string }[] = [];
  let needsStruct = false;
  let end = 0;
  for (const c of cells) {
    const bytes = cellBytes(c);
    if (!bytes || bytes.length === 0) continue;
    const off = parseHexAddr(c.address) - base;
    if (off < 0) continue;
    end = Math.max(end, off + bytes.length);
    const endian = (c.endianness ?? "little") === "big" ? ", endian='big'" : "";
    let expr: string;
    if (c.type === "pointer" || ((c.type === "number" || c.type === "integer") && isIntegerKind(getCellNumberKind(c)))) {
      const v = readUint(bytes, c.endianness ?? "little");
      expr = `p${bytes.length * 8}(0x${v.toString(16)}${endian})`;
    } else if (c.type === "number") {
      needsStruct = true;
      const fmt = getCellNumberKind(c) === "float" ? "f" : "d";
      expr = `struct.pack('${(c.endianness ?? "little") === "big" ? ">" : "<"}${fmt}', ${c.value || "0"})`;
    } else {
      expr = pyBytesLiteral(bytes);
    }
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    entries.push({ off, expr, note: parent?.fieldName });
  }
  entries.sort((a, b) => a.off - b.off);
  const body = entries
    .map((e) => `    0x${e.off.toString(16)}: ${e.expr},${e.note ? `  # ${e.note}` : ""}`)
    .join("\n");
  return `${needsStruct ? "import struct\n" : ""}payload = flat({\n${body}\n}, filler=b"\\0", length=0x${end.toString(16)})`;
}

// ── Cyclic (de Bruijn) pattern, pwntools-compatible ───────────────

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** First `length` bytes of the de Bruijn sequence B(26, n). */
export function cyclic(length: number, n = 4): number[] {
  const k = ALPHABET.length;
  const a = new Array<number>(k * n).fill(0);
  const out: number[] = [];
  const db = (t: number, p: number): boolean => {
    if (out.length >= length) return true;
    if (t > n) {
      if (n % p === 0) {
        for (let j = 1; j <= p; j++) {
          out.push(ALPHABET.charCodeAt(a[j]));
          if (out.length >= length) return true;
        }
      }
      return false;
    }
    a[t] = a[t - p];
    if (db(t + 1, p)) return true;
    for (let j = a[t - p] + 1; j < k; j++) {
      a[t] = j;
      if (db(t + 1, t)) return true;
    }
    return false;
  };
  db(1, 1);
  return out;
}

const CYCLIC_SEARCH_LEN = 0x20000;

/**
 * Offset of a subsequence in the cyclic pattern. Accepts `0x…` (packed with
 * `endianness`, first n bytes used) or a literal string. -1 if not found.
 */
export function cyclicFind(needle: string, n: number, endianness: Endianness): number {
  const t = needle.trim();
  if (!t) return -1;
  let bytes: number[];
  if (/^0x[0-9a-f]+$/i.test(t)) {
    let v = BigInt(t);
    const le: number[] = [];
    while (v > 0n) {
      le.push(Number(v & 0xffn));
      v >>= 8n;
    }
    while (le.length < n) le.push(0);
    bytes = endianness === "little" ? le : le.reverse();
  } else {
    bytes = Array.from(new TextEncoder().encode(t));
  }
  bytes = bytes.slice(0, n);
  if (bytes.length < n) return -1;
  const pat = cyclic(CYCLIC_SEARCH_LEN, n);
  outer: for (let i = 0; i + n <= pat.length; i++) {
    for (let j = 0; j < n; j++) if (pat[i + j] !== bytes[j]) continue outer;
    return i;
  }
  return -1;
}

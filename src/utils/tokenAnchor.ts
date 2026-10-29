import type { TokenAnchor } from '../types';
import { ELLIPSIS_MARKER } from './code';

/** Tab width used when rendering code lines (kept in sync with SourceCodeNode). */
export const CODE_TAB_SIZE = 4;

/** Visual column (in `ch`) at which character `idx` of `text` starts, expanding tabs. */
export function visualCol(text: string, idx: number): number {
  let col = 0;
  for (let i = 0; i < idx && i < text.length; i++) {
    col = text[i] === '\t' ? col + CODE_TAB_SIZE - (col % CODE_TAB_SIZE) : col + 1;
  }
  return col;
}

/** Character index whose glyph covers visual column `vcol`. */
function charAtVisualCol(text: string, vcol: number): number {
  let col = 0;
  for (let i = 0; i < text.length; i++) {
    const next = text[i] === '\t' ? col + CODE_TAB_SIZE - (col % CODE_TAB_SIZE) : col + 1;
    if (vcol < next) return i;
    col = next;
  }
  return Math.max(0, text.length - 1);
}

const IDENT = /[A-Za-z0-9_$]/;

/** Expand a character index to the surrounding word (identifier or operator run). */
export function wordRangeAt(text: string, idx: number): { start: number; end: number } | null {
  const ch = text[idx];
  if (ch === undefined || /\s/.test(ch)) return null;
  const same = IDENT.test(ch)
    ? (c: string) => IDENT.test(c)
    : (c: string) => !IDENT.test(c) && !/\s/.test(c);
  let start = idx;
  let end = idx + 1;
  while (start > 0 && same(text[start - 1])) start--;
  while (end < text.length && same(text[end])) end++;
  return { start, end };
}

/** Trim surrounding whitespace off a range; null if nothing is left. */
export function trimRange(text: string, start: number, end: number): { start: number; end: number } | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? { start, end } : null;
}

export interface CodeHit {
  line: number;
  content: string;
  /** Character index under the pointer. */
  index: number;
  codeEl: HTMLElement;
}

/**
 * Locate the code line and character under a pointer inside a SourceCodeNode.
 * Rows carry `data-line` / `data-content`; the column is derived from the
 * monospace `<code>` element's width, so it is independent of canvas zoom.
 */
export function codeHitAt(target: EventTarget | null, clientX: number): CodeHit | null {
  const row = (target as HTMLElement | null)?.closest?.('[data-line]') as HTMLElement | null;
  if (!row) return null;
  const codeEl = row.querySelector('code') as HTMLElement | null;
  if (!codeEl) return null;
  return hitInRow(row, codeEl, clientX);
}

/** Same as codeHitAt, for a row already known (e.g. during a drag). */
export function hitInRow(row: HTMLElement, codeEl: HTMLElement, clientX: number): CodeHit | null {
  const line = Number(row.dataset.line);
  const content = row.dataset.content ?? '';
  if (!Number.isFinite(line) || content.length === 0) return null;
  const rect = codeEl.getBoundingClientRect();
  const total = visualCol(content, content.length);
  if (total === 0 || rect.width === 0) return null;
  const cw = rect.width / total;
  const vcol = Math.max(0, Math.min(total - 1, Math.floor((clientX - rect.left) / cw)));
  return { line, content, index: charAtVisualCol(content, vcol), codeEl };
}

/** Anchors on `line` covering character `idx`. */
export function anchorAt(anchors: TokenAnchor[], line: number, idx: number): TokenAnchor | undefined {
  return anchors.find((a) => a.line === line && idx >= a.start && idx < a.end);
}

/** Text an anchor currently points at (may be stale after code edits). */
export function anchorText(code: string, collapsedLineMap: number[], anchor: TokenAnchor): string | null {
  const content = lineContent(code, collapsedLineMap, anchor.line);
  if (content === null) return null;
  return content.slice(anchor.start, anchor.end) || null;
}

/** Raw text of a display line number, honoring "..." collapse markers. */
export function lineContent(code: string, collapsedLineMap: number[], line: number): string | null {
  let num = 1;
  let ellipsis = 0;
  for (const raw of (code || '').split('\n')) {
    if (raw.trim() === ELLIPSIS_MARKER) {
      const next = collapsedLineMap[ellipsis++];
      if (next !== undefined && next > num) num = next;
      continue;
    }
    if (num === line) return raw;
    num++;
  }
  return null;
}

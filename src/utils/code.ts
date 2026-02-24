/** Sentinel string that marks a collapsed section in source code. */
export const ELLIPSIS_MARKER = '...';

/**
 * Returns the 0-based indices of lines in `code` that are exactly the
 * ellipsis marker (trimmed), in order.
 */
export function findEllipsisIndices(code: string): number[] {
  return (code || '')
    .split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.trim() === ELLIPSIS_MARKER)
    .map(({ i }) => i);
}

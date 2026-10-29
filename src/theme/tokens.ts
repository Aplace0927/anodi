import type { NodeData } from '../types';

// ── Node kind colors ─────────────────────────────────────────────

export const NODE_KIND_COLORS: Record<'source' | 'class' | 'memory' | 'notepad' | 'group', string> = {
  source: '#6366f1',
  class: '#a855f7',
  memory: '#f97316',
  notepad: '#f59e0b',
  group: '#6366f1',
};

// ── Opacity levels ───────────────────────────────────────────────

export const DIM_LEVELS = { focused: 1, neighbor: 1, dimmed: 0.3, hidden: 0 } as const;

export const EDGE_OPACITY = { selected: 1, normal: 0.6, dimmed: 0.2 } as const;

/** Resolve a node's display color: custom override first, else the kind color. */
export function nodeKindColor(data: NodeData): string {
  if (data.kind === 'group') return data.groupColor || NODE_KIND_COLORS.group;
  return (data as { nodeColor?: string }).nodeColor || NODE_KIND_COLORS[data.kind];
}

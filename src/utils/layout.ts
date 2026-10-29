import dagre from '@dagrejs/dagre';
import type { AnodiNode, AnodiEdge } from '../types';

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';
export type LayoutDirection = 'LR' | 'TB';
export interface PositionUpdate {
  id: string;
  position: { x: number; y: number };
}

const DEFAULT_W = 200;
const DEFAULT_H = 80;

function sizeOf(n: AnodiNode): { w: number; h: number } {
  return {
    w: (n.measured?.width ?? n.width) || DEFAULT_W,
    h: (n.measured?.height ?? n.height) || DEFAULT_H,
  };
}

// ── Align ────────────────────────────────────────────────────────

export function alignNodes(nodes: AnodiNode[], mode: AlignMode): PositionUpdate[] {
  if (nodes.length < 2) return [];
  const boxes = nodes.map((n) => ({ n, ...sizeOf(n) }));
  const minX = Math.min(...boxes.map((b) => b.n.position.x));
  const maxR = Math.max(...boxes.map((b) => b.n.position.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.n.position.y));
  const maxB = Math.max(...boxes.map((b) => b.n.position.y + b.h));
  const cx = (minX + maxR) / 2;
  const cy = (minY + maxB) / 2;
  return boxes.map(({ n, w, h }) => {
    let { x, y } = n.position;
    switch (mode) {
      case 'left': x = minX; break;
      case 'right': x = maxR - w; break;
      case 'top': y = minY; break;
      case 'bottom': y = maxB - h; break;
      case 'centerX': x = cx - w / 2; break;
      case 'centerY': y = cy - h / 2; break;
    }
    return { id: n.id, position: { x, y } };
  });
}

// ── Distribute ───────────────────────────────────────────────────

/** Evenly space nodes along an axis (equal gaps). Requires at least 3 nodes. */
export function distributeNodes(nodes: AnodiNode[], axis: 'x' | 'y'): PositionUpdate[] {
  if (nodes.length < 3) return [];
  const items = nodes
    .map((n) => ({ n, size: axis === 'x' ? sizeOf(n).w : sizeOf(n).h }))
    .sort((a, b) => a.n.position[axis] - b.n.position[axis]);
  const first = items[0];
  const last = items[items.length - 1];
  const start = first.n.position[axis];
  const end = last.n.position[axis] + last.size;
  const total = items.reduce((sum, i) => sum + i.size, 0);
  const gap = (end - start - total) / (items.length - 1);
  let cursor = start;
  return items.map(({ n, size }) => {
    const pos = { ...n.position, [axis]: cursor };
    cursor += size + gap;
    return { id: n.id, position: pos };
  });
}

// ── Auto layout (dagre) ──────────────────────────────────────────

/** Layered layout. Group nodes are skipped; edges touching skipped nodes are ignored. */
export function computeAutoLayout(
  nodes: AnodiNode[],
  edges: AnodiEdge[],
  direction: LayoutDirection,
): PositionUpdate[] {
  const targets = nodes.filter((n) => n.type !== 'group');
  if (targets.length === 0) return [];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(targets.map((n) => n.id));
  for (const n of targets) {
    const { w, h } = sizeOf(n);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  // Keep the layout anchored at the top-left of the original bounding box
  const origMinX = Math.min(...targets.map((n) => n.position.x));
  const origMinY = Math.min(...targets.map((n) => n.position.y));
  const raw = targets.map((n) => {
    const p = g.node(n.id);
    const { w, h } = sizeOf(n);
    return { id: n.id, x: p.x - w / 2, y: p.y - h / 2 };
  });
  const newMinX = Math.min(...raw.map((r) => r.x));
  const newMinY = Math.min(...raw.map((r) => r.y));
  return raw.map((r) => ({
    id: r.id,
    position: { x: r.x - newMinX + origMinX, y: r.y - newMinY + origMinY },
  }));
}

import { Position } from '@xyflow/react';
import type { EdgePathStyle } from '../types';

type Pt = { x: number; y: number };

/** Gap (px) a step edge travels straight out of its handle before turning. */
const STEP_OFFSET = 20;
/** Corner radius (px) for step edges. */
const STEP_RADIUS = 8;
/** Samples per cubic segment when approximating curves for label placement. */
const CURVE_SAMPLES = 16;

/** Unit vector pointing out of a handle on the given side. */
function handleDir(pos: Position): Pt {
  switch (pos) {
    case Position.Left: return { x: -1, y: 0 };
    case Position.Right: return { x: 1, y: 0 };
    case Position.Top: return { x: 0, y: -1 };
    default: return { x: 0, y: 1 };
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

/**
 * Smooth curve through every point (Catmull-Rom converted to cubic Béziers).
 * End tangents follow the handle directions so curves leave/enter nodes cleanly.
 */
function bezierPath(points: Pt[], sourcePos: Position, targetPos: Position): { d: string; samples: Pt[] } {
  const n = points.length;
  const sDir = handleDir(sourcePos);
  const tDir = handleDir(targetPos);
  const tangents: Pt[] = points.map((p, i) => {
    if (i === 0) {
      const k = Math.max(40, dist(p, points[1]) * (n === 2 ? 0.75 : 1));
      return { x: sDir.x * k * 1.5, y: sDir.y * k * 1.5 };
    }
    if (i === n - 1) {
      const k = Math.max(40, dist(points[i - 1], p) * (n === 2 ? 0.75 : 1));
      return { x: -tDir.x * k * 1.5, y: -tDir.y * k * 1.5 };
    }
    return { x: (points[i + 1].x - points[i - 1].x) / 2, y: (points[i + 1].y - points[i - 1].y) / 2 };
  });

  let d = `M ${points[0].x} ${points[0].y}`;
  const samples: Pt[] = [points[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const c1 = { x: p0.x + tangents[i].x / 3, y: p0.y + tangents[i].y / 3 };
    const c2 = { x: p1.x - tangents[i + 1].x / 3, y: p1.y - tangents[i + 1].y / 3 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`;
    for (let s = 1; s <= CURVE_SAMPLES; s++) samples.push(cubicAt(p0, c1, c2, p1, s / CURVE_SAMPLES));
  }
  return { d, samples };
}

/** Orthogonal route through every point, with rounded corners. */
function stepPoints(points: Pt[], sourcePos: Position, targetPos: Position): Pt[] {
  const s = points[0];
  const t = points[points.length - 1];
  const sd = handleDir(sourcePos);
  const td = handleDir(targetPos);
  const s1 = { x: s.x + sd.x * STEP_OFFSET, y: s.y + sd.y * STEP_OFFSET };
  const t1 = { x: t.x + td.x * STEP_OFFSET, y: t.y + td.y * STEP_OFFSET };
  const waypoints = [s1, ...points.slice(1, -1), t1];

  const route: Pt[] = [s, s1];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (waypoints.length === 2) {
      // No bend points: classic step that splits halfway along the handle axis
      if (sd.x !== 0) {
        const mx = (a.x + b.x) / 2;
        route.push({ x: mx, y: a.y }, { x: mx, y: b.y });
      } else {
        const my = (a.y + b.y) / 2;
        route.push({ x: a.x, y: my }, { x: b.x, y: my });
      }
    } else {
      route.push({ x: b.x, y: a.y });
    }
    route.push(b);
  }
  route.push(t);

  // Drop duplicate and collinear points so corners are only drawn where the path turns
  const out: Pt[] = [];
  for (const p of route) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      const collinear = (Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01) ||
        (Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01);
      if (collinear) out.pop();
    }
    out.push(p);
  }
  return out;
}

function roundedPolyline(pts: Pt[], radius: number): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const inLen = dist(prev, cur) || 1;
    const outLen = dist(cur, next) || 1;
    const a = { x: cur.x + ((prev.x - cur.x) / inLen) * r, y: cur.y + ((prev.y - cur.y) / inLen) * r };
    const b = { x: cur.x + ((next.x - cur.x) / outLen) * r, y: cur.y + ((next.y - cur.y) / outLen) * r };
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Build an SVG path for an edge running through `points` (source, bend points…, target).
 * `samples` is a polyline approximation of the rendered path, used for label placement.
 */
export function buildEdgePath(
  style: EdgePathStyle,
  points: Pt[],
  sourcePos: Position,
  targetPos: Position,
): { d: string; samples: Pt[] } {
  if (style === 'bezier') return bezierPath(points, sourcePos, targetPos);
  if (style === 'step') {
    const pts = stepPoints(points, sourcePos, targetPos);
    return { d: roundedPolyline(pts, STEP_RADIUS), samples: pts };
  }
  return { d: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '), samples: points };
}

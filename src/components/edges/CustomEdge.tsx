import { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  EdgeLabelRenderer,
  useReactFlow,
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { AnodiEdgeData } from '../../types';
import { getEdgeStyle, DEFAULT_EDGE_WIDTH } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { buildEdgePath } from '../../utils/edgePath';

type Props = EdgeProps & { data?: AnodiEdgeData };

/** Snap a point's angle (relative to an anchor) to the nearest 15-degree increment. */
function snapAngle(anchor: { x: number; y: number }, point: { x: number; y: number }): { x: number; y: number } {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return point;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 12; // 15 degrees
  const snapped = Math.round(angle / step) * step;
  return {
    x: anchor.x + distance * Math.cos(snapped),
    y: anchor.y + distance * Math.sin(snapped),
  };
}

/**
 * Compute 15-degree angle snaps from both adjacent points (previous and next)
 * and return whichever snapped position is closer to the raw cursor.
 */
function bestSnap(
  idx: number,
  bendPoints: { x: number; y: number }[],
  source: { x: number; y: number },
  target: { x: number; y: number },
  cursor: { x: number; y: number },
): { x: number; y: number } {
  const prev = idx === 0 ? source : bendPoints[idx - 1];
  const next = idx === bendPoints.length - 1 ? target : bendPoints[idx + 1];
  const snappedPrev = snapAngle(prev, cursor);
  const snappedNext = snapAngle(next, cursor);
  const distPrev = (cursor.x - snappedPrev.x) ** 2 + (cursor.y - snappedPrev.y) ** 2;
  const distNext = (cursor.x - snappedNext.x) ** 2 + (cursor.y - snappedNext.y) ** 2;
  return distPrev <= distNext ? snappedPrev : snappedNext;
}

/** Find the point at the midpoint of a polyline defined by the given points. */
function polylineMidpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };

  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    segLens.push(Math.sqrt(dx * dx + dy * dy));
    totalLen += segLens[segLens.length - 1];
  }

  let remaining = totalLen / 2;
  for (let i = 0; i < segLens.length; i++) {
    if (remaining <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] === 0 ? 0 : remaining / segLens[i];
      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y),
      };
    }
    remaining -= segLens[i];
  }

  return points[Math.floor(points.length / 2)];
}

const CustomEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
    markerStart,
  }: Props) => {
    const rel = data?.relationship ?? 'call';
    const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
    const observerMode = useGraphStore((s) => s.observerMode);
    const addBendPoint = useGraphStore((s) => s.addBendPoint);
    const removeBendPoint = useGraphStore((s) => s.removeBendPoint);
    const updateBendPoint = useGraphStore((s) => s.updateBendPoint);
    const defaultPathStyle = useGraphStore((s) => s.defaultEdgePathStyle);
    const style = getEdgeStyle(rel, userEdgeTypes);
    const color = data?.color ?? style.color;
    const pathStyle = data?.pathStyle ?? defaultPathStyle;
    const width = data?.strokeWidth ?? DEFAULT_EDGE_WIDTH;
    const reactFlow = useReactFlow();

    const bendPoints = data?.bendPoints ?? [];

    // Local state for dragging control points (avoids store updates during drag)
    const [dragPoints, setDragPoints] = useState<{ x: number; y: number }[] | null>(null);
    const effectivePoints = dragPoints ?? bendPoints;

    // Cleanup ref for global pointer listeners to prevent memory leaks
    const cleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => {
      return () => {
        cleanupRef.current?.();
      };
    }, []);

    // All points including source and target
    const allPoints = [
      { x: sourceX, y: sourceY },
      ...effectivePoints,
      { x: targetX, y: targetY },
    ];

    const { d: pathD, samples } = buildEdgePath(pathStyle, allPoints, sourcePosition, targetPosition);

    // Label position at the midpoint of the rendered path
    const labelPos = polylineMidpoint(samples);

    const strokeStyle: React.CSSProperties = {
      stroke: color,
      strokeWidth: selected ? width + 1 : width,
      strokeDasharray: style.strokeDasharray,
    };

    // 15° angle snapping only makes sense for straight segments
    const snapPoint = (
      idx: number,
      pts: { x: number; y: number }[],
      source: { x: number; y: number },
      target: { x: number; y: number },
      raw: { x: number; y: number },
    ) => (pathStyle === 'straight' ? bestSnap(idx, pts, source, target, raw) : raw);

    // Double-click on edge path → add a new bend point
    const handleEdgeDoubleClick = useCallback(
      (e: React.MouseEvent<SVGPathElement>) => {
        if (observerMode) return;
        e.stopPropagation();
        e.preventDefault();
        const flowPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });

        // Find which segment is closest to the click
        const pts = [
          { x: sourceX, y: sourceY },
          ...bendPoints,
          { x: targetX, y: targetY },
        ];
        let minDist = Infinity;
        let insertIdx = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const lenSq = dx * dx + dy * dy;
          const dot = (flowPos.x - p1.x) * dx + (flowPos.y - p1.y) * dy;
          const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, dot / lenSq));
          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;
          const dist = Math.sqrt((flowPos.x - projX) ** 2 + (flowPos.y - projY) ** 2);
          if (dist < minDist) {
            minDist = dist;
            insertIdx = i;
          }
        }
        addBendPoint(id, insertIdx, flowPos);
      },
      [id, sourceX, sourceY, targetX, targetY, bendPoints, addBendPoint, reactFlow, observerMode]
    );

    // Drag a control point using global listeners for reliability
    const handlePointPointerDown = useCallback(
      (e: React.PointerEvent, idx: number) => {
        if (observerMode) return;
        e.stopPropagation();
        e.preventDefault();
        const startPoints = [...bendPoints];
        setDragPoints(startPoints);

        const source = { x: sourceX, y: sourceY };
        const target = { x: targetX, y: targetY };

        const onMove = (moveEvt: PointerEvent) => {
          moveEvt.preventDefault();
          const raw = reactFlow.screenToFlowPosition({ x: moveEvt.clientX, y: moveEvt.clientY });
          const pos = snapPoint(idx, startPoints, source, target, raw);
          setDragPoints(startPoints.map((p, i) => (i === idx ? pos : p)));
        };

        const cleanup = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          cleanupRef.current = null;
        };

        const onUp = (upEvt: PointerEvent) => {
          cleanup();
          const raw = reactFlow.screenToFlowPosition({ x: upEvt.clientX, y: upEvt.clientY });
          const pos = snapPoint(idx, startPoints, source, target, raw);
          updateBendPoint(id, idx, pos);
          setDragPoints(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        cleanupRef.current = cleanup;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [id, bendPoints, sourceX, sourceY, targetX, targetY, reactFlow, updateBendPoint, observerMode, pathStyle]
    );

    // Double-click on a control point → remove it
    const handlePointDoubleClick = useCallback(
      (e: React.MouseEvent, idx: number) => {
        if (observerMode) return;
        e.stopPropagation();
        e.preventDefault();
        removeBendPoint(id, idx);
      },
      [id, removeBendPoint, observerMode]
    );

    return (
      <>
        {/* Visible edge path */}
        <path
          d={pathD}
          fill="none"
          style={strokeStyle}
          className="react-flow__edge-path"
          markerEnd={markerEnd as string}
          markerStart={markerStart as string}
        />
        {/* Invisible wider path for interaction (click / double-click) */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          className="react-flow__edge-interaction"
          onDoubleClick={handleEdgeDoubleClick}
        />
        <EdgeLabelRenderer>
          {/* Relationship label */}
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPos.x}px,${labelPos.y}px)`,
              pointerEvents: 'all',
            }}
            className="anodi-export-edge nodrag nopan font-sans"
          >
            <span
              className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold text-white shadow"
              style={{ backgroundColor: color }}
            >
              {style.label}
              {data?.label ? (
                <span
                  className="ml-1 inline-block max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap align-bottom font-normal opacity-95"
                  title={data.label}
                >
                  · {data.label}
                </span>
              ) : null}
            </span>
          </div>
          {/* Draggable control points (visible when edge is selected) */}
          {selected &&
            effectivePoints.map((p, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${p.x}px,${p.y}px)`,
                  pointerEvents: 'all',
                  cursor: 'grab',
                  zIndex: 10,
                }}
                className="nodrag nopan"
                onPointerDown={(e) => handlePointPointerDown(e, i)}
                onDoubleClick={(e) => handlePointDoubleClick(e, i)}
                title="Drag to move · Double-click to remove"
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: color,
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
            ))}
        </EdgeLabelRenderer>
      </>
    );
  }
);

CustomEdge.displayName = 'CustomEdge';
export default CustomEdge;

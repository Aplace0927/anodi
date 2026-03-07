import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { AnodiEdgeData } from '../../types';
import { getEdgeStyle } from '../../types';
import { useGraphStore } from '../../store/graphStore';

type Props = EdgeProps & { data?: AnodiEdgeData };

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
  }: Props) => {
    const rel = data?.relationship ?? 'call';
    const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
    const style = getEdgeStyle(rel, userEdgeTypes);

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const strokeStyle = {
      stroke: style.color,
      strokeWidth: selected ? 2.5 : 1.5,
      strokeDasharray: style.strokeDasharray,
    };

    return (
      <>
        <BaseEdge id={id} path={edgePath} style={strokeStyle} markerEnd={markerEnd} />
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="anodi-export-edge nodrag nopan font-sans"
          >
            <span
              className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
              style={{ backgroundColor: style.color }}
            >
              {style.label}
            </span>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

CustomEdge.displayName = 'CustomEdge';
export default CustomEdge;

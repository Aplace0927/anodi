import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { GroupData } from '../../types';
import { GROUP_MIN_WIDTH, GROUP_MIN_HEIGHT, GROUP_HEADER_HEIGHT } from '../../types';
import { contrastTextColor } from '../ColorPicker';

function GroupNodeComponent({ data }: NodeProps) {
  const gd = data as unknown as GroupData;
  const color = gd.groupColor || '#6366f1';
  const width = gd.computedWidth || GROUP_MIN_WIDTH;
  const height = gd.computedHeight || GROUP_MIN_HEIGHT;
  const textColor = contrastTextColor(color);

  return (
    <div
      className="group-node-container"
      style={{
        width,
        height,
        borderRadius: 16,
        border: `2px solid ${color}`,
        backgroundColor: `${color}20`,
        position: 'relative',
        pointerEvents: 'all',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: GROUP_HEADER_HEIGHT,
          borderRadius: '14px 14px 0 0',
          backgroundColor: `${color}40`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: textColor === '#ffffff' ? '#fff' : color,
            userSelect: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {gd.name || 'Group'}
        </span>
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            color: textColor === '#ffffff' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)',
            userSelect: 'none',
          }}
        >
          {gd.memberNodeIds.length} node{gd.memberNodeIds.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export default memo(GroupNodeComponent);

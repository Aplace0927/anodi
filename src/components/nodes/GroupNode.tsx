import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { GroupData } from '../../types';
import { GROUP_MIN_WIDTH, GROUP_MIN_HEIGHT, GROUP_HEADER_HEIGHT } from '../../types';
import { contrastTextColor } from '../ColorPicker';

function GroupNodeComponent({ data }: NodeProps) {
  const gd = data as unknown as GroupData & { longPressAction?: '+' | '-' | null };
  const color = gd.groupColor || '#6366f1';
  const width = gd.computedWidth || GROUP_MIN_WIDTH;
  const height = gd.computedHeight || GROUP_MIN_HEIGHT;
  const textColor = contrastTextColor(color);
  const action = gd.longPressAction;

  // Border glow: green for add, red for remove
  const glowColor = action === '+' ? '#22c55e' : action === '-' ? '#ef4444' : undefined;

  return (
    <div
      className="group-node-container"
      style={{
        width,
        height,
        borderRadius: 16,
        border: `2px solid ${glowColor ?? color}`,
        backgroundColor: `${color}33`,
        position: 'relative',
        pointerEvents: 'all',
        boxShadow: glowColor
          ? `0 0 16px 4px ${glowColor}80, inset 0 0 16px 2px ${glowColor}30`
          : undefined,
        transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
      }}
    >
      {/* Long-press action banner */}
      {action && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: glowColor,
              backgroundColor: 'rgba(0,0,0,0.65)',
              borderRadius: 6,
              padding: '2px 10px',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {action === '+' ? '＋ Adding Node' : '− Removing Node'}
          </span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          height: GROUP_HEADER_HEIGHT,
          borderRadius: '14px 14px 0 0',
          backgroundColor: color,
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
            color: textColor,
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
            color: textColor === '#ffffff' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
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

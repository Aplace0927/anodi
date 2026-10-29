import type { ComponentType, ReactNode } from 'react';
import { contrastTextColor } from '../ColorPicker';
import { NODE_KIND_COLORS } from '../../theme/tokens';

interface Props {
  kind: keyof typeof NODE_KIND_COLORS;
  icon: ComponentType<{ size?: number | string; color?: string; className?: string }>;
  name: string;
  badge?: ReactNode;
  nodeColor?: string;
  actions?: ReactNode;
  /** Fixed pixel height (used by nodes that compute handle positions). */
  height?: number;
  mono?: boolean;
}

export default function NodeHeader({ kind, icon: Icon, name, badge, nodeColor, actions, height, mono }: Props) {
  const accent = NODE_KIND_COLORS[kind];
  const textColor = nodeColor ? contrastTextColor(nodeColor) : undefined;
  return (
    <div
      className={`anodi-export-data flex items-center gap-2 rounded-t-lg px-3 ${
        nodeColor ? '' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
      }`}
      style={{
        ...(height ? { height } : { minHeight: 36 }),
        ...(nodeColor
          ? { backgroundColor: nodeColor, color: textColor }
          : { boxShadow: `inset 3px 0 0 ${accent}` }),
      }}
    >
      <Icon size={14} color={nodeColor ? textColor : accent} className="shrink-0" />
      {badge}
      <span className={`flex-1 truncate text-sm font-bold ${mono ? 'font-mono' : ''}`}>{name}</span>
      {actions && (
        <div className="flex shrink-0 items-center gap-1" style={textColor ? { color: textColor } : undefined}>
          {actions}
        </div>
      )}
    </div>
  );
}

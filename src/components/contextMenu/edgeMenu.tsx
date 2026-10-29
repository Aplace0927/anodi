import { ArrowRightLeft, Eraser, Palette, PanelRight, Trash2 } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type { EdgeRelationship, EdgePathStyle, EdgeArrow } from '../../types';
import { BUILTIN_RELATIONSHIPS, EDGE_STYLES, EDGE_PATH_STYLES, EDGE_ARROWS, EDGE_WIDTHS, DEFAULT_EDGE_WIDTH, getEdgeStyle } from '../../types';
import EdgeSwatch from '../ui/EdgeSwatch';
import type { MenuCtx, MenuItem } from './types';
import { sep } from './types';

/** Every relationship (builtin + user-defined) as menu-ready entries. */
export function relationshipOptions(): { id: EdgeRelationship; label: string }[] {
  const { userEdgeTypes } = useGraphStore.getState();
  return [
    ...BUILTIN_RELATIONSHIPS.map((r) => ({ id: r as EdgeRelationship, label: EDGE_STYLES[r].label })),
    ...userEdgeTypes.map((u) => ({ id: u.id as EdgeRelationship, label: u.label })),
  ];
}

export function edgeMenu({ state, run }: MenuCtx): MenuItem[] {
  const st = useGraphStore.getState();
  const edgeId = state.id!;
  const edge = st.edges.find((e) => e.id === edgeId);
  if (!edge) return [];
  const data = edge.data;
  const rel = data?.relationship ?? 'call';
  const relStyle = getEdgeStyle(rel, st.userEdgeTypes);
  const color = data?.color ?? relStyle.color;
  const bendCount = data?.bendPoints?.length ?? 0;

  return [
    {
      type: 'header',
      key: 'h',
      label: 'Edge',
      badge: (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
          {relStyle.label}
        </span>
      ),
    },
    {
      type: 'segmented',
      key: 'path',
      label: 'Path',
      value: data?.pathStyle ?? st.defaultEdgePathStyle,
      options: EDGE_PATH_STYLES.map((p) => ({ id: p.id, label: p.label })),
      onChange: (v) => st.updateEdgeStyle(edgeId, { pathStyle: v as EdgePathStyle }),
    },
    {
      type: 'segmented',
      key: 'arrow',
      label: 'Arrow',
      value: data?.arrow ?? 'end',
      options: EDGE_ARROWS.map((a) => ({ id: a.id, label: a.label, title: a.id })),
      onChange: (v) => st.updateEdgeStyle(edgeId, { arrow: v === 'end' ? undefined : (v as EdgeArrow) }),
    },
    {
      type: 'segmented',
      key: 'width',
      label: 'Width',
      value: data?.strokeWidth ?? DEFAULT_EDGE_WIDTH,
      options: EDGE_WIDTHS.map((w) => ({
        id: w,
        title: `${w}px`,
        label: (
          <svg width="20" height="8" aria-hidden>
            <line x1="1" y1="4" x2="19" y2="4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
          </svg>
        ),
      })),
      onChange: (v) => st.updateEdgeStyle(edgeId, { strokeWidth: v === DEFAULT_EDGE_WIDTH ? undefined : Number(v) }),
    },
    {
      type: 'swatches',
      key: 'color',
      label: 'Color',
      value: data?.color,
      fallback: relStyle.color,
      onChange: (c) => st.updateEdgeStyle(edgeId, { color: c }),
    },
    {
      type: 'input',
      key: 'label',
      label: 'Label',
      value: data?.label ?? '',
      placeholder: 'Optional edge label',
      onChange: (v) => st.updateEdgeLabel(edgeId, v),
    },
    sep('s1'),
    {
      key: 'type',
      label: 'Relationship',
      icon: <Palette size={14} />,
      hint: relStyle.label,
      children: relationshipOptions().map((r) => {
        const s = getEdgeStyle(r.id, st.userEdgeTypes);
        return {
          key: `t-${r.id}`,
          label: r.label,
          checked: r.id === rel,
          icon: <EdgeSwatch color={s.color} dash={s.strokeDasharray} width={16} />,
          onClick: run(() => st.updateEdgeRelationship(edgeId, r.id)),
        };
      }),
    },
    { key: 'rev', label: 'Reverse direction', icon: <ArrowRightLeft size={14} />, onClick: run(() => st.swapEdgeDirection(edgeId)) },
    {
      key: 'bend',
      label: bendCount > 0 ? `Clear ${bendCount} bend point${bendCount > 1 ? 's' : ''}` : 'Clear bend points',
      icon: <Eraser size={14} />,
      disabled: bendCount === 0,
      onClick: run(() => st.clearBendPoints(edgeId)),
    },
    { key: 'panel', label: 'Show details', icon: <PanelRight size={14} />, onClick: run(() => st.selectEdge(edgeId)) },
    sep('s2'),
    { key: 'del', label: 'Delete edge', icon: <Trash2 size={14} />, danger: true, onClick: run(() => st.onEdgesChange([{ type: 'remove', id: edgeId }])) },
  ];
}

import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  ClipboardPaste,
  Grid3x3,
  Group as GroupIcon,
  Maximize,
  Plus,
  Spline,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useGraphStore } from '../../store/graphStore';
import type { EdgePathStyle } from '../../types';
import { EDGE_PATH_STYLES, getEdgeStyle } from '../../types';
import type { AlignMode } from '../../utils/layout';
import EdgeSwatch from '../ui/EdgeSwatch';
import { relationshipOptions } from './edgeMenu';
import type { MenuCtx, MenuItem } from './types';
import { sep } from './types';

const ALIGN_MODES: { mode: AlignMode; label: string; icon: ReactNode }[] = [
  { mode: 'left', label: 'Align left', icon: <AlignHorizontalJustifyStart size={14} /> },
  { mode: 'centerX', label: 'Align center', icon: <AlignHorizontalJustifyCenter size={14} /> },
  { mode: 'right', label: 'Align right', icon: <AlignHorizontalJustifyEnd size={14} /> },
  { mode: 'top', label: 'Align top', icon: <AlignVerticalJustifyStart size={14} /> },
  { mode: 'centerY', label: 'Align middle', icon: <AlignVerticalJustifyCenter size={14} /> },
  { mode: 'bottom', label: 'Align bottom', icon: <AlignVerticalJustifyEnd size={14} /> },
];

export const fitViewItem = (ctx: MenuCtx): MenuItem => ({
  key: 'fit',
  label: 'Fit view',
  icon: <Maximize size={14} />,
  onClick: ctx.run(ctx.fitView),
});

export function paneMenu(ctx: MenuCtx): MenuItem[] {
  const st = useGraphStore.getState();
  const { state, run } = ctx;
  const clipboard = st.clipboard;
  const activeStyle = getEdgeStyle(st.activeEdgeType, st.userEdgeTypes);
  return [
    { key: 'add', label: 'Add node here', icon: <Plus size={14} />, hint: 'N', onClick: run(() => ctx.onAddNodeAt(state.flowPos)) },
    {
      key: 'paste',
      label: 'Paste here',
      icon: <ClipboardPaste size={14} />,
      hint: '⌘V',
      disabled: !clipboard || clipboard.nodes.length === 0,
      onClick: run(() => {
        if (!clipboard || clipboard.nodes.length === 0) return;
        const minX = Math.min(...clipboard.nodes.map((n) => n.position.x));
        const minY = Math.min(...clipboard.nodes.map((n) => n.position.y));
        st.pasteSelection({ x: state.flowPos.x - minX, y: state.flowPos.y - minY });
      }),
    },
    sep('s1'),
    { type: 'header', key: 'edges-h', label: 'New edges' },
    {
      key: 'active',
      label: 'Edge type',
      icon: <EdgeSwatch color={activeStyle.color} dash={activeStyle.strokeDasharray} width={14} />,
      hint: activeStyle.label,
      children: relationshipOptions().map((r) => {
        const s = getEdgeStyle(r.id, st.userEdgeTypes);
        return {
          key: `a-${r.id}`,
          label: r.label,
          checked: r.id === st.activeEdgeType,
          icon: <EdgeSwatch color={s.color} dash={s.strokeDasharray} width={16} />,
          onClick: run(() => st.setActiveEdgeType(r.id)),
        };
      }),
    },
    {
      type: 'segmented',
      key: 'path',
      label: 'Default path',
      value: st.defaultEdgePathStyle,
      options: EDGE_PATH_STYLES.map((p) => ({ id: p.id, label: p.label })),
      onChange: (v) => st.setDefaultEdgePathStyle(v as EdgePathStyle),
    },
    sep('s2'),
    {
      key: 'layout',
      label: 'Auto layout all',
      icon: <Workflow size={14} />,
      children: [
        { key: 'lr', label: 'Left to right', onClick: run(() => st.autoLayout('LR')) },
        { key: 'tb', label: 'Top to bottom', onClick: run(() => st.autoLayout('TB')) },
      ],
    },
    { key: 'snap', label: 'Snap to grid', icon: <Grid3x3 size={14} />, checked: st.snapToGrid, onClick: run(() => st.setSnapToGrid(!st.snapToGrid)) },
    fitViewItem(ctx),
  ];
}

export function selectionMenu(ctx: MenuCtx): MenuItem[] {
  const st = useGraphStore.getState();
  const { run } = ctx;
  const ids = [...st.selectedNodeIds];
  const selected = st.nodes.filter((n) => ids.includes(n.id));
  const plain = selected.filter((n) => n.type !== 'group');
  const idSet = new Set(ids);
  const innerEdges = st.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
  const commonColor = plain.length > 0 && plain.every((n) => n.data.nodeColor === plain[0].data.nodeColor)
    ? (plain[0].data.nodeColor as string | undefined)
    : undefined;

  const items: MenuItem[] = [
    { type: 'header', key: 'h', label: `${ids.length} nodes selected` },
    {
      type: 'swatches',
      key: 'color',
      label: 'Color',
      value: commonColor,
      onChange: (c) => st.updateNodesBulk(plain.map((n) => ({ id: n.id, data: { nodeColor: c } }))),
    },
  ];
  if (innerEdges.length > 0) {
    items.push({
      key: 'edge-path',
      label: `Path of ${innerEdges.length} inner edge${innerEdges.length > 1 ? 's' : ''}`,
      icon: <Spline size={14} />,
      children: EDGE_PATH_STYLES.map((p) => ({
        key: `p-${p.id}`,
        label: p.label,
        checked: innerEdges.every((e) => (e.data?.pathStyle ?? st.defaultEdgePathStyle) === p.id),
        onClick: run(() => st.updateEdgeStyle(innerEdges.map((e) => e.id), { pathStyle: p.id })),
      })),
    });
  }
  items.push(
    sep('s1'),
    {
      key: 'align',
      label: 'Align',
      icon: <AlignHorizontalJustifyStart size={14} />,
      children: ALIGN_MODES.map((a) => ({ key: a.mode, label: a.label, icon: a.icon, onClick: run(() => st.alignSelected(a.mode)) })),
    },
    { key: 'dx', label: 'Distribute horizontally', icon: <AlignHorizontalSpaceBetween size={14} />, disabled: ids.length < 3, onClick: run(() => st.distributeSelected('x')) },
    { key: 'dy', label: 'Distribute vertically', icon: <AlignVerticalSpaceBetween size={14} />, disabled: ids.length < 3, onClick: run(() => st.distributeSelected('y')) },
    {
      key: 'layout',
      label: 'Auto layout selection',
      icon: <Workflow size={14} />,
      children: [
        { key: 'lr', label: 'Left to right', onClick: run(() => st.autoLayout('LR', true)) },
        { key: 'tb', label: 'Top to bottom', onClick: run(() => st.autoLayout('TB', true)) },
      ],
    },
    {
      key: 'group',
      label: 'Group selection',
      icon: <GroupIcon size={14} />,
      onClick: run(() => {
        if (plain.length === 0) return;
        const minX = Math.min(...plain.map((n) => n.position.x));
        const minY = Math.min(...plain.map((n) => n.position.y));
        st.addGroup('Group', undefined, { x: minX - 40, y: minY - 76 });
        const groups = useGraphStore.getState().nodes.filter((n) => n.type === 'group');
        const created = groups[groups.length - 1];
        if (!created) return;
        plain.forEach((n) => useGraphStore.getState().addNodeToGroup(created.id, n.id));
        useGraphStore.getState().recomputeGroupBounds();
      }),
    },
    sep('s2'),
    {
      key: 'del',
      label: `Delete ${ids.length} nodes`,
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: run(() => st.onNodesChange(ids.map((id) => ({ type: 'remove' as const, id })))),
    },
  );
  return items;
}

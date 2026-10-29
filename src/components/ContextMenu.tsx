import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ChevronRight,
  Copy,
  FolderPlus,
  FolderMinus,
  Trash2,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  Workflow,
  Group as GroupIcon,
  ArrowRightLeft,
  Tag,
  Eraser,
  Plus,
  ClipboardPaste,
  Grid3x3,
  Maximize,
  Palette,
} from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { GroupData, EdgeRelationship } from '../types';
import { BUILTIN_RELATIONSHIPS, EDGE_STYLES, getEdgeStyle } from '../types';
import type { AlignMode } from '../utils/layout';

export type ContextMenuState = {
  x: number;
  y: number;
  kind: 'node' | 'selection' | 'edge' | 'pane';
  id?: string;
  flowPos: { x: number; y: number };
};

interface Props {
  state: ContextMenuState | null;
  onClose: () => void;
  onAddNodeAt: (pos: { x: number; y: number }) => void;
}

interface Item {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children?: Item[];
  swatch?: string;
}

const ALIGN_MODES: { mode: AlignMode; label: string; icon: ReactNode }[] = [
  { mode: 'left', label: 'Align left', icon: <AlignHorizontalJustifyStart size={14} /> },
  { mode: 'centerX', label: 'Align center', icon: <AlignHorizontalJustifyCenter size={14} /> },
  { mode: 'right', label: 'Align right', icon: <AlignHorizontalJustifyEnd size={14} /> },
  { mode: 'top', label: 'Align top', icon: <AlignVerticalJustifyStart size={14} /> },
  { mode: 'centerY', label: 'Align middle', icon: <AlignVerticalJustifyCenter size={14} /> },
  { mode: 'bottom', label: 'Align bottom', icon: <AlignVerticalJustifyEnd size={14} /> },
];

export default function ContextMenu({ state, onClose, onAddNodeAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const reactFlow = useReactFlow();

  const observerMode = useGraphStore((s) => s.observerMode);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const snapToGrid = useGraphStore((s) => s.snapToGrid);
  const clipboard = useGraphStore((s) => s.clipboard);

  // Position is re-measured by the layout effect below; resetting it here
  // (a passive effect, which runs after layout effects) would leave the menu hidden.
  useEffect(() => {
    setOpen(null);
  }, [state]);

  // Clamp to viewport after measuring
  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(state.x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(state.y, window.innerHeight - r.height - 8));
    setPos({ left, top });
  }, [state, open]);

  // Close on outside click / Escape / scroll
  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [state, onClose]);

  if (!state) return null;

  const st = useGraphStore.getState;
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const items: Item[] = [];
  const fitView = { key: 'fit', label: 'Fit view', icon: <Maximize size={14} />, onClick: run(() => reactFlow.fitView({ padding: 0.2, duration: 200 })) };

  if (observerMode) {
    items.push(fitView);
  } else if (state.kind === 'pane') {
    items.push(
      { key: 'add', label: 'Add node here', icon: <Plus size={14} />, onClick: run(() => onAddNodeAt(state.flowPos)) },
      {
        key: 'paste',
        label: 'Paste here',
        icon: <ClipboardPaste size={14} />,
        disabled: !clipboard || clipboard.nodes.length === 0,
        onClick: run(() => {
          if (!clipboard || clipboard.nodes.length === 0) return;
          const minX = Math.min(...clipboard.nodes.map((n) => n.position.x));
          const minY = Math.min(...clipboard.nodes.map((n) => n.position.y));
          st().pasteSelection({ x: state.flowPos.x - minX, y: state.flowPos.y - minY });
        }),
      },
      {
        key: 'layout',
        label: 'Auto layout all',
        icon: <Workflow size={14} />,
        children: [
          { key: 'lr', label: 'Left to right', onClick: run(() => st().autoLayout('LR')) },
          { key: 'tb', label: 'Top to bottom', onClick: run(() => st().autoLayout('TB')) },
        ],
      },
      { key: 'snap', label: snapToGrid ? 'Snap to grid: on' : 'Snap to grid: off', icon: <Grid3x3 size={14} />, onClick: run(() => st().setSnapToGrid(!snapToGrid)) },
      fitView,
    );
  } else if (state.kind === 'edge' && state.id) {
    const edgeId = state.id;
    const edge = edges.find((e) => e.id === edgeId);
    const rels: { id: EdgeRelationship; label: string }[] = [
      ...BUILTIN_RELATIONSHIPS.map((r) => ({ id: r as EdgeRelationship, label: EDGE_STYLES[r].label })),
      ...userEdgeTypes.map((u) => ({ id: u.id as EdgeRelationship, label: u.label })),
    ];
    items.push(
      { key: 'rev', label: 'Reverse direction', icon: <ArrowRightLeft size={14} />, onClick: run(() => st().swapEdgeDirection(edgeId)) },
      {
        key: 'type',
        label: 'Change type',
        icon: <Palette size={14} />,
        children: rels.map((r) => ({
          key: `t-${r.id}`,
          label: r.label,
          swatch: getEdgeStyle(r.id, userEdgeTypes).color,
          onClick: run(() => st().updateEdgeRelationship(edgeId, r.id)),
        })),
      },
      { key: 'label', label: 'Edit label', icon: <Tag size={14} />, onClick: run(() => st().selectEdge(edgeId)) },
      {
        key: 'bend',
        label: 'Clear bend points',
        icon: <Eraser size={14} />,
        disabled: (edge?.data?.bendPoints?.length ?? 0) === 0,
        onClick: run(() => st().clearBendPoints(edgeId)),
      },
      { key: 'del', label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: run(() => st().onEdgesChange([{ type: 'remove', id: edgeId }])) },
    );
  } else if (state.kind === 'selection' && selectedNodeIds.length > 1) {
    const ids = [...selectedNodeIds];
    items.push(
      {
        key: 'align',
        label: 'Align',
        icon: <AlignHorizontalJustifyStart size={14} />,
        children: ALIGN_MODES.map((a) => ({ key: a.mode, label: a.label, icon: a.icon, onClick: run(() => st().alignSelected(a.mode)) })),
      },
      { key: 'dx', label: 'Distribute horizontally', icon: <AlignHorizontalSpaceBetween size={14} />, disabled: ids.length < 3, onClick: run(() => st().distributeSelected('x')) },
      { key: 'dy', label: 'Distribute vertically', icon: <AlignVerticalSpaceBetween size={14} />, disabled: ids.length < 3, onClick: run(() => st().distributeSelected('y')) },
      {
        key: 'layout',
        label: 'Auto layout selection',
        icon: <Workflow size={14} />,
        children: [
          { key: 'lr', label: 'Left to right', onClick: run(() => st().autoLayout('LR', true)) },
          { key: 'tb', label: 'Top to bottom', onClick: run(() => st().autoLayout('TB', true)) },
        ],
      },
      {
        key: 'group',
        label: 'Group selection',
        icon: <GroupIcon size={14} />,
        onClick: run(() => {
          const sel = st().nodes.filter((n) => ids.includes(n.id) && n.type !== 'group');
          if (sel.length === 0) return;
          const minX = Math.min(...sel.map((n) => n.position.x));
          const minY = Math.min(...sel.map((n) => n.position.y));
          st().addGroup('Group', undefined, { x: minX - 40, y: minY - 76 });
          const groups = st().nodes.filter((n) => n.type === 'group');
          const created = groups[groups.length - 1];
          if (!created) return;
          sel.forEach((n) => st().addNodeToGroup(created.id, n.id));
          st().recomputeGroupBounds();
        }),
      },
      {
        key: 'del',
        label: `Delete ${ids.length} nodes`,
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: run(() => st().onNodesChange(ids.map((id) => ({ type: 'remove' as const, id })))),
      },
    );
  } else if (state.id) {
    const nodeId = state.id;
    const node = nodes.find((n) => n.id === nodeId);
    const groups = nodes.filter((n) => n.type === 'group');
    const home = groups.filter((g) => (g.data as GroupData).memberNodeIds.includes(nodeId));
    const others = groups.filter((g) => !(g.data as GroupData).memberNodeIds.includes(nodeId));
    if (node && node.type !== 'group') {
      items.push({
        key: 'dup',
        label: 'Duplicate',
        icon: <Copy size={14} />,
        onClick: run(() => {
          st().selectNode(nodeId);
          st().copySelection();
          st().pasteSelection();
        }),
      });
      if (others.length > 0) {
        items.push({
          key: 'addg',
          label: 'Add to group',
          icon: <FolderPlus size={14} />,
          children: others.map((g) => ({
            key: `g-${g.id}`,
            label: (g.data as GroupData).name || 'Group',
            swatch: (g.data as GroupData).groupColor || '#6366f1',
            onClick: run(() => {
              st().addNodeToGroup(g.id, nodeId);
              st().recomputeGroupBounds();
            }),
          })),
        });
      }
      home.forEach((g) =>
        items.push({
          key: `rm-${g.id}`,
          label: `Remove from ${(g.data as GroupData).name || 'group'}`,
          icon: <FolderMinus size={14} />,
          onClick: run(() => {
            st().removeNodeFromGroup(g.id, nodeId);
            st().recomputeGroupBounds();
          }),
        }),
      );
    }
    items.push({
      key: 'del',
      label: 'Delete',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: run(() => st().onNodesChange([{ type: 'remove', id: nodeId }])),
    });
  }

  const renderItem = (it: Item, nested = false) => {
    const expanded = open === it.key;
    return (
      <div key={it.key}>
        <button
          disabled={it.disabled}
          onClick={() => (it.children ? setOpen(expanded ? null : it.key) : it.onClick?.())}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            it.danger
              ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
          } ${nested ? 'pl-3' : ''}`}
        >
          {it.swatch ? (
            <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: it.swatch }} />
          ) : (
            <span className="flex w-3.5 shrink-0 justify-center text-gray-500 dark:text-gray-400">{it.icon}</span>
          )}
          <span className="flex-1 truncate">{it.label}</span>
          {it.children && <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />}
        </button>
        {it.children && expanded && (
          <div className="ml-3 border-l border-gray-200 pl-1 dark:border-gray-700">{it.children.map((c) => renderItem(c, true))}</div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="anodi-ctx-menu fixed z-[60] w-56 rounded-lg border border-gray-300 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={{ left: pos?.left ?? state.x, top: pos?.top ?? state.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => renderItem(it))}
    </div>
  );
}

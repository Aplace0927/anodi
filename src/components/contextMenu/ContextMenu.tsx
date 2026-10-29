import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Check, ChevronRight } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import Segmented from '../ui/Segmented';
import SwatchRow from '../ui/SwatchRow';
import type { ActionItem, ContextMenuState, MenuCtx, MenuItem } from './types';
import { edgeMenu } from './edgeMenu';
import { nodeMenu } from './nodeMenu';
import { paneMenu, selectionMenu, fitViewItem } from './canvasMenu';

interface Props {
  state: ContextMenuState | null;
  onClose: () => void;
  onAddNodeAt: (pos: { x: number; y: number }) => void;
}

const LABEL_CLS = 'mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function buildItems(ctx: MenuCtx): MenuItem[] {
  const { state } = ctx;
  const st = useGraphStore.getState();
  if (st.observerMode) return [fitViewItem(ctx)];
  if (state.kind === 'pane') return paneMenu(ctx);
  if (state.kind === 'edge' && state.id) return edgeMenu(ctx);
  if (state.kind === 'selection' && st.selectedNodeIds.length > 1) return selectionMenu(ctx);
  if (state.id) return nodeMenu(ctx);
  return [];
}

export default function ContextMenu({ state, onClose, onAddNodeAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const reactFlow = useReactFlow();

  // Re-render while open so inline controls reflect live store changes
  useGraphStore((s) => s.nodes);
  useGraphStore((s) => s.edges);
  useGraphStore((s) => s.selectedNodeIds);
  useGraphStore((s) => s.userEdgeTypes);
  useGraphStore((s) => s.activeEdgeType);
  useGraphStore((s) => s.defaultEdgePathStyle);
  useGraphStore((s) => s.snapToGrid);
  useGraphStore((s) => s.clipboard);
  useGraphStore((s) => s.observerMode);

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

  // Close on outside click / Escape / canvas scroll
  useEffect(() => {
    if (!state) return;
    const inside = (t: EventTarget | null) => !!ref.current && ref.current.contains(t as Node);
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onWheel = (e: WheelEvent) => {
      if (!inside(e.target)) onClose();
    };
    const onResize = () => onClose();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [state, onClose]);

  if (!state) return null;

  const ctx: MenuCtx = {
    state,
    run: (fn) => () => {
      fn();
      onClose();
    },
    onAddNodeAt,
    fitView: () => reactFlow.fitView({ padding: 0.2, duration: 200 }),
  };
  const items = buildItems(ctx);

  const renderAction = (it: ActionItem, nested: boolean) => {
    const expanded = open === it.key;
    return (
      <div key={it.key}>
        <button
          role="menuitem"
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
            <span className="flex min-w-3.5 shrink-0 justify-center text-gray-500 dark:text-gray-400">{it.icon}</span>
          )}
          <span className="flex-1 truncate">{it.label}</span>
          {it.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-gray-400 dark:text-gray-500">{it.hint}</span>}
          {it.checked && <Check size={14} className="shrink-0 text-indigo-500" />}
          {it.children && <ChevronRight size={14} className={`shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />}
        </button>
        {it.children && expanded && (
          <div className="ml-3 border-l border-gray-200 pl-1 dark:border-gray-700">{it.children.map((c) => renderItem(c, true))}</div>
        )}
      </div>
    );
  };

  const renderItem = (it: MenuItem, nested = false) => {
    switch (it.type) {
      case 'separator':
        return <hr key={it.key} className="my-1 border-gray-200 dark:border-gray-700" />;
      case 'header':
        return (
          <div key={it.key} className="flex items-center gap-2 px-2.5 pb-1 pt-1.5">
            <span className="truncate text-xs font-bold text-gray-500 dark:text-gray-400">{it.label}</span>
            {it.badge}
          </div>
        );
      case 'input':
        return (
          <div key={it.key} className="px-2.5 py-1">
            <label className={LABEL_CLS}>{it.label}</label>
            <input
              value={it.value}
              placeholder={it.placeholder}
              onChange={(e) => it.onChange(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') onClose();
              }}
              className={`w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white ${it.mono ? 'font-mono' : ''}`}
            />
          </div>
        );
      case 'segmented':
        return (
          <div key={it.key} className="px-2.5 py-1">
            <label className={LABEL_CLS}>{it.label}</label>
            <Segmented options={it.options} value={it.value} onChange={it.onChange} />
          </div>
        );
      case 'swatches':
        return (
          <div key={it.key} className="px-2.5 py-1">
            <label className={LABEL_CLS}>{it.label}</label>
            <SwatchRow value={it.value} fallback={it.fallback} onChange={it.onChange} />
          </div>
        );
      default:
        return renderAction(it, nested);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="anodi-ctx-menu fixed z-[60] max-h-[calc(100vh-16px)] w-64 overflow-y-auto rounded-lg border border-gray-300 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={{ left: pos?.left ?? state.x, top: pos?.top ?? state.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => renderItem(it))}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Plus, Undo2, Redo2, Image as ImageIcon, FileText, FileJson, Upload, Link2, Sun, Moon, Lock, Unlock, Grid3x3,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyEnd,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
  Workflow, FilePlus, Layers, Keyboard, Crosshair, GitCommitHorizontal,
} from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship } from '../types';
import { BUILTIN_RELATIONSHIPS, EDGE_STYLES, getEdgeStyle } from '../types';
import { runExportPng, runExportPdf, runExportJson } from '../utils/export';
import { copyShareLink } from '../utils/share';
import { showShortcutHelp } from './ShortcutHelp';
import Modal from './ui/Modal';
import Kbd from './ui/Kbd';

export const OPEN_PALETTE_EVENT = 'anodi:open-palette';
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));

interface Command {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  edit?: boolean;
  run: () => void;
}

interface Props {
  onAddNode: () => void;
  onAddGroup: () => void;
  onImportJson: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  observerMode: boolean;
  setObserverMode: (v: boolean) => void;
}

/** Subsequence match with a light score; returns -1 when no match. */
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx - t.length * 0.1;
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    score += found === ti ? 3 : 1;
    ti = found + 1;
  }
  return score;
}

const ic = 14;

export default function CommandPalette({ onAddNode, onAddGroup, onImportJson, theme, toggleTheme, observerMode, setObserverMode }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const { setCenter } = useReactFlow();

  const nodes = useGraphStore((s) => s.nodes);
  const boards = useGraphStore((s) => s.boards);
  const currentBoardId = useGraphStore((s) => s.currentBoardId);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const snapToGrid = useGraphStore((s) => s.snapToGrid);
  const hasSelection = useGraphStore((s) => s.selectedNodeIds.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const st = () => useGraphStore.getState();
    const scope = hasSelection ? 'selected' : 'all';
    const list: Command[] = [
      { id: 'add-node', label: 'Add node', icon: <Plus size={ic} />, shortcut: 'N', edit: true, run: onAddNode },
      { id: 'add-group', label: 'Add group', icon: <Plus size={ic} />, shortcut: 'G', edit: true, run: onAddGroup },
    ];
    BUILTIN_RELATIONSHIPS.forEach((rel, i) =>
      list.push({ id: `edge-${rel}`, label: `Edge type: ${EDGE_STYLES[rel].label}`, icon: <GitCommitHorizontal size={ic} />, shortcut: String(i + 1), edit: true, run: () => st().setActiveEdgeType(rel) }),
    );
    userEdgeTypes.forEach((ut) =>
      list.push({ id: `edge-${ut.id}`, label: `Edge type: ${getEdgeStyle(ut.id as EdgeRelationship, userEdgeTypes).label}`, icon: <GitCommitHorizontal size={ic} />, shortcut: ut.shortcutKey, edit: true, run: () => st().setActiveEdgeType(ut.id as EdgeRelationship) }),
    );
    list.push(
      { id: 'undo', label: 'Undo', icon: <Undo2 size={ic} />, shortcut: '⌘Z', edit: true, run: () => st().undo() },
      { id: 'redo', label: 'Redo', icon: <Redo2 size={ic} />, shortcut: '⌘Y', edit: true, run: () => st().redo() },
      { id: 'png', label: 'Export as PNG', icon: <ImageIcon size={ic} />, run: () => void runExportPng(false) },
      { id: 'pdf', label: 'Export as PDF', icon: <FileText size={ic} />, run: () => void runExportPdf() },
      { id: 'json', label: 'Export as JSON', icon: <FileJson size={ic} />, run: () => void runExportJson() },
      { id: 'import', label: 'Import from JSON', icon: <Upload size={ic} />, edit: true, run: onImportJson },
      { id: 'share', label: 'Copy share link', icon: <Link2 size={ic} />, run: () => void copyShareLink() },
      { id: 'theme', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? <Sun size={ic} /> : <Moon size={ic} />, run: toggleTheme },
      { id: 'lock', label: observerMode ? 'Unlock board' : 'Lock board', icon: observerMode ? <Unlock size={ic} /> : <Lock size={ic} />, run: () => setObserverMode(!observerMode) },
      { id: 'snap', label: snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid', icon: <Grid3x3 size={ic} />, edit: true, run: () => st().setSnapToGrid(!snapToGrid) },
    );
    const aligns: [Parameters<ReturnType<typeof st>['alignSelected']>[0], string, ReactNode][] = [
      ['left', 'left', <AlignHorizontalJustifyStart size={ic} />],
      ['right', 'right', <AlignHorizontalJustifyEnd size={ic} />],
      ['top', 'top', <AlignVerticalJustifyStart size={ic} />],
      ['bottom', 'bottom', <AlignVerticalJustifyEnd size={ic} />],
      ['centerX', 'center horizontally', <AlignHorizontalJustifyCenter size={ic} />],
      ['centerY', 'center vertically', <AlignVerticalJustifyCenter size={ic} />],
    ];
    aligns.forEach(([mode, label, icon]) =>
      list.push({ id: `align-${mode}`, label: `Align ${label}`, icon, edit: true, run: () => st().alignSelected(mode) }),
    );
    list.push(
      { id: 'dist-x', label: 'Distribute horizontally', icon: <AlignHorizontalSpaceAround size={ic} />, edit: true, run: () => st().distributeSelected('x') },
      { id: 'dist-y', label: 'Distribute vertically', icon: <AlignVerticalSpaceAround size={ic} />, edit: true, run: () => st().distributeSelected('y') },
      { id: 'layout-lr', label: `Auto layout left-to-right (${scope})`, icon: <Workflow size={ic} />, edit: true, run: () => st().autoLayout('LR', hasSelection) },
      { id: 'layout-tb', label: `Auto layout top-to-bottom (${scope})`, icon: <Workflow size={ic} />, edit: true, run: () => st().autoLayout('TB', hasSelection) },
      { id: 'new-board', label: 'New board', icon: <FilePlus size={ic} />, run: () => st().createBoard() },
    );
    boards.filter((b) => b.id !== currentBoardId).forEach((b) =>
      list.push({ id: `board-${b.id}`, label: `Switch to board: ${b.name}`, icon: <Layers size={ic} />, run: () => st().switchBoard(b.id) }),
    );
    list.push({ id: 'shortcuts', label: 'Show keyboard shortcuts', icon: <Keyboard size={ic} />, shortcut: '?', run: showShortcutHelp });
    nodes.filter((n) => n.data.kind !== 'group').forEach((n) => {
      const name = (n.data as { name?: string }).name ?? n.id;
      list.push({
        id: `goto-${n.id}`,
        label: `Go to node: ${name}`,
        icon: <Crosshair size={ic} />,
        run: () => {
          setCenter(n.position.x + 100, n.position.y + 80, { zoom: 1.2, duration: 500 });
          st().selectNode(n.id);
        },
      });
    });
    return list;
  }, [onAddNode, onAddGroup, onImportJson, theme, toggleTheme, observerMode, setObserverMode, snapToGrid, hasSelection, userEdgeTypes, boards, currentBoardId, nodes, setCenter]);

  const results = useMemo(() => {
    const avail = commands.filter((c) => !(observerMode && c.edit));
    if (!query.trim()) return avail.filter((c) => !c.id.startsWith('goto-')).concat(avail.filter((c) => c.id.startsWith('goto-'))).slice(0, 50);
    return avail
      .map((c) => ({ c, s: fuzzyScore(query.trim(), c.label) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((x) => x.c);
  }, [commands, query, observerMode]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const close = () => setOpen(false);
  const runCmd = (c: Command | undefined) => {
    if (!c) return;
    close();
    // Defer so the palette unmounts before commands open other modals.
    setTimeout(c.run, 0);
  };

  return (
    <Modal onClose={close} className="w-[36rem]" top>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            runCmd(results[active]);
          } else if (e.key === 'Escape') {
            close();
          }
        }}
        placeholder="Type a command or node name…"
        className="w-full rounded-t-xl border-b border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:border-gray-700 dark:text-white"
      />
      <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No matching commands</li>}
        {results.map((c, i) => (
          <li key={c.id}>
            <button
              data-idx={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => runCmd(c)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${i === active ? 'bg-indigo-50 text-gray-900 dark:bg-indigo-900/30 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <span className="shrink-0 text-gray-400">{c.icon}</span>
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

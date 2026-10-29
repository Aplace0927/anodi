import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Plus, Search, ChevronDown, Download, Image, FileText, FileJson, Upload, Sun, Moon, Undo2, Redo2, Trash2, Settings, Lock, Unlock, Menu, X, Link2, Copy, Crop, Layers, Check, Loader2, AlertCircle, Command } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship, UserEdgeType } from '../types';
import { EDGE_STYLES, BUILTIN_RELATIONSHIPS, BUILTIN_EDGE_SHORTCUT, MAX_USER_EDGE_TYPES, USER_EDGE_SHORTCUT_KEYS, getEdgeStyle } from '../types';
import AddNodeDialog from './dialogs/AddNodeDialog';
import AddGroupDialog from './dialogs/AddGroupDialog';
import AddEdgeTypeDialog from './dialogs/AddEdgeTypeDialog';
import { runExportPng, runExportPdf, runExportJson, runCopyImage, runImportJson } from '../utils/export';
import { copyShareLink } from '../utils/share';
import { useSearchStore } from '../store/searchStore';
import Dropdown from './ui/Dropdown';
import { MenuItem, MenuSeparator } from './ui/MenuItem';
import EdgeSwatch from './ui/EdgeSwatch';
import Kbd from './ui/Kbd';
import CommandPalette, { openCommandPalette } from './CommandPalette';
import ShortcutHelp from './ShortcutHelp';
import BoardsSidebar from './BoardsSidebar';

interface ToolbarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  showAddNode: boolean;
  setShowAddNode: (v: boolean) => void;
  showAddGroup: boolean;
  setShowAddGroup: (v: boolean) => void;
  getViewportCenter?: () => { x: number; y: number };
  observerMode: boolean;
  setObserverMode: (v: boolean) => void;
}

export default function Toolbar({ theme, toggleTheme, showAddNode, setShowAddNode, showAddGroup, setShowAddGroup, getViewportCenter, observerMode, setObserverMode }: ToolbarProps) {
  const [showAddEdgeType, setShowAddEdgeType] = useState(false);
  const [editingEdgeType, setEditingEdgeType] = useState<UserEdgeType | undefined>(undefined);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [showBoards, setShowBoards] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  // Detect narrow viewport
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsCompact(e.matches);
    handler(mq);
    mq.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => mq.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  const activeEdgeType = useGraphStore((s) => s.activeEdgeType);
  const setActiveEdgeType = useGraphStore((s) => s.setActiveEdgeType);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const removeUserEdgeType = useGraphStore((s) => s.removeUserEdgeType);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const boards = useGraphStore((s) => s.boards);
  const currentBoardId = useGraphStore((s) => s.currentBoardId);
  const saveStatus = useGraphStore((s) => s.saveStatus);
  const hasSelection = useGraphStore((s) => s.selectedNodeIds.length > 0);
  const regexMode = useSearchStore((s) => s.regex);
  const past = useGraphStore((s) => s.past);
  const future = useGraphStore((s) => s.future);

  const activeStyle = getEdgeStyle(activeEdgeType, userEdgeTypes);

  const sortedUserEdgeTypes = [...userEdgeTypes].sort((a, b) => {
    const keys = USER_EDGE_SHORTCUT_KEYS as readonly string[];
    const idxA = keys.indexOf(a.shortcutKey);
    const idxB = keys.indexOf(b.shortcutKey);
    return (idxA === -1 ? keys.length : idxA) - (idxB === -1 ? keys.length : idxB);
  });

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runImportJson(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  const seamlessBtn =
    'flex items-center justify-center rounded-lg p-1.5 text-gray-600 transition-colors duration-150 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700/70';
  const seamlessBtnDisabled = 'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent';

  const boardName = boards.find((b) => b.id === currentBoardId)?.name ?? 'Untitled board';

  // "/" or Cmd/Ctrl+F focuses the search input.
  useEffect(() => {
    const focusSearch = () => {
      const desktop = searchInputRef.current;
      if (desktop && desktop.offsetParent !== null) {
        desktop.focus();
        desktop.select();
      } else {
        setShowMobileSearch(true);
        requestAnimationFrame(() => mobileSearchRef.current?.focus());
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchQuery('');
      (e.target as HTMLInputElement).blur();
    }
  };

  const openAddNode = useCallback(() => setShowAddNode(true), [setShowAddNode]);
  const openAddGroup = useCallback(() => setShowAddGroup(true), [setShowAddGroup]);
  const openImport = useCallback(() => fileInputRef.current?.click(), []);

  type Item = { key: string; icon: ReactNode; label: string; shortcut?: string; disabled?: boolean; onClick: () => void } | 'sep';
  const exportItems: Item[] = [
    { key: 'png', icon: <Image size={14} />, label: 'Export as PNG', onClick: () => void runExportPng(false) },
    { key: 'png-sel', icon: <Crop size={14} />, label: 'Export selection as PNG', disabled: !hasSelection, onClick: () => void runExportPng(true) },
    { key: 'copy-img', icon: <Copy size={14} />, label: 'Copy image to clipboard', onClick: () => void runCopyImage() },
    { key: 'pdf', icon: <FileText size={14} />, label: 'Export as PDF', onClick: () => void runExportPdf() },
    { key: 'json', icon: <FileJson size={14} />, label: 'Export as JSON', onClick: () => void runExportJson() },
    'sep',
    { key: 'share', icon: <Link2 size={14} />, label: 'Copy share link', onClick: () => void copyShareLink() },
    'sep',
    { key: 'import', icon: <Upload size={14} />, label: 'Import from JSON', disabled: observerMode, onClick: openImport },
  ];
  const renderItems = (items: Item[], close: () => void) =>
    items.map((it, i) =>
      it === 'sep' ? (
        <MenuSeparator key={`sep-${i}`} />
      ) : (
        <MenuItem key={it.key} icon={it.icon} label={it.label} shortcut={it.shortcut} disabled={it.disabled} onClick={() => { close(); it.onClick(); }} />
      ),
    );

  const searchInputClass =
    'w-full rounded-lg border border-gray-300 bg-gray-100 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500';

  const saveIndicator = (
    <span className="hidden items-center sm:flex" aria-live="polite">
      {saveStatus === 'saved' && <Check size={13} className="text-gray-400 dark:text-gray-500" aria-label="Saved" />}
      {saveStatus === 'saving' && <Loader2 size={13} className="animate-spin text-gray-400" aria-label="Saving" />}
      {saveStatus === 'error' && <AlertCircle size={14} className="text-red-500" aria-label="Storage full — export JSON"><title>Storage full — export JSON</title></AlertCircle>}
    </span>
  );

  const edgeRow = 'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700';

  return (
    <>
      <div className="absolute left-0 right-0 top-0 z-20 flex h-12 items-center border-b border-gray-300 bg-white px-2 sm:px-4 dark:border-gray-700 dark:bg-gray-900">
        {/* ── Left group ── */}
        <div className="flex items-center gap-1 sm:gap-2">
          <a href="https://beyond-the-line-a.place" className="mr-1 text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:opacity-80 transition-opacity">
            <img src={theme === 'dark' ? '/dark.svg' : '/light.svg'} alt="Anodi" className="inline-block h-5 w-5 mr-1 -mt-0.5" />
          </a>

          {/* Board name + save status */}
          <button onClick={() => setShowBoards(true)} className={`${seamlessBtn} gap-1.5 px-2`} title="Boards">
            <Layers size={15} />
            <span className="hidden max-w-[9rem] truncate text-sm lg:inline">{boardName}</span>
          </button>
          {saveIndicator}

          {/* Add node / group */}
          {!observerMode && (
            <Dropdown
              trigger={({ toggle }) => (
                <button
                  onClick={toggle}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2 sm:px-3 py-1.5 text-sm font-bold text-white shadow hover:bg-indigo-700 active:scale-95 transition-all"
                  title="Add Node (N) / Group (G)"
                >
                  <Plus size={15} />
                  {!isCompact && <span>Add</span>}
                  <ChevronDown size={14} className="text-white/70" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={<Plus size={14} />} label="Add Node" shortcut="N" onClick={() => { close(); setShowAddNode(true); }} />
                  <MenuItem icon={<Plus size={14} />} label="Add Group" shortcut="G" onClick={() => { close(); setShowAddGroup(true); }} />
                </>
              )}
            </Dropdown>
          )}

          {/* Edge type selector */}
          {!observerMode && (
            <Dropdown
              widthClass="w-56"
              trigger={({ toggle }) => (
                <button onClick={toggle} className={`${seamlessBtn} gap-2 px-2 sm:px-2.5`} title="Edge type">
                  <EdgeSwatch color={activeStyle.color} dash={activeStyle.strokeDasharray} />
                  {!isCompact && <span className="whitespace-nowrap text-sm">{activeStyle.label}</span>}
                  <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
                </button>
              )}
            >
              {(close) => (
                <>
                  {BUILTIN_RELATIONSHIPS.map((rel) => {
                    const s = EDGE_STYLES[rel];
                    return (
                      <MenuItem
                        key={rel}
                        icon={<EdgeSwatch color={s.color} dash={s.strokeDasharray} />}
                        label={s.label}
                        shortcut={BUILTIN_EDGE_SHORTCUT[rel]}
                        active={rel === activeEdgeType}
                        onClick={() => { setActiveEdgeType(rel); close(); }}
                      />
                    );
                  })}

                  {sortedUserEdgeTypes.length > 0 && <MenuSeparator />}
                  {sortedUserEdgeTypes.map((ut) => (
                    <div
                      key={ut.id}
                      className={`group ${edgeRow} ${ut.id === activeEdgeType ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2"
                        onClick={() => { setActiveEdgeType(ut.id as EdgeRelationship); close(); }}
                      >
                        <EdgeSwatch color={ut.color} dash={ut.strokeDasharray} />
                        <span className="truncate">{ut.label}</span>
                        <span className="ml-auto shrink-0"><Kbd>{ut.shortcutKey}</Kbd></span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); close(); setEditingEdgeType(ut); setShowAddEdgeType(true); }}
                        className="text-gray-400 opacity-0 transition-opacity hover:text-indigo-500 group-hover:opacity-100"
                        title="Edit edge type"
                      >
                        <Settings size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeUserEdgeType(ut.id); }}
                        className="text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                        title="Remove edge type"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}

                  <MenuSeparator />
                  <button
                    onClick={() => { close(); setEditingEdgeType(undefined); setShowAddEdgeType(true); }}
                    disabled={userEdgeTypes.length >= MAX_USER_EDGE_TYPES}
                    className={`${edgeRow} text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-indigo-400`}
                  >
                    <Plus size={14} />
                    Add edge type…
                  </button>
                </>
              )}
            </Dropdown>
          )}

          {/* Undo / Redo */}
          {!observerMode && (
            <div className="flex items-center gap-0.5">
              <button onClick={undo} disabled={past.length === 0} className={`${seamlessBtn} ${seamlessBtnDisabled}`} title="Undo (Ctrl+Z)">
                <Undo2 size={16} />
              </button>
              <button onClick={redo} disabled={future.length === 0} className={`${seamlessBtn} ${seamlessBtnDisabled}`} title="Redo (Ctrl+Y)">
                <Redo2 size={16} />
              </button>
            </div>
          )}
        </div>

        {/* ── Center group ── */}
        <div className="hidden sm:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative flex w-56 items-center">
            <Search size={14} className="absolute left-2.5 text-gray-400" />
            <input
              ref={searchInputRef}
              data-anodi-search
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={regexMode ? 'Search (regex)…' : 'Search nodes…  /'}
              className={searchInputClass}
            />
          </div>
        </div>

        {/* ── Right group (desktop) ── */}
        <div className="ml-auto hidden sm:flex items-center gap-1">
          <button onClick={openCommandPalette} className={`${seamlessBtn} gap-1.5 px-2`} title="Command palette (Ctrl+K)">
            <Command size={15} />
          </button>

          <Dropdown
            align="right"
            widthClass="w-56"
            trigger={({ toggle }) => (
              <button onClick={toggle} className={`${seamlessBtn} gap-1.5 px-2.5`}>
                <Download size={15} />
                <span className="text-sm">Export</span>
                <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
              </button>
            )}
          >
            {(close) => renderItems(exportItems, close)}
          </Dropdown>

          <button
            onClick={() => setObserverMode(!observerMode)}
            className={`${seamlessBtn} ${observerMode ? 'text-amber-500 dark:text-amber-400' : ''}`}
            title={observerMode ? 'Unlock board' : 'Lock board'}
          >
            {observerMode ? <Lock size={16} /> : <Unlock size={16} />}
          </button>

          <button onClick={toggleTheme} className={seamlessBtn} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* ── Right group (mobile) ── */}
        <div className="ml-auto flex sm:hidden items-center gap-1">
          <button onClick={() => setShowMobileSearch((v) => !v)} className={seamlessBtn} title="Search">
            <Search size={16} />
          </button>

          <Dropdown
            align="right"
            widthClass="w-56"
            trigger={({ open, toggle }) => (
              <button onClick={toggle} className={seamlessBtn} title="Menu">
                {open ? <X size={16} /> : <Menu size={16} />}
              </button>
            )}
          >
            {(close) => (
              <>
                {renderItems(exportItems, close)}
                <MenuSeparator />
                <MenuItem
                  icon={observerMode ? <Lock size={14} /> : <Unlock size={14} />}
                  label={observerMode ? 'Unlock board' : 'Lock board'}
                  onClick={() => { close(); setObserverMode(!observerMode); }}
                />
                <MenuItem
                  icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  onClick={() => { close(); toggleTheme(); }}
                />
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* ── Mobile search bar ── */}
      {showMobileSearch && (
        <div className="sm:hidden absolute left-0 right-0 top-12 z-20 border-b border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-gray-400" />
            <input
              ref={mobileSearchRef}
              data-anodi-search
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search nodes…"
              className={searchInputClass}
            />
          </div>
        </div>
      )}

      {/* Hidden file input for JSON import */}
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />

      {showBoards && <BoardsSidebar onClose={() => setShowBoards(false)} />}
      <CommandPalette
        onAddNode={openAddNode}
        onAddGroup={openAddGroup}
        onImportJson={openImport}
        theme={theme}
        toggleTheme={toggleTheme}
        observerMode={observerMode}
        setObserverMode={setObserverMode}
      />
      <ShortcutHelp />

      {showAddNode && <AddNodeDialog onClose={() => setShowAddNode(false)} getViewportCenter={getViewportCenter} />}
      {showAddGroup && <AddGroupDialog onClose={() => setShowAddGroup(false)} getViewportCenter={getViewportCenter} />}
      {showAddEdgeType && (
        <AddEdgeTypeDialog
          editType={editingEdgeType}
          onClose={() => {
            setShowAddEdgeType(false);
            setEditingEdgeType(undefined);
          }}
        />
      )}
    </>
  );
}

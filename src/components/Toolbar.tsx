import { useRef, useState } from 'react';
import { Plus, Search, ChevronDown, Download, Image, FileText, FileJson, Upload, Sun, Moon, Undo2, Redo2, Trash2 } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship } from '../types';
import { EDGE_STYLES, BUILTIN_RELATIONSHIPS, BUILTIN_EDGE_SHORTCUT, MAX_USER_EDGE_TYPES, getEdgeStyle } from '../types';
import AddNodeDialog from './dialogs/AddNodeDialog';
import AddEdgeTypeDialog from './dialogs/AddEdgeTypeDialog';
import { exportToPng, exportToPdf, exportToJson, importFromJson } from '../utils/export';

interface ToolbarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  showAddNode: boolean;
  setShowAddNode: (v: boolean) => void;
  getViewportCenter?: () => { x: number; y: number };
}

export default function Toolbar({ theme, toggleTheme, showAddNode, setShowAddNode, getViewportCenter }: ToolbarProps) {
  const [showEdgeDropdown, setShowEdgeDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showAddEdgeType, setShowAddEdgeType] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeEdgeType = useGraphStore((s) => s.activeEdgeType);
  const setActiveEdgeType = useGraphStore((s) => s.setActiveEdgeType);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const removeUserEdgeType = useGraphStore((s) => s.removeUserEdgeType);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const past = useGraphStore((s) => s.past);
  const future = useGraphStore((s) => s.future);

  const activeStyle = getEdgeStyle(activeEdgeType, userEdgeTypes);

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importFromJson(file);
    } catch (err) {
      console.error('Failed to import JSON:', err);
    }
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  const seamlessBtn =
    'flex items-center justify-center rounded-lg p-1.5 text-gray-600 transition-colors duration-150 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700/70';
  const seamlessBtnDisabled = 'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent';

  return (
    <>
      <div className="absolute left-0 right-0 top-0 z-20 flex h-12 items-center border-b border-gray-300 bg-white px-4 dark:border-gray-700 dark:bg-gray-900">
        {/* ── Left group ── */}
        <div className="flex items-center gap-2">
          {/* Branding */}
          <span className="mr-1 text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
            an<span className="text-indigo-500 dark:text-indigo-400">odi</span>
          </span>

          {/* Add node – emphasized */}
          <button
            onClick={() => setShowAddNode(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:scale-95 transition-all"
            title="Add Node (N)"
          >
            <Plus size={15} />
            Add Node
          </button>

          {/* Edge type selector – emphasized with active edge color */}
          <div className="relative">
            <button
              onClick={() => setShowEdgeDropdown((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow transition-all active:scale-95"
              style={{ backgroundColor: activeStyle.color }}
            >
              <span
                className="inline-block h-2.5 w-5 rounded-sm border border-white/30"
                style={{ backgroundColor: activeStyle.color }}
              />
              <span>{activeStyle.label}</span>
              <ChevronDown size={14} className="text-white/70" />
            </button>

            {showEdgeDropdown && (
              <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                {/* Built-in types */}
                {BUILTIN_RELATIONSHIPS.map((rel) => {
                  const s = EDGE_STYLES[rel];
                  return (
                    <button
                      key={rel}
                      onClick={() => {
                        setActiveEdgeType(rel);
                        setShowEdgeDropdown(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        rel === activeEdgeType ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <span
                        className="inline-block h-2 w-5 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                      <span className="ml-auto text-[10px] text-gray-400">{BUILTIN_EDGE_SHORTCUT[rel]}</span>
                    </button>
                  );
                })}

                {/* User-defined types */}
                {userEdgeTypes.length > 0 && (
                  <>
                    <hr className="border-gray-200 dark:border-gray-700" />
                    {userEdgeTypes.map((ut) => (
                      <div
                        key={ut.id}
                        className={`group flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          ut.id === activeEdgeType ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        <button
                          className="flex flex-1 items-center gap-2"
                          onClick={() => {
                            setActiveEdgeType(ut.id as EdgeRelationship);
                            setShowEdgeDropdown(false);
                          }}
                        >
                          <span
                            className="inline-block h-2 w-5 rounded-sm"
                            style={{ backgroundColor: ut.color }}
                          />
                          {ut.label}
                          <span className="ml-auto text-[10px] text-gray-400">{ut.shortcutKey}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeUserEdgeType(ut.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                          title="Remove edge type"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* Add edge type button */}
                <hr className="border-gray-200 dark:border-gray-700" />
                <button
                  onClick={() => {
                    setShowEdgeDropdown(false);
                    setShowAddEdgeType(true);
                  }}
                  disabled={userEdgeTypes.length >= MAX_USER_EDGE_TYPES}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-indigo-400 dark:hover:bg-gray-700"
                >
                  <Plus size={14} />
                  Add edge type…
                </button>
              </div>
            )}
          </div>

          {/* Undo / Redo – seamless */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={undo}
              disabled={past.length === 0}
              className={`${seamlessBtn} ${seamlessBtnDisabled}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              className={`${seamlessBtn} ${seamlessBtnDisabled}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
          </div>
        </div>

        {/* ── Center group ── */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes…"
              className="w-56 rounded-lg border border-gray-300 bg-gray-100 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
        </div>

        {/* ── Right group ── */}
        <div className="ml-auto flex items-center gap-1">
          {/* Export – seamless */}
          <div className="relative">
            <button
              onClick={() => setShowExportDropdown((v) => !v)}
              className={`${seamlessBtn} gap-1.5 px-2.5`}
            >
              <Download size={15} />
              <span className="text-sm">Export</span>
              <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
            </button>

            {showExportDropdown && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <button
                  onClick={() => {
                    setShowExportDropdown(false);
                    exportToPng();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <Image size={14} />
                  Export as PNG
                </button>
                <button
                  onClick={() => {
                    setShowExportDropdown(false);
                    exportToPdf();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <FileText size={14} />
                  Export as PDF
                </button>
                <button
                  onClick={() => {
                    setShowExportDropdown(false);
                    exportToJson();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <FileJson size={14} />
                  Export as JSON
                </button>
                <hr className="border-gray-200 dark:border-gray-700" />
                <button
                  onClick={() => {
                    setShowExportDropdown(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <Upload size={14} />
                  Import from JSON
                </button>
              </div>
            )}
          </div>

          {/* Theme toggle – seamless */}
          <button
            onClick={toggleTheme}
            className={seamlessBtn}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Hidden file input for JSON import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportJson}
      />

      {showAddNode && <AddNodeDialog onClose={() => setShowAddNode(false)} getViewportCenter={getViewportCenter} />}
      {showAddEdgeType && <AddEdgeTypeDialog onClose={() => setShowAddEdgeType(false)} />}
    </>
  );
}

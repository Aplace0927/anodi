import { useRef, useState } from 'react';
import { Plus, Search, ChevronDown, Download, Image, FileText, FileJson, Upload, Sun, Moon } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship } from '../types';
import { EDGE_STYLES } from '../types';
import AddNodeDialog from './dialogs/AddNodeDialog';
import { exportToPng, exportToPdf, exportToJson, importFromJson } from '../utils/export';

const RELATIONSHIPS: EdgeRelationship[] = ['call', 'reference', 'information'];

interface ToolbarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function Toolbar({ theme, toggleTheme }: ToolbarProps) {
  const [showAddNode, setShowAddNode] = useState(false);
  const [showEdgeDropdown, setShowEdgeDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeEdgeType = useGraphStore((s) => s.activeEdgeType);
  const setActiveEdgeType = useGraphStore((s) => s.setActiveEdgeType);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);

  const activeStyle = EDGE_STYLES[activeEdgeType];

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

  return (
    <>
      <div className="absolute left-0 right-0 top-0 z-20 flex h-12 items-center gap-3 border-b border-gray-300 bg-white px-4 shadow-md dark:border-gray-700 dark:bg-gray-900">
        {/* Branding */}
        <span className="mr-2 text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
          an<span className="text-indigo-500 dark:text-indigo-400">odi</span>
        </span>

        {/* Add node */}
        <button
          onClick={() => setShowAddNode(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:scale-95 transition-all"
        >
          <Plus size={15} />
          Add Node
        </button>

        {/* Edge type selector */}
        <div className="relative">
          <button
            onClick={() => setShowEdgeDropdown((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
          >
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ backgroundColor: activeStyle.color }}
            />
            <span>{activeStyle.label}</span>
            <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" />
          </button>

          {showEdgeDropdown && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
              {RELATIONSHIPS.map((rel) => {
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
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="relative">
          <button
            onClick={() => setShowExportDropdown((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
          >
            <Download size={14} />
            <span>Export</span>
            <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" />
          </button>

          {showExportDropdown && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
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

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center rounded-lg border border-gray-300 bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Search */}
        <div className="relative ml-auto flex items-center">
          <Search size={14} className="absolute left-2.5 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-56 rounded-lg border border-gray-300 bg-gray-100 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
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

      {showAddNode && <AddNodeDialog onClose={() => setShowAddNode(false)} />}
    </>
  );
}

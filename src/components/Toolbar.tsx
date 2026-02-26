import { useState } from 'react';
import { Plus, Search, ChevronDown, FileDown } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship } from '../types';
import { EDGE_STYLES } from '../types';
import AddNodeDialog from './dialogs/AddNodeDialog';
import { exportToPdf } from '../utils/exportToPdf';

const RELATIONSHIPS: EdgeRelationship[] = ['call', 'reference', 'sharedVariable'];

export default function Toolbar() {
  const [showAddNode, setShowAddNode] = useState(false);
  const [showEdgeDropdown, setShowEdgeDropdown] = useState(false);

  const activeEdgeType = useGraphStore((s) => s.activeEdgeType);
  const setActiveEdgeType = useGraphStore((s) => s.setActiveEdgeType);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);

  const activeStyle = EDGE_STYLES[activeEdgeType];

  return (
    <>
      <div className="absolute left-0 right-0 top-0 z-20 flex h-12 items-center gap-3 border-b border-gray-700 bg-gray-900 px-4 shadow-md">
        {/* Branding */}
        <span className="mr-2 text-lg font-extrabold tracking-tight text-white">
          an<span className="text-indigo-400">odi</span>
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
            className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
          >
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ backgroundColor: activeStyle.color }}
            />
            <span>{activeStyle.label}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {showEdgeDropdown && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
              {RELATIONSHIPS.map((rel) => {
                const s = EDGE_STYLES[rel];
                return (
                  <button
                    key={rel}
                    onClick={() => {
                      setActiveEdgeType(rel);
                      setShowEdgeDropdown(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-700 ${
                      rel === activeEdgeType ? 'text-white' : 'text-gray-300'
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

        {/* Export PDF */}
        <button
          onClick={() => exportToPdf()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 active:scale-95 transition-all"
        >
          <FileDown size={15} />
          Export PDF
        </button>

        {/* Search */}
        <div className="relative ml-auto flex items-center">
          <Search size={14} className="absolute left-2.5 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-56 rounded-lg border border-gray-600 bg-gray-800 py-1.5 pl-8 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {showAddNode && <AddNodeDialog onClose={() => setShowAddNode(false)} />}
    </>
  );
}

import { useCallback, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import type { NodeMouseHandler, EdgeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from './store/graphStore';
import SourceCodeNode from './components/nodes/SourceCodeNode';
import ClassDiagramNode from './components/nodes/ClassDiagramNode';
import MemoryLayoutNode from './components/nodes/MemoryLayoutNode';
import NotepadNode from './components/nodes/NotepadNode';
import CustomEdge from './components/edges/CustomEdge';
import Toolbar from './components/Toolbar';
import DetailPanel from './components/panels/DetailPanel';
import EdgeDetailPanel from './components/panels/EdgeDetailPanel';
import SearchPanel from './components/panels/SearchPanel';
import { searchNodes } from './utils/search';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import type { AnodiNode, AnodiEdge } from './types';
import { getEdgeStyle } from './types';

const nodeTypes = {
  source: SourceCodeNode,
  class: ClassDiagramNode,
  memory: MemoryLayoutNode,
  notepad: NotepadNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

function AppInner() {
  const { theme, toggleTheme } = useTheme();
  const [showAddNode, setShowAddNode] = useState(false);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  // Expose a helper to get the viewport center in flow coordinates
  const getViewportCenter = useCallback(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return { x: 300, y: 300 };
    const rect = wrapper.getBoundingClientRect();
    return reactFlowInstance.screenToFlowPosition({
      x: rect.width / 2,
      y: rect.height / 2,
    });
  }, [reactFlowInstance]);

  // Compute search-matched node IDs
  const matchedIds = useMemo(() => {
    if (!searchQuery) return new Set<string>();
    return new Set(searchNodes(nodes, searchQuery).map((m) => m.nodeId));
  }, [nodes, searchQuery]);

  // Compute neighbor node IDs for selected node
  const neighborIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const neighbors = new Set<string>();
    edges.forEach((e) => {
      if (e.source === selectedNodeId) neighbors.add(e.target);
      if (e.target === selectedNodeId) neighbors.add(e.source);
    });
    return neighbors;
  }, [selectedNodeId, edges]);

  // Annotate nodes with selected/highlighted state
  const styledNodes = useMemo((): AnodiNode[] => {
    return nodes.map((n) => {
      const isSelected = n.id === selectedNodeId;
      const isNeighbor = neighborIds.has(n.id);
      const isMatch = matchedIds.has(n.id);

      let opacity = 1;
      if (selectedNodeId && !isSelected && !isNeighbor) opacity = 0.35;
      if (searchQuery && !isMatch) opacity = 0.3;

      return {
        ...n,
        selected: isSelected,
        style: {
          ...n.style,
          opacity,
          outline: isMatch && searchQuery ? '2px solid #f59e0b' : undefined,
          borderRadius: 12,
        },
      };
    });
  }, [nodes, selectedNodeId, neighborIds, matchedIds, searchQuery]);

  // Annotate edges with highlight state and arrow markers
  const styledEdges = useMemo((): AnodiEdge[] => {
    return edges.map((e) => {
      const isConnectedToSelected =
        e.source === selectedNodeId || e.target === selectedNodeId;
      return {
        ...e,
        animated: isConnectedToSelected,
        selected: e.id === selectedEdgeId,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: getEdgeStyle(e.data?.relationship ?? 'call', userEdgeTypes).color,
        },
        style: {
          opacity: e.id === selectedEdgeId
            ? 1
            : selectedNodeId && !isConnectedToSelected
              ? 0.2
              : 0.6,
        },
      };
    });
  }, [edges, selectedNodeId, selectedEdgeId, userEdgeTypes]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      selectEdge(edge.id);
    },
    [selectEdge]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  useKeyboardShortcuts({
    onOpenAddNode: useCallback(() => setShowAddNode(true), []),
  });

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <Toolbar theme={theme} toggleTheme={toggleTheme} showAddNode={showAddNode} setShowAddNode={setShowAddNode} getViewportCenter={getViewportCenter} />

      <div className="relative flex flex-1 overflow-hidden" style={{ marginTop: 48 }}>
        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow<AnodiNode, AnodiEdge>
            nodes={styledNodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={4}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={theme === 'dark' ? '#374151' : '#d1d5db'} />
            <Controls className={theme === 'dark' ? '!border-gray-700 !bg-gray-800 !text-white' : '!border-gray-300 !bg-white !text-gray-700'} />
            <MiniMap
              className={theme === 'dark' ? '!border-gray-700 !bg-gray-800' : '!border-gray-300 !bg-gray-100'}
              nodeColor={(n) => {
                const d = n.data as { kind?: string; nodeColor?: string };
                if (d.nodeColor) return d.nodeColor;
                if (d.kind === 'source') return '#6366f1';
                if (d.kind === 'class') return '#a855f7';
                if (d.kind === 'notepad') return '#f59e0b';
                return '#f97316';
              }}
            />
          </ReactFlow>
        </div>

        {/* Search results */}
        <SearchPanel />

        {/* Detail panel */}
        {selectedNodeId && <DetailPanel />}
        {selectedEdgeId && <EdgeDetailPanel />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}

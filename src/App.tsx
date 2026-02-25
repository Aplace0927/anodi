import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react';
import type { NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from './store/graphStore';
import SourceCodeNode from './components/nodes/SourceCodeNode';
import ClassDiagramNode from './components/nodes/ClassDiagramNode';
import MemoryLayoutNode from './components/nodes/MemoryLayoutNode';
import CustomEdge from './components/edges/CustomEdge';
import Toolbar from './components/Toolbar';
import DetailPanel from './components/panels/DetailPanel';
import SearchPanel from './components/panels/SearchPanel';
import { searchNodes } from './utils/search';
import { useTheme } from './hooks/useTheme';
import type { AnodiNode, AnodiEdge } from './types';

const nodeTypes = {
  source: SourceCodeNode,
  class: ClassDiagramNode,
  memory: MemoryLayoutNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const selectNode = useGraphStore((s) => s.selectNode);

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

  // Annotate edges with highlight state
  const styledEdges = useMemo((): AnodiEdge[] => {
    return edges.map((e) => {
      const isConnectedToSelected =
        e.source === selectedNodeId || e.target === selectedNodeId;
      return {
        ...e,
        animated: isConnectedToSelected,
        style: {
          opacity: selectedNodeId && !isConnectedToSelected ? 0.2 : 1,
        },
      };
    });
  }, [edges, selectedNodeId]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <Toolbar theme={theme} toggleTheme={toggleTheme} />

      <div className="relative flex flex-1 overflow-hidden" style={{ marginTop: 48 }}>
        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow<AnodiNode, AnodiEdge>
            nodes={styledNodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
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
                const d = n.data as { kind?: string };
                if (d.kind === 'source') return '#6366f1';
                if (d.kind === 'class') return '#a855f7';
                return '#f97316';
              }}
            />
          </ReactFlow>
        </div>

        {/* Search results */}
        <SearchPanel />

        {/* Detail panel */}
        {selectedNodeId && <DetailPanel />}
      </div>
    </div>
  );
}

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
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
import type { NodeMouseHandler, EdgeMouseHandler, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from './store/graphStore';
import SourceCodeNode from './components/nodes/SourceCodeNode';
import ClassDiagramNode from './components/nodes/ClassDiagramNode';
import MemoryLayoutNode from './components/nodes/MemoryLayoutNode';
import NotepadNode from './components/nodes/NotepadNode';
import GroupNode from './components/nodes/GroupNode';
import CustomEdge from './components/edges/CustomEdge';
import Toolbar from './components/Toolbar';
import DetailPanel from './components/panels/DetailPanel';
import GroupDetailPanel from './components/panels/GroupDetailPanel';
import EdgeDetailPanel from './components/panels/EdgeDetailPanel';
import SearchPanel from './components/panels/SearchPanel';
import { searchNodes } from './utils/search';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import type { AnodiNode, AnodiEdge, GroupData, NodeData } from './types';
import { getEdgeStyle, GROUP_LONG_PRESS_MS } from './types';

const nodeTypes = {
  source: SourceCodeNode,
  class: ClassDiagramNode,
  memory: MemoryLayoutNode,
  notepad: NotepadNode,
  group: GroupNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

function AppInner() {
  const { theme, toggleTheme } = useTheme();
  const [showAddNode, setShowAddNode] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [observerMode, setObserverMode] = useState(false);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const recomputeGroupBounds = useGraphStore((s) => s.recomputeGroupBounds);
  const moveGroupMembers = useGraphStore((s) => s.moveGroupMembers);
  const addNodeToGroup = useGraphStore((s) => s.addNodeToGroup);
  const removeNodeFromGroup = useGraphStore((s) => s.removeNodeFromGroup);
  const groupHoverDelay = useGraphStore((s) => s.groupHoverDelay);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  // ── Group drag tracking ──
  const groupDragStartPos = useRef<{ x: number; y: number } | null>(null);

  // ── Long-press tracking for add/remove node to/from group ──
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressGroupId, setLongPressGroupId] = useState<string | null>(null);
  const [longPressAction, setLongPressAction] = useState<'+' | '-' | null>(null);
  const [longPressDragNodeId, setLongPressDragNodeId] = useState<string | null>(null);

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

  // Compute neighbor node IDs for selected nodes
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const neighborIds = useMemo(() => {
    if (selectedNodeIds.length === 0) return new Set<string>();
    const neighbors = new Set<string>();
    edges.forEach((e) => {
      if (selectedIdSet.has(e.source)) neighbors.add(e.target);
      if (selectedIdSet.has(e.target)) neighbors.add(e.source);
    });
    return neighbors;
  }, [selectedNodeIds, selectedIdSet, edges]);

  // Annotate nodes with selected/highlighted state
  const styledNodes = useMemo((): AnodiNode[] => {
    const hasSelection = selectedNodeIds.length > 0;
    return nodes.map((n) => {
      const isSelected = selectedIdSet.has(n.id);
      const isNeighbor = neighborIds.has(n.id);
      const isMatch = matchedIds.has(n.id);
      const isGroup = n.type === 'group';

      let opacity = 1;
      if (hasSelection && !isSelected && !isNeighbor) opacity = 0.35;
      if (searchQuery && !isMatch) opacity = 0.3;

      // Groups get very low z-index; during long-press, temporarily reorder
      let zIndex: number | undefined;
      if (isGroup) {
        zIndex = -1000;
        // During long-press, the target group should be above other groups
        if (longPressGroupId === n.id) zIndex = -500;
      } else if (longPressDragNodeId === n.id && longPressGroupId) {
        // The dragged node goes to the top during long-press
        zIndex = 2000;
      }

      return {
        ...n,
        selected: isSelected,
        zIndex: zIndex ?? n.zIndex,
        style: {
          ...n.style,
          opacity,
          outline: isMatch && searchQuery ? '2px solid #f59e0b' : undefined,
          borderRadius: isGroup ? 16 : 12,
        },
      };
    });
  }, [nodes, selectedNodeIds, selectedIdSet, neighborIds, matchedIds, searchQuery, longPressGroupId, longPressDragNodeId]);

  // Annotate edges with highlight state and arrow markers
  const styledEdges = useMemo((): AnodiEdge[] => {
    const hasSelection = selectedNodeIds.length > 0;
    return edges.map((e) => {
      const isConnectedToSelected =
        selectedIdSet.has(e.source) || selectedIdSet.has(e.target);
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
            : hasSelection && !isConnectedToSelected
              ? 0.2
              : 0.6,
        },
      };
    });
  }, [edges, selectedNodeIds, selectedIdSet, selectedEdgeId, userEdgeTypes]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      // When shift is held, React Flow handles multi-selection natively
      // via multiSelectionKeyCode="Shift" – don't override it here.
      if (!_event.shiftKey) {
        selectNode(node.id);
      }
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

  // ── Group drag handling ──
  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'group') {
        groupDragStartPos.current = { x: node.position.x, y: node.position.y };
      } else {
        // Non-group node drag: start long-press timer to detect add-to-group
        const dragNodeId = node.id;
        longPressTimer.current = setTimeout(() => {
          // Check if the node is hovering over a group
          const currentNodes = useGraphStore.getState().nodes;
          const dragNode = currentNodes.find((n) => n.id === dragNodeId);
          if (!dragNode) return;

          for (const gn of currentNodes) {
            if (gn.type !== 'group') continue;
            const gd = gn.data as GroupData;
            const gw = gd.computedWidth || 200;
            const gh = gd.computedHeight || 120;
            if (
              dragNode.position.x >= gn.position.x &&
              dragNode.position.x <= gn.position.x + gw &&
              dragNode.position.y >= gn.position.y &&
              dragNode.position.y <= gn.position.y + gh
            ) {
              // Node is over this group
              const alreadyMember = gd.memberNodeIds.includes(dragNodeId);
              setLongPressGroupId(gn.id);
              setLongPressAction(alreadyMember ? '-' : '+');
              setLongPressDragNodeId(dragNodeId);
              return;
            }
          }
        }, groupHoverDelay);
      }
    },
    [groupHoverDelay]
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Clear long-press timer
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      if (node.type === 'group' && groupDragStartPos.current) {
        // Group drag: move all member nodes by the same delta
        const dx = node.position.x - groupDragStartPos.current.x;
        const dy = node.position.y - groupDragStartPos.current.y;
        groupDragStartPos.current = null;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          moveGroupMembers(node.id, dx, dy);
        }
      }

      // Handle long-press add/remove
      if (longPressGroupId && longPressDragNodeId && longPressAction) {
        if (longPressAction === '+') {
          addNodeToGroup(longPressGroupId, longPressDragNodeId);
        } else {
          removeNodeFromGroup(longPressGroupId, longPressDragNodeId);
        }
      }

      // Reset long-press state
      setLongPressGroupId(null);
      setLongPressAction(null);
      setLongPressDragNodeId(null);

      // Recompute group bounds after any drag
      recomputeGroupBounds();
    },
    [moveGroupMembers, recomputeGroupBounds, addNodeToGroup, removeNodeFromGroup, longPressGroupId, longPressDragNodeId, longPressAction]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  useKeyboardShortcuts({
    onOpenAddNode: useCallback(() => setShowAddNode(true), []),
    onOpenAddGroup: useCallback(() => setShowAddGroup(true), []),
    observerMode,
  });

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <Toolbar theme={theme} toggleTheme={toggleTheme} showAddNode={showAddNode} setShowAddNode={setShowAddNode} showAddGroup={showAddGroup} setShowAddGroup={setShowAddGroup} getViewportCenter={getViewportCenter} observerMode={observerMode} setObserverMode={setObserverMode} />

      <div className="relative flex flex-1 overflow-hidden" style={{ marginTop: 48 }}>
        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow<AnodiNode, AnodiEdge>
            nodes={styledNodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={observerMode ? undefined : onNodesChange}
            onEdgesChange={observerMode ? undefined : onEdgesChange}
            onConnect={observerMode ? undefined : onConnect}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onNodeDragStart={observerMode ? undefined : handleNodeDragStart}
            onNodeDragStop={observerMode ? undefined : handleNodeDragStop}
            nodesDraggable={!observerMode}
            nodesConnectable={!observerMode}
            elementsSelectable={!observerMode}
            multiSelectionKeyCode="Shift"
            deleteKeyCode={observerMode ? null : 'Delete'}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={4}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={theme === 'dark' ? '#374151' : '#d1d5db'} />
            <Controls className={theme === 'dark' ? '!border-gray-700 !bg-gray-800 !text-white' : '!border-gray-300 !bg-white !text-gray-700'} onInteractiveChange={(interactive) => setObserverMode(!interactive)} />
            <MiniMap
              className={theme === 'dark' ? '!border-gray-700 !bg-gray-800' : '!border-gray-300 !bg-gray-100'}
              nodeColor={(n) => {
                const d = n.data as { kind?: string; nodeColor?: string; groupColor?: string };
                if (d.kind === 'group') return d.groupColor || '#6366f1';
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
        {selectedNodeIds.length === 1 && (() => {
          const selectedNode = nodes.find((n) => n.id === selectedNodeIds[0]);
          if (selectedNode?.type === 'group') return <GroupDetailPanel />;
          return <DetailPanel />;
        })()}
        {selectedEdgeId && <EdgeDetailPanel />}

        {/* Long-press overlay */}
        {longPressGroupId && longPressAction && longPressDragNodeId && (
          <LongPressOverlay
            groupId={longPressGroupId}
            action={longPressAction}
            nodes={nodes}
          />
        )}
      </div>
    </div>
  );
}

/** Overlay shown on a group during long-press add/remove */
function LongPressOverlay({
  groupId,
  action,
  nodes,
}: {
  groupId: string;
  action: '+' | '-';
  nodes: AnodiNode[];
}) {
  const groupNode = nodes.find((n) => n.id === groupId);
  if (!groupNode) return null;
  const gd = groupNode.data as GroupData;
  const width = gd.computedWidth || 200;
  const height = gd.computedHeight || 120;
  const color = gd.groupColor || '#6366f1';

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1500,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: action === '+' ? '#22c55e' : '#ef4444',
          color: '#fff',
          fontSize: 32,
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {action}
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

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
import type { NodeMouseHandler, EdgeMouseHandler, Node, OnNodeDrag } from '@xyflow/react';
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
import { getEdgeStyle } from './types';

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
  // Track which group is currently being dragged so member nodes can be hidden
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);

  // ── Drag vs click tracking ──
  // React Flow fires onNodeClick even after a drag. We use this ref to
  // prevent the side-panel from opening when the user was actually dragging.
  const isDragging = useRef(false);

  // ── Continuous drag tracking for add/remove node to/from group ──
  // The long-press timer sets `longPressReady` after the configured delay.
  // While ready, every onNodeDrag event checks if the node is over a group
  // and updates the overlay icon accordingly.  On drag stop, if the icon is
  // showing, the add/remove action fires.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressReady = useRef(false);
  const [longPressGroupId, setLongPressGroupId] = useState<string | null>(null);
  const [longPressAction, setLongPressAction] = useState<'+' | '-' | null>(null);
  const [longPressDragNodeId, setLongPressDragNodeId] = useState<string | null>(null);
  // Store last mouse screen position so we can trigger detection when idle
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const lastDragNodeId = useRef<string | null>(null);

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
    // Collect member IDs of the group currently being dragged
    const draggingGroupMemberIds = new Set<string>();
    if (draggingGroupId) {
      const gn = nodes.find((n) => n.id === draggingGroupId);
      if (gn?.type === 'group') {
        const gd = gn.data as GroupData;
        gd.memberNodeIds.forEach((mid) => draggingGroupMemberIds.add(mid));
      }
    }

    return nodes.map((n) => {
      const isSelected = selectedIdSet.has(n.id);
      const isNeighbor = neighborIds.has(n.id);
      const isMatch = matchedIds.has(n.id);
      const isGroup = n.type === 'group';

      let opacity = 1;
      if (hasSelection && !isSelected && !isNeighbor) opacity = 0.35;
      if (searchQuery && !isMatch) opacity = 0.3;
      // Hide member nodes while their group is being dragged
      if (draggingGroupMemberIds.has(n.id)) opacity = 0;

      // Groups get very low z-index; during long-press, temporarily reorder
      let zIndex: number | undefined;
      // Pass long-press action to the target group so it can show border glow
      let dataOverride = n.data;
      if (isGroup) {
        zIndex = -1000;
        // During long-press, the target group should be above other groups
        if (longPressGroupId === n.id) {
          zIndex = -500;
          dataOverride = { ...n.data, longPressAction: longPressAction } as GroupData & { longPressAction?: '+' | '-' | null };
        }
      } else if (longPressDragNodeId === n.id && longPressGroupId) {
        // The dragged node goes to the top during long-press
        zIndex = 2000;
      }

      return {
        ...n,
        data: dataOverride,
        selected: isSelected,
        zIndex: zIndex ?? n.zIndex,
        style: {
          ...n.style,
          opacity,
          // Don't apply outline/borderRadius on group nodes – the GroupNode
          // component handles its own styling; the wrapper must be invisible.
          outline: !isGroup && isMatch && searchQuery ? '2px solid #f59e0b' : undefined,
          borderRadius: isGroup ? undefined : 12,
        },
      };
    });
  }, [nodes, selectedNodeIds, selectedIdSet, neighborIds, matchedIds, searchQuery, longPressGroupId, longPressAction, longPressDragNodeId, draggingGroupId]);

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
      // Ignore clicks that are actually the end of a drag gesture
      if (isDragging.current) return;
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

  // Helper: check if the mouse is hovering over any group and update overlay.
  // Uses screen coordinates (converted to flow coords) instead of the
  // node's top-left corner so the detection feels natural.
  const checkNodeOverGroup = useCallback(
    (dragNodeId: string, screenX: number, screenY: number) => {
      const currentNodes = useGraphStore.getState().nodes;
      const mouseFlowPos = reactFlowInstance.screenToFlowPosition({
        x: screenX,
        y: screenY,
      });

      // Check which group (if any) this node belongs to
      const homeGroup = currentNodes.find(
        (n) => n.type === 'group' && (n.data as GroupData).memberNodeIds.includes(dragNodeId)
      );

      for (const gn of currentNodes) {
        if (gn.type !== 'group') continue;
        const gd = gn.data as GroupData;
        const gw = gd.computedWidth || 200;
        const gh = gd.computedHeight || 120;
        const isOverGroup =
          mouseFlowPos.x >= gn.position.x &&
          mouseFlowPos.x <= gn.position.x + gw &&
          mouseFlowPos.y >= gn.position.y &&
          mouseFlowPos.y <= gn.position.y + gh;

        if (isOverGroup) {
          const alreadyMember = gd.memberNodeIds.includes(dragNodeId);
          if (!alreadyMember) {
            // Mouse is over a group the node doesn't belong to → show "+"
            setLongPressGroupId(gn.id);
            setLongPressAction('+');
            return;
          }
          // Mouse is over the node's own group → no action (do NOT remove)
          setLongPressGroupId(null);
          setLongPressAction(null);
          return;
        }
      }

      // Mouse is NOT over any group
      if (homeGroup) {
        // Node was in a group but mouse is now outside → show "-" to remove
        setLongPressGroupId(homeGroup.id);
        setLongPressAction('-');
      } else {
        // Node is not in any group and mouse not over any group → clear
        setLongPressGroupId(null);
        setLongPressAction(null);
      }
    },
    [reactFlowInstance]
  );

  // ── Group drag handling ──
  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      isDragging.current = true;
      if (node.type === 'group') {
        groupDragStartPos.current = { x: node.position.x, y: node.position.y };
        setDraggingGroupId(node.id);
      } else {
        // Non-group node drag: start long-press timer.
        // After the delay, continuous position checking is enabled.
        const dragNodeId = node.id;
        lastMousePos.current = { x: _event.clientX, y: _event.clientY };
        lastDragNodeId.current = dragNodeId;
        longPressReady.current = false;
        longPressTimer.current = setTimeout(() => {
          longPressReady.current = true;
          setLongPressDragNodeId(dragNodeId);
          // Immediately check the current position so that the indicator
          // appears even if the user is holding still after dragging out.
          if (lastMousePos.current && lastDragNodeId.current) {
            checkNodeOverGroup(lastDragNodeId.current, lastMousePos.current.x, lastMousePos.current.y);
          }
        }, groupHoverDelay);
      }
    },
    [groupHoverDelay, checkNodeOverGroup]
  );

  // Continuous drag tracking — fires on every move while dragging
  const handleNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      if (node.type === 'group') return;
      // Always keep the last mouse position up to date for idle detection
      lastMousePos.current = { x: _event.clientX, y: _event.clientY };
      if (!longPressReady.current) return;
      checkNodeOverGroup(node.id, _event.clientX, _event.clientY);
    },
    [checkNodeOverGroup]
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Clear long-press timer
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      longPressReady.current = false;

      if (node.type === 'group' && groupDragStartPos.current) {
        // Group drag: move all member nodes by the same delta
        const dx = node.position.x - groupDragStartPos.current.x;
        const dy = node.position.y - groupDragStartPos.current.y;
        groupDragStartPos.current = null;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          moveGroupMembers(node.id, dx, dy);
        }
      }

      // Clear group drag tracking (re-show member nodes)
      setDraggingGroupId(null);

      // Handle add/remove — only if the overlay icon is currently shown
      if (longPressGroupId && longPressDragNodeId && longPressAction) {
        if (longPressAction === '+') {
          addNodeToGroup(longPressGroupId, longPressDragNodeId);
        } else if (longPressAction === '-') {
          // Remove: the '-' icon is shown only when the node has been
          // dragged OUTSIDE its home group, so it's safe to remove.
          removeNodeFromGroup(longPressGroupId, longPressDragNodeId);
        }
      }

      // Reset long-press state
      setLongPressGroupId(null);
      setLongPressAction(null);
      setLongPressDragNodeId(null);
      lastMousePos.current = null;
      lastDragNodeId.current = null;

      // Recompute group bounds after any drag
      recomputeGroupBounds();

      // Reset isDragging after a short delay so that the click event
      // (which fires after mouseup) is suppressed.
      requestAnimationFrame(() => {
        isDragging.current = false;
      });
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
            onNodeDrag={observerMode ? undefined : handleNodeDrag}
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

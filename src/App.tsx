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
import type { AnodiNode, AnodiEdge, GroupData } from './types';
import { getEdgeStyle, GRID_SIZE } from './types';
import type { SourceLanguage, NodeData } from './types';
import { nodeKindColor, DIM_LEVELS, EDGE_OPACITY } from './theme/tokens';
import ContextMenu from './components/ContextMenu';
import type { ContextMenuState } from './components/ContextMenu';
import EmptyState from './components/EmptyState';

const MAX_DROP_BYTES = 512 * 1024;
const EXT_LANG: Record<string, SourceLanguage> = {
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cxx: 'cpp',
  py: 'python',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  rs: 'rust',
  go: 'go',
  ml: 'ocaml', mli: 'ocaml',
  s: 'assembly (x86-64)', asm: 'assembly (x86-64)',
};

function hasFiles(e: React.DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

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
  const observerMode = useGraphStore((s) => s.observerMode);
  const setObserverMode = useGraphStore((s) => s.setObserverMode);
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
  const snapToGrid = useGraphStore((s) => s.snapToGrid);
  const addNodes = useGraphStore((s) => s.addNodes);
  const nodeCount = nodes.length;

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const dragDepth = useRef(0);
  const overridePos = useRef<{ x: number; y: number } | null>(null);
  // Group currently hovered by a dragged node before long-press is ready
  const [hintGroupId, setHintGroupId] = useState<string | null>(null);
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
    if (overridePos.current) return overridePos.current;
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return { x: 300, y: 300 };
    const rect = wrapper.getBoundingClientRect();
    return reactFlowInstance.screenToFlowPosition({
      x: rect.width / 2,
      y: rect.height / 2,
    });
  }, [reactFlowInstance]);

  // The click-position override only applies to a single dialog open
  useEffect(() => {
    if (!showAddNode) overridePos.current = null;
  }, [showAddNode]);

  useEffect(() => {
    const onFit = () => reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
    window.addEventListener('anodi-fit-view', onFit);
    return () => window.removeEventListener('anodi-fit-view', onFit);
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

      // Precedence: hidden > search mismatch > selection non-neighbor > normal
      let opacity: number = DIM_LEVELS.focused;
      if (draggingGroupMemberIds.has(n.id)) opacity = DIM_LEVELS.hidden;
      else if (searchQuery && !isMatch) opacity = DIM_LEVELS.dimmed;
      else if (hasSelection && !isSelected && !isNeighbor) opacity = DIM_LEVELS.dimmed;
      else if (isNeighbor && !isSelected) opacity = DIM_LEVELS.neighbor;

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
        } else if (hintGroupId === n.id) {
          dataOverride = { ...n.data, hoverHint: true } as GroupData & { hoverHint?: boolean };
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
  }, [nodes, selectedNodeIds, selectedIdSet, neighborIds, matchedIds, searchQuery, longPressGroupId, longPressAction, longPressDragNodeId, draggingGroupId, hintGroupId]);

  // Annotate edges with highlight state and arrow markers
  const styledEdges = useMemo((): AnodiEdge[] => {
    const hasSelection = selectedNodeIds.length > 0;
    // Collect member IDs of the group currently being dragged so we can hide related edges
    const draggingGroupMemberIds = new Set<string>();
    if (draggingGroupId) {
      const gn = nodes.find((n) => n.id === draggingGroupId);
      if (gn?.type === 'group') {
        const gd = gn.data as GroupData;
        gd.memberNodeIds.forEach((mid) => draggingGroupMemberIds.add(mid));
      }
    }
    return edges.map((e) => {
      const isConnectedToSelected =
        selectedIdSet.has(e.source) || selectedIdSet.has(e.target);
      // Hide edges connected to members of the group being dragged
      const isConnectedToDraggingGroup =
        draggingGroupMemberIds.has(e.source) || draggingGroupMemberIds.has(e.target);
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
          opacity: isConnectedToDraggingGroup
            ? DIM_LEVELS.hidden
            : e.id === selectedEdgeId
              ? EDGE_OPACITY.selected
              : hasSelection && !isConnectedToSelected
                ? EDGE_OPACITY.dimmed
                : EDGE_OPACITY.normal,
        },
      };
    });
  }, [edges, selectedNodeIds, selectedIdSet, selectedEdgeId, userEdgeTypes, draggingGroupId, nodes]);

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
    setCtxMenu(null);
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
      if (!longPressReady.current) {
        // Subtle "hold to add" hint while hovering a foreign group
        const fp = reactFlowInstance.screenToFlowPosition({ x: _event.clientX, y: _event.clientY });
        let hint: string | null = null;
        for (const gn of useGraphStore.getState().nodes) {
          if (gn.type !== 'group') continue;
          const gd = gn.data as GroupData;
          if (gd.memberNodeIds.includes(node.id)) continue;
          if (
            fp.x >= gn.position.x && fp.x <= gn.position.x + (gd.computedWidth || 200) &&
            fp.y >= gn.position.y && fp.y <= gn.position.y + (gd.computedHeight || 120)
          ) {
            hint = gn.id;
            break;
          }
        }
        setHintGroupId((cur) => (cur === hint ? cur : hint));
        return;
      }
      setHintGroupId(null);
      checkNodeOverGroup(node.id, _event.clientX, _event.clientY);
    },
    [checkNodeOverGroup, reactFlowInstance]
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
      setHintGroupId(null);

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

  // ── Context menu handlers ──
  const openCtx = useCallback(
    (e: React.MouseEvent | MouseEvent, kind: ContextMenuState['kind'], id?: string) => {
      e.preventDefault();
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        kind,
        id,
        flowPos: reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      });
    },
    [reactFlowInstance]
  );
  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (e, node) => {
      const st = useGraphStore.getState();
      if (!st.observerMode && !st.selectedNodeIds.includes(node.id)) st.selectNode(node.id);
      const multi = useGraphStore.getState().selectedNodeIds.length > 1;
      openCtx(e, multi ? 'selection' : 'node', node.id);
    },
    [openCtx]
  );
  const handleEdgeContextMenu: EdgeMouseHandler = useCallback(
    (e, edge) => openCtx(e, 'edge', edge.id),
    [openCtx]
  );
  const handlePaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => openCtx(e, 'pane'),
    [openCtx]
  );
  const handleSelectionContextMenu = useCallback(
    (e: React.MouseEvent) => openCtx(e, 'selection'),
    [openCtx]
  );
  const closeCtx = useCallback(() => setCtxMenu(null), []);
  const handleAddNodeAt = useCallback((pos: { x: number; y: number }) => {
    overridePos.current = pos;
    setShowAddNode(true);
  }, []);

  // ── File drop ──
  const handleDragEnter = (e: React.DragEvent) => {
    if (observerMode || !hasFiles(e)) return;
    dragDepth.current++;
    setFileDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (observerMode || !hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setFileDragOver(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (observerMode || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = async (e: React.DragEvent) => {
    dragDepth.current = 0;
    setFileDragOver(false);
    if (observerMode || !hasFiles(e)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.size <= MAX_DROP_BYTES);
    if (files.length === 0) return;
    const origin = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const specs: { name: string; data: NodeData; position: { x: number; y: number } }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let text: string;
      try {
        text = await file.text();
      } catch {
        continue;
      }
      if (text.includes('\u0000')) continue; // binary
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      const lang = EXT_LANG[ext];
      const position = { x: origin.x + specs.length * 40, y: origin.y + specs.length * 40 };
      specs.push({
        name: file.name,
        position,
        data: lang
          ? { kind: 'source', language: lang, code: text, collapsedLineMap: [] }
          : { kind: 'notepad', content: text },
      });
    }
    if (specs.length > 0) addNodes(specs);
  };

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
        <div
          className="relative flex-1"
          ref={reactFlowWrapper}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {fileDragOver && <div className="anodi-drop-overlay">Drop files to create nodes</div>}
          {nodeCount === 0 && !observerMode && <EmptyState onAddNode={() => setShowAddNode(true)} />}
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
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onPaneContextMenu={handlePaneContextMenu}
            onSelectionContextMenu={handleSelectionContextMenu}
            snapToGrid={snapToGrid}
            snapGrid={[GRID_SIZE, GRID_SIZE]}
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
            {snapToGrid ? (
              <Background
                key="grid-lines"
                variant={BackgroundVariant.Lines}
                gap={GRID_SIZE}
                lineWidth={0.5}
                color={theme === 'dark' ? '#1f2937' : '#e5e7eb'}
              />
            ) : (
              <Background key="grid-dots" variant={BackgroundVariant.Dots} gap={20} size={1} color={theme === 'dark' ? '#374151' : '#d1d5db'} />
            )}
            <Controls className={theme === 'dark' ? '!border-gray-700 !bg-gray-800 !text-white' : '!border-gray-300 !bg-white !text-gray-700'} onInteractiveChange={(interactive) => setObserverMode(!interactive)} />
            <MiniMap
              className={theme === 'dark' ? '!border-gray-700 !bg-gray-800' : '!border-gray-300 !bg-gray-100'}
              nodeColor={(n) => nodeKindColor(n.data as NodeData)}
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
      <ContextMenu state={ctxMenu} onClose={closeCtx} onAddNodeAt={handleAddNodeAt} />
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

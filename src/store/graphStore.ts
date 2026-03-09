import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import type { Connection, NodeChange, EdgeChange } from '@xyflow/react';
import type {
  AnodiNode,
  AnodiEdge,
  NodeData,
  EdgeRelationship,
  AnodiEdgeData,
  UserEdgeType,
  GroupData,
} from '../types';
import { USER_EDGE_SHORTCUT_KEYS, MAX_USER_EDGE_TYPES, GROUP_PADDING, GROUP_HEADER_HEIGHT, GROUP_MIN_WIDTH, GROUP_MIN_HEIGHT } from '../types';

interface Snapshot {
  nodes: AnodiNode[];
  edges: AnodiEdge[];
}

const MAX_HISTORY = 50;

interface Clipboard {
  nodes: AnodiNode[];
  edges: AnodiEdge[];
}

interface GraphState {
  nodes: AnodiNode[];
  edges: AnodiEdge[];
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  activeEdgeType: EdgeRelationship;
  searchQuery: string;
  userEdgeTypes: UserEdgeType[];
  clipboard: Clipboard | null;

  // History
  past: Snapshot[];
  future: Snapshot[];

  // Node actions
  addNode: (name: string, data: NodeData, position?: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeName: (id: string, name: string) => void;
  onNodesChange: (changes: NodeChange<AnodiNode>[]) => void;

  // Edge actions
  onEdgesChange: (changes: EdgeChange<AnodiEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setActiveEdgeType: (type: EdgeRelationship) => void;
  swapEdgeDirection: (edgeId: string) => void;
  updateEdgeRelationship: (edgeId: string, relationship: EdgeRelationship) => void;

  // User edge types
  addUserEdgeType: (label: string, color: string, strokeDasharray?: string) => void;
  updateUserEdgeType: (id: string, label: string, color: string, strokeDasharray?: string) => void;
  removeUserEdgeType: (id: string) => void;

  // Selection
  selectNode: (id: string | null) => void;
  toggleNodeSelection: (id: string) => void;
  selectEdge: (id: string | null) => void;

  // Group actions
  addGroup: (name: string, color?: string, position?: { x: number; y: number }) => void;
  addNodeToGroup: (groupId: string, nodeId: string) => void;
  removeNodeFromGroup: (groupId: string, nodeId: string) => void;
  recomputeGroupBounds: () => void;
  moveGroupMembers: (groupId: string, dx: number, dy: number) => void;
  /** Configurable long-press delay for add/remove node to/from group (ms). */
  groupHoverDelay: number;
  setGroupHoverDelay: (ms: number) => void;

  // Clipboard
  copySelection: () => void;
  pasteSelection: (offset?: { x: number; y: number }) => void;

  // Search
  setSearchQuery: (q: string) => void;

  // Import / export
  loadGraph: (nodes: AnodiNode[], edges: AnodiEdge[], userEdgeTypes?: UserEdgeType[]) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let nodeCounter = 1;
let edgeCounter = 1;

function pushSnapshot(past: Snapshot[], nodes: AnodiNode[], edges: AnodiEdge[]): Snapshot[] {
  const newPast = [...past, { nodes, edges }];
  if (newPast.length > MAX_HISTORY) newPast.shift();
  return newPast;
}

const USER_EDGE_TYPES_KEY = 'anodi-user-edge-types';

function loadUserEdgeTypes(): UserEdgeType[] {
  try {
    const stored = localStorage.getItem(USER_EDGE_TYPES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveUserEdgeTypes(types: UserEdgeType[]) {
  try {
    localStorage.setItem(USER_EDGE_TYPES_KEY, JSON.stringify(types));
  } catch {
    // ignore
  }
}

function findNextShortcutKey(existing: UserEdgeType[]): string | null {
  const used = new Set(existing.map((t) => t.shortcutKey));
  for (const key of USER_EDGE_SHORTCUT_KEYS) {
    if (!used.has(key)) return key;
  }
  return null;
}

let userEdgeIdCounter = Date.now();

/** Compute position and size of a group node based on its member nodes. */
function computeGroupNodeBounds(
  groupNode: AnodiNode,
  allNodes: AnodiNode[],
): { x: number; y: number; width: number; height: number } | null {
  const gd = groupNode.data as GroupData;
  if (!gd.memberNodeIds || gd.memberNodeIds.length === 0) return null;

  const DEFAULT_W = 200;
  const DEFAULT_H = 80;

  const members = allNodes.filter((n) => gd.memberNodeIds.includes(n.id));
  if (members.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const m of members) {
    const w = (m.measured?.width ?? m.width) || DEFAULT_W;
    const h = (m.measured?.height ?? m.height) || DEFAULT_H;
    if (m.position.x < minX) minX = m.position.x;
    if (m.position.y < minY) minY = m.position.y;
    if (m.position.x + w > maxX) maxX = m.position.x + w;
    if (m.position.y + h > maxY) maxY = m.position.y + h;
  }

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - GROUP_HEADER_HEIGHT,
    width: Math.max(maxX - minX + 2 * GROUP_PADDING, GROUP_MIN_WIDTH),
    height: Math.max(maxY - minY + 2 * GROUP_PADDING + GROUP_HEADER_HEIGHT, GROUP_MIN_HEIGHT),
  };
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  selectedEdgeId: null,
  activeEdgeType: 'call',
  searchQuery: '',
  userEdgeTypes: loadUserEdgeTypes(),
  clipboard: null,
  past: [],
  future: [],
  groupHoverDelay: 600,

  addNode: (name, data, position) => {
    const id = `node-${nodeCounter++}`;
    const offset = (nodeCounter - 1) * 20;
    const newNode: AnodiNode = {
      id,
      type: data.kind,
      position: position ?? { x: 100 + (offset % 400), y: 100 + Math.floor(offset / 400) * 200 },
      data: { ...data, name },
    };
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: [...s.nodes, newNode],
    }));
  },

  updateNodeData: (id, patch) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } as NodeData } : n
      ),
    }));
  },

  updateNodeName: (id, name) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, name } } : n
      ),
    }));
  },

  onNodesChange: (changes) => {
    const hasStructural = changes.some(
      (c) => c.type === 'remove' || c.type === 'add'
    );
    const hasSelection = changes.some((c) => c.type === 'select');
    // Gather removed node IDs so we can clean up group membership
    const removedIds = new Set(
      changes.filter((c) => c.type === 'remove').map((c) => c.id)
    );
    set((s) => {
      const updatedNodes = applyNodeChanges(changes as NodeChange<AnodiNode>[], s.nodes);
      // Sync selectedNodeIds when selection changes come through React Flow
      const selectionUpdate = hasSelection
        ? { selectedNodeIds: updatedNodes.filter((n) => n.selected).map((n) => n.id), selectedEdgeId: null }
        : {};
      // Clean up group membership for removed nodes
      let finalNodes = updatedNodes;
      if (removedIds.size > 0) {
        finalNodes = updatedNodes.map((n) => {
          if (n.type !== 'group') return n;
          const gd = n.data as GroupData;
          const filtered = gd.memberNodeIds.filter((mid) => !removedIds.has(mid));
          if (filtered.length === gd.memberNodeIds.length) return n;
          return { ...n, data: { ...gd, memberNodeIds: filtered } };
        });
      }
      return {
        ...(hasStructural
          ? { past: pushSnapshot(s.past, s.nodes, s.edges), future: [] }
          : {}),
        nodes: finalNodes,
        ...selectionUpdate,
      };
    });
  },

  onEdgesChange: (changes) => {
    const hasStructural = changes.some(
      (c) => c.type === 'remove' || c.type === 'add'
    );
    set((s) => ({
      ...(hasStructural
        ? { past: pushSnapshot(s.past, s.nodes, s.edges), future: [] }
        : {}),
      edges: applyEdgeChanges(changes as EdgeChange<AnodiEdge>[], s.edges),
    }));
  },

  onConnect: (connection) => {
    const rel = get().activeEdgeType;
    const edgeData: AnodiEdgeData = { relationship: rel };
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: addEdge(
        {
          ...connection,
          type: 'custom',
          data: edgeData,
        },
        s.edges
      ) as AnodiEdge[],
    }));
  },

  setActiveEdgeType: (type) => set({ activeEdgeType: type }),

  addUserEdgeType: (label, color, strokeDasharray) => {
    const { userEdgeTypes } = get();
    if (userEdgeTypes.length >= MAX_USER_EDGE_TYPES) return;
    const shortcutKey = findNextShortcutKey(userEdgeTypes);
    if (!shortcutKey) return;
    const id = `user-edge-${++userEdgeIdCounter}`;
    const newType: UserEdgeType = { id, label, color, strokeDasharray, shortcutKey };
    const updated = [...userEdgeTypes, newType];
    saveUserEdgeTypes(updated);
    set({ userEdgeTypes: updated });
  },

  updateUserEdgeType: (id, label, color, strokeDasharray) => {
    const { userEdgeTypes } = get();
    const updated = userEdgeTypes.map((t) =>
      t.id === id ? { ...t, label, color, strokeDasharray } : t
    );
    saveUserEdgeTypes(updated);
    set({ userEdgeTypes: updated });
  },

  removeUserEdgeType: (id) => {
    const { userEdgeTypes, activeEdgeType, edges } = get();
    const updated = userEdgeTypes.filter((t) => t.id !== id);
    saveUserEdgeTypes(updated);
    // Fallback: any edges using the removed type revert to 'call'
    const updatedEdges = edges.map((e) =>
      e.data?.relationship === id
        ? { ...e, data: { ...e.data, relationship: 'call' as EdgeRelationship } as AnodiEdgeData }
        : e
    );
    set({
      userEdgeTypes: updated,
      edges: updatedEdges,
      // If the removed type was active, reset to 'call'
      ...(activeEdgeType === id ? { activeEdgeType: 'call' as EdgeRelationship } : {}),
    });
  },

  swapEdgeDirection: (edgeId) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        // Only swap source/target; keep same handle IDs so the visual path stays the same.
        // Each handle position exposes both source and target types, so the handles resolve correctly.
        return {
          ...e,
          source: e.target,
          target: e.source,
          sourceHandle: e.targetHandle ?? null,
          targetHandle: e.sourceHandle ?? null,
        };
      }),
    }));
  },

  updateEdgeRelationship: (edgeId, relationship) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, relationship } as AnodiEdgeData }
          : e
      ),
    }));
  },

  selectNode: (id) => set({ selectedNodeIds: id ? [id] : [], selectedEdgeId: null }),

  toggleNodeSelection: (id) => set((s) => {
    const idx = s.selectedNodeIds.indexOf(id);
    const next = idx >= 0
      ? s.selectedNodeIds.filter((nid) => nid !== id)
      : [...s.selectedNodeIds, id];
    return { selectedNodeIds: next, selectedEdgeId: null };
  }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeIds: [] }),

  // ── Group actions ──────────────────────────────────────────────

  addGroup: (name, color, position) => {
    const id = `node-${nodeCounter++}`;
    const newNode: AnodiNode = {
      id,
      type: 'group',
      position: position ?? { x: 200, y: 200 },
      data: {
        kind: 'group',
        name: name || 'Untitled Group',
        groupColor: color,
        memberNodeIds: [],
        computedWidth: GROUP_MIN_WIDTH,
        computedHeight: GROUP_MIN_HEIGHT,
      } as GroupData,
      zIndex: -1000,
    };
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: [...s.nodes, newNode],
    }));
  },

  addNodeToGroup: (groupId, nodeId) => {
    set((s) => {
      // Remove the node from any existing group first
      const nodes = s.nodes.map((n) => {
        if (n.type !== 'group') return n;
        const gd = n.data as GroupData;
        if (n.id === groupId) {
          if (gd.memberNodeIds.includes(nodeId)) return n;
          return { ...n, data: { ...gd, memberNodeIds: [...gd.memberNodeIds, nodeId] } };
        }
        // Remove from other groups
        if (gd.memberNodeIds.includes(nodeId)) {
          return { ...n, data: { ...gd, memberNodeIds: gd.memberNodeIds.filter((mid) => mid !== nodeId) } };
        }
        return n;
      });
      return {
        past: pushSnapshot(s.past, s.nodes, s.edges),
        future: [],
        nodes,
      };
    });
    // Recompute bounds after membership change
    get().recomputeGroupBounds();
  },

  removeNodeFromGroup: (groupId, nodeId) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: s.nodes.map((n) => {
        if (n.id !== groupId || n.type !== 'group') return n;
        const gd = n.data as GroupData;
        return { ...n, data: { ...gd, memberNodeIds: gd.memberNodeIds.filter((mid) => mid !== nodeId) } };
      }),
    }));
    get().recomputeGroupBounds();
  },

  recomputeGroupBounds: () => {
    set((s) => {
      let changed = false;
      const nodes = s.nodes.map((n) => {
        if (n.type !== 'group') return n;
        const bounds = computeGroupNodeBounds(n, s.nodes);
        if (!bounds) return n;
        const gd = n.data as GroupData;
        if (
          n.position.x === bounds.x &&
          n.position.y === bounds.y &&
          gd.computedWidth === bounds.width &&
          gd.computedHeight === bounds.height
        ) {
          return n;
        }
        changed = true;
        return {
          ...n,
          position: { x: bounds.x, y: bounds.y },
          data: { ...gd, computedWidth: bounds.width, computedHeight: bounds.height },
        };
      });
      return changed ? { nodes } : {};
    });
  },

  moveGroupMembers: (groupId, dx, dy) => {
    set((s) => {
      const groupNode = s.nodes.find((n) => n.id === groupId);
      if (!groupNode || groupNode.type !== 'group') return {};
      const gd = groupNode.data as GroupData;
      const memberSet = new Set(gd.memberNodeIds);
      return {
        past: pushSnapshot(s.past, s.nodes, s.edges),
        future: [],
        nodes: s.nodes.map((n) =>
          memberSet.has(n.id)
            ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            : n
        ),
      };
    });
    get().recomputeGroupBounds();
  },

  setGroupHoverDelay: (ms) => set({ groupHoverDelay: ms }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  copySelection: () => {
    const { nodes, edges, selectedNodeIds } = get();
    if (selectedNodeIds.length === 0) return;
    const selectedSet = new Set(selectedNodeIds);
    const copiedNodes = nodes.filter((n) => selectedSet.has(n.id));
    // Copy edges only when both endpoints are in the selected group
    const copiedEdges = edges.filter(
      (e) => selectedSet.has(e.source) && selectedSet.has(e.target)
    );
    set({ clipboard: { nodes: copiedNodes, edges: copiedEdges } });
  },

  pasteSelection: (offset) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;
    const dx = offset?.x ?? 50;
    const dy = offset?.y ?? 50;
    // Build old-id → new-id mapping
    const idMap = new Map<string, string>();
    const newNodes: AnodiNode[] = clipboard.nodes.map((n) => {
      const newId = `node-${nodeCounter++}`;
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + dx, y: n.position.y + dy },
        selected: true,
        data: { ...n.data },
      };
    });
    // Re-map edges to point to new node IDs
    const newEdges: AnodiEdge[] = clipboard.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: `edge-${edgeCounter++}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        data: e.data ? { ...e.data } : undefined,
      }));
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: [
        // Deselect existing nodes
        ...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...newNodes,
      ],
      edges: [...s.edges, ...newEdges],
      selectedNodeIds: newNodes.map((n) => n.id),
    }));
  },

  loadGraph: (nodes, edges, importedUserEdgeTypes) => {
    // Reset counter based on imported node IDs to avoid collisions
    const maxId = nodes.reduce((max, n) => {
      const match = n.id.match(/^node-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    // If no standard IDs were found, use current timestamp to avoid collisions
    nodeCounter = maxId > 0 ? maxId + 1 : Date.now();

    // Restore user-defined edge types if present, re-assigning shortcut keys
    const restoredEdgeTypes = importedUserEdgeTypes && Array.isArray(importedUserEdgeTypes)
      ? importedUserEdgeTypes.slice(0, MAX_USER_EDGE_TYPES).map((t, i) => ({
          ...t,
          shortcutKey: USER_EDGE_SHORTCUT_KEYS[i] ?? t.shortcutKey,
        }))
      : get().userEdgeTypes;
    if (importedUserEdgeTypes) saveUserEdgeTypes(restoredEdgeTypes);

    set({ nodes, edges, userEdgeTypes: restoredEdgeTypes, selectedNodeIds: [], selectedEdgeId: null, searchQuery: '', past: [], future: [] });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [{ nodes, edges }, ...future],
      nodes: previous.nodes,
      edges: previous.edges,
    });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      past: [...past, { nodes, edges }],
      future: future.slice(1),
      nodes: next.nodes,
      edges: next.edges,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

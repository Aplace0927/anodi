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
  EdgePathStyle,
  EdgeStylePatch,
  TokenAnchor,
  SourceCodeData,
} from '../types';
import { USER_EDGE_SHORTCUT_KEYS, MAX_USER_EDGE_TYPES, GROUP_PADDING, GROUP_HEADER_HEIGHT, GROUP_MIN_WIDTH, GROUP_MIN_HEIGHT } from '../types';
import { alignNodes, distributeNodes, computeAutoLayout } from '../utils/layout';
import type { AlignMode, LayoutDirection } from '../utils/layout';
import {
  loadBoardIndex,
  saveBoardIndex,
  loadCurrentBoardId,
  saveCurrentBoardId,
  loadBoardData,
  saveBoardData,
  deleteBoardData,
  newBoardId,
} from '../utils/persistence';
import type { BoardMeta } from '../utils/persistence';

export type { BoardMeta };
export type SaveStatus = 'saved' | 'saving' | 'error';

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

  // Boards / persistence
  boards: BoardMeta[];
  currentBoardId: string;
  saveStatus: SaveStatus;

  // History
  past: Snapshot[];
  future: Snapshot[];

  // Node actions
  addNode: (name: string, data: NodeData, position?: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeName: (id: string, name: string) => void;
  /** Apply several position/data updates as a single undo step. */
  updateNodesBulk: (updates: { id: string; position?: { x: number; y: number }; data?: Partial<NodeData> }[]) => void;
  /** Add a word/range connection point to a source node; returns the anchor id. */
  addTokenAnchor: (nodeId: string, anchor: Omit<TokenAnchor, 'id'>) => string;
  /** Remove a connection point and any edges attached to it (single undo step). */
  removeTokenAnchor: (nodeId: string, anchorId: string) => void;
  /** Add several nodes as a single undo step; returns the new ids. */
  addNodes: (nodes: { name: string; data: NodeData; position?: { x: number; y: number } }[]) => string[];
  onNodesChange: (changes: NodeChange<AnodiNode>[]) => void;

  // Edge actions
  onEdgesChange: (changes: EdgeChange<AnodiEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setActiveEdgeType: (type: EdgeRelationship) => void;
  swapEdgeDirection: (edgeId: string) => void;
  updateEdgeRelationship: (edgeId: string, relationship: EdgeRelationship) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  /** Patch visual edge settings (path style, width, arrows, color). `undefined` values reset to default. */
  updateEdgeStyle: (edgeIds: string | string[], patch: EdgeStylePatch) => void;
  /** Board-wide path style used by edges without their own `pathStyle`. */
  defaultEdgePathStyle: EdgePathStyle;
  setDefaultEdgePathStyle: (style: EdgePathStyle) => void;
  /** Create an edge programmatically (one undo step); returns the new edge id. */
  addEdgeBetween: (
    source: string,
    target: string,
    opts?: { sourceHandle?: string | null; targetHandle?: string | null; relationship?: EdgeRelationship; label?: string },
  ) => string;

  // Bend point actions
  addBendPoint: (edgeId: string, index: number, point: { x: number; y: number }) => void;
  removeBendPoint: (edgeId: string, index: number) => void;
  updateBendPoint: (edgeId: string, index: number, point: { x: number; y: number }) => void;
  clearBendPoints: (edgeId: string) => void;

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

  // Align / distribute / layout
  alignSelected: (mode: AlignMode) => void;
  distributeSelected: (axis: 'x' | 'y') => void;
  autoLayout: (direction: LayoutDirection, onlySelected?: boolean) => void;

  // Snap to grid
  snapToGrid: boolean;
  setSnapToGrid: (on: boolean) => void;

  // Boards
  createBoard: (name?: string) => string;
  switchBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  duplicateBoard: (id: string) => string | null;
  deleteBoard: (id: string) => void;
  initBoards: () => void;

  // Clipboard
  copySelection: () => void;
  pasteSelection: (offset?: { x: number; y: number }) => void;

  // Search
  setSearchQuery: (q: string) => void;

  // Import / export
  loadGraph: (nodes: AnodiNode[], edges: AnodiEdge[], userEdgeTypes?: UserEdgeType[]) => void;

  // Observer mode (locked board)
  observerMode: boolean;
  setObserverMode: (mode: boolean) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let nodeCounter = 1;
let edgeCounter = 1;

// ── History coalescing ───────────────────────────────────────────

const COALESCE_MS = 1000;
/** Last coalescible edit (node/edge + action); consecutive edits within COALESCE_MS share one snapshot. */
let lastEdit: { key: string; time: number } | null = null;
/** True while a node drag is in progress (snapshot already taken). */
let dragInProgress = false;

function pushSnapshot(past: Snapshot[], nodes: AnodiNode[], edges: AnodiEdge[]): Snapshot[] {
  lastEdit = null;
  const newPast = [...past, { nodes, edges }];
  if (newPast.length > MAX_HISTORY) newPast.shift();
  return newPast;
}

/** History patch for a text-like edit: snapshots unless the same key was edited moments ago. */
function coalescedHistory(s: GraphState, key: string): { past: Snapshot[]; future: Snapshot[] } {
  const now = Date.now();
  if (lastEdit && lastEdit.key === key && now - lastEdit.time < COALESCE_MS) {
    lastEdit.time = now;
    return { past: s.past, future: [] };
  }
  const past = pushSnapshot(s.past, s.nodes, s.edges);
  lastEdit = { key, time: now };
  return { past, future: [] };
}

const SNAP_GRID_KEY = 'anodi-snap-grid';

function loadSnapToGrid(): boolean {
  try {
    return localStorage.getItem(SNAP_GRID_KEY) === 'true';
  } catch {
    return false;
  }
}

const EDGE_PATH_STYLE_KEY = 'anodi-edge-path-style';

function loadDefaultEdgePathStyle(): EdgePathStyle {
  try {
    const v = localStorage.getItem(EDGE_PATH_STYLE_KEY);
    return v === 'bezier' || v === 'step' ? v : 'straight';
  } catch {
    return 'straight';
  }
}

let anchorCounter = Date.now();

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
  boards: [],
  currentBoardId: '',
  saveStatus: 'saved',
  snapToGrid: loadSnapToGrid(),
  defaultEdgePathStyle: loadDefaultEdgePathStyle(),
  past: [],
  future: [],
  groupHoverDelay: 600,
  observerMode: false,

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
      ...coalescedHistory(s, `${id}:data`),
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } as NodeData } : n
      ),
    }));
  },

  updateNodeName: (id, name) => {
    set((s) => ({
      ...coalescedHistory(s, `${id}:name`),
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, name } } : n
      ),
    }));
  },

  updateNodesBulk: (updates) => {
    if (updates.length === 0) return;
    const byId = new Map(updates.map((u) => [u.id, u]));
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: s.nodes.map((n) => {
        const u = byId.get(n.id);
        if (!u) return n;
        return {
          ...n,
          position: u.position ?? n.position,
          data: u.data ? ({ ...n.data, ...u.data } as NodeData) : n.data,
        };
      }),
    }));
  },

  addTokenAnchor: (nodeId, anchor) => {
    const id = `a${(++anchorCounter).toString(36)}`;
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== 'source') return n;
        const d = n.data as SourceCodeData;
        return { ...n, data: { ...d, tokenAnchors: [...(d.tokenAnchors ?? []), { ...anchor, id }] } };
      }),
    }));
    return id;
  },

  removeTokenAnchor: (nodeId, anchorId) => {
    const prefix = `anchor-${anchorId}-`;
    const touches = (nid: string, h: string | null | undefined) => nid === nodeId && !!h?.startsWith(prefix);
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== 'source') return n;
        const d = n.data as SourceCodeData;
        return { ...n, data: { ...d, tokenAnchors: (d.tokenAnchors ?? []).filter((a) => a.id !== anchorId) } };
      }),
      edges: s.edges.filter((e) => !touches(e.source, e.sourceHandle) && !touches(e.target, e.targetHandle)),
    }));
  },

  addNodes: (specs) => {
    if (specs.length === 0) return [];
    const newNodes: AnodiNode[] = specs.map((spec) => {
      const id = `node-${nodeCounter++}`;
      const offset = (nodeCounter - 1) * 20;
      return {
        id,
        type: spec.data.kind,
        position: spec.position ?? { x: 100 + (offset % 400), y: 100 + Math.floor(offset / 400) * 200 },
        data: { ...spec.data, name: spec.name },
      } as AnodiNode;
    });
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      nodes: [...s.nodes, ...newNodes],
    }));
    return newNodes.map((n) => n.id);
  },

  onNodesChange: (changes) => {
    const hasStructural = changes.some(
      (c) => c.type === 'remove' || c.type === 'add'
    );
    const hasSelection = changes.some((c) => c.type === 'select');
    // Drag undo: one snapshot when a drag begins, re-armed when it ends
    let dragStart = false;
    for (const c of changes) {
      if (c.type !== 'position') continue;
      if (c.dragging === true && !dragInProgress) {
        dragInProgress = true;
        dragStart = true;
      } else if (c.dragging === false) {
        dragInProgress = false;
      }
    }
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
        ...(hasStructural || dragStart
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
          id: `edge-${edgeCounter++}`,
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
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      userEdgeTypes: updated,
      edges: updatedEdges,
      // If the removed type was active, reset to 'call'
      ...(activeEdgeType === id ? { activeEdgeType: 'call' as EdgeRelationship } : {}),
    }));
  },

  swapEdgeDirection: (edgeId) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const bendPoints = e.data?.bendPoints;
        return {
          ...e,
          source: e.target,
          target: e.source,
          sourceHandle: e.targetHandle ?? null,
          targetHandle: e.sourceHandle ?? null,
          data: bendPoints && bendPoints.length > 0
            ? { ...e.data, bendPoints: [...bendPoints].reverse() } as AnodiEdgeData
            : e.data,
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

  updateEdgeLabel: (edgeId, label) => {
    set((s) => ({
      ...coalescedHistory(s, `${edgeId}:label`),
      edges: s.edges.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, label } as AnodiEdgeData }
          : e
      ),
    }));
  },

  updateEdgeStyle: (edgeIds, patch) => {
    const ids = new Set(Array.isArray(edgeIds) ? edgeIds : [edgeIds]);
    // The native color input fires continuously while dragging; coalesce those
    const colorOnly = Object.keys(patch).length === 1 && 'color' in patch;
    set((s) => ({
      ...(colorOnly
        ? coalescedHistory(s, `${[...ids].join(',')}:color`)
        : { past: pushSnapshot(s.past, s.nodes, s.edges), future: [] }),
      edges: s.edges.map((e) => {
        if (!ids.has(e.id)) return e;
        const data = { ...e.data, ...patch } as AnodiEdgeData;
        for (const k of Object.keys(patch) as (keyof EdgeStylePatch)[]) {
          if (patch[k] === undefined) delete data[k];
        }
        return { ...e, data };
      }),
    }));
  },

  setDefaultEdgePathStyle: (style) => {
    try {
      localStorage.setItem(EDGE_PATH_STYLE_KEY, style);
    } catch {
      // ignore
    }
    set({ defaultEdgePathStyle: style });
  },

  addEdgeBetween: (source, target, opts) => {
    const id = `edge-${edgeCounter++}`;
    const edgeData: AnodiEdgeData = {
      relationship: opts?.relationship ?? get().activeEdgeType,
      ...(opts?.label ? { label: opts.label } : {}),
    };
    const edge: AnodiEdge = {
      id,
      source,
      target,
      sourceHandle: opts?.sourceHandle ?? null,
      targetHandle: opts?.targetHandle ?? null,
      type: 'custom',
      data: edgeData,
    };
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: [...s.edges, edge],
    }));
    return id;
  },

  addBendPoint: (edgeId, index, point) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const bendPoints = [...(e.data?.bendPoints ?? [])];
        bendPoints.splice(index, 0, point);
        return { ...e, data: { ...e.data, bendPoints } as AnodiEdgeData };
      }),
    }));
  },

  removeBendPoint: (edgeId, index) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const bendPoints = [...(e.data?.bendPoints ?? [])];
        bendPoints.splice(index, 1);
        return { ...e, data: { ...e.data, bendPoints } as AnodiEdgeData };
      }),
    }));
  },

  updateBendPoint: (edgeId, index, point) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const bendPoints = [...(e.data?.bendPoints ?? [])];
        bendPoints[index] = point;
        return { ...e, data: { ...e.data, bendPoints } as AnodiEdgeData };
      }),
    }));
  },

  clearBendPoints: (edgeId) => {
    set((s) => ({
      past: pushSnapshot(s.past, s.nodes, s.edges),
      future: [],
      edges: s.edges.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, bendPoints: [] } as AnodiEdgeData }
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

  // ── Align / distribute / layout ────────────────────────────────

  alignSelected: (mode) => {
    const { nodes, selectedNodeIds, updateNodesBulk, recomputeGroupBounds } = get();
    const sel = new Set(selectedNodeIds);
    const targets = nodes.filter((n) => sel.has(n.id) && n.type !== 'group');
    const updates = alignNodes(targets, mode);
    if (updates.length === 0) return;
    updateNodesBulk(updates);
    recomputeGroupBounds();
  },

  distributeSelected: (axis) => {
    const { nodes, selectedNodeIds, updateNodesBulk, recomputeGroupBounds } = get();
    const sel = new Set(selectedNodeIds);
    const targets = nodes.filter((n) => sel.has(n.id) && n.type !== 'group');
    const updates = distributeNodes(targets, axis);
    if (updates.length === 0) return;
    updateNodesBulk(updates);
    recomputeGroupBounds();
  },

  autoLayout: (direction, onlySelected) => {
    const { nodes, edges, selectedNodeIds, updateNodesBulk, recomputeGroupBounds } = get();
    const sel = new Set(selectedNodeIds);
    const targets = onlySelected ? nodes.filter((n) => sel.has(n.id)) : nodes;
    const updates = computeAutoLayout(targets, edges, direction);
    if (updates.length === 0) return;
    updateNodesBulk(updates);
    recomputeGroupBounds();
  },

  setSnapToGrid: (on) => {
    try {
      localStorage.setItem(SNAP_GRID_KEY, String(on));
    } catch {
      // ignore
    }
    set({ snapToGrid: on });
  },

  // ── Boards ─────────────────────────────────────────────────────

  createBoard: (name) => {
    flushSave();
    const id = newBoardId();
    const meta: BoardMeta = { id, name: name?.trim() || 'Untitled board', updatedAt: Date.now() };
    const boards = [...get().boards, meta];
    saveBoardData(id, [], [], get().userEdgeTypes);
    saveBoardIndex(boards);
    saveCurrentBoardId(id);
    set({ boards, currentBoardId: id, saveStatus: 'saved' });
    loadWithoutAutosave([], []);
    return id;
  },

  switchBoard: (id) => {
    const { currentBoardId, boards } = get();
    if (id === currentBoardId || !boards.some((b) => b.id === id)) return;
    flushSave();
    const data = loadBoardData(id);
    saveCurrentBoardId(id);
    set({ currentBoardId: id, saveStatus: 'saved' });
    loadWithoutAutosave(data?.nodes ?? [], data?.edges ?? [], data?.userEdgeTypes);
  },

  renameBoard: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const boards = get().boards.map((b) => (b.id === id ? { ...b, name: trimmed } : b));
    saveBoardIndex(boards);
    set({ boards });
  },

  duplicateBoard: (id) => {
    flushSave();
    const src = get().boards.find((b) => b.id === id);
    if (!src) return null;
    const data = loadBoardData(id);
    const newId = newBoardId();
    const ok = saveBoardData(newId, data?.nodes ?? [], data?.edges ?? [], data?.userEdgeTypes ?? get().userEdgeTypes);
    if (!ok) {
      set({ saveStatus: 'error' });
      return null;
    }
    const boards = [...get().boards, { id: newId, name: `${src.name} copy`, updatedAt: Date.now() }];
    saveBoardIndex(boards);
    set({ boards });
    return newId;
  },

  deleteBoard: (id) => {
    const { boards, currentBoardId } = get();
    if (!boards.some((b) => b.id === id)) return;
    if (id === currentBoardId) cancelSave();
    else flushSave();
    deleteBoardData(id);
    const remaining = boards.filter((b) => b.id !== id);
    saveBoardIndex(remaining);
    set({ boards: remaining });
    if (id !== currentBoardId) return;
    if (remaining.length > 0) {
      // Clear current id so switchBoard does not treat it as a no-op
      set({ currentBoardId: '' });
      get().switchBoard(remaining[0].id);
    } else {
      get().createBoard('Untitled board');
    }
  },

  initBoards: () => {
    if (boardsInitialized) return;
    boardsInitialized = true;
    let boards = loadBoardIndex();
    if (boards.length === 0) {
      boards = [{ id: newBoardId(), name: 'Untitled board', updatedAt: Date.now() }];
      saveBoardIndex(boards);
    }
    const last = loadCurrentBoardId();
    const id = boards.some((b) => b.id === last) ? (last as string) : boards[0].id;
    saveCurrentBoardId(id);
    set({ boards, currentBoardId: id, saveStatus: 'saved' });
    const data = loadBoardData(id);
    loadWithoutAutosave(data?.nodes ?? [], data?.edges ?? [], data?.userEdgeTypes);
  },

  setGroupHoverDelay: (ms) => set({ groupHoverDelay: ms }),

  setObserverMode: (mode) => set({ observerMode: mode }),

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
    const maxEdgeId = edges.reduce((max, e) => {
      const match = e.id.match(/^edge-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    edgeCounter = Math.max(edgeCounter, maxEdgeId + 1);
    lastEdit = null;
    dragInProgress = false;

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
    lastEdit = null;
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
    lastEdit = null;
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

// ── Autosave ─────────────────────────────────────────────────────

const AUTOSAVE_MS = 600;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Board id captured when the pending save was scheduled. */
let pendingBoardId: string | null = null;
/** True while a board switch/load is replacing store contents (must not be autosaved). */
let suppressAutosave = false;
let boardsInitialized = false;

function loadWithoutAutosave(nodes: AnodiNode[], edges: AnodiEdge[], userEdgeTypes?: UserEdgeType[]) {
  suppressAutosave = true;
  try {
    useGraphStore.getState().loadGraph(nodes, edges, userEdgeTypes);
  } finally {
    suppressAutosave = false;
  }
}

function cancelSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  pendingBoardId = null;
}

/** Write the pending save now (if any) to the board it was scheduled for. */
function flushSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const boardId = pendingBoardId;
  pendingBoardId = null;
  if (!boardId) return;
  const st = useGraphStore.getState();
  // Only the current board's contents live in the store
  if (st.currentBoardId !== boardId) return;
  const ok = saveBoardData(boardId, st.nodes, st.edges, st.userEdgeTypes);
  const boards = st.boards.map((b) => (b.id === boardId ? { ...b, updatedAt: Date.now() } : b));
  const indexOk = saveBoardIndex(boards);
  useGraphStore.setState({ boards, saveStatus: ok && indexOk ? 'saved' : 'error' });
}

function scheduleSave(boardId: string) {
  pendingBoardId = boardId;
  if (saveTimer) clearTimeout(saveTimer);
  if (useGraphStore.getState().saveStatus !== 'saving') useGraphStore.setState({ saveStatus: 'saving' });
  saveTimer = setTimeout(flushSave, AUTOSAVE_MS);
}

if (typeof window !== 'undefined') {
  useGraphStore.subscribe((state, prev) => {
    if (suppressAutosave || !state.currentBoardId) return;
    if (
      state.nodes !== prev.nodes ||
      state.edges !== prev.edges ||
      state.userEdgeTypes !== prev.userEdgeTypes
    ) {
      scheduleSave(state.currentBoardId);
    }
  });
  window.addEventListener('beforeunload', flushSave);
  useGraphStore.getState().initBoards();
}

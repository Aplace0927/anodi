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
} from '../types';

interface Snapshot {
  nodes: AnodiNode[];
  edges: AnodiEdge[];
}

const MAX_HISTORY = 50;

interface GraphState {
  nodes: AnodiNode[];
  edges: AnodiEdge[];
  selectedNodeId: string | null;
  activeEdgeType: EdgeRelationship;
  searchQuery: string;

  // History
  past: Snapshot[];
  future: Snapshot[];

  // Node actions
  addNode: (name: string, data: NodeData) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeName: (id: string, name: string) => void;
  onNodesChange: (changes: NodeChange<AnodiNode>[]) => void;

  // Edge actions
  onEdgesChange: (changes: EdgeChange<AnodiEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setActiveEdgeType: (type: EdgeRelationship) => void;

  // Selection
  selectNode: (id: string | null) => void;

  // Search
  setSearchQuery: (q: string) => void;

  // Import / export
  loadGraph: (nodes: AnodiNode[], edges: AnodiEdge[]) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let nodeCounter = 1;

function pushSnapshot(past: Snapshot[], nodes: AnodiNode[], edges: AnodiEdge[]): Snapshot[] {
  const newPast = [...past, { nodes, edges }];
  if (newPast.length > MAX_HISTORY) newPast.shift();
  return newPast;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  activeEdgeType: 'call',
  searchQuery: '',
  past: [],
  future: [],

  addNode: (name, data) => {
    const id = `node-${nodeCounter++}`;
    const offset = (nodeCounter - 1) * 20;
    const newNode: AnodiNode = {
      id,
      type: data.kind,
      position: { x: 100 + (offset % 400), y: 100 + Math.floor(offset / 400) * 200 },
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
    set((s) => ({
      ...(hasStructural
        ? { past: pushSnapshot(s.past, s.nodes, s.edges), future: [] }
        : {}),
      nodes: applyNodeChanges(changes as NodeChange<AnodiNode>[], s.nodes),
    }));
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

  selectNode: (id) => set({ selectedNodeId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  loadGraph: (nodes, edges) => {
    // Reset counter based on imported node IDs to avoid collisions
    const maxId = nodes.reduce((max, n) => {
      const match = n.id.match(/^node-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    // If no standard IDs were found, use current timestamp to avoid collisions
    nodeCounter = maxId > 0 ? maxId + 1 : Date.now();
    set({ nodes, edges, selectedNodeId: null, searchQuery: '', past: [], future: [] });
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

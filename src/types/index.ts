// ── Node data types ──────────────────────────────────────────────

export type SourceLanguage =
  | 'c'
  | 'cpp'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'go';

// Each interface extends Record<string, unknown> so it satisfies @xyflow/react's constraint.
export interface SourceCodeData extends Record<string, unknown> {
  kind: 'source';
  language: SourceLanguage;
  code: string;
  // For each "..." line in code (0-indexed occurrence), the starting line number of the next section.
  collapsedLineMap: number[];
  name?: string;
}

export interface ClassField {
  id: string;
  name: string;
  type: string;
}

export interface ClassMethod {
  id: string;
  signature: string;
}

export interface ClassDiagramData extends Record<string, unknown> {
  kind: 'class';
  className: string;
  fields: ClassField[];
  methods: ClassMethod[];
  name?: string;
}

export type MemoryUnitSize = 4 | 8 | 16;

export interface MemoryCollapsedRange {
  id: string;
  start: string; // hex address e.g. "0x4050"
  end: string;   // hex address e.g. "0x4150" (exclusive)
}

export interface MemoryLayoutData extends Record<string, unknown> {
  kind: 'memory';
  baseAddress: string;      // start of the memory range, e.g. "0x4000"
  endAddress: string;       // end of the memory range (exclusive), e.g. "0x4200"
  unitSize: MemoryUnitSize; // bytes per addressable unit: 4, 8, or 16
  collapsedRanges: MemoryCollapsedRange[];
  name?: string;
}

export type NodeData = SourceCodeData | ClassDiagramData | MemoryLayoutData;

// ── Edge types ───────────────────────────────────────────────────

export type EdgeRelationship = 'call' | 'reference' | 'sharedVariable';

export interface AnodiEdgeData extends Record<string, unknown> {
  relationship: EdgeRelationship;
}

// ── React Flow node/edge aliases ─────────────────────────────────

import type { Node, Edge } from '@xyflow/react';

export type AnodiNode = Node<NodeData>;
export type AnodiEdge = Edge<AnodiEdgeData>;

// ── Edge style helpers ───────────────────────────────────────────

export const EDGE_STYLES: Record<
  EdgeRelationship,
  { label: string; color: string; strokeDasharray?: string }
> = {
  call: { label: 'Call', color: '#3b82f6' },
  reference: { label: 'Reference', color: '#22c55e', strokeDasharray: '6 3' },
  sharedVariable: {
    label: 'Shared Variable',
    color: '#f97316',
    strokeDasharray: '2 4',
  },
};

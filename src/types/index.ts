// ── Node data types ──────────────────────────────────────────────

export type SourceLanguage =
  | 'c'
  | 'cpp'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'go'
  | 'assembly (x86-64)'
  | 'assembly (arm)';

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

/** Type of user-provided content attached to a memory address. */
export type MemoryCellType = 'hex' | 'text' | 'field';

/**
 * A user annotation attached to a specific memory address inside a MemoryLayoutNode.
 *
 * - `hex`   – raw bytes shown as "41 42 43 00"
 * - `text`  – plain string shown as "Hello"
 * - `field` – named field spanning `fieldSize` bytes (e.g. `int size`)
 */
export interface MemoryCell {
  id: string;
  type: MemoryCellType;
  address: string;      // hex string, e.g. "0x4010"
  value?: string;       // for hex / text types
  fieldName?: string;   // for field type: name of the field
  fieldSize?: number;   // for field type: size in bytes
}

export interface MemoryLayoutData extends Record<string, unknown> {
  kind: 'memory';
  baseAddress: string;      // start of the memory range, e.g. "0x4000"
  endAddress: string;       // end of the memory range (exclusive), e.g. "0x4200"
  unitSize: MemoryUnitSize; // bytes per addressable unit: 4, 8, or 16
  collapsedRanges: MemoryCollapsedRange[];
  cells?: MemoryCell[];     // user-provided content annotations
  name?: string;
}

export type NodeData = SourceCodeData | ClassDiagramData | MemoryLayoutData;

// ── Edge types ───────────────────────────────────────────────────

export type EdgeRelationship = 'call' | 'reference' | 'information';

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
  information: {
    label: 'Information',
    color: '#f97316',
    strokeDasharray: '2 4',
  },
};

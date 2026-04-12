// ── Node data types ──────────────────────────────────────────────

export type SourceLanguage =
  | 'c'
  | 'cpp'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'go'
  | 'ocaml'
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
  nodeColor?: string; // custom color for the node header/border
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
  nodeColor?: string; // custom color for the node header/border
}

export type MemoryUnitSize = 4 | 8 | 16;

export interface MemoryCollapsedRange {
  id: string;
  start: string; // hex address e.g. "0x4050"
  end: string;   // hex address e.g. "0x4150" (exclusive)
}

/** Type of user-provided content attached to a memory address. */
export type MemoryCellType = 'hex' | 'text' | 'field' | 'number' | 'integer';

export type IntegerSize = 1 | 2 | 4 | 8;
export type Endianness = 'little' | 'big';
export type MemoryNumberKind = 'int8_t' | 'int16_t' | 'int32_t' | 'int64_t' | 'float' | 'double';

/**
 * A user annotation attached to a specific memory address inside a MemoryLayoutNode.
 *
 * - `hex`     – raw bytes shown as "41 42 43 00"
 * - `text`    – plain string shown as "Hello"
 * - `field`   – named field spanning `fieldSize` bytes (e.g. `int size`)
 * - `number`  – scalar value rendered as bytes (`int*_t`, `float`, `double`, little/big endian)
 */
export interface MemoryCell {
  id: string;
  type: MemoryCellType;
  address: string;      // hex string, e.g. "0x4010"
  value?: string;       // for hex / text / number types
  fieldName?: string;   // for field type: name of the field
  fieldSize?: number;   // for field type: size in bytes
  numberKind?: MemoryNumberKind; // for number type: scalar kind
  numberSigned?: boolean;        // for integer number kinds: signed vs unsigned
  integerSize?: IntegerSize;     // legacy support for old "integer" cells
  endianness?: Endianness;       // for number/legacy-integer type: byte order
  fieldColor?: string;           // custom color for memory cell styling
}

export interface MemoryLayoutData extends Record<string, unknown> {
  kind: 'memory';
  baseAddress: string;      // start of the memory range, e.g. "0x4000"
  endAddress: string;       // end of the memory range (exclusive), e.g. "0x4200"
  unitSize: MemoryUnitSize; // bytes per addressable unit: 4, 8, or 16
  collapsedRanges: MemoryCollapsedRange[];
  cells?: MemoryCell[];     // user-provided content annotations
  name?: string;
  nodeColor?: string; // custom color for the node header/border
}

export interface NotepadData extends Record<string, unknown> {
  kind: 'notepad';
  content: string;
  name?: string;
  nodeColor?: string;
}

export interface GroupData extends Record<string, unknown> {
  kind: 'group';
  name?: string;
  groupColor?: string;
  memberNodeIds: string[];
  /** Computed width of the group (set by recomputeGroupBounds). */
  computedWidth?: number;
  /** Computed height of the group (set by recomputeGroupBounds). */
  computedHeight?: number;
}

export type NodeData = SourceCodeData | ClassDiagramData | MemoryLayoutData | NotepadData | GroupData;

// ── Group helpers ────────────────────────────────────────────────

/** Padding (px) around member nodes inside a group visual. */
export const GROUP_PADDING = 40;
/** Height (px) reserved for the group name header. */
export const GROUP_HEADER_HEIGHT = 36;
/** Minimum visual width when group is empty. */
export const GROUP_MIN_WIDTH = 200;
/** Minimum visual height when group is empty. */
export const GROUP_MIN_HEIGHT = 120;
/** Default long-press delay (ms) for add/remove node to/from group. */
export const GROUP_LONG_PRESS_MS = 600;

// ── Edge types ───────────────────────────────────────────────────

export type BuiltinEdgeRelationship = 'call' | 'reference' | 'information';
export type EdgeRelationship = BuiltinEdgeRelationship | (string & {});

export interface AnodiEdgeData extends Record<string, unknown> {
  relationship: EdgeRelationship;
  bendPoints?: { x: number; y: number }[];
}

// ── React Flow node/edge aliases ─────────────────────────────────

import type { Node, Edge } from '@xyflow/react';

export type AnodiNode = Node<NodeData>;
export type AnodiEdge = Edge<AnodiEdgeData>;

// ── Edge style helpers ───────────────────────────────────────────

export interface EdgeStyleInfo {
  label: string;
  color: string;
  strokeDasharray?: string;
}

export const BUILTIN_RELATIONSHIPS: BuiltinEdgeRelationship[] = ['call', 'reference', 'information'];

export const EDGE_STYLES: Record<BuiltinEdgeRelationship, EdgeStyleInfo> = {
  call: { label: 'Call', color: '#3b82f6' },
  reference: { label: 'Reference', color: '#22c55e', strokeDasharray: '6 3' },
  information: {
    label: 'Information',
    color: '#f97316',
    strokeDasharray: '2 4',
  },
};

// ── User-defined edge types ──────────────────────────────────────

/** Keys available for user-defined edge shortcuts, in assignment order. */
export const USER_EDGE_SHORTCUT_KEYS = ['4', '5', '6', '7', '8', '9', '0'] as const;
export const MAX_USER_EDGE_TYPES = USER_EDGE_SHORTCUT_KEYS.length; // 7

export interface UserEdgeType {
  id: string;            // unique identifier, used as EdgeRelationship value
  label: string;         // display name
  color: string;         // hex color
  strokeDasharray?: string;
  shortcutKey: string;   // one of USER_EDGE_SHORTCUT_KEYS
}

export const BUILTIN_EDGE_SHORTCUT: Record<string, string> = {
  call: '1',
  reference: '2',
  information: '3',
};

/** Look up edge style for any relationship (builtin or user-defined). */
export function getEdgeStyle(
  relationship: EdgeRelationship,
  userEdgeTypes: UserEdgeType[]
): EdgeStyleInfo {
  if (relationship in EDGE_STYLES) {
    return EDGE_STYLES[relationship as BuiltinEdgeRelationship];
  }
  const userType = userEdgeTypes.find((t) => t.id === relationship);
  if (userType) {
    return { label: userType.label, color: userType.color, strokeDasharray: userType.strokeDasharray };
  }
  // Fallback
  return { label: relationship, color: '#6b7280' };
}

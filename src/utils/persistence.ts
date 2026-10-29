import type { AnodiNode, AnodiEdge, UserEdgeType } from '../types';
import type { AnodiGraphJson } from './export';

// ── Types & keys ─────────────────────────────────────────────────

export interface BoardMeta {
  id: string;
  name: string;
  updatedAt: number;
}

const BOARDS_KEY = 'anodi-boards';
const BOARD_PREFIX = 'anodi-board:';
const CURRENT_BOARD_KEY = 'anodi-current-board';

// ── Index ────────────────────────────────────────────────────────

export function loadBoardIndex(): BoardMeta[] {
  try {
    const raw = localStorage.getItem(BOARDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Returns false on failure (e.g. quota exceeded). */
export function saveBoardIndex(boards: BoardMeta[]): boolean {
  try {
    localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrentBoardId(): string | null {
  try {
    return localStorage.getItem(CURRENT_BOARD_KEY);
  } catch {
    return null;
  }
}

export function saveCurrentBoardId(id: string): void {
  try {
    localStorage.setItem(CURRENT_BOARD_KEY, id);
  } catch {
    // ignore
  }
}

// ── Board contents ───────────────────────────────────────────────

export function newBoardId(): string {
  return `board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Strip transient render-time fields before persisting. */
function stripNode(n: AnodiNode): AnodiNode {
  const { selected: _s, dragging: _d, ...rest } = n;
  void _s; void _d;
  return rest as AnodiNode;
}

function stripEdge(e: AnodiEdge): AnodiEdge {
  const { selected: _s, ...rest } = e;
  void _s;
  return rest as AnodiEdge;
}

/** Returns false on failure (e.g. quota exceeded). */
export function saveBoardData(
  id: string,
  nodes: AnodiNode[],
  edges: AnodiEdge[],
  userEdgeTypes: UserEdgeType[],
): boolean {
  try {
    const payload: AnodiGraphJson = {
      version: 1,
      nodes: nodes.map(stripNode),
      edges: edges.map(stripEdge),
      userEdgeTypes,
    };
    localStorage.setItem(BOARD_PREFIX + id, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadBoardData(id: string): AnodiGraphJson | null {
  try {
    const raw = localStorage.getItem(BOARD_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnodiGraphJson;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteBoardData(id: string): void {
  try {
    localStorage.removeItem(BOARD_PREFIX + id);
  } catch {
    // ignore
  }
}

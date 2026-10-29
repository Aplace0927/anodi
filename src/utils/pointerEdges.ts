import type { AnodiEdge, AnodiNode, MemoryLayoutData } from "../types";
import { buildRowItems, parseHexAddr, visibleCells } from "./memory";

export const POINTER_EDGE_PREFIX = "ptr-";
export const POINTER_EDGE_COLOR = "#ec4899";

interface RowIndex {
  node: AnodiNode;
  base: number;
  end: number;
  unit: number;
  /** Visible row start address → handle label. */
  labels: Map<number, string>;
}

function indexMemoryNode(node: AnodiNode): RowIndex {
  const d = node.data as MemoryLayoutData;
  const unit = d.unitSize ?? 8;
  const labels = new Map<number, string>();
  for (const item of buildRowItems(d.baseAddress ?? "0x0", d.endAddress ?? "0x0", unit, d.collapsedRanges ?? [])) {
    if (!("ellipsis" in item)) labels.set(item.addr, item.label);
  }
  return { node, base: parseHexAddr(d.baseAddress ?? "0x0"), end: parseHexAddr(d.endAddress ?? "0x0"), unit, labels };
}

const rowOf = (idx: RowIndex, addr: number) => idx.base + Math.floor((addr - idx.base) / idx.unit) * idx.unit;

const centerX = (n: AnodiNode) => n.position.x + (n.measured?.width ?? 0) / 2;

/**
 * Derived (non-persisted) edges from every visible pointer cell to the memory
 * row it points at. Skipped when either row is folded away.
 */
export function buildPointerEdges(nodes: AnodiNode[]): AnodiEdge[] {
  const mem = nodes.filter((n) => n.data.kind === "memory").map(indexMemoryNode);
  if (mem.length === 0) return [];
  const out: AnodiEdge[] = [];
  for (const src of mem) {
    const d = src.node.data as MemoryLayoutData;
    for (const cell of visibleCells(d.cells ?? [])) {
      if (cell.type !== "pointer") continue;
      let target: number;
      try {
        target = Number(BigInt(cell.value || "0"));
      } catch {
        continue;
      }
      const dst = mem.find((m) => m.node.id === src.node.id && target >= m.base && target < m.end)
        ?? mem.find((m) => target >= m.base && target < m.end);
      if (!dst) continue;
      const srcLabel = src.labels.get(rowOf(src, parseHexAddr(cell.address)));
      const dstLabel = dst.labels.get(rowOf(dst, target));
      if (!srcLabel || !dstLabel) continue;

      const self = dst.node.id === src.node.id;
      const leftward = !self && centerX(dst.node) < centerX(src.node);
      out.push({
        id: `${POINTER_EDGE_PREFIX}${src.node.id}-${cell.id}`,
        source: src.node.id,
        target: dst.node.id,
        sourceHandle: `addr-${srcLabel}-${leftward ? "left" : "right"}`,
        targetHandle: `addr-${dstLabel}-${self || leftward ? "right" : "left"}`,
        type: "smoothstep",
        selectable: false,
        deletable: false,
        focusable: false,
      });
    }
  }
  return out;
}

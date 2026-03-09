import type { AnodiNode } from '../types';

export interface SearchMatch {
  nodeId: string;
  nodeName: string;
  nodeKind: string;
  context: string;
}

export function searchNodes(nodes: AnodiNode[], query: string): SearchMatch[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchMatch[] = [];

  for (const node of nodes) {
    const data = node.data as typeof node.data & { name?: string };
    const name = data.name ?? node.id;

    if (data.kind === 'source') {
      const lines = data.code.split('\n');
      const matching = lines
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => line.toLowerCase().includes(q));
      if (name.toLowerCase().includes(q) || matching.length > 0) {
        const context =
          matching.length > 0
            ? matching
                .slice(0, 3)
                .map(({ line, i }) => `L${i + 1}: ${line.trim()}`)
                .join(' · ')
            : `Language: ${data.language}`;
        results.push({ nodeId: node.id, nodeName: name, nodeKind: 'source', context });
      }
    } else if (data.kind === 'class') {
      const hits: string[] = [];
      if (data.className.toLowerCase().includes(q)) hits.push(`class ${data.className}`);
      data.fields.forEach((f) => {
        if (f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q))
          hits.push(`field: ${f.type} ${f.name}`);
      });
      data.methods.forEach((m) => {
        if (m.signature.toLowerCase().includes(q)) hits.push(`method: ${m.signature}`);
      });
      if (name.toLowerCase().includes(q) || hits.length > 0) {
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'class',
          context: hits.slice(0, 3).join(' · ') || `class ${data.className}`,
        });
      }
    } else if (data.kind === 'memory') {
      const hits: string[] = [];
      if (
        (data.baseAddress ?? '').toLowerCase().includes(q) ||
        (data.endAddress ?? '').toLowerCase().includes(q)
      ) {
        hits.push(`${data.baseAddress}–${data.endAddress}`);
      }
      (data.collapsedRanges ?? []).forEach((r) => {
        if (r.start.toLowerCase().includes(q) || r.end.toLowerCase().includes(q)) {
          hits.push(`collapsed: ${r.start}–${r.end}`);
        }
      });
      if (name.toLowerCase().includes(q) || hits.length > 0) {
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'memory',
          context: hits.slice(0, 3).join(' · ') || 'Memory layout',
        });
      }
    } else if (data.kind === 'notepad') {
      if (name.toLowerCase().includes(q) || (data.content ?? '').toLowerCase().includes(q)) {
        const preview = (data.content ?? '').substring(0, 80);
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'notepad',
          context: preview || 'Empty notepad',
        });
      }
    } else if (data.kind === 'group') {
      if (name.toLowerCase().includes(q)) {
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'group',
          context: `Group (${data.memberNodeIds?.length ?? 0} nodes)`,
        });
      }
    }
  }

  return results;
}

import type { AnodiNode } from '../types';

export interface SearchMatch {
  nodeId: string;
  nodeName: string;
  nodeKind: string;
  context: string;
  /** First matching line (1-based), source nodes only. */
  lineNumber?: number;
}

export interface SearchOptions {
  regex?: boolean;
  kinds?: string[];
}

export function searchNodes(nodes: AnodiNode[], query: string, options?: SearchOptions): SearchMatch[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchMatch[] = [];

  let re: RegExp | null = null;
  if (options?.regex) {
    try {
      re = new RegExp(query, 'i');
    } catch {
      return [];
    }
  }
  const test = (text: string): boolean => (re ? re.test(text) : text.toLowerCase().includes(q));
  const kinds = options?.kinds && options.kinds.length > 0 ? new Set(options.kinds) : null;

  for (const node of nodes) {
    const data = node.data as typeof node.data & { name?: string };
    const name = data.name ?? node.id;
    if (kinds && !kinds.has(data.kind)) continue;

    if (data.kind === 'source') {
      const lines = data.code.split('\n');
      const matching = lines
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => test(line));
      if (test(name) || matching.length > 0) {
        const context =
          matching.length > 0
            ? matching
                .slice(0, 3)
                .map(({ line, i }) => `L${i + 1}: ${line.trim()}`)
                .join(' · ')
            : `Language: ${data.language}`;
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'source',
          context,
          lineNumber: matching.length > 0 ? matching[0].i + 1 : undefined,
        });
      }
    } else if (data.kind === 'class') {
      const hits: string[] = [];
      if (test(data.className)) hits.push(`class ${data.className}`);
      data.fields.forEach((f) => {
        if (test(f.name) || test(f.type)) hits.push(`field: ${f.type} ${f.name}`);
      });
      data.methods.forEach((m) => {
        if (test(m.signature)) hits.push(`method: ${m.signature}`);
      });
      if (test(name) || hits.length > 0) {
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'class',
          context: hits.slice(0, 3).join(' · ') || `class ${data.className}`,
        });
      }
    } else if (data.kind === 'memory') {
      const hits: string[] = [];
      if (test(data.baseAddress ?? '') || test(data.endAddress ?? '')) {
        hits.push(`${data.baseAddress}–${data.endAddress}`);
      }
      (data.collapsedRanges ?? []).forEach((r) => {
        if (test(r.start) || test(r.end)) {
          hits.push(`collapsed: ${r.start}–${r.end}`);
        }
      });
      (data.cells ?? []).forEach((c) => {
        const label = c.type === 'field' ? (c.fieldName ?? '') : (c.value ?? '');
        if (test(label) || test(c.address ?? '')) {
          const desc =
            c.type === 'field'
              ? `field ${c.fieldName ?? ''}`
              : c.type === 'text'
                ? `text "${c.value ?? ''}"`
                : `${c.type} ${c.value ?? ''}`;
          hits.push(`${desc.trim()} @${c.address}`);
        }
      });
      if (test(name) || hits.length > 0) {
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'memory',
          context: hits.slice(0, 3).join(' · ') || 'Memory layout',
        });
      }
    } else if (data.kind === 'notepad') {
      if (test(name) || test(data.content ?? '')) {
        const preview = (data.content ?? '').substring(0, 80);
        results.push({
          nodeId: node.id,
          nodeName: name,
          nodeKind: 'notepad',
          context: preview || 'Empty notepad',
        });
      }
    } else if (data.kind === 'group') {
      if (test(name)) {
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

import { Plus, Sparkles } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';
import type { SourceLanguage } from '../types';

interface Props {
  onAddNode: () => void;
}

const EXAMPLE_CODE = `#include <stdio.h>

int add(int a, int b) {
  return a + b;
}

int main(void) {
  int x = add(2, 3);
  printf("%d\\n", x);
  return 0;
}`;

export default function EmptyState({ onAddNode }: Props) {
  const loadExample = () => {
    const s = useGraphStore.getState();
    const [src, cls, mem, note] = s.addNodes([
      {
        name: 'main.c',
        position: { x: 0, y: 0 },
        data: { kind: 'source', language: 'c' as SourceLanguage, code: EXAMPLE_CODE, collapsedLineMap: [] },
      },
      {
        name: 'Calculator',
        position: { x: 520, y: 0 },
        data: {
          kind: 'class',
          className: 'Calculator',
          fields: [{ id: 'ex-f1', name: 'result', type: 'int' }],
          methods: [
            { id: 'ex-m1', signature: 'int add(int a, int b)' },
            { id: 'ex-m2', signature: 'void reset()' },
          ],
        },
      },
      {
        name: 'Stack frame',
        position: { x: 0, y: 380 },
        data: {
          kind: 'memory',
          baseAddress: '0x4000',
          endAddress: '0x4040',
          unitSize: 8,
          collapsedRanges: [],
          cells: [
            { id: 'ex-c1', type: 'field', address: '0x4000', fieldName: 'x', fieldSize: 4 },
            { id: 'ex-c2', type: 'text', address: '0x4010', value: 'Hello' },
          ],
        },
      },
      {
        name: 'Notes',
        position: { x: 520, y: 320 },
        data: { kind: 'notepad', content: 'main() calls add().\nResult is stored on the stack.' },
      },
    ]);
    s.addEdgeBetween(src, cls, { sourceHandle: 'line-8-right', targetHandle: 'top', relationship: 'call', label: 'add()' });
    s.addEdgeBetween(src, mem, { sourceHandle: 'line-8-left', targetHandle: 'addr-0x4000-left', relationship: 'reference' });
    s.addEdgeBetween(cls, note, { sourceHandle: 'bottom', targetHandle: 'top', relationship: 'information' });
    setTimeout(() => window.dispatchEvent(new Event('anodi-fit-view')), 50);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-800 dark:text-gray-100">
          <span className="text-indigo-500">A</span>nodi
        </h1>
        <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <p>Press N to add a node</p>
          <p>Drop source files here</p>
          <p>⌘K for commands</p>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={onAddNode}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-600"
          >
            <Plus size={14} />
            Add node
          </button>
          <button
            onClick={loadExample}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-normal text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Sparkles size={14} />
            Load example
          </button>
        </div>
      </div>
    </div>
  );
}

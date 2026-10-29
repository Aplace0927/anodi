import { ClipboardCopy, Code2, Copy, FolderMinus, FolderPlus, Highlighter, Link2, Link2Off, ListPlus, Trash2, Ungroup } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import type { ClassDiagramData, Endianness, GroupData, MemoryLayoutData, MemoryUnitSize, NodeData, PointerSize, SourceCodeData, SourceLanguage } from '../../types';
import { toast } from '../../store/toastStore';
import { parseHexAddr } from '../../utils/memory';
import { exportCArray, exportPwntools, exportPyBytes } from '../../utils/memoryTools';
import { v4 } from '../../utils/uuid';
import { anchorAt, trimRange, wordRangeAt } from '../../utils/tokenAnchor';
import type { MenuCtx, MenuItem } from './types';
import { sep } from './types';

const LANGS: SourceLanguage[] = ['c', 'cpp', 'python', 'javascript', 'typescript', 'rust', 'go', 'ocaml', 'assembly (x86-64)', 'assembly (arm)'];

const KIND_LABEL: Record<NodeData['kind'], string> = {
  source: 'Source Code',
  class: 'Class Diagram',
  memory: 'Memory Layout',
  notepad: 'Notepad',
  group: 'Group',
};

const short = (s: string, max = 24) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Line-level and word-level actions when right-clicking inside source code. */
function sourceCodeItems(nodeId: string, data: SourceCodeData, ctx: MenuCtx): MenuItem[] {
  const code = ctx.state.code;
  if (!code) return [];
  const st = useGraphStore.getState();
  const { line, index, content } = code;
  const anchors = data.tokenAnchors ?? [];
  const existing = (ctx.state.anchorId && anchors.find((a) => a.id === ctx.state.anchorId)) || anchorAt(anchors, line, index);
  const word = wordRangeAt(content, index);
  const whole = trimRange(content, 0, content.length);
  const highlighted = (data.highlights ?? []).some((h) => h.line === line);
  const note = (data.lineNotes ?? []).find((n) => n.line === line)?.text ?? '';

  const items: MenuItem[] = [{ type: 'header', key: 'line-h', label: `Line ${line}` }];
  if (existing) {
    items.push({
      key: 'anchor-rm',
      label: `Remove point “${short(content.slice(existing.start, existing.end))}”`,
      icon: <Link2Off size={14} />,
      onClick: ctx.run(() => st.removeTokenAnchor(nodeId, existing.id)),
    });
  } else if (word) {
    items.push({
      key: 'anchor-word',
      label: `Connect from “${short(content.slice(word.start, word.end))}”`,
      icon: <Link2 size={14} />,
      hint: '⌘-click',
      onClick: ctx.run(() => st.addTokenAnchor(nodeId, { line, ...word })),
    });
  }
  if (whole && !anchors.some((a) => a.line === line && a.start === whole.start && a.end === whole.end)) {
    items.push({
      key: 'anchor-line',
      label: 'Connection point on whole line',
      icon: <Link2 size={14} />,
      onClick: ctx.run(() => st.addTokenAnchor(nodeId, { line, ...whole })),
    });
  }
  items.push(
    {
      key: 'hl',
      label: highlighted ? 'Remove highlight' : 'Highlight line',
      icon: <Highlighter size={14} />,
      hint: '⌥-click #',
      onClick: ctx.run(() =>
        st.updateNodeData(nodeId, {
          highlights: highlighted
            ? (data.highlights ?? []).filter((h) => h.line !== line)
            : [...(data.highlights ?? []), { line }],
        }),
      ),
    },
    {
      type: 'input',
      key: 'note',
      label: 'Line note',
      value: note,
      placeholder: 'Note…',
      onChange: (text) => {
        const cur = (useGraphStore.getState().nodes.find((n) => n.id === nodeId)?.data as SourceCodeData | undefined)?.lineNotes ?? [];
        const rest = cur.filter((n) => n.line !== line);
        st.updateNodeData(nodeId, { lineNotes: text ? [...rest, { line, text }] : rest });
      },
    },
    sep('line-s'),
  );
  return items;
}

function kindItems(nodeId: string, data: NodeData, ctx: MenuCtx): MenuItem[] {
  const st = useGraphStore.getState();
  switch (data.kind) {
    case 'source':
      return [
        {
          key: 'lang',
          label: 'Language',
          icon: <Code2 size={14} />,
          hint: data.language,
          children: LANGS.map((l) => ({
            key: `l-${l}`,
            label: l,
            checked: l === data.language,
            onClick: ctx.run(() => st.updateNodeData(nodeId, { language: l })),
          })),
        },
      ];
    case 'class': {
      const d = data as ClassDiagramData;
      return [
        { type: 'input', key: 'cls', label: 'Class name', value: d.className, mono: true, onChange: (v) => st.updateNodeData(nodeId, { className: v }) },
        {
          key: 'add-field',
          label: 'Add field',
          icon: <ListPlus size={14} />,
          onClick: ctx.run(() => st.updateNodeData(nodeId, { fields: [...d.fields, { id: v4(), name: 'field', type: 'int' }] })),
        },
        {
          key: 'add-method',
          label: 'Add method',
          icon: <ListPlus size={14} />,
          onClick: ctx.run(() => st.updateNodeData(nodeId, { methods: [...d.methods, { id: v4(), signature: 'void method()' }] })),
        },
      ];
    }
    case 'memory': {
      const d = data as MemoryLayoutData;
      const cells = d.cells ?? [];
      const base = parseHexAddr(d.baseAddress ?? '0x0');
      const copy = (label: string, text: string) =>
        ctx.run(() => {
          navigator.clipboard.writeText(text).then(
            () => toast.success(`Copied as ${label}`),
            () => toast.error('Clipboard unavailable'),
          );
        });
      return [
        {
          type: 'segmented',
          key: 'unit',
          label: 'Unit size',
          value: d.unitSize ?? 8,
          options: ([4, 8, 16] as MemoryUnitSize[]).map((u) => ({ id: u, label: `${u}B` })),
          onChange: (v) => st.updateNodeData(nodeId, { unitSize: v as MemoryUnitSize }),
        },
        {
          type: 'segmented',
          key: 'endian',
          label: 'Endianness',
          value: d.defaultEndianness ?? 'little',
          options: [
            { id: 'little', label: 'Little' },
            { id: 'big', label: 'Big' },
          ],
          onChange: (v) => st.updateNodeData(nodeId, { defaultEndianness: v as Endianness }),
        },
        {
          type: 'segmented',
          key: 'ptr',
          label: 'Pointer',
          value: d.pointerSize ?? 8,
          options: [
            { id: 4, label: '32-bit' },
            { id: 8, label: '64-bit' },
          ],
          onChange: (v) => st.updateNodeData(nodeId, { pointerSize: v as PointerSize }),
        },
        {
          key: 'export',
          label: 'Copy payload as',
          icon: <ClipboardCopy size={14} />,
          disabled: cells.length === 0,
          children: [
            { key: 'pwn', label: 'pwntools flat()', onClick: copy('pwntools', exportPwntools(cells, base)) },
            { key: 'py', label: 'Python bytes', onClick: copy('Python bytes', exportPyBytes(cells, base)) },
            { key: 'c', label: 'C array', onClick: copy('C array', exportCArray(cells, base, d.name ?? 'buf')) },
          ],
        },
      ];
    }
    default:
      return [];
  }
}

function groupMenu(groupId: string, data: GroupData, ctx: MenuCtx): MenuItem[] {
  const st = useGraphStore.getState();
  return [
    { type: 'header', key: 'h', label: 'Group' },
    { type: 'input', key: 'name', label: 'Name', value: data.name ?? '', onChange: (v) => st.updateNodeName(groupId, v) },
    {
      type: 'swatches',
      key: 'color',
      label: 'Color',
      value: data.groupColor,
      fallback: '#6366f1',
      onChange: (c) => st.updateNodeData(groupId, { groupColor: c }),
    },
    sep('s1'),
    {
      key: 'ungroup',
      label: 'Ungroup',
      icon: <Ungroup size={14} />,
      hint: `${data.memberNodeIds.length} kept`,
      onClick: ctx.run(() => st.onNodesChange([{ type: 'remove', id: groupId }])),
    },
    {
      key: 'del',
      label: 'Delete group and members',
      icon: <Trash2 size={14} />,
      danger: true,
      disabled: data.memberNodeIds.length === 0,
      onClick: ctx.run(() =>
        st.onNodesChange([groupId, ...data.memberNodeIds].map((id) => ({ type: 'remove' as const, id }))),
      ),
    },
  ];
}

export function nodeMenu(ctx: MenuCtx): MenuItem[] {
  const st = useGraphStore.getState();
  const nodeId = ctx.state.id!;
  const node = st.nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  if (node.type === 'group') return groupMenu(nodeId, node.data as GroupData, ctx);

  const data = node.data;
  const groups = st.nodes.filter((n) => n.type === 'group');
  const home = groups.filter((g) => (g.data as GroupData).memberNodeIds.includes(nodeId));
  const others = groups.filter((g) => !(g.data as GroupData).memberNodeIds.includes(nodeId));

  const items: MenuItem[] = [];
  if (data.kind === 'source') items.push(...sourceCodeItems(nodeId, data, ctx));
  items.push(
    { type: 'header', key: 'h', label: KIND_LABEL[data.kind] },
    { type: 'input', key: 'name', label: 'Name', value: (data.name as string | undefined) ?? '', onChange: (v) => st.updateNodeName(nodeId, v) },
    {
      type: 'swatches',
      key: 'color',
      label: 'Color',
      value: data.nodeColor as string | undefined,
      onChange: (c) => st.updateNodeData(nodeId, { nodeColor: c }),
    },
    ...kindItems(nodeId, data, ctx),
    sep('s1'),
    {
      key: 'dup',
      label: 'Duplicate',
      icon: <Copy size={14} />,
      onClick: ctx.run(() => {
        st.selectNode(nodeId);
        st.copySelection();
        st.pasteSelection();
      }),
    },
  );
  if (others.length > 0) {
    items.push({
      key: 'addg',
      label: 'Add to group',
      icon: <FolderPlus size={14} />,
      children: others.map((g) => ({
        key: `g-${g.id}`,
        label: (g.data as GroupData).name || 'Group',
        swatch: (g.data as GroupData).groupColor || '#6366f1',
        onClick: ctx.run(() => {
          st.addNodeToGroup(g.id, nodeId);
          st.recomputeGroupBounds();
        }),
      })),
    });
  }
  home.forEach((g) =>
    items.push({
      key: `rm-${g.id}`,
      label: `Remove from ${(g.data as GroupData).name || 'group'}`,
      icon: <FolderMinus size={14} />,
      onClick: ctx.run(() => {
        st.removeNodeFromGroup(g.id, nodeId);
        st.recomputeGroupBounds();
      }),
    }),
  );
  items.push(sep('s2'), {
    key: 'del',
    label: 'Delete',
    icon: <Trash2 size={14} />,
    danger: true,
    onClick: ctx.run(() => st.onNodesChange([{ type: 'remove', id: nodeId }])),
  });
  return items;
}

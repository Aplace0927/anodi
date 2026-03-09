import { useEffect, useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship } from '../types';
import { BUILTIN_RELATIONSHIPS } from '../types';

interface UseKeyboardShortcutsOptions {
  onOpenAddNode: () => void;
  observerMode?: boolean;
}

export function useKeyboardShortcuts({ onOpenAddNode, observerMode }: UseKeyboardShortcutsOptions) {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const setActiveEdgeType = useGraphStore((s) => s.setActiveEdgeType);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const nodes = useGraphStore((s) => s.nodes);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const userEdgeTypes = useGraphStore((s) => s.userEdgeTypes);
  const copySelection = useGraphStore((s) => s.copySelection);
  const pasteSelection = useGraphStore((s) => s.pasteSelection);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // In observer mode, block all editing shortcuts
      if (observerMode) return;

      // Undo: Cmd/Ctrl + Z (without Shift)
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z  OR  Cmd/Ctrl + Y
      if ((mod && key === 'z' && e.shiftKey) || (mod && key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Copy: Cmd/Ctrl + C
      if (mod && key === 'c' && !isInput) {
        e.preventDefault();
        copySelection();
        return;
      }

      // Paste: Cmd/Ctrl + V
      if (mod && key === 'v' && !isInput) {
        e.preventDefault();
        pasteSelection();
        return;
      }

      // Skip remaining shortcuts when focused on form inputs
      if (isInput) return;

      // Add node: N
      if (key === 'n' && !mod) {
        e.preventDefault();
        onOpenAddNode();
        return;
      }

      // Built-in edge types: 1, 2, 3
      if (e.key === '1' && !mod) {
        e.preventDefault();
        setActiveEdgeType(BUILTIN_RELATIONSHIPS[0]);
        return;
      }
      if (e.key === '2' && !mod) {
        e.preventDefault();
        setActiveEdgeType(BUILTIN_RELATIONSHIPS[1]);
        return;
      }
      if (e.key === '3' && !mod) {
        e.preventDefault();
        setActiveEdgeType(BUILTIN_RELATIONSHIPS[2]);
        return;
      }

      // User-defined edge types: 4-9, 0
      if (!mod && /^[0456789]$/.test(e.key)) {
        const userType = userEdgeTypes.find((t) => t.shortcutKey === e.key);
        if (userType) {
          e.preventDefault();
          setActiveEdgeType(userType.id as EdgeRelationship);
          return;
        }
      }

      // Delete selected nodes: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.length > 0) {
        e.preventDefault();
        onNodesChange(selectedNodeIds.map((id) => ({ type: 'remove' as const, id })));
        selectNode(null);
        return;
      }

      // Delete selected edge: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        e.preventDefault();
        onEdgesChange([{ type: 'remove', id: selectedEdgeId }]);
        selectEdge(null);
        return;
      }

      // Deselect: Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        selectNode(null);
        return;
      }

      // Select all: Cmd/Ctrl + A
      if (mod && key === 'a') {
        e.preventDefault();
        const changes = nodes.map((n) => ({
          type: 'select' as const,
          id: n.id,
          selected: true,
        }));
        onNodesChange(changes);
        return;
      }
    },
    [undo, redo, onOpenAddNode, setActiveEdgeType, selectedNodeIds, selectNode, selectedEdgeId, selectEdge, nodes, onNodesChange, onEdgesChange, userEdgeTypes, observerMode, copySelection, pasteSelection]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

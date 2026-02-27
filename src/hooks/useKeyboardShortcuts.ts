import { useEffect, useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import type { EdgeRelationship } from '../types';

const EDGE_TYPES: EdgeRelationship[] = ['call', 'reference', 'information'];

interface UseKeyboardShortcutsOptions {
  onOpenAddNode: () => void;
}

export function useKeyboardShortcuts({ onOpenAddNode }: UseKeyboardShortcutsOptions) {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const setActiveEdgeType = useGraphStore((s) => s.setActiveEdgeType);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      const mod = e.metaKey || e.ctrlKey;

      // Undo: Cmd/Ctrl + Z (without Shift)
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z  OR  Cmd/Ctrl + Y
      if ((mod && e.key === 'z' && e.shiftKey) || (mod && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Skip remaining shortcuts when focused on form inputs
      if (isInput) return;

      // Add node: N
      if (e.key === 'n' && !mod) {
        e.preventDefault();
        onOpenAddNode();
        return;
      }

      // Edge type: 1, 2, 3
      if (e.key === '1' && !mod) {
        e.preventDefault();
        setActiveEdgeType(EDGE_TYPES[0]);
        return;
      }
      if (e.key === '2' && !mod) {
        e.preventDefault();
        setActiveEdgeType(EDGE_TYPES[1]);
        return;
      }
      if (e.key === '3' && !mod) {
        e.preventDefault();
        setActiveEdgeType(EDGE_TYPES[2]);
        return;
      }

      // Delete selected node: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        onNodesChange([{ type: 'remove', id: selectedNodeId }]);
        selectNode(null);
        return;
      }

      // Deselect: Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        selectNode(null);
        return;
      }

      // Select all: Cmd/Ctrl + A
      if (mod && e.key === 'a') {
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
    [undo, redo, onOpenAddNode, setActiveEdgeType, selectedNodeId, selectNode, nodes, onNodesChange]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

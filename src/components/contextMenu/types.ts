import type { ReactNode } from 'react';
import type { SegmentedOption } from '../ui/Segmented';

export type ContextMenuState = {
  x: number;
  y: number;
  kind: 'node' | 'selection' | 'edge' | 'pane';
  id?: string;
  flowPos: { x: number; y: number };
  /** Source-code line/character under the cursor, when right-clicking code. */
  code?: { line: number; index: number; content: string };
  /** Word connection point under the cursor. */
  anchorId?: string;
};

export interface ActionItem {
  type?: 'action';
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shows a check mark (current choice in a submenu). */
  checked?: boolean;
  children?: MenuItem[];
  swatch?: string;
  hint?: string;
}

export interface SeparatorItem {
  type: 'separator';
  key: string;
}

export interface HeaderItem {
  type: 'header';
  key: string;
  label: string;
  /** Optional chip/badge rendered next to the title. */
  badge?: ReactNode;
}

/** Inline text field; changes apply live, the menu stays open. */
export interface InputItem {
  type: 'input';
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (value: string) => void;
}

/** Inline single-choice row; the menu stays open so several settings can be tweaked. */
export interface SegmentedItem<T extends string | number = string | number> {
  type: 'segmented';
  key: string;
  label: string;
  options: SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}

export interface SwatchesItem {
  type: 'swatches';
  key: string;
  label: string;
  value: string | undefined;
  fallback?: string;
  onChange: (color: string | undefined) => void;
}

export type MenuItem = ActionItem | SeparatorItem | HeaderItem | InputItem | SegmentedItem | SwatchesItem;

/** Context handed to each menu builder. */
export interface MenuCtx {
  state: ContextMenuState;
  /** Wrap an action so the menu closes after it runs. */
  run: (fn: () => void) => () => void;
  onAddNodeAt: (pos: { x: number; y: number }) => void;
  fitView: () => void;
}

export const sep = (key: string): SeparatorItem => ({ type: 'separator', key });

import { Plus, Diff } from "lucide-react";
import type { MemoryState } from "../../../types";

interface Props {
  states: MemoryState[];
  activeId: string | undefined;
  showDiff: boolean;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onToggleDiff: () => void;
}

/** Snapshot chips in the node's badge strip: switch state, duplicate, toggle diff. */
export default function StateBar({ states, activeId, showDiff, onSwitch, onAdd, onToggleDiff }: Props) {
  const activeIdx = states.findIndex((s) => s.id === activeId);
  const prev = activeIdx > 0 ? states[activeIdx - 1] : undefined;

  if (states.length === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        title="Save a snapshot of the current content (e.g. before an overflow)"
        className="nodrag flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[10px] text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-900 group-hover/mem:opacity-100 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <Plus size={10} /> Snapshot
      </button>
    );
  }

  return (
    <div className="nodrag flex min-w-0 flex-1 items-center gap-1 font-sans">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-md bg-gray-100 p-0.5 dark:bg-gray-800">
        {states.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSwitch(s.id)}
            className={`shrink-0 rounded px-1.5 text-[10px] leading-4 transition-colors ${
              s.id === activeId
                ? "bg-white font-bold text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {s.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          title="Duplicate current state"
          className="shrink-0 rounded px-1 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
        >
          <Plus size={10} />
        </button>
      </div>
      <button
        type="button"
        onClick={onToggleDiff}
        disabled={!prev}
        title={prev ? `Highlight bytes changed since “${prev.name}”` : "No previous state to compare"}
        className={`flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] leading-5 disabled:opacity-30 ${
          showDiff && prev
            ? "bg-rose-100 font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
            : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        }`}
      >
        <Diff size={10} /> Δ
      </button>
    </div>
  );
}

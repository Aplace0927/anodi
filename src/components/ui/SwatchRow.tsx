import { RotateCcw } from 'lucide-react';

/** Quick-pick colors shared by context menus and compact pickers. */
export const QUICK_COLORS = [
  '#ef5350', '#ec407a', '#ab47bc', '#5c6bc0', '#42a5f5', '#26c6da',
  '#26a69a', '#66bb6a', '#d4e157', '#ffa726', '#8d6e63', '#78909c',
];

interface SwatchRowProps {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  /** Color shown on the reset chip (the value used when unset). */
  fallback?: string;
}

/** Row of color chips plus a custom picker and a reset-to-default chip. */
export default function SwatchRow({ value, onChange, fallback }: SwatchRowProps) {
  const current = value?.toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        title="Reset to default"
        onClick={() => onChange(undefined)}
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-gray-500 dark:text-gray-400 ${
          value === undefined ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-300 dark:border-gray-600'
        }`}
        style={fallback ? { backgroundColor: `${fallback}33` } : undefined}
      >
        <RotateCcw size={10} />
      </button>
      {QUICK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full border border-black/10 ${current === c ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        title="Custom color"
        className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-gray-300 dark:border-gray-600"
        style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
      >
        <input
          type="color"
          value={value ?? fallback ?? '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

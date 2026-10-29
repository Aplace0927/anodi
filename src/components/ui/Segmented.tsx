import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  id: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

/** Compact single-choice button row (path style, arrows, unit size…). */
export default function Segmented<T extends string | number>({ options, value, onChange, size = 'sm' }: SegmentedProps<T>) {
  return (
    <div className="flex w-full gap-0.5 rounded-md bg-gray-100 p-0.5 dark:bg-gray-800">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`flex flex-1 items-center justify-center rounded px-1.5 ${size === 'sm' ? 'py-0.5 text-xs' : 'py-1 text-sm'} transition-colors ${
            value === o.id
              ? 'bg-white font-bold text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';

const PREDEFINED_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#78716c',
];

const RECENT_COLORS_KEY = 'anodi-recent-colors';
const MAX_RECENT = 8;

function getRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentColor(color: string) {
  const recent = getRecentColors().filter((c) => c !== color);
  recent.unshift(color);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent));
  } catch {
    // ignore
  }
}

interface ColorPickerProps {
  value?: string;
  onChange: (color: string | undefined) => void;
  label?: string;
}

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentColors(getRecentColors());
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (color: string) => {
    addRecentColor(color);
    onChange(color);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2">
        {label && (
          <span className="text-xs font-semibold uppercase text-gray-400">{label}</span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-gray-500"
        >
          {value ? (
            <span
              className="inline-block h-3 w-3 rounded-sm border border-gray-500"
              style={{ backgroundColor: value }}
            />
          ) : (
            <Palette size={12} className="text-gray-400" />
          )}
          <span>{value ? value : 'Default'}</span>
        </button>
        {value && (
          <button
            onClick={handleClear}
            className="text-[10px] text-gray-500 hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-600 bg-gray-800 p-3 shadow-xl">
          {/* Predefined palette */}
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-400">Palette</p>
          <div className="mb-3 grid grid-cols-8 gap-1">
            {PREDEFINED_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleSelect(c)}
                className={`h-5 w-5 rounded-sm border transition-all hover:scale-110 ${
                  value === c ? 'border-white ring-1 ring-white' : 'border-gray-600'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>

          {/* Recently used */}
          {recentColors.length > 0 && (
            <>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-400">
                Recently used
              </p>
              <div className="mb-3 flex gap-1">
                {recentColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelect(c)}
                    className={`h-5 w-5 rounded-sm border transition-all hover:scale-110 ${
                      value === c ? 'border-white ring-1 ring-white' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </>
          )}

          {/* Custom color input */}
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-400">Custom</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value || '#6366f1'}
              onChange={(e) => handleSelect(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-gray-600 bg-transparent"
            />
            <input
              type="text"
              value={value || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  handleSelect(v);
                }
              }}
              placeholder="#6366f1"
              className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 font-mono text-[10px] text-white focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';

// Material Design color palette (10 hues × 6 shades + 4 grays = 64 swatches)
const MATERIAL_COLORS: { label: string; shades: string[] }[] = [
  { label: 'Red',        shades: ['#ffcdd2', '#ef9a9a', '#ef5350', '#e53935', '#c62828', '#b71c1c'] },
  { label: 'Pink',       shades: ['#f8bbd0', '#f48fb1', '#ec407a', '#d81b60', '#ad1457', '#880e4f'] },
  { label: 'Purple',     shades: ['#e1bee7', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a', '#4a148c'] },
  { label: 'Deep Purple', shades: ['#d1c4e9', '#b39ddb', '#7e57c2', '#5e35b1', '#4527a0', '#311b92'] },
  { label: 'Indigo',     shades: ['#c5cae9', '#9fa8da', '#5c6bc0', '#3949ab', '#283593', '#1a237e'] },
  { label: 'Blue',       shades: ['#bbdefb', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0', '#0d47a1'] },
  { label: 'Cyan',       shades: ['#b2ebf2', '#80deea', '#26c6da', '#00acc1', '#00838f', '#006064'] },
  { label: 'Teal',       shades: ['#b2dfdb', '#80cbc4', '#26a69a', '#00897b', '#00695c', '#004d40'] },
  { label: 'Green',      shades: ['#c8e6c9', '#a5d6a7', '#66bb6a', '#43a047', '#2e7d32', '#1b5e20'] },
  { label: 'Lime',       shades: ['#f0f4c3', '#e6ee9c', '#d4e157', '#c0ca33', '#9e9d24', '#827717'] },
  { label: 'Yellow',     shades: ['#fff9c4', '#fff59d', '#ffee58', '#fdd835', '#f9a825', '#f57f17'] },
  { label: 'Orange',     shades: ['#ffe0b2', '#ffcc80', '#ffa726', '#fb8c00', '#ef6c00', '#e65100'] },
  { label: 'Deep Orange', shades: ['#ffccbc', '#ffab91', '#ff7043', '#f4511e', '#d84315', '#bf360c'] },
  { label: 'Brown',      shades: ['#d7ccc8', '#bcaaa4', '#8d6e63', '#6d4c41', '#4e342e', '#3e2723'] },
  { label: 'Gray',       shades: ['#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242'] },
  { label: 'Blue Gray',  shades: ['#cfd8dc', '#b0bec5', '#78909c', '#546e7a', '#37474f', '#263238'] },
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
        <div className="absolute left-0 top-full z-50 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 p-3 shadow-xl">
          {/* Predefined palette – Material Design */}
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-400">Palette</p>
          <div className="mb-3 space-y-px">
            {MATERIAL_COLORS.map((group) => (
              <div key={group.label} className="flex gap-px" title={group.label}>
                {group.shades.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelect(c)}
                    className={`h-4 flex-1 transition-all hover:scale-110 hover:z-10 first:rounded-l-sm last:rounded-r-sm ${
                      value === c ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-800 z-10' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    title={`${group.label} – ${c}`}
                  />
                ))}
              </div>
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

export default function EdgeSwatch({ color, dash, width = 22 }: { color: string; dash?: string; width?: number }) {
  return (
    <svg width={width} height="8" viewBox={`0 0 ${width} 8`} className="shrink-0" aria-hidden>
      <line x1="1" y1="4" x2={width - 1} y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  );
}

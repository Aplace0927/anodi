import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { AnodiNode, AnodiEdge } from '../types';
import { useGraphStore } from '../store/graphStore';

// ── PNG export ──────────────────────────────────────────────────────

/** Maximum dimension (width or height) in pixels for PNG export. */
const MAX_PNG_DIMENSION = 4096;

function getFlowElement(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport') as HTMLElement | null;
}

export async function exportToPng() {
  const el = getFlowElement();
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const baseWidth = rect.width;
  const baseHeight = rect.height;

  // Determine a pixel ratio that keeps both dimensions ≤ MAX_PNG_DIMENSION
  const pixelRatio = Math.max(
    0.5, // floor at 0.5× to avoid tiny images
    Math.min(2, MAX_PNG_DIMENSION / baseWidth, MAX_PNG_DIMENSION / baseHeight)
  );

  const dataUrl = await toPng(el, {
    backgroundColor: '#030712',
    quality: 1,
    pixelRatio,
  });

  const link = document.createElement('a');
  link.download = 'anodi-board.png';
  link.href = dataUrl;
  link.click();
}

// ── PDF export (rendered HTML) ──────────────────────────────────────

export async function exportToPdf() {
  const el = getFlowElement();
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const orientation = width > height ? 'landscape' : 'portrait';

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
    hotfixes: ['px_scaling'],
  });

  await pdf.html(el, {
    x: 0,
    y: 0,
    width,
    windowWidth: width,
    html2canvas: {
      scale: 2,
      backgroundColor: '#030712',
      useCORS: true,
      logging: false,
    },
  });

  pdf.save('anodi-board.pdf');
}

// ── JSON export / import ────────────────────────────────────────────

export interface AnodiGraphJson {
  version: 1;
  nodes: AnodiNode[];
  edges: AnodiEdge[];
}

export function exportToJson() {
  const { nodes, edges } = useGraphStore.getState();
  const payload: AnodiGraphJson = { version: 1, nodes, edges };
  const json = JSON.stringify(payload, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'anodi-board.json';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function importFromJson(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const payload = JSON.parse(text) as AnodiGraphJson;
        if (!Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
          throw new Error('Invalid anodi JSON: missing or malformed nodes/edges');
        }
        useGraphStore.getState().loadGraph(payload.nodes, payload.edges);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

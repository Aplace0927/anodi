import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { elementToSVG, inlineResources } from 'dom-to-svg';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import type { AnodiNode, AnodiEdge } from '../types';
import { useGraphStore } from '../store/graphStore';

// ── Shared helpers ──────────────────────────────────────────────────

/** Maximum dimension (width or height) in pixels for PNG export. */
const MAX_PNG_DIMENSION = 4096;

/** Minimum padding (px) around content in exported images. */
const MIN_PADDING_PX = 50;

/** Zoom constraints for the fitted viewport. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

function getFlowElement(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport') as HTMLElement | null;
}

/** Detect current theme and return a suitable background colour. */
function themeBgColor(): string {
  return document.documentElement.classList.contains('dark')
    ? '#030712'
    : '#f3f4f6';
}

/**
 * Compute the viewport dimensions and transform needed to fit every node
 * into the output image.  Returns `null` when there is nothing to render.
 */
function computeFitViewport(padding = 0.1) {
  const { nodes } = useGraphStore.getState();
  if (nodes.length === 0) return null;

  const bounds = getNodesBounds(nodes);
  if (bounds.width === 0 || bounds.height === 0) return null;

  // Guarantee a minimum padding on each side
  const imageWidth = Math.max(bounds.width * (1 + padding * 2), bounds.width + MIN_PADDING_PX * 2);
  const imageHeight = Math.max(bounds.height * (1 + padding * 2), bounds.height + MIN_PADDING_PX * 2);

  const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, MIN_ZOOM, MAX_ZOOM, padding);

  return { imageWidth, imageHeight, viewport };
}

// ── PNG export ──────────────────────────────────────────────────────

export async function exportToPng() {
  const el = getFlowElement();
  if (!el) return;

  const fit = computeFitViewport();
  if (!fit) return;

  const { imageWidth, imageHeight, viewport } = fit;

  // Keep both dimensions ≤ MAX_PNG_DIMENSION
  const pixelRatio = Math.max(
    0.5,
    Math.min(2, MAX_PNG_DIMENSION / imageWidth, MAX_PNG_DIMENSION / imageHeight),
  );

  const dataUrl = await toPng(el, {
    backgroundColor: themeBgColor(),
    width: imageWidth,
    height: imageHeight,
    pixelRatio,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  const link = document.createElement('a');
  link.download = 'anodi-board.png';
  link.href = dataUrl;
  link.click();
}

// ── PDF export ──────────────────────────────────────────────────────

/** Individual font names that indicate a monospace family. */
const MONO_NAMES = new Set([
  'monospace', 'courier', 'courier new', 'consolas', 'menlo',
  'monaco', 'sfmono-regular', 'ui-monospace', 'liberation mono',
]);
/** Individual font names that indicate a serif family (generic "serif" only). */
const SERIF_NAMES = new Set([
  'serif', 'times', 'times new roman', 'georgia',
]);

/**
 * Classify a CSS font-family value into a standard PDF font name.
 * Splits on commas and checks each individual name so that
 * `sans-serif` is never confused with `serif`.
 */
function classifyFontFamily(ff: string): 'Courier' | 'Times' | 'Helvetica' {
  const names = ff.split(',').map((s) => s.trim().replace(/['"]/g, '').toLowerCase());
  if (names.some((n) => MONO_NAMES.has(n))) return 'Courier';
  if (names.some((n) => SERIF_NAMES.has(n))) return 'Times';
  return 'Helvetica';
}

/**
 * Walk every element in `root` and replace `font-family` inline-style
 * values with the corresponding standard PDF font name so that
 * svg2pdf.js can match them to jsPDF's built-in font registry.
 */
function normaliseFontsForPdf(root: Element): void {
  const it = root.ownerDocument.createNodeIterator(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = it.nextNode())) {
    const el = node as HTMLElement | SVGElement;
    const ff = el.style?.fontFamily;
    if (!ff) continue;
    el.style.fontFamily = classifyFontFamily(ff);
  }
}

export async function exportToPdf() {
  const flowEl = document.querySelector('.react-flow') as HTMLElement | null;
  if (!flowEl) return;

  const fit = computeFitViewport();
  if (!fit) return;

  const { imageWidth, imageHeight, viewport } = fit;
  const bgColor = themeBgColor();

  // ── Snapshot the viewport element via dom-to-svg ──────────────────
  const viewportEl = flowEl.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewportEl) return;

  // Save originals so we can restore after capture
  const origFlowW = flowEl.style.width;
  const origFlowH = flowEl.style.height;
  const origTransform = viewportEl.style.transform;

  // Temporarily resize the container and set the fitted transform
  flowEl.style.width = `${imageWidth}px`;
  flowEl.style.height = `${imageHeight}px`;
  viewportEl.style.transform =
    `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  // Hide interactive UI elements
  const uiSelectors = '.react-flow__controls, .react-flow__minimap, .react-flow__attribution, .react-flow__background';
  const hiddenEls: HTMLElement[] = [];
  flowEl.querySelectorAll(uiSelectors).forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style.display !== 'none') {
      hiddenEls.push(htmlEl);
      htmlEl.style.display = 'none';
    }
  });

  // Capture the flow element (with nodes, edges, data) to SVG
  const svgDocument = elementToSVG(flowEl);
  await inlineResources(svgDocument.documentElement);

  // Restore original styles
  flowEl.style.width = origFlowW;
  flowEl.style.height = origFlowH;
  viewportEl.style.transform = origTransform;
  hiddenEls.forEach((el) => { el.style.display = ''; });

  // ── Normalise fonts so svg2pdf.js maps them to built-in PDF fonts ─
  normaliseFontsForPdf(svgDocument.documentElement);

  const svgElement = svgDocument.documentElement;
  svgElement.setAttribute('width', String(imageWidth));
  svgElement.setAttribute('height', String(imageHeight));

  const orientation = imageWidth > imageHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [imageWidth, imageHeight],
    hotfixes: ['px_scaling'],
  });

  // Draw background
  pdf.setFillColor(bgColor);
  pdf.rect(0, 0, imageWidth, imageHeight, 'F');

  // Add SVG as vector content (not rasterised)
  await pdf.svg(svgElement, { x: 0, y: 0, width: imageWidth, height: imageHeight });
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

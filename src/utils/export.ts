import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { elementToSVG, inlineResources } from 'dom-to-svg';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import type { AnodiNode, AnodiEdge, UserEdgeType } from '../types';
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

/** Attributes that may contain `url(#id)` references to SVG resources. */
const URL_REF_ATTRS = [
  'fill', 'stroke', 'clip-path', 'mask', 'filter',
  'marker-start', 'marker-mid', 'marker-end',
];

/**
 * Remove `url(#id)` attribute values whose target ID doesn't exist in the SVG.
 *
 * `dom-to-svg` can produce SVG with dangling references (e.g. React Flow edge
 * markers) that cause svg2pdf.js to crash with
 *   "Cannot read properties of undefined (reading 'apply')"
 * because its internal ID map has no entry for the referenced element.
 */
function removeDanglingReferences(svg: SVGSVGElement): void {
  const allElements = svg.querySelectorAll('*');

  // Collect every defined id in the document
  const definedIds = new Set<string>();
  allElements.forEach((el) => {
    const id = el.getAttribute('id');
    if (id) definedIds.add(id);
  });

  const urlRefRe = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/;

  allElements.forEach((el) => {
    // Clean url(#id) attribute references
    for (const attr of URL_REF_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      const m = val.match(urlRefRe);
      if (m && !definedIds.has(m[1])) {
        el.removeAttribute(attr);
      }
    }

    // Clean <use href="#id"> / <use xlink:href="#id"> references
    if (el.tagName.toLowerCase() === 'use') {
      for (const hrefAttr of ['href', 'xlink:href']) {
        const href = el.getAttribute(hrefAttr);
        if (href && href.startsWith('#') && !definedIds.has(href.slice(1))) {
          el.remove();
          break;
        }
      }
    }
  });
}

/** Convert an ArrayBuffer to a base64-encoded string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(''));
}

/** Fetch a TTF file from `public/fonts/` and register it in jsPDF's VFS. */
async function embedFont(
  pdf: jsPDF,
  url: string,
  vfsName: string,
  fontFamily: string,
  style: string,
): Promise<void> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  pdf.addFileToVFS(vfsName, arrayBufferToBase64(buf));
  pdf.addFont(vfsName, fontFamily, style);
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

  const svgElement = svgDocument.documentElement;
  svgElement.setAttribute('width', String(imageWidth));
  svgElement.setAttribute('height', String(imageHeight));

  // Strip url(#id) references whose targets don't exist in the captured SVG.
  // dom-to-svg may produce orphan refs (e.g. React Flow arrow markers) that
  // crash svg2pdf.js.
  removeDanglingReferences(svgElement);

  const orientation = imageWidth > imageHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [imageWidth, imageHeight],
    hotfixes: ['px_scaling'],
  });

  // Embed Inter and JetBrains Mono fonts so text renders correctly
  await Promise.all([
    embedFont(pdf, '/fonts/Inter-Regular.ttf', 'Inter-Regular.ttf', 'Inter', 'normal'),
    embedFont(pdf, '/fonts/Inter-Bold.ttf', 'Inter-Bold.ttf', 'Inter', 'bold'),
    embedFont(pdf, '/fonts/JetBrainsMono-Regular.ttf', 'JetBrainsMono-Regular.ttf', 'JetBrains Mono', 'normal'),
    embedFont(pdf, '/fonts/JetBrainsMono-Bold.ttf', 'JetBrainsMono-Bold.ttf', 'JetBrains Mono', 'bold'),
    
    embedFont(pdf, '/fonts/Inter-Regular.ttf', 'Inter-Regular.ttf', 'helvetica', 'normal'),
    embedFont(pdf, '/fonts/Inter-Bold.ttf', 'Inter-Bold.ttf', 'helvetica', '600normal'),
    embedFont(pdf, '/fonts/JetBrainsMono-Regular.ttf', 'JetBrainsMono-Regular.ttf', 'courier', 'normal'),
    embedFont(pdf, '/fonts/JetBrainsMono-Bold.ttf', 'JetBrainsMono-Bold.ttf', 'courier', '600normal'),
  ]);

  // Draw background
  pdf.setFillColor(bgColor);
  pdf.rect(0, 0, imageWidth, imageHeight, 'F');

  // Add SVG as vector content (not rasterised)
  try {
    await pdf.svg(svgElement, { x: 0, y: 0, width: imageWidth, height: imageHeight });
  } catch (err) {
    console.warn('[anodi] svg2pdf vector render failed, falling back to rasterised export', err);
    // Fall back to rasterised PNG embedded in the PDF
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth * 2;
    canvas.height = imageHeight * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svgElement)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = svgUrl;
    });
    ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
    URL.revokeObjectURL(svgUrl);
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imageWidth, imageHeight);
  }
  pdf.save('anodi-board.pdf');
}

// ── JSON export / import ────────────────────────────────────────────

export interface AnodiGraphJson {
  version: 1;
  nodes: AnodiNode[];
  edges: AnodiEdge[];
  userEdgeTypes?: UserEdgeType[];
}

export function exportToJson() {
  const { nodes, edges, userEdgeTypes } = useGraphStore.getState();
  const payload: AnodiGraphJson = { version: 1, nodes, edges, userEdgeTypes };
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
        useGraphStore.getState().loadGraph(payload.nodes, payload.edges, payload.userEdgeTypes);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

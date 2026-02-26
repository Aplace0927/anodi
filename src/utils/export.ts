import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
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

export async function exportToPdf() {
  const reactFlowEl = document.querySelector('*') as HTMLElement | null;
  if (!reactFlowEl) return;

  const fit = computeFitViewport();
  if (!fit) return;

  const { imageWidth, imageHeight, viewport } = fit;
  const bgColor = themeBgColor();

  // Capture the viewport as SVG using html-to-image (handles React Flow reliably)
  const svgDataUrl = await toSvg(el, {
    backgroundColor: bgColor,
    width: imageWidth,
    height: imageHeight,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  // Rasterize the SVG to a canvas via the browser's native SVG renderer
  const renderCanvas = document.createElement('canvas');
  const pxRatio = 2;
  renderCanvas.width = imageWidth * pxRatio;
  renderCanvas.height = imageHeight * pxRatio;
  const ctx = renderCanvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(pxRatio, pxRatio);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  await new Promise<void>((resolve, reject) => {
    const svgImg = new Image();
    svgImg.onload = () => {
      ctx.drawImage(svgImg, 0, 0, imageWidth, imageHeight);
      resolve();
    };
    svgImg.onerror = reject;
    svgImg.src = svgDataUrl;
  });

  // Convert canvas to a PNG data-URL and place it in an <img> element.
  // Canvas pixel data is lost during DOM cloneNode (used internally by
  // html2canvas inside pdf.html), but <img src> is preserved in clones.
  const pngDataUrl = renderCanvas.toDataURL('image/png');
  const imgEl = document.createElement('img');
  imgEl.src = pngDataUrl;
  imgEl.style.cssText = `display:block;width:${imageWidth}px;height:${imageHeight}px;`;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed;left:0;top:0;width:${imageWidth}px;height:${imageHeight}px;overflow:hidden;z-index:-1;pointer-events:none;opacity:0;`;
  wrapper.appendChild(imgEl);
  document.body.appendChild(wrapper);

  // Wait for the image element to fully decode
  await new Promise<void>((resolve) => {
    if (imgEl.complete) resolve();
    else imgEl.onload = () => resolve();
  });

  try {
    const orientation = imageWidth > imageHeight ? 'landscape' : 'portrait';
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [imageWidth, imageHeight],
      hotfixes: ['px_scaling'],
    });

    await pdf.html(wrapper, {
      x: 0,
      y: 0,
      width: imageWidth,
      windowWidth: imageWidth,
      autoPaging: false,
      html2canvas: {
        // scale: 1 is sufficient — the <img> already contains 2x pixel data
        scale: 1,
        width: imageWidth,
        height: imageHeight,
      },
    });

    pdf.save('anodi-board.pdf');
  } finally {
    document.body.removeChild(wrapper);
  }
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

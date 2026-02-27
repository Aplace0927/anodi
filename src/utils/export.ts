import { toPng } from 'html-to-image';
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
  const reactFlowEl = document.querySelector('.react-flow') as HTMLElement | null;
  if (!reactFlowEl) return;

  const fit = computeFitViewport();
  if (!fit) return;

  const { imageWidth, imageHeight, viewport } = fit;
  const bgColor = themeBgColor();

  // Create a single-page PDF sized to the content
  const orientation = imageWidth > imageHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [imageWidth, imageHeight],
    hotfixes: ['px_scaling'],
  });

  // Render actual HTML into the PDF via pdf.html()
  await pdf.html(reactFlowEl, {
    x: 0,
    y: 0,
    width: imageWidth,
    windowWidth: imageWidth,
    autoPaging: false,
    html2canvas: {
      scale: 2,
      backgroundColor: bgColor,
      useCORS: true,
      logging: false,
      width: imageWidth,
      height: imageHeight,
      onclone: (clonedDoc: Document) => {
        // Resize the cloned .react-flow container to match the computed bounds
        const clonedWrapper = clonedDoc.querySelector('.react-flow') as HTMLElement;
        if (clonedWrapper) {
          clonedWrapper.style.width = `${imageWidth}px`;
          clonedWrapper.style.height = `${imageHeight}px`;
        }

        // Apply the computed viewport transform so every node is visible
        // at the same location and zoom level
        const clonedViewport = clonedDoc.querySelector('.react-flow__viewport') as HTMLElement;
        if (clonedViewport) {
          clonedViewport.style.transform =
            `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
        }

        // Ensure all tagged export elements (nodes, edges, data) remain visible
        clonedDoc
          .querySelectorAll('.anodi-export-node, .anodi-export-edge, .anodi-export-data')
          .forEach((el) => {
            (el as HTMLElement).style.opacity = '1';
          });

        // Hide interactive UI elements that should not appear in the PDF
        clonedDoc
          .querySelectorAll(
            '.react-flow__controls, .react-flow__minimap, .react-flow__attribution, .react-flow__panel'
          )
          .forEach((uiEl) => {
            (uiEl as HTMLElement).style.display = 'none';
          });
      },
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

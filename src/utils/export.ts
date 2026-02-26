import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type {
  AnodiNode,
  AnodiEdge,
  SourceCodeData,
  ClassDiagramData,
  MemoryLayoutData,
  NodeData,
  EdgeRelationship,
} from '../types';
import { EDGE_STYLES } from '../types';
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

// ── PDF export (vector-based) ───────────────────────────────────────

/** Maximum rows rendered for a memory node in PDF to prevent excessively tall output. */
const MAX_MEMORY_PDF_ROWS = 32;
const PDF_PADDING = 40;
const PDF_FONT = 'helvetica';

/** Hex color string (#rrggbb) → [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function pdfDrawRoundedRect(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillColor?: string,
  strokeColor?: string
) {
  if (fillColor) {
    const [cr, cg, cb] = hexToRgb(fillColor);
    pdf.setFillColor(cr, cg, cb);
  }
  if (strokeColor) {
    const [cr, cg, cb] = hexToRgb(strokeColor);
    pdf.setDrawColor(cr, cg, cb);
    pdf.setLineWidth(1);
  }
  const mode = fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'S';
  pdf.roundedRect(x, y, w, h, r, r, mode);
}

/** Draw a source-code node on the PDF. */
function drawSourceNode(pdf: jsPDF, x: number, y: number, data: SourceCodeData) {
  const nodeW = 260;
  const headerH = 28;
  const lineH = 14;
  const lines = (data.code || '').split('\n');
  const nodeH = headerH + Math.max(lines.length, 1) * lineH + 8;

  const bgColor = '#111827';
  const headerColor = data.nodeColor || '#1f2937';
  const borderColor = data.nodeColor ? `${data.nodeColor}99` : '#4b5563';

  // Border / background
  pdfDrawRoundedRect(pdf, x, y, nodeW, nodeH, 6, bgColor, borderColor);
  // Header
  pdfDrawRoundedRect(pdf, x, y, nodeW, headerH, 6, headerColor);
  // Flatten bottom corners of header
  pdf.setFillColor(...hexToRgb(headerColor));
  pdf.rect(x, y + headerH - 6, nodeW, 6, 'F');

  // Language badge
  pdf.setFontSize(7);
  pdf.setFont(PDF_FONT, 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(data.language.toUpperCase(), x + 8, y + 12);

  // Name
  pdf.setFontSize(9);
  pdf.setFont(PDF_FONT, 'bold');
  pdf.text(data.name ?? 'Untitled', x + 8 + pdf.getTextWidth(data.language.toUpperCase()) + 8, y + 12);

  // Code lines
  pdf.setFontSize(8);
  pdf.setFont('courier', 'normal');
  pdf.setTextColor(220, 220, 220);
  let lineNum = 1;
  lines.forEach((line, idx) => {
    const ly = y + headerH + 10 + idx * lineH;
    const trimmed = line.trimEnd();
    if (trimmed === '...') {
      pdf.setTextColor(120, 120, 120);
      pdf.text('···', x + 8, ly);
      pdf.setTextColor(220, 220, 220);
    } else {
      pdf.setTextColor(120, 120, 120);
      pdf.text(String(lineNum).padStart(3, ' '), x + 4, ly);
      pdf.setTextColor(220, 220, 220);
      pdf.text(trimmed.substring(0, 50), x + 30, ly);
      lineNum++;
    }
  });

  return { w: nodeW, h: nodeH };
}

/** Draw a class-diagram node on the PDF. */
function drawClassNode(pdf: jsPDF, x: number, y: number, data: ClassDiagramData) {
  const nodeW = 180;
  const headerH = 32;
  const rowH = 13;
  const sectionGap = 4;
  const fieldsH = data.fields.length > 0 ? data.fields.length * rowH + sectionGap * 2 : 0;
  const methodsH = data.methods.length > 0 ? data.methods.length * rowH + sectionGap * 2 : 0;
  const emptyH = data.fields.length === 0 && data.methods.length === 0 ? 20 : 0;
  const nodeH = headerH + fieldsH + methodsH + emptyH + 8;

  const bgColor = '#111827';
  const headerColor = data.nodeColor || '#7e22ce';
  const borderColor = data.nodeColor ? `${data.nodeColor}99` : '#4b5563';

  pdfDrawRoundedRect(pdf, x, y, nodeW, nodeH, 6, bgColor, borderColor);
  pdfDrawRoundedRect(pdf, x, y, nodeW, headerH, 6, headerColor);
  pdf.setFillColor(...hexToRgb(headerColor));
  pdf.rect(x, y + headerH - 6, nodeW, 6, 'F');

  // «class» label
  pdf.setFontSize(7);
  pdf.setFont(PDF_FONT, 'normal');
  pdf.setTextColor(200, 200, 255);
  pdf.text('«class»', x + nodeW / 2, y + 11, { align: 'center' });

  // Class name
  pdf.setFontSize(10);
  pdf.setFont(PDF_FONT, 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(data.className || data.name || 'ClassName', x + nodeW / 2, y + 24, { align: 'center' });

  let cy = y + headerH + sectionGap;

  // Fields
  if (data.fields.length > 0) {
    pdf.setFontSize(8);
    pdf.setFont(PDF_FONT, 'normal');
    data.fields.forEach((f) => {
      pdf.setTextColor(96, 165, 250); // blue-400
      pdf.text(f.type, x + 10, cy + 10);
      pdf.setTextColor(209, 213, 219); // gray-300
      pdf.text(' ' + f.name, x + 10 + pdf.getTextWidth(f.type), cy + 10);
      cy += rowH;
    });
    cy += sectionGap;
  }

  // Methods
  if (data.methods.length > 0) {
    pdf.setFontSize(8);
    pdf.setFont(PDF_FONT, 'normal');
    data.methods.forEach((m) => {
      pdf.setTextColor(34, 197, 94); // green-500
      pdf.text('⚙ ', x + 10, cy + 10);
      pdf.setTextColor(209, 213, 219);
      pdf.text(m.signature, x + 22, cy + 10);
      cy += rowH;
    });
  }

  return { w: nodeW, h: nodeH };
}

/** Draw a memory-layout node on the PDF. */
function drawMemoryNode(pdf: jsPDF, x: number, y: number, data: MemoryLayoutData) {
  const nodeW = 240;
  const headerH = 32;
  const rowH = 14;
  const baseAddr = parseInt(data.baseAddress, 16) || 0;
  const endAddr = parseInt(data.endAddress, 16) || baseAddr + 0x100;
  const unitSize = data.unitSize || 8;
  const numRows = Math.min(Math.ceil((endAddr - baseAddr) / unitSize), MAX_MEMORY_PDF_ROWS);
  const nodeH = headerH + numRows * rowH + 12;

  const bgColor = '#111827';
  const headerColor = data.nodeColor || '#ea580c';
  const borderColor = data.nodeColor ? `${data.nodeColor}99` : '#4b5563';

  pdfDrawRoundedRect(pdf, x, y, nodeW, nodeH, 6, bgColor, borderColor);
  pdfDrawRoundedRect(pdf, x, y, nodeW, headerH, 6, headerColor);
  pdf.setFillColor(...hexToRgb(headerColor));
  pdf.rect(x, y + headerH - 6, nodeW, 6, 'F');

  // Name
  pdf.setFontSize(9);
  pdf.setFont(PDF_FONT, 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(data.name ?? 'Memory', x + 8, y + 14);

  // Address range badge
  pdf.setFontSize(7);
  pdf.setFont('courier', 'normal');
  pdf.setTextColor(200, 200, 200);
  pdf.text(`${data.baseAddress} – ${data.endAddress}`, x + 8, y + 26);

  // Memory rows
  pdf.setFontSize(7);
  pdf.setFont('courier', 'normal');
  for (let i = 0; i < numRows; i++) {
    const addr = baseAddr + i * unitSize;
    const ly = y + headerH + 10 + i * rowH;
    pdf.setTextColor(120, 120, 120);
    pdf.text('0x' + addr.toString(16).padStart(4, '0'), x + 6, ly);
    pdf.setTextColor(180, 180, 180);
    // Show placeholder bytes
    let byteStr = '';
    for (let b = 0; b < unitSize && b < 16; b++) {
      byteStr += '00 ';
    }
    pdf.text(byteStr.trim(), x + 50, ly);
  }

  return { w: nodeW, h: nodeH };
}

/** Draw a single node on the PDF, dispatching by kind. */
function drawNode(pdf: jsPDF, node: AnodiNode) {
  const x = node.position.x;
  const y = node.position.y;
  const data = node.data as NodeData;

  switch (data.kind) {
    case 'source':
      return drawSourceNode(pdf, x, y, data as SourceCodeData);
    case 'class':
      return drawClassNode(pdf, x, y, data as ClassDiagramData);
    case 'memory':
      return drawMemoryNode(pdf, x, y, data as MemoryLayoutData);
  }
}

/** Compute the approximate dimensions of a node. */
function nodeDimensions(node: AnodiNode): { w: number; h: number } {
  const data = node.data as NodeData;
  if (data.kind === 'source') {
    const lines = ((data as SourceCodeData).code || '').split('\n');
    return { w: 260, h: 28 + Math.max(lines.length, 1) * 14 + 8 };
  } else if (data.kind === 'class') {
    const d = data as ClassDiagramData;
    const rowH = 13, sectionGap = 4;
    const fieldsH = d.fields.length > 0 ? d.fields.length * rowH + sectionGap * 2 : 0;
    const methodsH = d.methods.length > 0 ? d.methods.length * rowH + sectionGap * 2 : 0;
    const emptyH = d.fields.length === 0 && d.methods.length === 0 ? 20 : 0;
    return { w: 180, h: 32 + fieldsH + methodsH + emptyH + 8 };
  } else if (data.kind === 'memory') {
    const d = data as MemoryLayoutData;
    const baseAddr = parseInt(d.baseAddress, 16) || 0;
    const endAddr = parseInt(d.endAddress, 16) || baseAddr + 0x100;
    const numRows = Math.min(Math.ceil((endAddr - baseAddr) / (d.unitSize || 8)), MAX_MEMORY_PDF_ROWS);
    return { w: 240, h: 32 + numRows * 14 + 12 };
  }
  return { w: 200, h: 100 };
}

/** Compute the approximate bounding box centre of a node. */
function nodeCenter(node: AnodiNode): { cx: number; cy: number } {
  const { w, h } = nodeDimensions(node);
  return { cx: node.position.x + w / 2, cy: node.position.y + h / 2 };
}

/** Draw edges as bezier curves with labels. */
function drawEdges(
  pdf: jsPDF,
  edges: AnodiEdge[],
  nodeMap: Map<string, AnodiNode>
) {
  edges.forEach((edge) => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;

    const rel: EdgeRelationship = (edge.data as { relationship?: EdgeRelationship })?.relationship ?? 'call';
    const style = EDGE_STYLES[rel];
    const [r, g, b] = hexToRgb(style.color);

    const from = nodeCenter(src);
    const to = nodeCenter(tgt);

    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(1.2);

    // Dash pattern
    if (rel === 'reference') {
      pdf.setLineDashPattern([4, 2], 0);
    } else if (rel === 'information') {
      pdf.setLineDashPattern([1.5, 3], 0);
    } else {
      pdf.setLineDashPattern([], 0);
    }

    pdf.line(from.cx, from.cy, to.cx, to.cy);
    pdf.setLineDashPattern([], 0);

    // Label at midpoint
    const mx = (from.cx + to.cx) / 2;
    const my = (from.cy + to.cy) / 2;
    const labelW = pdf.getTextWidth(style.label) + 8;
    pdf.setFillColor(r, g, b);
    pdf.roundedRect(mx - labelW / 2, my - 6, labelW, 12, 3, 3, 'F');
    pdf.setFontSize(7);
    pdf.setFont(PDF_FONT, 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(style.label, mx, my + 3, { align: 'center' });
  });
}

export async function exportToPdf() {
  const { nodes, edges } = useGraphStore.getState();
  if (nodes.length === 0) return;

  // Compute bounding box of all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    const { w, h } = nodeDimensions(n);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  });

  const totalW = maxX - minX + PDF_PADDING * 2;
  const totalH = maxY - minY + PDF_PADDING * 2;
  const orientation = totalW > totalH ? 'landscape' : 'portrait';

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [totalW, totalH],
  });

  // Background
  pdf.setFillColor(...hexToRgb('#030712'));
  pdf.rect(0, 0, totalW, totalH, 'F');

  // Translate so that min coords sit at (PADDING, PADDING)
  const offsetX = -minX + PDF_PADDING;
  const offsetY = -minY + PDF_PADDING;

  // Build node map and offset nodes for drawing
  const nodeMap = new Map<string, AnodiNode>();
  const offsetNodes = nodes.map((n) => {
    const shifted: AnodiNode = {
      ...n,
      position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
    };
    nodeMap.set(n.id, shifted);
    return shifted;
  });

  // Draw edges first (underneath nodes)
  drawEdges(pdf, edges, nodeMap);

  // Draw nodes
  offsetNodes.forEach((n) => drawNode(pdf, n));

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

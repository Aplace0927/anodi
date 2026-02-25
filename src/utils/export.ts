import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

function getFlowElement(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport') as HTMLElement | null;
}

export async function exportToPng() {
  const el = getFlowElement();
  if (!el) return;

  const dataUrl = await toPng(el, {
    backgroundColor: '#030712', // bg-gray-950
    quality: 1,
    pixelRatio: 2,
  });

  const link = document.createElement('a');
  link.download = 'anodi-board.png';
  link.href = dataUrl;
  link.click();
}

export async function exportToPdf() {
  const el = getFlowElement();
  if (!el) return;

  const dataUrl = await toPng(el, {
    backgroundColor: '#030712',
    quality: 1,
    pixelRatio: 2,
  });

  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve) => {
    img.onload = resolve;
  });

  const imgWidth = img.width;
  const imgHeight = img.height;

  // Use landscape or portrait based on aspect ratio
  const orientation = imgWidth > imgHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [imgWidth, imgHeight],
  });

  pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight);
  pdf.save('anodi-board.pdf');
}

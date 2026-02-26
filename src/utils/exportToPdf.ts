import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const EXPORT_CLASS = 'anodi-export';

export async function exportToPdf(): Promise<void> {
  const flowContainer = document.querySelector('.react-flow') as HTMLElement;
  if (!flowContainer) return;

  const canvas = await html2canvas(flowContainer, {
    backgroundColor: null,
    onclone: (_doc: Document, clonedElement: HTMLElement) => {
      const exportElements = clonedElement.querySelectorAll(`.${EXPORT_CLASS}`);

      // Collect all elements that should remain visible:
      // the export-marked elements, their ancestors, and their descendants.
      const visibleElements = new Set<Element>();

      exportElements.forEach((el) => {
        // Walk up to keep ancestor containers visible
        let current: Element | null = el;
        while (current && current !== clonedElement) {
          visibleElements.add(current);
          current = current.parentElement;
        }
        visibleElements.add(clonedElement);

        // Keep all descendants visible
        el.querySelectorAll('*').forEach((child) => visibleElements.add(child));
      });

      // Hide everything that is not in the visible set
      clonedElement.querySelectorAll('*').forEach((el) => {
        if (!visibleElements.has(el)) {
          (el as HTMLElement).style.visibility = 'hidden';
        }
      });
    },
  });

  const w = canvas.width;
  const h = canvas.height;
  const orientation = w > h ? 'landscape' : 'portrait';

  const pdf = new jsPDF({ orientation, unit: 'px', format: [w, h] });
  pdf.addImage(canvas, 'PNG', 0, 0, w, h);
  pdf.save('anodi-export.pdf');
}

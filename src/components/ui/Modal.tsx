import { useEffect, type ReactNode } from 'react';

/** Centered modal with backdrop; closes on Escape or backdrop click. */
export default function Modal({ onClose, children, className = 'w-[32rem]', top = false }: { onClose: () => void; children: ReactNode; className?: string; top?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 px-4 ${top ? 'items-start pt-[15vh]' : 'items-center'}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`max-w-full rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 ${className}`}>{children}</div>
    </div>
  );
}

import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto flex max-w-sm cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          {t.kind === 'success' && <CheckCircle2 size={16} className="shrink-0 text-green-500" />}
          {t.kind === 'error' && <AlertCircle size={16} className="shrink-0 text-red-500" />}
          {t.kind === 'info' && <Info size={16} className="shrink-0 text-indigo-500" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

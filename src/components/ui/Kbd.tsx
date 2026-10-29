export default function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-sans text-[10px] font-medium leading-none text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
      {children}
    </kbd>
  );
}

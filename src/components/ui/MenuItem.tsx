import type { ReactNode } from 'react';
import Kbd from './Kbd';

interface MenuItemProps {
  icon?: ReactNode;
  label: ReactNode;
  shortcut?: string;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function MenuItem({ icon, label, shortcut, danger, active, disabled, onClick }: MenuItemProps) {
  const tone = danger
    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
    : active
      ? 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${tone}`}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <hr className="my-0.5 border-gray-200 dark:border-gray-700" />;
}

export default MenuItem;

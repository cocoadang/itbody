import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  id?: string;
  icon?: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  id = 'empty-state',
  icon: Icon = Inbox,
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction
}) => {
  return (
    <div
      id={id}
      className="flex flex-col items-center justify-center p-12 text-center bg-stone-50 border border-stone-200 rounded-xl my-4"
    >
      <div className="w-12 h-12 rounded-full bg-stone-200/80 flex items-center justify-center text-stone-600 mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-stone-800 mb-1">{title}</h3>
      <p className="text-sm text-stone-500 max-w-md mb-6 leading-relaxed">{description}</p>
      
      {(actionText || secondaryActionText) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actionText && onAction && (
            <button
              id={`${id}-action-btn`}
              onClick={onAction}
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              {actionText}
            </button>
          )}
          {secondaryActionText && onSecondaryAction && (
            <button
              id={`${id}-sec-action-btn`}
              onClick={onSecondaryAction}
              className="px-5 py-2.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              {secondaryActionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useRef, useLayoutEffect } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateInput, isValidDate } from '../utils/dateInputUtils';

interface DateInputFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export const DateInputField: React.FC<DateInputFieldProps> = ({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = 'YYYY-MM-DD',
  className = '',
  'aria-label': ariaLabel
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const targetCaretRef = useRef<number | null>(null);

  // Restore cursor position immediately after React DOM reconciliation
  useLayoutEffect(() => {
    if (targetCaretRef.current !== null && inputRef.current) {
      const pos = Math.min(Math.max(0, targetCaretRef.current), inputRef.current.value.length);
      inputRef.current.setSelectionRange(pos, pos);
      targetCaretRef.current = null;
    }
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const rawCaret = e.target.selectionStart ?? rawValue.length;

    const formatted = formatDateInput(rawValue);

    // Calculate new caret position based on digits before cursor
    if (formatted === rawValue) {
      targetCaretRef.current = rawCaret;
    } else if (rawCaret >= rawValue.length) {
      targetCaretRef.current = formatted.length;
    } else {
      const digitsBefore = rawValue.slice(0, rawCaret).replace(/\D/g, '').length;
      if (digitsBefore === 0) {
        targetCaretRef.current = 0;
      } else {
        let digitCount = 0;
        let targetPos = formatted.length;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            digitCount++;
            if (digitCount === digitsBefore) {
              let pos = i + 1;
              if (formatted[pos] === '-' && rawValue[rawCaret - 1] === '-') {
                pos++;
              }
              targetPos = pos;
              break;
            }
          }
        }
        targetCaretRef.current = targetPos;
      }
    }

    onChange(formatted);
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={handleTextChange}
        maxLength={10}
        aria-label={ariaLabel}
        className={`w-full px-3 py-2 pr-9 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-colors ${className}`}
      />
      {/* Calendar picker icon & native datepicker trigger */}
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 text-stone-400 hover:text-stone-700 transition-colors"
        title="달력에서 날짜 선택"
      >
        <Calendar className="w-4 h-4 pointer-events-none" />
        <input
          type="date"
          tabIndex={-1}
          aria-label="달력 날짜 선택기"
          disabled={disabled}
          value={isValidDate(value) ? value : ''}
          onChange={handlePickerChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
};

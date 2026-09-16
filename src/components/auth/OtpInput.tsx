import React, { useRef, useEffect } from 'react';
import './OtpInput.css';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  hasError = false,
  autoFocus = true,
  onComplete,
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize input refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Focus first input on mount if autoFocus
  useEffect(() => {
    if (autoFocus && inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled]);

  const digits = value.padEnd(length, '').slice(0, length).split('');

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    // Extract only digits
    const cleaned = rawVal.replace(/\D/g, '');

    if (!cleaned) {
      // User pressed backspace or cleared
      const newDigits = [...digits];
      newDigits[index] = '';
      const newVal = newDigits.join('').trimEnd();
      onChange(newVal);
      return;
    }

    if (cleaned.length > 1) {
      // User pasted into cell
      handlePasteValue(cleaned, index);
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = singleDigit;
    const newVal = newDigits.join('').slice(0, length);
    onChange(newVal);

    if (newVal.length === length && onComplete) {
      onComplete(newVal);
    } else if (index < length - 1) {
      // Auto-advance to next input
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Empty cell: move to previous cell and clear it
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join('').trimEnd());
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
      inputRefs.current[index - 1]?.select();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
    if (pastedData) {
      handlePasteValue(pastedData, 0);
    }
  };

  const handlePasteValue = (pastedText: string, startIndex: number) => {
    const cleanNumbers = pastedText.replace(/\D/g, '');
    if (!cleanNumbers) return;

    const currentDigits = [...digits];
    for (let i = 0; i < cleanNumbers.length; i++) {
      const targetIndex = startIndex + i;
      if (targetIndex < length) {
        currentDigits[targetIndex] = cleanNumbers[i];
      }
    }

    const newVal = currentDigits.join('').slice(0, length);
    onChange(newVal);

    // Focus last filled or next empty input
    const nextEmptyIndex = currentDigits.findIndex((d, idx) => idx >= startIndex && (!d || d === ' '));
    if (nextEmptyIndex !== -1 && nextEmptyIndex < length) {
      inputRefs.current[nextEmptyIndex]?.focus();
    } else {
      const focusIndex = Math.min(startIndex + cleanNumbers.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
    }

    if (newVal.length === length && onComplete) {
      onComplete(newVal);
    }
  };

  return (
    <div
      className={`vaango-otp-container ${hasError ? 'vaango-otp-container--error' : ''}`}
      onPaste={handlePaste}
    >
      <div className="vaango-otp-cells" role="group" aria-label="Verification code input">
        {Array.from({ length }).map((_, idx) => {
          const digit = digits[idx] || '';
          const isCurrentActive =
            !disabled && (value.length === idx || (value.length === length && idx === length - 1));

          return (
            <input
              key={idx}
              ref={(el) => { inputRefs.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              value={digit}
              disabled={disabled}
              aria-label={`Digit ${idx + 1} of ${length}`}
              className={`vaango-otp-cell ${digit ? 'vaango-otp-cell--filled' : ''} ${
                hasError ? 'vaango-otp-cell--error' : ''
              } ${isCurrentActive ? 'vaango-otp-cell--active' : ''}`}
              onChange={(e) => handleChange(idx, e)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onFocus={(e) => e.target.select()}
            />
          );
        })}
      </div>
    </div>
  );
};

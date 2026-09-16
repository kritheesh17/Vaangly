import React, { forwardRef } from 'react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  error?: boolean;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, error = false, placeholder, className = '', id, ...props }, ref) => {
    return (
      <div className={`vaango-select-wrapper ${error ? 'vaango-select-wrapper--error' : ''}`}>
        <select
          ref={ref}
          id={id}
          aria-invalid={error}
          aria-describedby={error && id ? `${id}-error` : undefined}
          className={`vaango-select ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="vaango-select-arrow" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
    );
  }
);

Select.displayName = 'Select';

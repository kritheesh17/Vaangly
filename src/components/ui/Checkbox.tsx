import React, { forwardRef } from 'react';
import './Checkbox.css';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  sublabel?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, sublabel, id, className = '', disabled, ...props }, ref) => {
    const inputId = id || `checkbox-${Math.random().toString(36).substring(2, 9)}`;

    return (
      <label htmlFor={inputId} className={`vaango-checkbox-wrapper ${disabled ? 'vaango-checkbox-wrapper--disabled' : ''} ${className}`}>
        <div className="vaango-checkbox-box-container">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            disabled={disabled}
            className="vaango-checkbox-input"
            {...props}
          />
          <div className="vaango-checkbox-custom" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        <div className="vaango-checkbox-text">
          <span className="vaango-checkbox-label">{label}</span>
          {sublabel && <span className="vaango-checkbox-sublabel">{sublabel}</span>}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

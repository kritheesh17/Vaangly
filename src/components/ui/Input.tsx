import React, { forwardRef } from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    return (
      <div className={`vaango-input-wrapper ${error ? 'vaango-input-wrapper--error' : ''}`}>
        {leftIcon && <span className="vaango-input-wrapper__icon-left">{leftIcon}</span>}
        <input
          ref={ref}
          id={id}
          aria-invalid={error}
          aria-describedby={error && id ? `${id}-error` : undefined}
          className={`vaango-input ${leftIcon ? 'vaango-input--has-left-icon' : ''} ${
            rightIcon ? 'vaango-input--has-right-icon' : ''
          } ${className}`}
          {...props}
        />
        {rightIcon && <span className="vaango-input-wrapper__icon-right">{rightIcon}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

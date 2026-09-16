import React, { forwardRef } from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'lg', // Defaults to accessible touch-friendly size
      isLoading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const classNames = [
      'vaango-button',
      `vaango-button--${variant}`,
      `vaango-button--${size}`,
      fullWidth ? 'vaango-button--full-width' : '',
      isLoading ? 'vaango-button--loading' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={classNames}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && (
          <span className="vaango-button__spinner" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
          </span>
        )}
        {!isLoading && leftIcon && <span className="vaango-button__icon-left">{leftIcon}</span>}
        <span className="vaango-button__content">{children}</span>
        {!isLoading && rightIcon && <span className="vaango-button__icon-right">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

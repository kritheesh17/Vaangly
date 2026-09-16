import React, { forwardRef } from 'react';
import './IconButton.css';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ 'aria-label': ariaLabel, variant = 'ghost', size = 'lg', icon, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`vaango-icon-btn vaango-icon-btn--${variant} vaango-icon-btn--${size} ${className}`}
        {...props}
      >
        <span className="vaango-icon-btn__icon" aria-hidden="true">
          {icon}
        </span>
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

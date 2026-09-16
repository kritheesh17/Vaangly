import React from 'react';
import './Badge.css';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md';
  withDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  withDot = false,
  className = '',
  ...props
}) => {
  return (
    <span
      className={`vaango-badge vaango-badge--${variant} vaango-badge--${size} ${className}`}
      {...props}
    >
      {withDot && <span className="vaango-badge__dot" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
};

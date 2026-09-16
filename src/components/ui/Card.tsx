import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'sunken' | 'outlined';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  interactive = false,
  padding = 'md',
  className = '',
  ...props
}) => {
  const classNames = [
    'vaango-card',
    `vaango-card--${variant}`,
    `vaango-card--padding-${padding}`,
    interactive ? 'vaango-card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
};

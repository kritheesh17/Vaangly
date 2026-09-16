import React, { forwardRef } from 'react';
import './Textarea.css';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className = '', id, rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error}
        aria-describedby={error && id ? `${id}-error` : undefined}
        className={`vaango-textarea ${error ? 'vaango-textarea--error' : ''} ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

import React from 'react';
import './FormField.css';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  required = false,
  error,
  hint,
  children,
  className = '',
}) => {
  return (
    <div className={`vaango-form-field ${error ? 'vaango-form-field--error' : ''} ${className}`}>
      <label htmlFor={id} className="vaango-form-field__label">
        {label}
        {required && <span className="vaango-form-field__required" aria-hidden="true">*</span>}
      </label>

      <div className="vaango-form-field__control">{children}</div>

      {error ? (
        <p id={`${id}-error`} className="vaango-form-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="vaango-form-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

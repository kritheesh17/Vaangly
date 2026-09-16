import React from 'react';
import './Switch.css';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  const switchId = id || `switch-${Math.random().toString(36).substring(2, 9)}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div className={`vaango-switch-wrapper ${disabled ? 'vaango-switch-wrapper--disabled' : ''} ${className}`}>
      <div className="vaango-switch-info">
        <label id={`${switchId}-label`} htmlFor={switchId} className="vaango-switch-label">
          {label}
        </label>
        {description && <span className="vaango-switch-desc">{description}</span>}
      </div>

      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${switchId}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        onKeyDown={handleKeyDown}
        className={`vaango-switch-button ${checked ? 'vaango-switch-button--checked' : ''}`}
      >
        <span className="vaango-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
};

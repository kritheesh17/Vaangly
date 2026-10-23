import React from 'react';
import { AlertCircle, WifiOff, AlertTriangle, Info, X, RefreshCw } from 'lucide-react';
import './ActionErrorBanner.css';

export interface ActionErrorBannerProps {
  id?: string;
  message: string | React.ReactNode;
  title?: string;
  variant?: 'error' | 'warning' | 'network' | 'info';
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  onDismiss?: () => void;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}

export const ActionErrorBanner: React.FC<ActionErrorBannerProps> = ({
  id,
  message,
  title,
  variant = 'error',
  action,
  onDismiss,
  className = '',
  style,
  compact = false,
}) => {
  if (!message) return null;

  const renderIcon = () => {
    switch (variant) {
      case 'network':
        return <WifiOff size={18} className="vaangly-action-error__icon" aria-hidden="true" />;
      case 'warning':
        return <AlertTriangle size={18} className="vaangly-action-error__icon" aria-hidden="true" />;
      case 'info':
        return <Info size={18} className="vaangly-action-error__icon" aria-hidden="true" />;
      case 'error':
      default:
        return <AlertCircle size={18} className="vaangly-action-error__icon" aria-hidden="true" />;
    }
  };

  return (
    <div
      id={id}
      className={`vaangly-action-error vaangly-action-error--${variant} ${compact ? 'vaangly-action-error--compact' : ''} ${className}`}
      role="alert"
      aria-live="polite"
      style={style}
    >
      <div className="vaangly-action-error__icon-wrap">{renderIcon()}</div>

      <div className="vaangly-action-error__body">
        {title && <strong className="vaangly-action-error__title">{title}</strong>}
        <div className="vaangly-action-error__message">{message}</div>
      </div>

      {(action || onDismiss) && (
        <div className="vaangly-action-error__actions">
          {action && (
            <button
              type="button"
              className="vaangly-action-error__btn"
              onClick={(e) => {
                e.preventDefault();
                action.onClick();
              }}
            >
              {action.icon || (variant === 'network' ? <RefreshCw size={13} /> : null)}
              <span>{action.label}</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              className="vaangly-action-error__dismiss"
              onClick={(e) => {
                e.preventDefault();
                onDismiss();
              }}
              aria-label="Dismiss error notification"
              title="Dismiss"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

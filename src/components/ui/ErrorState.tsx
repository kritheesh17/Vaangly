import React from 'react';
import { AlertOctagon, RotateCw } from 'lucide-react';
import { Button } from './Button';
import './ErrorState.css';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'We encountered an unexpected error while loading this information. Please try again.',
  onRetry,
  className = '',
}) => {
  return (
    <div className={`vaango-error-state ${className}`} role="alert">
      <div className="vaango-error-state__icon-box" aria-hidden="true">
        <AlertOctagon size={44} />
      </div>
      <h3 className="vaango-error-state__title">{title}</h3>
      <p className="vaango-error-state__message">{message}</p>

      {onRetry && (
        <Button
          variant="primary"
          size="md"
          onClick={onRetry}
          leftIcon={<RotateCw size={18} />}
        >
          Try Again
        </Button>
      )}
    </div>
  );
};

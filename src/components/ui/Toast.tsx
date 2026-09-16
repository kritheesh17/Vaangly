import React from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import './Toast.css';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="vaango-toast__icon vaango-toast__icon--success" />;
      case 'warning':
        return <AlertTriangle className="vaango-toast__icon vaango-toast__icon--warning" />;
      case 'error':
        return <AlertCircle className="vaango-toast__icon vaango-toast__icon--error" />;
      default:
        return <Info className="vaango-toast__icon vaango-toast__icon--info" />;
    }
  };

  return (
    <div className="vaango-toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`vaango-toast vaango-toast--${toast.type}`}
          role="status"
        >
          <div className="vaango-toast__content">
            {getIcon(toast.type)}
            <p className="vaango-toast__message">{toast.message}</p>
          </div>
          <button
            type="button"
            className="vaango-toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

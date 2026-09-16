import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="vaango-modal-overlay" onClick={onClose} role="presentation">
      <div
        className={`vaango-modal-content vaango-modal-content--${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-desc' : undefined}
        ref={modalRef}
      >
        <div className="vaango-modal-header">
          <div className="vaango-modal-title-wrap">
            <h2 id="modal-title" className="vaango-modal-title">
              {title}
            </h2>
            {description && (
              <p id="modal-desc" className="vaango-modal-desc">
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon={<X />}
            aria-label="Close modal"
            onClick={onClose}
            variant="ghost"
            size="md"
          />
        </div>

        <div className="vaango-modal-body">{children}</div>

        {footer && <div className="vaango-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

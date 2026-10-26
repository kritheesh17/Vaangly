import React, { useState } from 'react';
import { AlertTriangle, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Request } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../../context/ToastContext';
import {
  CANCELLATION_REASONS,
  CancellationReason,
  cancelOrderDirectly,
  requestOrderCancellation,
} from '../../lib/orderCancellationApi';
import './OrderCancellationModal.css';

interface OrderCancellationModalProps {
  request: Request;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedRequest: Request) => void;
}

export const OrderCancellationModal: React.FC<OrderCancellationModalProps> = ({
  request,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [selectedReason, setSelectedReason] = useState<CancellationReason>(CANCELLATION_REASONS[0]);
  const [explanation, setExplanation] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refCode = request.reference_code || `ORD-${request.id.slice(0, 4)}`;
  const isDirectCancellation = request.current_state === 'REQUESTED';
  const isReady = request.current_state === 'READY';

  let shopName = 'Shop';
  try {
    if (request.notes) {
      const parsed = JSON.parse(request.notes);
      if (parsed.shop_name) shopName = parsed.shop_name;
    }
  } catch { /* notes parse fallback */ }

  const handleConfirm = async () => {
    if (!user) {
      setErrorMessage('You must be signed in to cancel this order.');
      return;
    }

    if (!selectedReason) {
      setErrorMessage('Please select a cancellation reason.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isDirectCancellation) {
        // Direct immediate cancellation for REQUESTED orders
        const res = await cancelOrderDirectly({
          requestId: request.id,
          customerId: user.id,
          reason: selectedReason,
          explanation: explanation.trim() || undefined,
          actorRole: user.role === 'admin' ? 'admin' : 'customer',
        });

        if (!res.success || !res.request) {
          throw new Error(res.error || 'Failed to cancel order.');
        }

        toastSuccess(`Order #${refCode} cancelled successfully.`);
        onSuccess(res.request);
        onClose();
      } else {
        // Request cancellation requiring shopkeeper response
        const res = await requestOrderCancellation({
          requestId: request.id,
          customerId: user.id,
          reason: selectedReason,
          explanation: explanation.trim() || undefined,
        });

        if (!res.success || !res.request) {
          throw new Error(res.error || 'Failed to submit cancellation request.');
        }

        toastSuccess(`Cancellation request for #${refCode} sent to ${shopName}.`);
        onSuccess(res.request);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while processing your cancellation.';
      setErrorMessage(msg);
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={isDirectCancellation ? 'Cancel Order' : 'Request Order Cancellation'}
      maxWidth="md"
    >
      <div className="vaango-cancel-modal-body">
        {/* Order Reference & State Banner */}
        <div className="vaango-cancel-order-header">
          <div className="vaango-cancel-order-info">
            <span className="vaango-cancel-order-label">Order Reference</span>
            <span className="vaango-cancel-order-ref">{refCode}</span>
            <span className="vaango-cancel-order-shop">{shopName}</span>
          </div>
          <div className="vaango-cancel-status-pill">
            <span className={`vaango-order-status-badge vaango-order-status-badge--${request.current_state.toLowerCase()}`}>
              {request.current_state}
            </span>
          </div>
        </div>

        {/* Policy Explanatory Notice */}
        <div className={`vaango-cancel-notice-box ${isDirectCancellation ? 'vaango-cancel-notice--direct' : 'vaango-cancel-notice--request'}`}>
          <div className="vaango-cancel-notice-icon">
            {isDirectCancellation ? <CheckCircle2 size={18} /> : isReady ? <ShieldAlert size={18} /> : <Clock size={18} />}
          </div>
          <div className="vaango-cancel-notice-text">
            {isDirectCancellation ? (
              <span>
                <strong>Direct Cancellation:</strong> This order has not yet been accepted by the shopkeeper. You may cancel it directly right now.
              </span>
            ) : isReady ? (
              <span>
                <strong>Shopkeeper Approval Required:</strong> This order is marked ready for collection/delivery. Cancelling now requires the shopkeeper's confirmation.
              </span>
            ) : (
              <span>
                <strong>Shopkeeper Approval Required:</strong> {shopName} has already accepted your order and may have begun preparation. Cancelling will notify the shopkeeper for review.
              </span>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="vaango-cancel-error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Cancellation Reason Selector */}
        <div className="vaango-cancel-section">
          <label className="vaango-cancel-section-title">
            Please select a reason for cancellation <span className="text-danger">*</span>
          </label>
          <div className="vaango-cancel-reasons-list" role="radiogroup" aria-label="Cancellation reasons">
            {CANCELLATION_REASONS.map((r) => {
              const isChecked = selectedReason === r;
              return (
                <label
                  key={r}
                  className={`vaango-cancel-reason-item ${isChecked ? 'vaango-cancel-reason-item--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="cancellation_reason"
                    value={r}
                    checked={isChecked}
                    onChange={() => setSelectedReason(r)}
                    disabled={isSubmitting}
                  />
                  <span>{r}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Optional Explanation */}
        <div className="vaango-cancel-section">
          <label className="vaango-cancel-section-title" htmlFor="cancellation-explanation">
            Additional explanation (optional)
          </label>
          <Textarea
            id="cancellation-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Add any specific context for the shopkeeper..."
            rows={3}
            disabled={isSubmitting}
            maxLength={300}
          />
        </div>

        {/* Local Merchant Courtesy Note */}
        <div className="vaango-cancel-courtesy-note">
          <small>
            Please cancel orders only when necessary. Frequent cancellations after orders are accepted can inconvenience local shops.
          </small>
        </div>

        {/* Modal Actions */}
        <div className="vaango-cancel-modal-actions">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Keep Order
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            {isDirectCancellation ? 'Confirm Direct Cancellation' : 'Send Cancellation Request'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Phone, XCircle, Store } from 'lucide-react';
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
} from '../../lib/orderCancellationApi';
import { cancelCustomerRequest } from '../../lib/appointmentServiceApi';
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
  const isAppointment = request.workflow_group_code === 'APPOINTMENT';

  // Eligibility check:
  // For retail orders: immediately cancellable strictly while in REQUESTED (pre-acceptance) state.
  // For appointments: cancellable in REQUESTED, ACCEPTED, or CONFIRMED state.
  const isEligible = isAppointment
    ? ['REQUESTED', 'ACCEPTED', 'CONFIRMED'].includes(request.current_state)
    : request.current_state === 'REQUESTED';

  let shopName = 'Shop';
  let shopPhone = '';
  let shopAddress = '';
  try {
    if (request.notes) {
      const parsed = JSON.parse(request.notes);
      if (parsed.shop_name) shopName = parsed.shop_name;
      if (parsed.shop_phone) shopPhone = parsed.shop_phone;
      if (parsed.shop_address) shopAddress = parsed.shop_address;
    }
  } catch {
    /* notes parse fallback */
  }

  if (!shopPhone && (request as any)?.shops?.phone) {
    shopPhone = (request as any).shops.phone;
  }
  if (!shopAddress && (request as any)?.shops?.address_line) {
    shopAddress = (request as any).shops.address_line;
  }

  const handleConfirm = async () => {
    if (!user) {
      setErrorMessage('You must be signed in to cancel this order.');
      return;
    }

    if (!isEligible) {
      setErrorMessage('This order is no longer eligible for direct cancellation. Please contact the shop directly.');
      return;
    }

    if (!selectedReason) {
      setErrorMessage('Please select a cancellation reason.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isAppointment) {
        // Safe appointment cancellation with automatic slot freeing
        const reasonText = selectedReason + (explanation.trim() ? `: ${explanation.trim()}` : '');
        const res = await cancelCustomerRequest(request.id, user.id, reasonText);

        if (!res.success || !res.request) {
          throw new Error(res.error || 'Failed to cancel appointment.');
        }

        toastSuccess(`Appointment #${refCode} cancelled successfully.`);
        onSuccess(res.request);
        onClose();
      } else {
        // Direct immediate retail order cancellation
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
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while cancelling your order.';
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
      title={isEligible ? (isAppointment ? 'Cancel Appointment' : 'Cancel Order') : 'Cannot Cancel Order'}
      maxWidth="md"
    >
      <div className="vaango-cancel-modal-body">
        {/* Order Reference & State Header */}
        <div className="vaango-cancel-order-header">
          <div className="vaango-cancel-order-info">
            <span className="vaango-cancel-order-label">
              {isAppointment ? 'Booking Reference' : 'Order Reference'}
            </span>
            <span className="vaango-cancel-order-ref">{refCode}</span>
            <span className="vaango-cancel-order-shop">{shopName}</span>
          </div>
          <div className="vaango-cancel-status-pill">
            <span className={`vaango-order-status-badge vaango-order-status-badge--${request.current_state.toLowerCase()}`}>
              {request.current_state === 'REQUESTED' ? 'Pending' : request.current_state}
            </span>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="vaango-cancel-error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {isEligible ? (
          <>
            {/* Immediate Cancellation Notice */}
            <div className="vaango-cancel-notice-box vaango-cancel-notice--direct">
              <div className="vaango-cancel-notice-icon">
                <CheckCircle2 size={18} />
              </div>
              <div className="vaango-cancel-notice-text">
                <span>
                  <strong>Immediate Cancellation:</strong>{' '}
                  {isAppointment
                    ? 'Your booking will be cancelled immediately and your slot released.'
                    : 'This order has not been accepted yet. Confirming will cancel the order immediately and notify the shopkeeper.'}
                </span>
              </div>
            </div>

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

            {/* Courtesy Note */}
            <div className="vaango-cancel-courtesy-note">
              <small>
                Please cancel orders only when necessary. Repeated cancellations after orders are accepted can inconvenience local shops.
              </small>
            </div>

            {/* Modal Actions */}
            <div className="vaango-cancel-modal-actions">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Keep {isAppointment ? 'Appointment' : 'Order'}
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirm}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                leftIcon={<XCircle size={16} />}
              >
                {isAppointment ? 'Confirm Cancellation' : 'Cancel Order Immediately'}
              </Button>
            </div>
          </>
        ) : (
          /* Ineligible Explanation Notice */
          <div className="vaango-cancel-ineligible-view">
            <div className="vaango-cancel-notice-box vaango-cancel-notice--ineligible">
              <div className="vaango-cancel-notice-icon">
                <AlertTriangle size={20} className="text-warning" />
              </div>
              <div className="vaango-cancel-notice-text">
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  Order Already Accepted & In Progress
                </strong>
                <span>
                  {shopName} has already accepted your order and begun fulfillment. Because preparation is underway, this order cannot be cancelled directly through the app.
                </span>
              </div>
            </div>

            <div className="vaango-cancel-contact-shop-card">
              <div className="vaango-cancel-contact-shop-header">
                <Store size={18} className="text-primary" />
                <strong>Contact {shopName} Directly</strong>
              </div>
              <p className="vaango-cancel-contact-desc">
                If you need to make changes, request a cancellation, or discuss delays, please speak directly with the merchant:
              </p>
              {shopAddress && (
                <div className="vaango-cancel-contact-detail">
                  <span className="text-muted">Address:</span> {shopAddress}
                </div>
              )}
              {shopPhone && (
                <div className="vaango-cancel-contact-actions">
                  <a
                    href={`tel:${shopPhone}`}
                    className="vaango-cancel-call-btn"
                  >
                    <Phone size={16} />
                    <span>Call Shop ({shopPhone})</span>
                  </a>
                </div>
              )}
            </div>

            <div className="vaango-cancel-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

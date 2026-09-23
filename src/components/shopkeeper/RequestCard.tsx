import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ShoppingBag,
  ArrowRight,
  User,
  Phone,
  CheckCircle,
  XCircle,
  Package,
  Calendar,
  Wrench,
} from 'lucide-react';
import { Request } from '../../types/database';
import { WorkflowGroupCode, WorkflowStateCode } from '../../types/workflow';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';
import './RequestCard.css';

interface DecodedNotes {
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; subtotal: number; variant_label?: string; variant_price?: number }[];
  service_name?: string;
  provider_name?: string;
  specialization?: string;
  slot_date?: string;
  start_time?: string;
  end_time?: string;
  service_category?: string;
  price_type?: 'fixed' | 'range';
  min_price?: number;
  max_price?: number;
  confirmed_price?: number;
  notes?: string | null;
  customer_name?: string;
  customer_phone?: string;
}

interface RequestCardProps {
  request: Request;
  onQuickTransition?: (request: Request, nextState: WorkflowStateCode) => void;
  onReject?: (request: Request) => void;
  isActionLoading?: boolean;
}

export const RequestCard: React.FC<RequestCardProps> = ({
  request,
  onQuickTransition,
  onReject,
  isActionLoading = false,
}) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const groupCode: WorkflowGroupCode = (request.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  // Decode items / services from request.notes
  let decoded: DecodedNotes = {};
  try {
    if (request.notes) {
      decoded = JSON.parse(request.notes);
    }
  } catch {
    // fallback if unformatted string
  }

  const items = decoded.items || [];
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Status badge
  const getStatusBadge = () => {
    switch (request.current_state) {
      case 'REQUESTED':
        return <Badge variant="primary" size="sm" withDot>{t('status_REQUESTED')}</Badge>;
      case 'CONFIRMED':
        return <Badge variant="success" size="sm" withDot>{t('status_CONFIRMED')}</Badge>;
      case 'ACCEPTED':
        return <Badge variant="accent" size="sm" withDot>{t('status_ACCEPTED')}</Badge>;
      case 'PREPARING':
      case 'IN_PROGRESS':
        return <Badge variant="accent" size="sm" withDot>{t('status_IN_PROGRESS')}</Badge>;
      case 'DELAYED':
        return <Badge variant="warning" size="sm" withDot>{t('status_DELAYED')}</Badge>;
      case 'READY':
        return <Badge variant="success" size="sm" withDot>{t('status_READY')}</Badge>;
      case 'COMPLETED':
        return <Badge variant="success" size="sm">{t('status_COMPLETED')}</Badge>;
      case 'NO_SHOW':
        return <Badge variant="error" size="sm">{t('status_NO_SHOW')}</Badge>;
      case 'REJECTED':
        return <Badge variant="error" size="sm">{t('status_REJECTED')}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error" size="sm">{t('status_CANCELLED')}</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{request.current_state}</Badge>;
    }
  };

  const formattedTime = () => {
    try {
      const date = new Date(request.created_at);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <Card
      variant="default"
      padding="md"
      className={`vaango-shop-req-card ${
        request.current_state === 'REQUESTED' ? 'vaango-shop-req-card--urgent' : ''
      }`}
    >
      {/* Header: Reference code, time, status */}
      <div className="vaango-shop-req-card__header">
        <div className="vaango-shop-req-card__ref-wrap">
          <span className="vaango-shop-req-card__ref">{request.reference_code}</span>
          <span className="vaango-shop-req-card__time">
            <Clock size={13} />
            {formattedTime()}
          </span>
        </div>
        {getStatusBadge()}
      </div>

      {/* Customer summary */}
      <div className="vaango-shop-req-card__customer">
        <div className="vaango-shop-req-card__cust-item">
          <User size={14} />
          <span>{decoded.customer_name || t('customerLabel')}</span>
        </div>
        {decoded.customer_phone && (
          <div className="vaango-shop-req-card__cust-item">
            <Phone size={14} />
            <span>{decoded.customer_phone}</span>
          </div>
        )}
      </div>

      {/* Body preview adapted by workflow group */}
      {groupCode === 'APPOINTMENT' ? (
        <div className="vaango-shop-req-card__items-preview">
          <div className="vaango-shop-req-card__items-count">
            <Calendar size={14} className="text-primary" />
            <strong className="text-primary">{decoded.service_name || t('appointmentFallback')}</strong>
          </div>
          <div className="text-xs text-muted mt-1">
            {decoded.provider_name && <span>{t('stylistDoctorLabel')} {decoded.provider_name} • </span>}
            📅 {decoded.slot_date} at ⏰ {decoded.start_time} – {decoded.end_time}
          </div>
        </div>
      ) : groupCode === 'SERVICE' ? (
        <div className="vaango-shop-req-card__items-preview">
          <div className="vaango-shop-req-card__items-count">
            <Wrench size={14} className="text-primary" />
            <strong className="text-primary">{decoded.service_name || t('serviceFallback')}</strong>
            {decoded.service_category && <span> ({decoded.service_category})</span>}
          </div>
          {decoded.confirmed_price ? (
            <div className="text-xs text-success font-semibold mt-1">
              {t('confirmedPriceLabel')} ₹{decoded.confirmed_price}
            </div>
          ) : decoded.price_type === 'range' ? (
            <div className="text-xs text-accent mt-1">
              {t('estimatedPriceLabel')} ₹{decoded.min_price} – ₹{decoded.max_price}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="vaango-shop-req-card__items-preview">
          <div className="vaango-shop-req-card__items-count">
            <ShoppingBag size={14} />
            <span>
              {itemCount === 1 ? t('itemCount') : t('itemsCount', { count: itemCount })}
            </span>
          </div>
          <div className="vaango-shop-req-card__items-list">
            {items.slice(0, 3).map((it, idx) => (
              <span key={idx} className="vaango-shop-req-card__item-pill">
                {it.quantity}x {it.name}
                {it.variant_label ? ` (${it.variant_label})` : ''}
              </span>
            ))}
            {items.length > 3 && (
              <span className="vaango-shop-req-card__item-more">{t('moreItems', { count: items.length - 3 })}</span>
            )}
          </div>
          {request.fulfillment_type && (
            <strong className="text-sm text-primary mt-2">
              Order Type: {['DINE_IN', 'dine_in'].includes(request.fulfillment_type) ? '🍽️ Dine-in' : '📦 Parcel / Takeaway'}
            </strong>
          )}
        </div>
      )}

      {/* Notes if any */}
      {decoded.notes && (
        <div className="vaango-shop-req-card__note">
          <strong>{t('customerNotePrefix')}</strong> &ldquo;{decoded.notes}&rdquo;
        </div>
      )}

      {/* Footer: Total & Actions */}
      <div className="vaango-shop-req-card__footer">
        <div className="vaango-shop-req-card__total">
          <span className="vaango-shop-req-card__total-label">
            {decoded.confirmed_price ? t('confirmedLabel') : t('estimateLabel')}
          </span>
          <span className="vaango-shop-req-card__total-amount">
            ₹{decoded.confirmed_price || request.total_estimate || 0}
          </span>
        </div>
        {request.payment_method === 'upi' && <Badge variant={request.payment_status === 'PAYMENT_VERIFIED' ? 'success' : request.payment_status === 'PAYMENT_REJECTED' ? 'error' : 'warning'} size="sm">{request.payment_status === 'PAYMENT_VERIFIED' ? 'Payment verified' : request.payment_status === 'PAYMENT_REJECTED' ? 'Payment rejected' : 'UPI proof pending'}</Badge>}
        {request.payment_method !== 'upi' && request.customer_paid && <Badge variant="success" size="sm">{t('paidBadge')}</Badge>}

        <div className="vaango-shop-req-card__actions">
          {/* Quick Primary Transition Buttons */}
          {groupCode === 'APPOINTMENT' ? (
            <>
              {request.current_state === 'REQUESTED' && onQuickTransition && (
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'CONFIRMED')}
                  leftIcon={<CheckCircle size={15} />}
                >
                  {t('confirmSlotBtn')}
                </Button>
              )}
              {request.current_state === 'CONFIRMED' && onQuickTransition && (
                <Button
                  variant="accent"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'IN_PROGRESS')}
                  leftIcon={<Clock size={15} />}
                >
                  {t('startServiceBtn')}
                </Button>
              )}
              {request.current_state === 'IN_PROGRESS' && onQuickTransition && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'COMPLETED')}
                  leftIcon={<CheckCircle size={15} />}
                >
                  {t('completeBtn')}
                </Button>
              )}
            </>
          ) : groupCode === 'SERVICE' ? (
            <>
              {request.current_state === 'REQUESTED' && onQuickTransition && (
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'ACCEPTED')}
                  leftIcon={<CheckCircle size={15} />}
                >
                  {t('acceptServiceBtn')}
                </Button>
              )}
              {request.current_state === 'ACCEPTED' && onQuickTransition && (
                <Button
                  variant="accent"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'IN_PROGRESS')}
                  leftIcon={<Wrench size={15} />}
                >
                  {t('startWorkBtn')}
                </Button>
              )}
              {request.current_state === 'IN_PROGRESS' && onQuickTransition && (
                <Button
                  variant="accent"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'READY')}
                  leftIcon={<Package size={15} />}
                >
                  {t('markReadyBtn')}
                </Button>
              )}
              {request.current_state === 'READY' && onQuickTransition && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'COMPLETED')}
                  leftIcon={<CheckCircle size={15} />}
                >
                  {t('completeBtn')}
                </Button>
              )}
            </>
          ) : (
            <>
              {request.current_state === 'REQUESTED' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {onQuickTransition && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={isActionLoading}
                      onClick={() => onQuickTransition(request, 'ACCEPTED')}
                      leftIcon={<CheckCircle size={15} />}
                    >
                      {t('acceptOrderBtn')}
                    </Button>
                  )}
                  {onReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReject(request)}
                      leftIcon={<XCircle size={15} color="var(--color-error)" />}
                      style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              )}
              {request.current_state === 'PREPARING' && onQuickTransition && (
                <Button
                  variant="accent"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'READY')}
                  leftIcon={<Package size={15} />}
                >
                  {t('markReadyBtn')}
                </Button>
              )}
              {request.current_state === 'READY' && onQuickTransition && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isActionLoading}
                  onClick={() => onQuickTransition(request, 'COMPLETED')}
                  leftIcon={<CheckCircle size={15} />}
                >
                  {t('markCompletedBtn')}
                </Button>
              )}
            </>
          )}

          {/* View Details */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/shopkeeper/requests/${request.id}`)}
            rightIcon={<ArrowRight size={14} />}
          >
            {t('detailsBtn')}
          </Button>
        </div>
      </div>
    </Card>
  );
};

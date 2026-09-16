import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Clock, ShieldCheck, ListOrdered } from 'lucide-react';
import { Request } from '../types/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import './RequestConfirmationPage.css';
import { registerPushSubscription } from '../lib/pushNotifications';
import { useToast } from '../context/ToastContext';

interface DecodedNotes {
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; subtotal: number }[];
  notes?: string | null;
  shop_name?: string;
  shop_address?: string;
  shop_phone?: string;
}

export const RequestConfirmationPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { success } = useToast();

  const [request, setRequest] = useState<Request | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadRequest() {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('requests')
            .select('*')
            .eq('id', requestId)
            .single();

          if (!error && data && isMounted) {
            setRequest(data as Request);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        // Fallback from localStorage
        const demoRequests: Request[] = JSON.parse(
          localStorage.getItem('vaango_demo_requests') || '[]'
        );
        const match = demoRequests.find((r) => r.id === requestId);
        if (match && isMounted) {
          setRequest(match);
        }
      }
      if (isMounted) setIsLoading(false);
    }

    loadRequest();
    return () => {
      isMounted = false;
    };
  }, [requestId]);

  useEffect(() => {
    if (localStorage.getItem('vaango_push_asked')) return;
    const timer = window.setTimeout(() => {
      void registerPushSubscription().then((granted) => {
        localStorage.setItem('vaango_push_asked', 'true');
        if (granted) success("Notifications enabled - we'll alert you when your order is ready.");
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [success]);

  if (isLoading) {
    return (
      <div className="container vaango-confirm-page" style={{ paddingTop: 'var(--space-8)' }}>
        <Skeleton height={60} width="60%" style={{ marginBottom: 'var(--space-4)' }} />
        <Skeleton height={200} style={{ marginBottom: 'var(--space-4)' }} />
        <Skeleton height={100} />
      </div>
    );
  }

  let decodedPayload: DecodedNotes = {};
  if (request?.notes) {
    try {
      decodedPayload = JSON.parse(request.notes);
    } catch {
      // notes was plain text
    }
  }

  const items = decodedPayload.items || [];
  const shopName = decodedPayload.shop_name || 'Neighborhood Store';

  return (
    <div className="container vaango-confirm-page">
      {/* Big Success Header */}
      <div className="vaango-confirm-card">
        <div className="vaango-confirm-badge-icon" aria-hidden="true">
          <CheckCircle2 size={48} />
        </div>

        <h1 className="vaango-confirm-title">Request Sent!</h1>
        <p className="vaango-confirm-subtitle">
          Your pre-order has been successfully submitted to <strong>{shopName}</strong>.
        </p>

        {request && (
          <div className="vaango-confirm-ref-box">
            <span className="vaango-confirm-ref-label">Order Reference Code</span>
            <span className="vaango-confirm-ref-code">{request.reference_code}</span>
            <div className="vaango-confirm-status-pill">
              <Badge variant="primary" size="sm" withDot>
                Status: REQUESTED (Awaiting Shop Acceptance)
              </Badge>
            </div>
          </div>
        )}

        <div className="vaango-confirm-info-banner">
          <Clock size={20} className="vaango-confirm-banner-icon" />
          <p>
            <strong>What happens next?</strong> The shopkeeper has received your pre-order request. They will confirm availability and start preparing your items shortly.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="vaango-confirm-actions">
          {request && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate(`/request/${request.id}`)}
              rightIcon={<ArrowRight size={18} />}
            >
              Track Live Request Status
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/orders')}
            leftIcon={<ListOrdered size={18} />}
          >
            View All Requests
          </Button>
        </div>
      </div>

      {/* Summary of Requested Items */}
      {items.length > 0 && (
        <Card variant="default" padding="lg" className="vaango-confirm-items-card">
          <div className="vaango-confirm-items-header">
            <h2 className="vaango-confirm-items-title">Requested Items ({items.length})</h2>
            <span className="vaango-confirm-items-total">
              Estimated: ₹{request?.total_estimate}
            </span>
          </div>

          <div className="vaango-confirm-items-list">
            {items.map((item, idx) => (
              <div key={idx} className="vaango-confirm-item-row">
                <div>
                  <div className="vaango-confirm-item-name">{item.name}</div>
                  <div className="vaango-confirm-item-unit">
                    ₹{item.price} / {item.unit}
                  </div>
                </div>
                <div className="vaango-confirm-item-qty">
                  <span>x{item.quantity}</span>
                  <strong>₹{item.subtotal}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="vaango-confirm-direct-pay">
            <ShieldCheck size={16} />
            <span>Pay directly to shopkeeper upon pickup or delivery.</span>
          </div>
        </Card>
      )}
    </div>
  );
};

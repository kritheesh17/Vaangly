import React, { useState, useEffect } from 'react';
import { Star, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Request } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../../context/ToastContext';
import './RatingModal.css';

interface RatingModalProps {
  request: Request;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface OrderItemInfo {
  product_id: string;
  name: string;
  price: number;
}

export const RatingModal: React.FC<RatingModalProps> = ({
  request,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [shopRating, setShopRating] = useState<number>(5);
  const [shopHoverRating, setShopHoverRating] = useState<number>(0);
  const [shopReview, setShopReview] = useState<string>('');

  const [productRatings, setProductRatings] = useState<Record<string, { rating: number; review: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Decode order items from request
  let items: OrderItemInfo[] = [];
  let shopName = 'Storefront';
  try {
    if (request.notes) {
      const parsed = JSON.parse(request.notes);
      if (parsed.items && Array.isArray(parsed.items)) {
        items = parsed.items.map((it: any) => ({
          product_id: it.product_id,
          name: it.name,
          price: it.price,
        }));
      }
      if (parsed.shop_name) {
        shopName = parsed.shop_name;
      }
    }
  } catch {
    // fallback
  }

  // Initialize product ratings
  useEffect(() => {
    const initial: Record<string, { rating: number; review: string }> = {};
    items.forEach((item) => {
      initial[item.product_id] = { rating: 5, review: '' };
    });
    setProductRatings(initial);
  }, [request.id]);

  // Check if existing rating exists
  useEffect(() => {
    async function checkExistingRating() {
      if (!isSupabaseConfigured || !user) return;
      try {
        const { data } = await supabase
          .from('shop_ratings')
          .select('id, rating, review')
          .eq('request_id', request.id)
          .maybeSingle();

        if (data) {
          setAlreadyRated(true);
          setShopRating(data.rating);
          if (data.review) setShopReview(data.review);
        }
      } catch {
        // ignore
      }
    }

    if (isOpen) {
      checkExistingRating();
    }
  }, [isOpen, request.id, user]);

  const handleProductRatingChange = (productId: string, rating: number) => {
    setProductRatings((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { review: '' }),
        rating,
      },
    }));
  };

  const handleProductReviewChange = (productId: string, review: string) => {
    setProductRatings((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { rating: 5 }),
        review,
      },
    }));
  };

  const handleSubmit = async () => {
    if (!user) {
      toastError('Please sign in to submit your rating.');
      return;
    }

    if (request.current_state !== 'COMPLETED') {
      toastError('Ratings can only be submitted for completed orders.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isSupabaseConfigured) {
        // 1. Submit or update storefront rating
        const { error: shopRateErr } = await supabase.from('shop_ratings').upsert(
          {
            shop_id: request.shop_id,
            customer_id: user.id,
            request_id: request.id,
            rating: shopRating,
            review: shopReview.trim() || null,
          },
          { onConflict: 'request_id' }
        );

        if (shopRateErr) {
          throw new Error(shopRateErr.message || 'Failed to submit storefront rating.');
        }

        // 2. Submit purchased product ratings
        for (const it of items) {
          const pEntry = productRatings[it.product_id];
          if (pEntry && pEntry.rating) {
            await supabase.from('product_ratings').upsert(
              {
                product_id: it.product_id,
                customer_id: user.id,
                request_id: request.id,
                rating: pEntry.rating,
                review: pEntry.review.trim() || null,
              },
              { onConflict: 'customer_id,product_id,request_id' }
            );
          }
        }
      } else {
        // Local mock fallback
        const existing = JSON.parse(localStorage.getItem('vaango_demo_ratings') || '[]');
        existing.push({
          request_id: request.id,
          shop_rating: shopRating,
          shop_review: shopReview,
          product_ratings: productRatings,
          created_at: new Date().toISOString(),
        });
        localStorage.setItem('vaango_demo_ratings', JSON.stringify(existing));
      }

      toastSuccess('Thank you for rating your purchase!');
      setAlreadyRated(true);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting rating.';
      setErrorMessage(msg);
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={alreadyRated ? `Rating for Order #${request.reference_code}` : `Rate Your Purchase #${request.reference_code}`}
      maxWidth="md"
    >
      <div className="vaango-rating-modal-body">
        {alreadyRated && (
          <div className="vaango-rating-done-banner">
            <CheckCircle2 size={18} className="text-success" />
            <span>You have already submitted a rating for this completed order.</span>
          </div>
        )}

        {errorMessage && (
          <div className="vaango-rating-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Storefront Experience Rating */}
        <div className="vaango-rating-section">
          <h3 className="vaango-rating-section-title">
            Store Experience: <strong>{shopName}</strong>
          </h3>
          <p className="vaango-rating-section-sub">
            How was your ordering and fulfillment experience with this store?
          </p>

          <div className="vaango-stars-row" role="radiogroup" aria-label="Storefront Rating">
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = (shopHoverRating || shopRating) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  disabled={alreadyRated || isSubmitting}
                  className={`vaango-star-btn ${filled ? 'vaango-star-btn--filled' : ''}`}
                  onClick={() => setShopRating(star)}
                  onMouseEnter={() => !alreadyRated && setShopHoverRating(star)}
                  onMouseLeave={() => !alreadyRated && setShopHoverRating(0)}
                  aria-label={`${star} star`}
                >
                  <Star size={28} fill={filled ? 'currentColor' : 'none'} />
                </button>
              );
            })}
            <span className="vaango-stars-score">{shopRating} / 5</span>
          </div>

          {!alreadyRated && (
            <div style={{ marginTop: 10 }}>
              <Textarea
                id="shop-review-input"
                placeholder="Share your thoughts about the service and fulfillment (optional)..."
                value={shopReview}
                onChange={(e) => setShopReview(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>

        {/* 2. Purchased Product Ratings */}
        {items.length > 0 && (
          <div className="vaango-rating-section">
            <h3 className="vaango-rating-section-title">Purchased Items Rating</h3>
            <p className="vaango-rating-section-sub">
              Rate the quality of the products you purchased:
            </p>

            <div className="vaango-rating-products-list">
              {items.map((it) => {
                const current = productRatings[it.product_id] || { rating: 5, review: '' };
                return (
                  <div key={it.product_id} className="vaango-rating-prod-card">
                    <div className="vaango-rating-prod-header">
                      <strong>{it.name}</strong>
                      <span className="text-secondary text-sm">₹{it.price}</span>
                    </div>

                    <div className="vaango-stars-row vaango-stars-row--sm">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const filled = current.rating >= star;
                        return (
                          <button
                            key={star}
                            type="button"
                            disabled={alreadyRated || isSubmitting}
                            className={`vaango-star-btn ${filled ? 'vaango-star-btn--filled' : ''}`}
                            onClick={() => handleProductRatingChange(it.product_id, star)}
                            aria-label={`${star} stars for ${it.name}`}
                          >
                            <Star size={20} fill={filled ? 'currentColor' : 'none'} />
                          </button>
                        );
                      })}
                      <span className="vaango-stars-score">{current.rating} / 5</span>
                    </div>

                    {!alreadyRated && (
                      <input
                        type="text"
                        className="vaango-input vaango-prod-review-input"
                        placeholder="Short review on product quality (optional)..."
                        value={current.review}
                        onChange={(e) => handleProductReviewChange(it.product_id, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="vaango-rating-actions">
          <Button variant="outline" onClick={onClose}>
            {alreadyRated ? 'Close' : 'Cancel'}
          </Button>
          {!alreadyRated && (
            <Button
              variant="primary"
              isLoading={isSubmitting}
              onClick={handleSubmit}
            >
              Submit Rating & Review
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

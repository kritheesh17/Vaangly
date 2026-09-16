import React from 'react';
import { Shop } from '../../types/database';
import { Badge } from '../ui/Badge';
import { Clock, MapPin, Store, Truck } from 'lucide-react';
import { StarRating } from '../ui/StarRating';
import './ShopCard.css';

export interface ShopCardProps {
  shop: Shop;
  categoryName?: string;
  onClick: () => void;
}

export const ShopCard: React.FC<ShopCardProps> = ({ shop, categoryName, onClick }) => {
  return (
    <div className="vaango-shop-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      {/* Shop Image / Thumbnail */}
      <div className="vaango-shop-card__media">
        {shop.photo_url ? (
          <img src={shop.photo_url} alt={shop.name} className="vaango-shop-card__image" loading="lazy" />
        ) : (
          <div className="vaango-shop-card__placeholder" aria-hidden="true">
            <Store size={36} />
          </div>
        )}
        <div className="vaango-shop-card__status-tag">
          <Badge variant={shop.is_open_today ? 'success' : 'neutral'} size="sm" withDot>
            {shop.is_open_today ? 'Open Today' : 'Closed'}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="vaango-shop-card__body">
        <div className="vaango-shop-card__header">
          <h3 className="vaango-shop-card__name">{shop.name}</h3>
          {categoryName && (
            <Badge variant="primary" size="sm">
              {categoryName}
            </Badge>
          )}
        </div>

        {shop.tagline && <p className="vaango-shop-card__tagline">{shop.tagline}</p>}
        {shop.avg_rating != null && <div className="vaango-shop-card-rating"><StarRating value={Math.round(shop.avg_rating)} readonly size="sm" /><span className="vaango-shop-card-rating__text">{shop.avg_rating} ({shop.total_ratings ?? 0})</span></div>}

        <div className="vaango-shop-card__footer">
          <div className="vaango-shop-card__meta-item">
            <MapPin size={14} className="vaango-shop-card__meta-icon" />
            <span>{shop.address_line}</span>
          </div>

          <div className="vaango-shop-card__meta-row">
            {shop.opening_time && shop.closing_time && (
              <div className="vaango-shop-card__meta-item">
                <Clock size={14} className="vaango-shop-card__meta-icon" />
                <span>{shop.opening_time} - {shop.closing_time}</span>
              </div>
            )}
            <div className="vaango-shop-card__delivery-badge">
              <Truck size={13} />
              <span>Counter Pickup & Delivery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

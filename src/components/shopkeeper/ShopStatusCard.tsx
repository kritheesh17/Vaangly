import { Radio, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';
import { Shop, ApplicationStatus } from '../../types/database';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import './ShopStatusCard.css';

interface ShopStatusCardProps {
  shop: Shop | null;
  applicationStatus?: ApplicationStatus;
  rejectionReason?: string | null;
  productCount: number;
  onToggleLive: (nextLiveState: boolean) => Promise<void>;
  isToggling?: boolean;
}

export const ShopStatusCard: React.FC<ShopStatusCardProps> = ({
  shop,
  applicationStatus,
  rejectionReason,
  productCount,
  onToggleLive,
  isToggling = false,
}) => {
  // Determine conceptual state
  if (applicationStatus === 'rejected') {
    return (
      <Card variant="default" padding="lg" className="vaango-shop-status-card vaango-shop-status-card--rejected">
        <div className="vaango-shop-status-card__header">
          <div className="vaango-shop-status-card__icon-wrap vaango-shop-status-card__icon-wrap--error">
            <XCircle size={26} />
          </div>
          <div className="vaango-shop-status-card__title-col">
            <Badge variant="error" size="md">Application Rejected</Badge>
            <h2 className="vaango-shop-status-card__title">Storefront Application Not Approved</h2>
          </div>
        </div>
        <div className="vaango-shop-status-card__body">
          <p className="vaango-shop-status-card__desc">
            Your application was reviewed and could not be approved at this time.
          </p>
          {rejectionReason && (
            <div className="vaango-shop-status-card__reason-box">
              <ShieldAlert size={18} />
              <div>
                <strong>Reason for rejection:</strong>
                <p>{rejectionReason}</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  }

  if (applicationStatus === 'submitted' || applicationStatus === 'under_review' || (!shop && applicationStatus)) {
    return (
      <Card variant="default" padding="lg" className="vaango-shop-status-card vaango-shop-status-card--pending">
        <div className="vaango-shop-status-card__header">
          <div className="vaango-shop-status-card__icon-wrap vaango-shop-status-card__icon-wrap--warning">
            <AlertTriangle size={26} />
          </div>
          <div className="vaango-shop-status-card__title-col">
            <Badge variant="warning" size="md" withDot>Pending Application</Badge>
            <h2 className="vaango-shop-status-card__title">Application Under Verification</h2>
          </div>
        </div>
        <div className="vaango-shop-status-card__body">
          <p className="vaango-shop-status-card__desc">
            Your shop onboarding application and storefront verification documents are currently being checked. Once verified, you can set up your product catalogue and start receiving orders.
          </p>
        </div>
      </Card>
    );
  }

  if (!shop) {
    return (
      <Card variant="default" padding="lg" className="vaango-shop-status-card">
        <div className="vaango-shop-status-card__body">
          <p className="vaango-shop-status-card__desc">No registered shop found for this account.</p>
        </div>
      </Card>
    );
  }

  // Approved shop scenarios: Incomplete Catalogue vs Live vs Offline
  const isCatalogueIncomplete = productCount === 0;
  const isLive = shop.is_live;
  const isSuspended = shop.status === 'suspended';

  return (
    <Card
      variant="default"
      padding="lg"
      className={`vaango-shop-status-card ${
        isSuspended
          ? 'vaango-shop-status-card--rejected'
          : isLive
          ? 'vaango-shop-status-card--live'
          : isCatalogueIncomplete
          ? 'vaango-shop-status-card--incomplete'
          : 'vaango-shop-status-card--paused'
      }`}
    >
      <div className="vaango-shop-status-card__main-row">
        <div className="vaango-shop-status-card__info">
          <div className="vaango-shop-status-card__badge-row">
            {isSuspended ? (
              <Badge variant="error" size="md" withDot>
                SUSPENDED
              </Badge>
            ) : isLive ? (
              <Badge variant="success" size="md" withDot>
                LIVE ON VAANGO
              </Badge>
            ) : isCatalogueIncomplete ? (
              <Badge variant="warning" size="md">
                Approved — Catalogue Incomplete
              </Badge>
            ) : (
              <Badge variant="neutral" size="md">
                Approved — Store Paused (Offline)
              </Badge>
            )}
            <span className="vaango-shop-status-card__item-count">
              {productCount} {productCount === 1 ? 'product' : 'products'} in catalogue
            </span>
          </div>

          <h2 className="vaango-shop-status-card__name">{shop.name}</h2>
          <p className="vaango-shop-status-card__desc">
            {isSuspended ? (
              <>
                Your shop is suspended and cannot be made visible until the Vaango admin team reviews it.
              </>
            ) : isLive ? (
              <>
                <span className="vaango-status-highlight">Customers can find your shop</span> in town and send pre-orders right now.
              </>
            ) : isCatalogueIncomplete ? (
              <>
                Your application is approved! <strong>Your shop is NOT yet visible to customers</strong>. Add your daily products to make your shop go live.
              </>
            ) : (
              <>
                Your catalogue is ready, but your shop is currently set to <strong>Offline</strong>. Customers cannot send new orders while offline.
              </>
            )}
          </p>
        </div>

        {/* Go Live Toggle Switch */}
        <div className="vaango-shop-status-card__toggle-container">
          {isSuspended ? (
            <Badge variant="error" size="md">Suspended - awaiting admin review</Badge>
          ) : (
            <>
          <label className="vaango-switch" htmlFor="go-live-toggle">
            <input
              id="go-live-toggle"
              type="checkbox"
              checked={isLive}
              disabled={isToggling || isCatalogueIncomplete}
              onChange={(e) => onToggleLive(e.target.checked)}
              aria-label="Toggle shop live visibility"
            />
            <span className="vaango-switch__slider" />
          </label>
          <span className="vaango-shop-status-card__toggle-label">
            {isLive ? 'Shop is LIVE' : 'Go Live'}
          </span>
            </>
          )}
        </div>
      </div>

      {isCatalogueIncomplete && (
        <div className="vaango-shop-status-card__incomplete-alert" role="status">
          <AlertTriangle size={18} />
          <span>
            Minimum catalogue requirement: Add at least 1 product to unlock Go Live visibility.
          </span>
        </div>
      )}

      {isLive && (
        <div className="vaango-shop-status-card__live-footer">
          <Radio size={16} className="vaango-radar-icon" />
          <span>Actively receiving orders for counter pickup & delivery</span>
        </div>
      )}
    </Card>
  );
};

import React from 'react';
import { Radio, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';
import { Shop, ApplicationStatus } from '../../types/database';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useLanguage } from '../../context/LanguageContext';
import './ShopStatusCard.css';

interface ShopStatusCardProps {
  shop: Shop | null;
  applicationStatus?: ApplicationStatus;
  rejectionReason?: string | null;
  productCount: number;
  workflowGroup?: 'ORDER' | 'SERVICE' | 'APPOINTMENT' | 'SALES_SERVICE';
  onToggleLive: (nextLiveState: boolean) => Promise<void>;
  isToggling?: boolean;
}

export const ShopStatusCard: React.FC<ShopStatusCardProps> = ({
  shop,
  applicationStatus,
  rejectionReason,
  productCount,
  workflowGroup = 'ORDER',
  onToggleLive,
  isToggling = false,
}) => {
  const { t } = useLanguage();

  // Determine conceptual state
  if (applicationStatus === 'rejected') {
    return (
      <Card variant="default" padding="lg" className="vaango-shop-status-card vaango-shop-status-card--rejected">
        <div className="vaango-shop-status-card__header">
          <div className="vaango-shop-status-card__icon-wrap vaango-shop-status-card__icon-wrap--error">
            <XCircle size={26} />
          </div>
          <div className="vaango-shop-status-card__title-col">
            <Badge variant="error" size="md">{t('applicationRejectedBadge')}</Badge>
            <h2 className="vaango-shop-status-card__title">{t('applicationNotApprovedTitle')}</h2>
          </div>
        </div>
        <div className="vaango-shop-status-card__body">
          <p className="vaango-shop-status-card__desc">
            {t('applicationRejectedDesc')}
          </p>
          {rejectionReason && (
            <div className="vaango-shop-status-card__reason-box">
              <ShieldAlert size={18} />
              <div>
                <strong>{t('rejectionReasonLabel')}</strong>
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
            <Badge variant="warning" size="md" withDot>{t('pendingApplicationBadge')}</Badge>
            <h2 className="vaango-shop-status-card__title">{t('applicationUnderVerificationTitle')}</h2>
          </div>
        </div>
        <div className="vaango-shop-status-card__body">
          <p className="vaango-shop-status-card__desc">
            {t('applicationUnderVerificationDesc')}
          </p>
        </div>
      </Card>
    );
  }

  if (!shop) {
    return (
      <Card variant="default" padding="lg" className="vaango-shop-status-card">
        <div className="vaango-shop-status-card__body">
          <p className="vaango-shop-status-card__desc">{t('noRegisteredShopFound')}</p>
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
                {t('suspendedBadge')}
              </Badge>
            ) : isLive ? (
              <Badge variant="success" size="md" withDot>
                {t('liveOnVaango')}
              </Badge>
            ) : isCatalogueIncomplete ? (
              <Badge variant="warning" size="md">
                {t('approvedCatalogueIncomplete')}
              </Badge>
            ) : (
              <Badge variant="neutral" size="md">
                {t('approvedStorePaused')}
              </Badge>
            )}
            <span className="vaango-shop-status-card__item-count">
              {workflowGroup === 'SALES_SERVICE'
                ? productCount === 1
                  ? '1 item/service in catalogue'
                  : `${productCount} items/services in catalogue`
                : workflowGroup === 'SERVICE' || workflowGroup === 'APPOINTMENT'
                ? productCount === 1
                  ? '1 service in catalogue'
                  : `${productCount} services in catalogue`
                : productCount === 1
                ? t('productInCatalogue')
                : t('productsInCatalogue', { count: productCount })}
            </span>
          </div>

          <h2 className="vaango-shop-status-card__name">{shop.name}</h2>
          <p className="vaango-shop-status-card__desc">
            {isSuspended ? (
              t('shopSuspendedDesc')
            ) : isLive ? (
              t('shopLiveDesc')
            ) : isCatalogueIncomplete ? (
              t('shopCatalogueIncompleteDesc')
            ) : (
              t('shopOfflineDesc')
            )}
          </p>
        </div>

        {/* Go Live Toggle Switch */}
        <div className="vaango-shop-status-card__toggle-container">
          {isSuspended ? (
            <Badge variant="error" size="md">{t('suspendedAwaitingReview')}</Badge>
          ) : (
            <>
              <label className="vaango-switch" htmlFor="go-live-toggle">
                <input
                  id="go-live-toggle"
                  type="checkbox"
                  checked={isLive}
                  disabled={isToggling || isCatalogueIncomplete}
                  onChange={(e) => onToggleLive(e.target.checked)}
                  aria-label={isLive ? t('shopIsLive') : t('goLive')}
                />
                <span className="vaango-switch__slider" />
              </label>
              <span className="vaango-shop-status-card__toggle-label">
                {isLive ? t('shopIsLive') : t('goLive')}
              </span>
            </>
          )}
        </div>
      </div>

      {isCatalogueIncomplete && (
        <div className="vaango-shop-status-card__incomplete-alert" role="status">
          <AlertTriangle size={18} />
          <span>
            {t('minCatalogueReq')}
          </span>
        </div>
      )}

      {isLive && (
        <div className="vaango-shop-status-card__live-footer">
          <Radio size={16} className="vaango-radar-icon" />
          <span>{t('activelyReceivingOrders')}</span>
        </div>
      )}
    </Card>
  );
};

import React from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { usePwaUpdate } from '../../context/PwaUpdateContext';
import { Button } from '../ui/Button';
import './PwaUpdateBanner.css';

export const PwaUpdateBanner: React.FC = () => {
  const { isUpdateAvailable, isBannerDismissed, applyUpdate, dismissUpdateBanner, appVersion } = usePwaUpdate();

  if (!isUpdateAvailable || isBannerDismissed) return null;

  return (
    <div className="vaangly-update-banner" role="alert" aria-live="polite">
      <div className="vaangly-update-banner__content">
        <div className="vaangly-update-banner__icon-wrap">
          <Sparkles size={18} className="vaangly-update-banner__icon" />
        </div>
        <div className="vaangly-update-banner__text">
          <span className="vaangly-update-banner__title">New version available</span>
          <span className="vaangly-update-banner__desc">
            Vaangly {appVersion} is ready with fresh improvements and bug fixes.
          </span>
        </div>
      </div>

      <div className="vaangly-update-banner__actions">
        <Button
          variant="primary"
          size="sm"
          onClick={applyUpdate}
          leftIcon={<RefreshCw size={14} />}
          className="vaangly-update-banner__btn"
        >
          Update Now
        </Button>
        <button
          type="button"
          onClick={dismissUpdateBanner}
          className="vaangly-update-banner__close"
          aria-label="Dismiss update notification"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

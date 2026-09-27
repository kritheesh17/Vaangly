import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';
import { usePermissions } from '../../context/PermissionContext';
import './InstallPrompt.css';

const DISMISSED_KEY = 'vaangly_install_banner_dismissed';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const InstallPrompt: React.FC = () => {
  const { t } = useLanguage();
  const { isInstalled, platform, promptInstall } = usePermissions();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isInstalled) {
      setDismissed(true);
      return;
    }
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    if (!dismissedAt || Date.now() - dismissedAt > SEVEN_DAYS) {
      setDismissed(false);
    }
  }, [isInstalled]);

  if (isInstalled || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setDismissed(true);
    }
  };

  return (
    <div className="vaango-install-prompt" role="status">
      <Download size={18} aria-hidden="true" className="text-primary flex-shrink-0" />
      <span>
        {platform === 'ios'
          ? 'Install Vaangly on iPhone / iPad for instant access'
          : 'Install Vaangly app for instant booking & offline access'}
      </span>
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={() => void handleInstall()}
      >
        {t('installBtn') || 'Install'}
      </Button>
      <button
        type="button"
        className="vaango-install-prompt__close"
        aria-label="Dismiss install banner"
        onClick={handleDismiss}
      >
        <X size={18} />
      </button>
    </div>
  );
};

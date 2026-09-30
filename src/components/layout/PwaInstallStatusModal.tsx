import React from 'react';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  X,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { usePermissions } from '../../context/PermissionContext';
import './PwaInstallStatusModal.css';

export const PwaInstallStatusModal: React.FC = () => {
  const {
    isInstallFeedbackOpen,
    installState,
    installPhase,
    installStatusMessage,
    promptInstall,
    resetInstallFeedback,
    setIsManualInstallOpen,
  } = usePermissions();

  if (!isInstallFeedbackOpen) return null;

  const isPending = installPhase === 'preparing' || installPhase === 'prompt_opened' || installPhase === 'installing';
  const isCompleting = installPhase === 'completing';
  const isInstalled = installPhase === 'installed' || installState === 'INSTALLED';
  const isCancelled = installPhase === 'cancelled' || installState === 'DISMISSED';
  const isError = installPhase === 'error' || installState === 'ERROR';
  const isUnavailable = installPhase === 'unavailable' || installState === 'UNSUPPORTED';

  const handleOpenApp = () => {
    resetInstallFeedback();
    // If running in browser and installed, prompt user or navigate
    if (window.matchMedia('(display-mode: standalone)').matches) {
      window.location.href = '/';
    } else {
      // Direct user to open their new app icon from home screen
      window.focus();
    }
  };

  const handleManualGuide = () => {
    resetInstallFeedback();
    setIsManualInstallOpen(true);
  };

  return (
    <div
      className="vaangly-install-overlay"
      onClick={!isPending ? resetInstallFeedback : undefined}
      role="presentation"
    >
      <div
        className="vaangly-install-card"
        onClick={(e) => e.stopPropagation()}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-labelledby="vaangly-install-title"
      >
        {/* Header */}
        <div className="vaangly-install-card__header">
          <div className="vaangly-install-card__brand">
            <div className="vaangly-install-card__logo-wrap">
              <Download size={20} />
            </div>
            <div className="vaangly-install-card__title-group">
              <span className="vaangly-install-card__kicker">PWA Installation</span>
              <h3 id="vaangly-install-title" className="vaangly-install-card__title">
                {isInstalled ? 'Vaangly is Installed' : 'Install Vaangly App'}
              </h3>
            </div>
          </div>

          {!isPending && (
            <button
              type="button"
              className="vaangly-install-card__close-btn"
              onClick={resetInstallFeedback}
              aria-label="Close installation status dialog"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Semantic Status Box */}
        <div
          className={`vaangly-install-status-box ${
            isPending
              ? 'vaangly-install-status-box--installing'
              : isInstalled || isCompleting
              ? 'vaangly-install-status-box--installed'
              : isCancelled
              ? 'vaangly-install-status-box--cancelled'
              : isError
              ? 'vaangly-install-status-box--error'
              : ''
          }`}
        >
          <div
            className={`vaangly-install-status-box__icon-wrap ${
              isPending
                ? 'vaangly-install-status-box__icon-wrap--spinner'
                : isInstalled || isCompleting
                ? 'vaangly-install-status-box__icon-wrap--success'
                : isCancelled
                ? 'vaangly-install-status-box__icon-wrap--warning'
                : isError
                ? 'vaangly-install-status-box__icon-wrap--error'
                : 'vaangly-install-status-box__icon-wrap--warning'
            }`}
          >
            {isPending && <Loader2 size={20} />}
            {(isInstalled || isCompleting) && <CheckCircle2 size={20} />}
            {isCancelled && <AlertCircle size={20} />}
            {isError && <XCircle size={20} />}
            {isUnavailable && <Smartphone size={20} />}
          </div>

          <div className="vaangly-install-status-box__text">
            <div className="vaangly-install-status-box__state-label">
              {installStatusMessage.title}
            </div>
            <p className="vaangly-install-status-box__detail">
              {installStatusMessage.detail}
            </p>
          </div>
        </div>

        {/* Feature Benefits List */}
        {!isInstalled && (
          <ul className="vaangly-install-benefits">
            <li className="vaangly-install-benefit-item">
              <CheckCircle2 size={16} />
              <span>Opens in full-screen without browser address bars</span>
            </li>
            <li className="vaangly-install-benefit-item">
              <CheckCircle2 size={16} />
              <span>Instant one-tap access from your home screen</span>
            </li>
            <li className="vaangly-install-benefit-item">
              <CheckCircle2 size={16} />
              <span>Cached offline support & background order updates</span>
            </li>
          </ul>
        )}

        {/* Action Controls */}
        <div className="vaangly-install-card__actions">
          {isInstalled ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleOpenApp}
              leftIcon={<ExternalLink size={16} />}
              className="w-full"
            >
              Open Vaangly
            </Button>
          ) : isCompleting ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={resetInstallFeedback}
              className="w-full"
            >
              Got It
            </Button>
          ) : isPending ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={resetInstallFeedback}
              className="w-full"
            >
              Dismiss
            </Button>
          ) : isCancelled || isError ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={resetInstallFeedback}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => void promptInstall()}
                leftIcon={<RotateCcw size={16} />}
              >
                Try Again
              </Button>
            </>
          ) : isUnavailable ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={resetInstallFeedback}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleManualGuide}
                leftIcon={<Sparkles size={16} />}
              >
                View Instructions
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => void promptInstall()}
              leftIcon={<Download size={16} />}
              className="w-full"
            >
              Install Vaangly
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellOff,
  ShoppingBag,
  Clock,
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  Smartphone,
  Globe,
  Apple,
  Info,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { usePermissions } from '../../context/PermissionContext';
import './NotificationPermissionGate.css';

interface NotificationPermissionGateProps {
  onAcknowledgeUnsupported?: () => void;
}

export const NotificationPermissionGate: React.FC<NotificationPermissionGateProps> = ({
  onAcknowledgeUnsupported,
}) => {
  const {
    notificationStatus,
    isRequestingNotification,
    requestNotificationPermission,
    refreshNotificationStatus,
    platform,
  } = usePermissions();

  const [activeGuideTab, setActiveGuideTab] = useState<'android' | 'ios' | 'desktop'>(() => {
    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';
    return 'desktop';
  });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCheckingAgain, setIsCheckingAgain] = useState(false);

  // Automatically check permission when user returns to the tab/window from browser settings
  useEffect(() => {
    const handleRecheck = () => {
      const updated = refreshNotificationStatus();
      if (updated === 'granted') {
        setFeedback(null);
      }
    };

    window.addEventListener('focus', handleRecheck);
    document.addEventListener('visibilitychange', handleRecheck);
    return () => {
      window.removeEventListener('focus', handleRecheck);
      document.removeEventListener('visibilitychange', handleRecheck);
    };
  }, [refreshNotificationStatus]);

  const handleRequestPermission = async () => {
    setFeedback(null);
    const granted = await requestNotificationPermission();
    if (!granted) {
      const current = refreshNotificationStatus();
      if (current === 'denied') {
        setFeedback(
          'Notifications are currently blocked. Please follow the instructions below to allow notifications in your browser settings.'
        );
      }
    }
  };

  const handleCheckAgain = useCallback(async () => {
    setIsCheckingAgain(true);
    setFeedback(null);

    // Brief delay to allow browser to flush permission state
    await new Promise((resolve) => setTimeout(resolve, 350));

    const status = refreshNotificationStatus();
    setIsCheckingAgain(false);

    if (status === 'granted') {
      setFeedback(null);
    } else if (status === 'denied') {
      setFeedback(
        'Notifications are still blocked in your browser settings. Please ensure notifications are set to "Allow" and try again.'
      );
    } else {
      setFeedback('Notification permission has not yet been granted. Please tap "Request Permission".');
    }
  }, [refreshNotificationStatus]);

  // If already granted, don't render anything
  if (notificationStatus === 'granted') {
    return null;
  }

  return (
    <div className="vaangly-notif-gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="vaangly-notif-gate__backdrop" />

      <div className="vaangly-notif-gate__container">
        <div className="vaangly-notif-gate__card">
          {/* Top Brand Banner */}
          <div className="vaangly-notif-gate__header">
            <div className="vaangly-notif-gate__badge">
              <span className="vaangly-notif-gate__badge-dot" />
              <span>Mandatory Notification Setup</span>
            </div>
            <h1 className="vaangly-notif-gate__brand">Vaangly</h1>
          </div>

          {/* STATE 1: PROMPT (First time / not yet decided) */}
          {notificationStatus === 'prompt' && (
            <div className="vaangly-notif-gate__body">
              <div className="vaangly-notif-gate__hero-icon">
                <div className="vaangly-notif-gate__icon-pulse" />
                <div className="vaangly-notif-gate__icon-circle">
                  <Bell size={32} />
                </div>
              </div>

              <h2 id="gate-title" className="vaangly-notif-gate__title">
                Enable Notifications to Access Vaangly
              </h2>

              <p className="vaangly-notif-gate__subtitle">
                Vaangly keeps you informed with real-time updates for orders, doctor appointments, and urgent shop alerts.
                You must enable notifications to enter the app.
              </p>

              {/* Mandatory Feature Reasons */}
              <div className="vaangly-notif-gate__features">
                <div className="vaangly-notif-gate__feature-item">
                  <div className="vaangly-notif-gate__feature-icon vaangly-notif-gate__feature-icon--order">
                    <ShoppingBag size={20} />
                  </div>
                  <div className="vaangly-notif-gate__feature-text">
                    <div className="vaangly-notif-gate__feature-heading">Real-Time Order Updates</div>
                    <div className="vaangly-notif-gate__feature-desc">
                      Instant alerts when your store order is confirmed, packed, and ready for pickup.
                    </div>
                  </div>
                </div>

                <div className="vaangly-notif-gate__feature-item">
                  <div className="vaangly-notif-gate__feature-icon vaangly-notif-gate__feature-icon--queue">
                    <Clock size={20} />
                  </div>
                  <div className="vaangly-notif-gate__feature-text">
                    <div className="vaangly-notif-gate__feature-heading">Doctor & Clinic Queue Tokens</div>
                    <div className="vaangly-notif-gate__feature-desc">
                      Live queue alerts so you never miss your turn when you are 3rd, 2nd, or next in line.
                    </div>
                  </div>
                </div>

                <div className="vaangly-notif-gate__feature-item">
                  <div className="vaangly-notif-gate__feature-icon vaangly-notif-gate__feature-icon--security">
                    <ShieldAlert size={20} />
                  </div>
                  <div className="vaangly-notif-gate__feature-text">
                    <div className="vaangly-notif-gate__feature-heading">Critical Store & Security Alerts</div>
                    <div className="vaangly-notif-gate__feature-desc">
                      Important shopkeeper notices, slot cancellations, and account security alerts.
                    </div>
                  </div>
                </div>
              </div>

              {feedback && (
                <div className="vaangly-notif-gate__alert vaangly-notif-gate__alert--warning">
                  <AlertTriangle size={16} />
                  <span>{feedback}</span>
                </div>
              )}

              {/* Primary Action Button */}
              <div className="vaangly-notif-gate__actions">
                <Button
                  variant="primary"
                  size="lg"
                  className="vaangly-notif-gate__btn-primary"
                  isLoading={isRequestingNotification}
                  onClick={handleRequestPermission}
                >
                  <Bell size={18} />
                  <span>Enable Notifications to Continue</span>
                </Button>

                <p className="vaangly-notif-gate__disclaimer">
                  Tap <strong>Allow</strong> on the browser prompt that appears above. You can customize channels anytime in Settings.
                </p>
              </div>
            </div>
          )}

          {/* STATE 2: DENIED / BLOCKED */}
          {notificationStatus === 'denied' && (
            <div className="vaangly-notif-gate__body">
              <div className="vaangly-notif-gate__hero-icon vaangly-notif-gate__hero-icon--denied">
                <div className="vaangly-notif-gate__icon-circle vaangly-notif-gate__icon-circle--denied">
                  <BellOff size={32} />
                </div>
              </div>

              <h2 id="gate-title" className="vaangly-notif-gate__title text-rose-600 dark:text-rose-400">
                Notifications are Blocked
              </h2>

              <p className="vaangly-notif-gate__subtitle">
                Access to Vaangly is locked until notification permission is enabled. Live token queues and order tracking require immediate alerts.
              </p>

              {feedback && (
                <div className="vaangly-notif-gate__alert vaangly-notif-gate__alert--error">
                  <AlertTriangle size={16} />
                  <span>{feedback}</span>
                </div>
              )}

              {/* Instructions Box with Platform Tabs */}
              <div className="vaangly-notif-gate__guide-card">
                <div className="vaangly-notif-gate__guide-header">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    How to Unblock on your device:
                  </div>

                  <div className="vaangly-notif-gate__tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeGuideTab === 'android'}
                      className={`vaangly-notif-gate__tab ${activeGuideTab === 'android' ? 'vaangly-notif-gate__tab--active' : ''}`}
                      onClick={() => setActiveGuideTab('android')}
                    >
                      <Smartphone size={13} />
                      <span>Android</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeGuideTab === 'ios'}
                      className={`vaangly-notif-gate__tab ${activeGuideTab === 'ios' ? 'vaangly-notif-gate__tab--active' : ''}`}
                      onClick={() => setActiveGuideTab('ios')}
                    >
                      <Apple size={13} />
                      <span>iOS / iPhone</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeGuideTab === 'desktop'}
                      className={`vaangly-notif-gate__tab ${activeGuideTab === 'desktop' ? 'vaangly-notif-gate__tab--active' : ''}`}
                      onClick={() => setActiveGuideTab('desktop')}
                    >
                      <Globe size={13} />
                      <span>Desktop</span>
                    </button>
                  </div>
                </div>

                {/* Tab 1: Android Chrome & PWA */}
                {activeGuideTab === 'android' && (
                  <ol className="vaangly-notif-gate__steps">
                    <li>
                      <span className="vaangly-notif-gate__step-num">1</span>
                      <div>
                        Tap the <strong>Padlock (🔒)</strong> or <strong>Tune (⚙️)</strong> icon next to the URL in your browser bar.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">2</span>
                      <div>
                        Tap <strong>Permissions</strong> or <strong>Site settings</strong>.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">3</span>
                      <div>
                        Tap <strong>Notifications</strong> and change it to <strong>Allow</strong>.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">4</span>
                      <div>
                        Return to this page and tap <strong>Check Again & Enter</strong> below.
                      </div>
                    </li>
                  </ol>
                )}

                {/* Tab 2: iOS Safari & PWA */}
                {activeGuideTab === 'ios' && (
                  <ol className="vaangly-notif-gate__steps">
                    <li>
                      <span className="vaangly-notif-gate__step-num">1</span>
                      <div>
                        Open your iPhone <strong>Settings</strong> app.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">2</span>
                      <div>
                        Scroll down and tap <strong>Vaangly</strong> (or <strong>Safari</strong> &gt; <strong>Advanced</strong>).
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">3</span>
                      <div>
                        Tap <strong>Notifications</strong> and turn on <strong>Allow Notifications</strong>.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">4</span>
                      <div>
                        Return here and tap <strong>Check Again & Enter</strong> below.
                      </div>
                    </li>
                  </ol>
                )}

                {/* Tab 3: Desktop Chrome / Edge / Firefox */}
                {activeGuideTab === 'desktop' && (
                  <ol className="vaangly-notif-gate__steps">
                    <li>
                      <span className="vaangly-notif-gate__step-num">1</span>
                      <div>
                        Click the <strong>padlock or site settings icon</strong> on the left side of the address bar.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">2</span>
                      <div>
                        Toggle <strong>Notifications</strong> to <strong>Allow</strong>.
                      </div>
                    </li>
                    <li>
                      <span className="vaangly-notif-gate__step-num">3</span>
                      <div>
                        Click <strong>Check Again & Enter</strong> below or reload this page.
                      </div>
                    </li>
                  </ol>
                )}
              </div>

              {/* Action Buttons for Denied State */}
              <div className="vaangly-notif-gate__actions">
                <Button
                  variant="primary"
                  size="lg"
                  className="vaangly-notif-gate__btn-primary"
                  isLoading={isCheckingAgain}
                  onClick={handleCheckAgain}
                >
                  <RefreshCw size={18} className={isCheckingAgain ? 'vaango-spin' : ''} />
                  <span>Check Again & Enter</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  isLoading={isRequestingNotification}
                  onClick={handleRequestPermission}
                >
                  <span>Try Browser Permission Dialog</span>
                </Button>
              </div>
            </div>
          )}

          {/* STATE 3: UNSUPPORTED (Legacy / Fallback) */}
          {notificationStatus === 'unsupported' && (
            <div className="vaangly-notif-gate__body">
              <div className="vaangly-notif-gate__hero-icon">
                <div className="vaangly-notif-gate__icon-circle bg-amber-500/10 text-amber-600">
                  <Info size={32} />
                </div>
              </div>

              <h2 id="gate-title" className="vaangly-notif-gate__title">
                Notifications Unsupported on this Browser
              </h2>

              <p className="vaangly-notif-gate__subtitle">
                Your current browser does not support the Web Notifications API. For live queue alerts and order tracking, please use <strong>Google Chrome on Android</strong> or add Vaangly to your Home Screen on <strong>iOS 16.4+</strong>.
              </p>

              <div className="vaangly-notif-gate__actions">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => onAcknowledgeUnsupported && onAcknowledgeUnsupported()}
                >
                  <span>Continue in Limited Notification Mode</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

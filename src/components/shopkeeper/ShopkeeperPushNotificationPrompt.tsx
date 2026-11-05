import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registerPushSubscription, getNotificationDiagnostics, NotificationDiagnosticsData } from '../../lib/pushNotifications';
import { Button } from '../ui/Button';
import './ShopkeeperPushNotificationPrompt.css';

const SK_NOTIF_DISMISSED_KEY = 'vaangly_sk_notif_banner_dismissed_until';

export interface ShopkeeperPushNotificationPromptProps {
  variant?: 'banner' | 'card';
  className?: string;
  showDismiss?: boolean;
}

export const ShopkeeperPushNotificationPrompt: React.FC<ShopkeeperPushNotificationPromptProps> = ({
  variant = 'banner',
  className = '',
  showDismiss = true,
}) => {
  const { user } = useAuth();
  const {
    notificationStatus,
    requestNotificationPermission,
    sendTestNotification,
    refreshDiagnostics,
  } = usePermissions();
  const { success, error: toastError, info } = useToast();

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (variant === 'card') return false;
    try {
      const until = localStorage.getItem(SK_NOTIF_DISMISSED_KEY);
      if (until && Number(until) > Date.now()) {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  });

  const [isEnabling, setIsEnabling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagData, setDiagData] = useState<NotificationDiagnosticsData | null>(null);
  const [isRefreshingDiag, setIsRefreshingDiag] = useState(false);

  // Auto-sync push subscription if permission is already granted and user is logged in
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && user?.id) {
      void registerPushSubscription().then((ok) => {
        if (ok) {
          void refreshDiagnostics();
        }
      });
    }
  }, [user?.id, refreshDiagnostics]);

  const loadLocalDiagnostics = useCallback(async () => {
    setIsRefreshingDiag(true);
    try {
      const data = await getNotificationDiagnostics();
      setDiagData(data);
    } catch {
      // ignore
    } finally {
      setIsRefreshingDiag(false);
    }
  }, []);

  useEffect(() => {
    if (variant === 'card' || showDiagnostics) {
      loadLocalDiagnostics();
    }
  }, [variant, showDiagnostics, loadLocalDiagnostics]);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      // Dismiss for 24 hours
      localStorage.setItem(SK_NOTIF_DISMISSED_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      // ignore
    }
  };

  const handleEnableNotifications = async () => {
    setIsEnabling(true);
    setTestResult(null);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        success('Order alerts enabled! You will receive notifications even when Vaangly is closed.');
        void registerPushSubscription();
        await loadLocalDiagnostics();
      } else {
        info('Notifications were not granted. You can re-enable them in your browser settings.');
      }
    } catch (err) {
      console.warn('Error enabling notifications:', err);
      toastError('Failed to enable notifications. Please check browser permissions.');
    } finally {
      setIsEnabling(false);
    }
  };

  const handleTestAlert = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await sendTestNotification(user?.id);
      setTestResult(res);
      if (res.success) {
        success('Test notification sent! Check your notification drawer / lock screen.');
      } else {
        toastError(res.message);
      }
      await loadLocalDiagnostics();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fire test notification';
      setTestResult({ success: false, message: msg });
      toastError(msg);
    } finally {
      setIsTesting(false);
    }
  };

  if (isDismissed && variant === 'banner') {
    return null;
  }

  const isGranted = notificationStatus === 'granted';
  const isDenied = notificationStatus === 'denied';

  return (
    <div
      className={`vaangly-sk-notif-prompt vaangly-sk-notif-prompt--${variant} ${
        isGranted
          ? 'vaangly-sk-notif-prompt--granted'
          : isDenied
          ? 'vaangly-sk-notif-prompt--denied'
          : ''
      } ${className}`}
      role="region"
      aria-label="Order Notification Status"
    >
      <div className="vaangly-sk-notif-prompt__header">
        <div className="vaangly-sk-notif-prompt__icon-box">
          {isGranted ? (
            <BellRing size={20} />
          ) : isDenied ? (
            <AlertTriangle size={20} />
          ) : (
            <Bell size={20} />
          )}
        </div>

        <div className="vaangly-sk-notif-prompt__content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <h2 className="vaangly-sk-notif-prompt__title">
              {isGranted
                ? 'Instant Order Alerts Active'
                : isDenied
                ? 'Order Notifications Blocked'
                : 'Enable Instant Order Alerts'}
            </h2>
            {showDismiss && variant === 'banner' && (
              <button
                type="button"
                onClick={handleDismiss}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted, #94a3b8)',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Dismiss banner"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <p className="vaangly-sk-notif-prompt__desc">
            {isGranted
              ? 'This device will alert you with sound and vibration when a customer places an order or books a service, even when Vaangly is in the background or your phone is locked.'
              : isDenied
              ? 'Browser notification permission is currently blocked. To receive alerts when orders arrive while Vaangly is closed, allow notifications in your browser site settings.'
              : 'Never miss an order! Get real-time alerts with sound and vibration the moment a customer orders, even if your phone is locked or Vaangly is closed.'}
          </p>

          <div className="vaangly-sk-notif-prompt__actions">
            {!isGranted && !isDenied && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEnableNotifications}
                  isLoading={isEnabling}
                  leftIcon={<Bell size={15} />}
                >
                  Enable Order Alerts
                </Button>
                {showDismiss && variant === 'banner' && (
                  <Button variant="ghost" size="sm" onClick={handleDismiss}>
                    Remind Me Later
                  </Button>
                )}
              </>
            )}

            {isGranted && (
              <>
                <span className="vaangly-sk-notif-prompt__status-pill">
                  <span className="vaangly-sk-notif-prompt__status-dot" />
                  Background Alerts Ready
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestAlert}
                  isLoading={isTesting}
                  leftIcon={<Send size={14} />}
                >
                  Send Test Alert
                </Button>
              </>
            )}

            {isDenied && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnableNotifications}
                isLoading={isEnabling}
                leftIcon={<RefreshCw size={14} />}
              >
                Re-check Permission
              </Button>
            )}

            {variant === 'card' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDiagnostics((prev) => !prev)}
                leftIcon={showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              >
                {showDiagnostics ? 'Hide Diagnostics' : 'View Diagnostics'}
              </Button>
            )}
          </div>

          {testResult && (
            <div
              className={`vaangly-sk-notif-prompt__test-feedback vaangly-sk-notif-prompt__test-feedback--${
                testResult.success ? 'success' : 'error'
              }`}
            >
              {testResult.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{testResult.message}</span>
            </div>
          )}

          {isDenied && (
            <div className="vaangly-sk-notif-help-box">
              <strong>How to unblock in Android Chrome:</strong>
              <br />
              1. Tap the tune/lock icon 🔒 in the browser address bar.
              <br />
              2. Tap <strong>Site settings</strong> &rarr; <strong>Notifications</strong> &rarr; Select <strong>Allow</strong>.
              <br />
              3. Come back and tap <em>Re-check Permission</em> above.
            </div>
          )}

          {(variant === 'card' || showDiagnostics) && diagData && (
            <div className="vaangly-sk-notif-diag-grid">
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                <button
                  type="button"
                  onClick={loadLocalDiagnostics}
                  disabled={isRefreshingDiag}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-text-secondary, #64748b)' }}
                >
                  <RefreshCw size={12} className={isRefreshingDiag ? 'vaango-spin' : ''} />
                  <span>Refresh Diag</span>
                </button>
              </div>
              <div className="vaangly-sk-notif-diag-item">
                <span className="vaangly-sk-notif-diag-label">Device Permission</span>
                <span className="vaangly-sk-notif-diag-val" style={{ color: isGranted ? '#16a34a' : '#ea580c' }}>
                  {diagData.permission.toUpperCase()}
                </span>
              </div>
              <div className="vaangly-sk-notif-diag-item">
                <span className="vaangly-sk-notif-diag-label">Service Worker</span>
                <span className="vaangly-sk-notif-diag-val">{diagData.swStatus.toUpperCase()}</span>
              </div>
              <div className="vaangly-sk-notif-diag-item">
                <span className="vaangly-sk-notif-diag-label">Cloud Push Sub</span>
                <span className="vaangly-sk-notif-diag-val">{diagData.pushSubscription.toUpperCase()}</span>
              </div>
              <div className="vaangly-sk-notif-diag-item">
                <span className="vaangly-sk-notif-diag-label">Supabase Sync</span>
                <span className="vaangly-sk-notif-diag-val" style={{ color: diagData.backendRegistration === 'registered' ? '#16a34a' : '#64748b' }}>
                  {diagData.backendRegistration.toUpperCase()}
                </span>
              </div>
              <div className="vaangly-sk-notif-diag-item" style={{ gridColumn: '1 / -1' }}>
                <span className="vaangly-sk-notif-diag-label">Device Endpoint</span>
                <span className="vaangly-sk-notif-diag-val" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                  {diagData.maskedEndpoint}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

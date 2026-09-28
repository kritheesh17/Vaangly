import React, { useState } from 'react';
import {
  Bell,
  MapPin,
  Download,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  Info,
  Calendar,
  ShoppingBag,
  Clock,
  Sparkles,
  Layers,
  Terminal,
  Activity,
  Send,
  Lock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Switch } from '../ui/Switch';
import { usePermissions } from '../../context/PermissionContext';
import { usePwaUpdate } from '../../context/PwaUpdateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './Permissions.css';

export const PermissionCenterContent: React.FC = () => {
  const {
    notificationStatus,
    locationStatus,
    isInstalled,
    userCoords,
    notificationPrefs,
    updateNotificationPrefs,
    isRequestingNotification,
    isRequestingLocation,
    requestNotificationPermission,
    requestLocationPermission,
    promptInstall,
    sendTestNotification,
    sendTestSwNotification,
    sendTestCloudNotification,
    diagnostics,
    refreshDiagnostics,
  } = usePermissions();

  const {
    isUpdateAvailable,
    isCheckingForUpdates,
    lastChecked,
    appVersion,
    buildId,
    checkForUpdates,
    applyUpdate,
  } = usePwaUpdate();

  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [showNotifHelp, setShowNotifHelp] = useState(false);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);
  const [isSendingTestA, setIsSendingTestA] = useState(false);
  const [isSendingTestB, setIsSendingTestB] = useState(false);
  const [isRefreshingDiag, setIsRefreshingDiag] = useState(false);
  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);

  const isDevOrLocalhost =
    import.meta.env.DEV ||
    (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]' ||
        window.location.search.includes('diag=1')));

  // Unified Real Pipeline Test
  const handleTestNotification = async () => {
    if (notificationStatus !== 'granted') {
      toastError('Please enable notifications first before running test.');
      return;
    }

    setIsSendingTestAlert(true);
    try {
      const result = await sendTestNotification(user?.id);
      if (result.success) {
        success(result.message);
      } else {
        toastError(result.message);
      }
    } catch {
      toastError('Failed to trigger test notification.');
    } finally {
      setIsSendingTestAlert(false);
    }
  };

  // Test A — Local Service Worker Notification
  const handleTestA = async () => {
    if (notificationStatus !== 'granted') {
      toastError('Please enable notifications first.');
      return;
    }
    setIsSendingTestA(true);
    try {
      const result = await sendTestSwNotification();
      if (result.success) {
        success('Test A: Local Service Worker notification fired! 🔔');
      } else {
        toastError(result.message);
      }
    } catch {
      toastError('Test A execution failed.');
    } finally {
      setIsSendingTestA(false);
    }
  };

  // Test B — Real Web Push via Supabase Edge Function
  const handleTestB = async () => {
    if (notificationStatus !== 'granted') {
      toastError('Please enable notifications first.');
      return;
    }
    if (!user) {
      toastError('Test B (Cloud Web Push) requires an authenticated user. Please sign in to test Supabase Edge Function delivery.');
      return;
    }

    setIsSendingTestB(true);
    try {
      const result = await sendTestCloudNotification(user.id);
      if (result.success) {
        success(result.message);
      } else {
        toastError(result.message);
      }
    } catch {
      toastError('Test B execution failed.');
    } finally {
      setIsSendingTestB(false);
    }
  };

  const handleRefreshDiagnostics = async () => {
    setIsRefreshingDiag(true);
    try {
      await refreshDiagnostics();
      success('Notification diagnostics refreshed.');
    } finally {
      setIsRefreshingDiag(false);
    }
  };

  const handleManualUpdateCheck = async () => {
    setUpdateCheckFeedback(null);
    const hasUpdate = await checkForUpdates();
    if (hasUpdate) {
      setUpdateCheckFeedback('A new version of Vaangly is ready to install!');
    } else {
      setUpdateCheckFeedback('Vaangly is already up to date!');
      setTimeout(() => setUpdateCheckFeedback(null), 4000);
    }
  };

  return (
    <div className="vaangly-permission-center space-y-6">
      {/* Overview Intro */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/15 flex items-start gap-3.5">
        <div className="p-2 rounded-xl bg-primary/10 text-primary mt-0.5">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Permissions & Privacy Center</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Vaangly only requests permissions needed to alert you about bookings and show nearby shops. Your data is protected by strict row-level security.
          </p>
        </div>
      </div>

      {/* 1. App Options & Auto-Update Card */}
      <Card variant="default" padding="lg" className="border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Smartphone size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold">App Options & Updates</h4>
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={13} /> Installed
                  </span>
                ) : (
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    Web Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Automatic updates ensure you always have the latest features without reinstalling.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            {isInstalled ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1.5"
                isLoading={isCheckingForUpdates}
                onClick={handleManualUpdateCheck}
              >
                <RefreshCw size={13} /> Check for Updates
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="flex items-center gap-1.5"
                onClick={() => void promptInstall()}
              >
                <Download size={14} /> Install Vaangly
              </Button>
            )}
          </div>
        </div>

        {/* Update Alert / Status Notice */}
        {isUpdateAvailable && (
          <div className="mt-4 p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Sparkles size={16} />
              <span>A new version of Vaangly has been downloaded and is ready!</span>
            </div>
            <Button variant="primary" size="sm" onClick={applyUpdate}>
              Update Now
            </Button>
          </div>
        )}

        {updateCheckFeedback && !isUpdateAvailable && (
          <div className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={14} />
            <span>{updateCheckFeedback}</span>
          </div>
        )}

        {/* App Version & Build Metadata */}
        <div className="pt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">App Version</div>
            <div className="text-sm font-bold text-foreground mt-0.5">{appVersion}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Build Hash</div>
            <div className="text-sm font-mono font-bold text-foreground mt-0.5">{buildId}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Install State</div>
            <div className="text-sm font-bold text-foreground mt-0.5">{isInstalled ? 'Installed PWA' : 'Browser Tab'}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Last Checked</div>
            <div className="text-sm font-medium text-foreground mt-0.5">
              {lastChecked ? lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Notifications & Channels Section */}
      <Card variant="default" padding="lg" className="border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Bell size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold">Push Notifications</h4>
                {notificationStatus === 'granted' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={13} /> Enabled
                  </span>
                ) : notificationStatus === 'denied' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                    <AlertCircle size={13} /> Blocked
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    Action Needed
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Stay updated on live queue positions, appointment tokens, and order statuses.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            {notificationStatus === 'granted' ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1.5"
                isLoading={isSendingTestAlert}
                onClick={handleTestNotification}
              >
                Send Test Alert
              </Button>
            ) : notificationStatus === 'denied' ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1"
                onClick={() => setShowNotifHelp(!showNotifHelp)}
              >
                <HelpCircle size={14} /> How to Unblock
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                isLoading={isRequestingNotification}
                onClick={async () => {
                  const res = await requestNotificationPermission();
                  if (res) success('Notifications enabled successfully!');
                }}
              >
                Enable Notifications
              </Button>
            )}
          </div>
        </div>

        {/* Granular Notification Channels (Part 13 Requirement) */}
        <div className="pt-4 space-y-3">
          <div className="font-semibold text-xs text-foreground mb-1">Notification Channels:</div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <Calendar size={16} className="text-primary" />
              <div>
                <div className="text-xs font-semibold">Appointment Updates</div>
                <div className="text-[11px] text-muted-foreground">Booking confirmation, token reminders, and schedule changes</div>
              </div>
            </div>
            <Switch
              label="Appointment Updates"
              checked={notificationPrefs.appointments}
              onChange={(checked) => updateNotificationPrefs({ appointments: checked })}
              disabled={notificationStatus === 'denied'}
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={16} className="text-primary" />
              <div>
                <div className="text-xs font-semibold">Order Updates</div>
                <div className="text-[11px] text-muted-foreground">Order accepted, dispatched, or ready for in-store pickup</div>
              </div>
            </div>
            <Switch
              label="Order Updates"
              checked={notificationPrefs.orders}
              onChange={(checked) => updateNotificationPrefs({ orders: checked })}
              disabled={notificationStatus === 'denied'}
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <Clock size={16} className="text-primary" />
              <div>
                <div className="text-xs font-semibold">Queue Position Alerts</div>
                <div className="text-[11px] text-muted-foreground">Live alerts when you are 3rd, 2nd, or next in clinic/salon queue</div>
              </div>
            </div>
            <Switch
              label="Queue Position Alerts"
              checked={notificationPrefs.queue}
              onChange={(checked) => updateNotificationPrefs({ queue: checked })}
              disabled={notificationStatus === 'denied'}
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <Layers size={16} className="text-primary" />
              <div>
                <div className="text-xs font-semibold">Account & Security Notifications</div>
                <div className="text-[11px] text-muted-foreground">Important updates regarding your login and account status</div>
              </div>
            </div>
            <Switch
              label="Account & Security"
              checked={notificationPrefs.account}
              onChange={(checked) => updateNotificationPrefs({ account: checked })}
              disabled={notificationStatus === 'denied'}
            />
          </div>
        </div>

        {/* Unblock guide if denied */}
        {showNotifHelp && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2 text-foreground">
            <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Info size={15} /> How to re-enable blocked notifications:
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
              <li>Tap the <strong>Padlock or Site Settings icon</strong> in your browser&apos;s address bar.</li>
              <li>Tap <strong>Permissions</strong> or <strong>Site Settings</strong>.</li>
              <li>Set <strong>Notifications</strong> from Blocked to <strong>Allow</strong>.</li>
              <li>Refresh this page to activate push notifications.</li>
            </ol>
          </div>
        )}
      </Card>

      {/* 3. Visible Development & Localhost Diagnostic Section */}
      {isDevOrLocalhost && (
        <Card
          variant="default"
          padding="lg"
          className="border-2 border-indigo-500/20 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.03] to-purple-500/[0.03]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Terminal size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-foreground">Notification Diagnostics</h4>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    {diagnostics?.environment || (window.location.hostname.includes('localhost') ? 'Localhost' : 'Production')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time pipeline diagnostics across browser, service worker, and Supabase Web Push edge function.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-xs flex items-center gap-1.5 self-start sm:self-center"
              isLoading={isRefreshingDiag}
              onClick={handleRefreshDiagnostics}
            >
              <RefreshCw size={13} /> Refresh Diagnostics
            </Button>
          </div>

          {/* Diagnostic Metrics Matrix */}
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Environment */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Environment</div>
              <div className="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${window.location.hostname.includes('localhost') ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {diagnostics?.environment || (window.location.hostname.includes('localhost') ? 'Localhost' : 'Production')}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                {diagnostics?.origin || (typeof window !== 'undefined' ? window.location.origin : '')}
              </div>
            </div>

            {/* Notification Permission */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Notification Permission</div>
              <div className="text-sm font-bold mt-1">
                {notificationStatus === 'granted' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">granted</span>
                ) : notificationStatus === 'denied' ? (
                  <span className="text-rose-600 dark:text-rose-400">denied</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">default</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Detected via Notification.permission
              </div>
            </div>

            {/* Service Worker */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Service Worker</div>
              <div className="text-sm font-bold mt-1">
                {diagnostics?.swStatus === 'active' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">active</span>
                ) : diagnostics?.swStatus === 'waiting' ? (
                  <span className="text-amber-600 dark:text-amber-400">waiting</span>
                ) : diagnostics?.swStatus === 'registered' ? (
                  <span className="text-blue-600 dark:text-blue-400">registered</span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400">failed</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Controlled by /sw.js
              </div>
            </div>

            {/* Push Support */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Push Support</div>
              <div className="text-sm font-bold text-foreground mt-1">
                {diagnostics?.pushSupported ? (
                  <span className="text-emerald-600 dark:text-emerald-400">supported</span>
                ) : (
                  <span className="text-muted-foreground">unsupported</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                PushManager in window
              </div>
            </div>

            {/* Push Subscription */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Push Subscription</div>
              <div className="text-sm font-bold mt-1">
                {diagnostics?.pushSubscription === 'subscribed' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">subscribed</span>
                ) : (
                  <span className="text-muted-foreground">not subscribed</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Device pushManager token
              </div>
            </div>

            {/* Subscription Endpoint (Masked) */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Subscription Endpoint</div>
              <div className="text-xs font-mono font-medium text-foreground mt-1 truncate" title={diagnostics?.maskedEndpoint}>
                {diagnostics?.maskedEndpoint || 'None'}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Lock size={10} /> Masked (safe for display)
              </div>
            </div>

            {/* Backend Registration */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Backend Registration</div>
              <div className="text-sm font-bold mt-1">
                {diagnostics?.backendRegistration === 'registered' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">registered</span>
                ) : diagnostics?.backendRegistration === 'login_required' ? (
                  <span className="text-amber-600 dark:text-amber-400">login required</span>
                ) : diagnostics?.backendRegistration === 'failed' ? (
                  <span className="text-rose-600 dark:text-rose-400">failed</span>
                ) : (
                  <span className="text-muted-foreground">not registered</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Supabase push_subscriptions
              </div>
            </div>

            {/* Last Test Push */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase">Last Test Push</div>
              <div className="text-xs font-semibold mt-1">
                {diagnostics?.lastTestPush ? (
                  <span className={diagnostics.lastTestPush.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                    {diagnostics.lastTestPush.timestamp} &bull; {diagnostics.lastTestPush.success ? 'Success' : 'Failed'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Never tested</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 truncate" title={diagnostics?.lastTestPush?.message}>
                {diagnostics?.lastTestPush ? diagnostics.lastTestPush.message : 'Run Test A or Test B below'}
              </div>
            </div>
          </div>

          {/* Authentication Requirement Callout (Guest vs Authenticated) */}
          {!user && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <Info size={16} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Guest Mode Notice: </span>
                Cloud Web Push (Test B) requires an authenticated user so the Supabase Edge Function can retrieve your PushSubscription from the database. You can test local browser/device notification display immediately via <strong>Test A (Local SW)</strong>, or log in to test <strong>Test B (Real Web Push)</strong>.
              </div>
            </div>
          )}

          {/* Dual Notification Test Action Buttons */}
          <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              size="sm"
              className="text-xs flex items-center gap-1.5"
              isLoading={isSendingTestAlert}
              onClick={handleTestNotification}
            >
              <Send size={13} /> Send Test Notification
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="text-xs flex items-center gap-1.5 border-indigo-300 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
              isLoading={isSendingTestA}
              onClick={handleTestA}
            >
              <Activity size={13} /> Test A — Local SW Notification
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="text-xs flex items-center gap-1.5 border-purple-300 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              isLoading={isSendingTestB}
              onClick={handleTestB}
            >
              <Sparkles size={13} /> Test B — Real Web Push (Cloud)
            </Button>
          </div>
        </Card>
      )}

      {/* 4. Location Section */}
      <Card variant="default" padding="lg" className="border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <MapPin size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold">Location Access</h4>
                {locationStatus === 'granted' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={13} /> Enabled
                  </span>
                ) : locationStatus === 'denied' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                    <AlertCircle size={13} /> Blocked
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    Optional
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Calculate live distance to stores and discover verified neighborhood services around you.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            {locationStatus === 'granted' ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1.5"
                isLoading={isRequestingLocation}
                onClick={async () => {
                  const coords = await requestLocationPermission();
                  if (coords) success(`Location updated: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
                }}
              >
                <RefreshCw size={13} /> Refresh GPS
              </Button>
            ) : locationStatus === 'denied' ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1"
                onClick={() => setShowLocationHelp(!showLocationHelp)}
              >
                <HelpCircle size={14} /> How to Unblock
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                isLoading={isRequestingLocation}
                onClick={async () => {
                  const coords = await requestLocationPermission();
                  if (coords) success('Location enabled!');
                }}
              >
                Enable Location
              </Button>
            )}
          </div>
        </div>

        {/* Location notes */}
        <div className="pt-3.5 text-xs text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground mb-1.5">How your location is used:</div>
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">•</span>
            <span>Shows neighborhood shops within your immediate radius (e.g. 2km, 5km)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">•</span>
            <span>Always optional: you can switch between live GPS and town selection anytime</span>
          </div>
          {userCoords && (
            <div className="mt-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-muted-foreground">
              Current GPS: {userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}
            </div>
          )}
        </div>

        {showLocationHelp && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2 text-foreground">
            <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Info size={15} /> How to re-enable blocked location:
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
              <li>Tap the <strong>Padlock icon</strong> next to the address in your browser.</li>
              <li>Tap <strong>Permissions</strong> &rarr; set <strong>Location</strong> to <strong>Allow</strong>.</li>
              <li>Ensure your device GPS / Location toggle is turned on in Android / iOS Quick Settings.</li>
              <li>Tap &quot;Refresh GPS&quot; above.</li>
            </ol>
          </div>
        )}
      </Card>
    </div>
  );
};

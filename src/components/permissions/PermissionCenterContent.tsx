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
  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);

  const handleTestNotification = async () => {
    if (notificationStatus !== 'granted') {
      toastError('Please enable notifications first before running test.');
      return;
    }

    setIsSendingTestAlert(true);
    try {
      const result = await sendTestNotification(user?.id);
      if (result.success) {
        success('Test notification delivered to your device! 🔔');
      } else {
        toastError(result.message);
      }
    } catch (err) {
      toastError('Failed to trigger test notification.');
    } finally {
      setIsSendingTestAlert(false);
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

      {/* 3. Location Section */}
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

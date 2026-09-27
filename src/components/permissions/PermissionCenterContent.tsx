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
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { usePermissions } from '../../context/PermissionContext';
import { useToast } from '../../context/ToastContext';
import './Permissions.css';

export const PermissionCenterContent: React.FC = () => {
  const {
    notificationStatus,
    locationStatus,
    isInstalled,
    userCoords,
    isRequestingNotification,
    isRequestingLocation,
    requestNotificationPermission,
    requestLocationPermission,
    promptInstall,
  } = usePermissions();

  const { success, info } = useToast();
  const [showNotifHelp, setShowNotifHelp] = useState(false);
  const [showLocationHelp, setShowLocationHelp] = useState(false);

  const handleTestNotification = () => {
    if (notificationStatus !== 'granted') return;
    if ('Notification' in window) {
      new Notification('Vaangly Test Notification', {
        body: 'Notifications are working properly on your device!',
        icon: '/icons/icon-192.png',
      });
      info('Test notification sent!');
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
          <h3 className="text-base font-bold text-foreground">Permissions & Privacy</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Vaangly only requests permissions needed to alert you about bookings and show nearby shops. Your data is never sold or shared with third parties.
          </p>
        </div>
      </div>

      {/* 1. Notifications Section */}
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
                Receive doctor appointment tokens, queue status (#1, #2), and order delivery updates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            {notificationStatus === 'granted' ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1.5"
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

        {/* Benefits bullets */}
        <div className="pt-3.5 text-xs text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground mb-1.5">What you receive:</div>
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">•</span>
            <span>Real-time appointment queue alerts (e.g. &quot;You are next in queue #4&quot;)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">•</span>
            <span>Order accepted, dispatched, or ready-for-pickup notifications</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">•</span>
            <span>Payment verification and booking confirmations</span>
          </div>
        </div>

        {/* Unblock guide if denied */}
        {showNotifHelp && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2 text-foreground">
            <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Info size={15} /> How to re-enable blocked notifications:
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
              <li>Tap the <strong>Padlock or Settings icon</strong> in your browser&apos;s address bar.</li>
              <li>Tap <strong>Permissions</strong> or <strong>Site Settings</strong>.</li>
              <li>Set <strong>Notifications</strong> from Blocked to <strong>Allow</strong>.</li>
              <li>Reload this page to activate.</li>
            </ol>
          </div>
        )}
      </Card>

      {/* 2. Location Section */}
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
              <li>Tap <strong>Permissions</strong> $\rightarrow$ set <strong>Location</strong> to <strong>Allow</strong>.</li>
              <li>Ensure your device GPS / Location toggle is turned on in Android / iOS Quick Settings.</li>
              <li>Tap &quot;Refresh GPS&quot; above.</li>
            </ol>
          </div>
        )}
      </Card>

      {/* 3. App Installation Section */}
      <Card variant="default" padding="lg" className="border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Smartphone size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold">Install Vaangly App</h4>
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={13} /> Installed
                  </span>
                ) : (
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    Available for Install
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Fast, lightweight app experience without app store downloads. Works offline and launches instantly.
              </p>
            </div>
          </div>

          <div>
            {isInstalled ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={16} /> Ready on Home Screen
              </span>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="flex items-center gap-1.5"
                onClick={() => void promptInstall()}
              >
                <Download size={15} /> Install Vaangly
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

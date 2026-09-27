import React from 'react';
import { Bell, MapPin, Sparkles, Check, ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { usePermissions } from '../../context/PermissionContext';
import './Permissions.css';

export const FirstVisitPermissionModal: React.FC = () => {
  const {
    isFirstVisitPromptOpen,
    dismissFirstVisitPrompt,
    notificationStatus,
    locationStatus,
    isRequestingNotification,
    isRequestingLocation,
    requestNotificationPermission,
    requestLocationPermission,
  } = usePermissions();

  if (!isFirstVisitPromptOpen) return null;

  const allGranted = notificationStatus === 'granted' && locationStatus === 'granted';

  return (
    <Modal
      isOpen={isFirstVisitPromptOpen}
      onClose={dismissFirstVisitPrompt}
      title=""
      maxWidth="md"
    >
      <div className="vaangly-first-visit-content pt-2 pb-1">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 text-primary mb-3">
            <Sparkles size={28} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Get the Most Out of Vaangly</h2>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
            Enable notifications and location for instant booking tokens, live queue alerts, and neighborhood shops.
          </p>
        </div>

        <div className="space-y-3.5 mb-6">
          {/* Notification Card */}
          <div className="vaangly-perm-card flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
                <Bell size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold">Notifications</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Queue updates, doctor appointment alerts & order status
                </div>
              </div>
            </div>
            <div>
              {notificationStatus === 'granted' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                  <Check size={14} /> Enabled
                </span>
              ) : notificationStatus === 'denied' ? (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Blocked in browser
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={isRequestingNotification}
                  onClick={() => void requestNotificationPermission()}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>

          {/* Location Card */}
          <div className="vaangly-perm-card flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 mt-0.5">
                <MapPin size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold">Location Access</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Discover local stores & verified nearby services
                </div>
              </div>
            </div>
            <div>
              {locationStatus === 'granted' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                  <Check size={14} /> Enabled
                </span>
              ) : locationStatus === 'denied' ? (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Blocked in browser
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={isRequestingLocation}
                  onClick={() => void requestLocationPermission()}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
            onClick={dismissFirstVisitPrompt}
          >
            <span>{allGranted ? 'Start Exploring' : 'Continue to Vaangly'}</span>
            <ArrowRight size={16} />
          </Button>
          {!allGranted && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors"
              onClick={dismissFirstVisitPrompt}
            >
              Maybe later (You can change this anytime in Settings)
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

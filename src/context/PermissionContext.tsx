import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  registerPushSubscription,
  sendTestPushNotification,
  sendLocalSwTestNotification,
  sendCloudEdgePushNotification,
  getNotificationDiagnostics,
  NotificationDiagnosticsData,
} from '../lib/pushNotifications';
import { useAuth } from './AuthContext';

export type PermissionStatus = 'granted' | 'prompt' | 'denied' | 'unsupported';
export type AppPlatform = 'android' | 'ios' | 'desktop' | 'capacitor';

export type InstallState =
  | 'NOT_AVAILABLE'
  | 'READY'
  | 'INSTALLING'
  | 'INSTALLED'
  | 'DISMISSED'
  | 'UNSUPPORTED'
  | 'ERROR';

export type InstallFeedbackPhase =
  | 'idle'
  | 'preparing'
  | 'prompt_opened'
  | 'installing'
  | 'completing'
  | 'installed'
  | 'cancelled'
  | 'unavailable'
  | 'error';

export interface NotificationPreferences {
  appointments: boolean;
  orders: boolean;
  queue: boolean;
  account: boolean;
}

declare global {
  interface Window {
    __kartzoInstallPrompt?: BeforeInstallPromptEvent | null;
    __kartzoAppInstalled?: boolean;
  }
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function getInstallStatusInfo(
  state: InstallState,
  phase: InstallFeedbackPhase,
  platform?: AppPlatform
): { title: string; detail: string } {
  const currentPlatform = platform || (typeof window !== 'undefined' ? detectPlatform() : 'desktop');
  switch (phase) {
    case 'preparing':
      return {
        title: 'Preparing Kartzo for installation',
        detail: 'Connecting with your browser installation manager. Please wait...',
      };
    case 'prompt_opened':
      return {
        title: 'Installation prompt opened',
        detail: 'Please confirm the installation in your browser window.',
      };
    case 'installing':
      return {
        title: 'Installing Kartzo...',
        detail: 'Adding Kartzo to your device and configuring offline access...',
      };
    case 'completing':
      return {
        title: 'Installation request accepted',
        detail: 'The browser is completing setup in the background. Check your home screen or app launcher for Kartzo.',
      };
    case 'installed':
      return {
        title: 'Kartzo installed successfully! ✓',
        detail: 'Kartzo is now ready on your device. Launch it anytime from your home screen or app launcher.',
      };
    case 'cancelled':
      return {
        title: 'Installation was cancelled.',
        detail: 'You can install Kartzo anytime from the Install button whenever you are ready.',
      };
    case 'unavailable':
      if (currentPlatform === 'android') {
        return {
          title: 'Install Kartzo from your browser menu',
          detail: 'Tap the three dots (⋮) in Chrome or your browser menu, then select "Install app" or "Add to Home screen".',
        };
      }
      if (currentPlatform === 'ios') {
        return {
          title: 'Install Kartzo on iPhone / iPad',
          detail: 'In Safari, tap the Share button at the bottom of the screen, then select "Add to Home Screen".',
        };
      }
      return {
        title: 'Install Kartzo from your browser menu',
        detail: 'Open your browser menu (⋮ or ⋯) and select "Install Kartzo" or "Add to Home screen" to pin the app to your device.',
      };
    case 'error':
      return {
        title: "Kartzo couldn't be installed right now.",
        detail: 'An unexpected browser error occurred. Please try again or check your browser settings.',
      };
    default:
      if (state === 'INSTALLED') {
        return {
          title: 'Kartzo is installed ✓',
          detail: 'Already running as an installed application.',
        };
      }
      if (state === 'UNSUPPORTED') {
        return {
          title: 'Browser not supported for direct installation',
          detail: 'Your current browser does not support one-click installation. Open Kartzo in Google Chrome, Microsoft Edge, or Safari to install.',
        };
      }
      return {
        title: 'Install Kartzo',
        detail: 'Install Kartzo on your device for fast access, fullscreen experience, and offline support.',
      };
  }
}

interface PermissionContextType {
  // Permission statuses
  notificationStatus: PermissionStatus;
  locationStatus: PermissionStatus;

  // Runtime & Install info
  platform: AppPlatform;
  isInstallable: boolean;
  isInstalled: boolean;
  isNativeApp: boolean;

  // Centralized PWA Installation State Machine
  installState: InstallState;
  installPhase: InstallFeedbackPhase;
  installStatusMessage: { title: string; detail: string };
  isInstalling: boolean;
  isInstallFeedbackOpen: boolean;
  setIsInstallFeedbackOpen: (open: boolean) => void;
  resetInstallFeedback: () => void;

  // Notification Preferences
  notificationPrefs: NotificationPreferences;
  updateNotificationPrefs: (prefs: Partial<NotificationPreferences>) => void;

  // Last known coordinates
  userCoords: { lat: number; lng: number } | null;

  // In-flight request flags
  isRequestingNotification: boolean;
  isRequestingLocation: boolean;

  // User actions
  requestNotificationPermission: () => Promise<boolean>;
  requestLocationPermission: () => Promise<{ lat: number; lng: number } | null>;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'manual'>;
  sendTestNotification: (userId?: string) => Promise<{ success: boolean; message: string }>;
  sendTestSwNotification: () => Promise<{ success: boolean; message: string }>;
  sendTestCloudNotification: (userId?: string) => Promise<{ success: boolean; message: string }>;

  // Live Notification Diagnostics
  diagnostics: NotificationDiagnosticsData | null;
  refreshDiagnostics: () => Promise<NotificationDiagnosticsData>;

  // UI state controllers
  isManualInstallOpen: boolean;
  setIsManualInstallOpen: (open: boolean) => void;
  isPermissionCenterOpen: boolean;
  setIsPermissionCenterOpen: (open: boolean) => void;
  isFirstVisitPromptOpen: boolean;
  dismissFirstVisitPrompt: () => void;

  // Real-time permission refresh
  refreshNotificationStatus: () => PermissionStatus;
}

const FIRST_VISIT_STORAGE_KEY = 'vaangly_first_visit_onboarding_shown';
const NOTIF_PREFS_STORAGE_KEY = 'vaangly_notification_prefs';

const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  appointments: true,
  orders: true,
  queue: true,
  account: true,
};

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function detectPlatform(): AppPlatform {
  if (Capacitor.isNativePlatform()) return 'capacitor';
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos && !(window as unknown as { MSStream?: boolean }).MSStream) return 'ios';
  return 'desktop';
}

export function checkIsInstalled(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === 'undefined') return false;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone) ||
    document.referrer.startsWith('android-app://');

  return isStandalone;
}

function getInitialNotificationStatus(): PermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const perm = Notification.permission;
  if (perm === 'granted') return 'granted';
  if (perm === 'denied') return 'denied';
  return 'prompt';
}

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [platform] = useState<AppPlatform>(detectPlatform);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.__kartzoAppInstalled) return true;
    return checkIsInstalled();
  });
  const [isInstallable, setIsInstallable] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && Boolean(window.__kartzoInstallPrompt)) return true;
    return false;
  });
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(
    typeof window !== 'undefined' ? window.__kartzoInstallPrompt || null : null
  );
  const isInstallingRef = useRef<boolean>(false);

  // Centralized PWA Installation State Machine
  const [installState, setInstallState] = useState<InstallState>(() => {
    if (typeof window !== 'undefined' && window.__kartzoAppInstalled) return 'INSTALLED';
    if (checkIsInstalled()) return 'INSTALLED';
    if (typeof window !== 'undefined' && window.__kartzoInstallPrompt) return 'READY';
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      return 'NOT_AVAILABLE';
    }
    return 'UNSUPPORTED';
  });
  const [installPhase, setInstallPhase] = useState<InstallFeedbackPhase>(() => {
    return (checkIsInstalled() || (typeof window !== 'undefined' && window.__kartzoAppInstalled)) ? 'installed' : 'idle';
  });
  const [isInstallFeedbackOpen, setIsInstallFeedbackOpen] = useState<boolean>(false);

  // Permission states
  const [notificationStatus, setNotificationStatus] = useState<PermissionStatus>(getInitialNotificationStatus);
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('prompt');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // In-flight flags
  const [isRequestingNotification, setIsRequestingNotification] = useState<boolean>(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState<boolean>(false);

  // Live diagnostics state
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnosticsData | null>(null);

  const refreshDiagnostics = useCallback(async (): Promise<NotificationDiagnosticsData> => {
    const diag = await getNotificationDiagnostics();
    setDiagnostics(diag);
    return diag;
  }, []);

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(() => {
    try {
      const saved = localStorage.getItem(NOTIF_PREFS_STORAGE_KEY);
      if (saved) return { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(saved) };
    } catch {
      // fallback
    }
    return DEFAULT_NOTIF_PREFS;
  });

  const updateNotificationPrefs = useCallback((partial: Partial<NotificationPreferences>) => {
    setNotificationPrefs((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem(NOTIF_PREFS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Modals & Panels
  const [isManualInstallOpen, setIsManualInstallOpen] = useState<boolean>(false);
  const [isPermissionCenterOpen, setIsPermissionCenterOpen] = useState<boolean>(false);
  const [isFirstVisitPromptOpen, setIsFirstVisitPromptOpen] = useState<boolean>(false);

  // 1. Initial Notification State Inspection
  const refreshNotificationStatus = useCallback((): PermissionStatus => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      return 'unsupported';
    }
    const perm = Notification.permission;
    let next: PermissionStatus = 'prompt';
    if (perm === 'granted') next = 'granted';
    else if (perm === 'denied') next = 'denied';
    setNotificationStatus(next);
    return next;
  }, []);

  // 2. Initial Location State Inspection via Permissions API
  const refreshLocationStatus = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location === 'granted' || perm.coarseLocation === 'granted') {
          setLocationStatus('granted');
        } else if (perm.location === 'denied') {
          setLocationStatus('denied');
        } else {
          setLocationStatus('prompt');
        }
        return;
      } catch {
        // Fallback to web permissions check
      }
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const queryStatus = await navigator.permissions.query({ name: 'geolocation' });
        const updateFromState = (state: PermissionState) => {
          if (state === 'granted') setLocationStatus('granted');
          else if (state === 'denied') setLocationStatus('denied');
          else setLocationStatus('prompt');
        };
        updateFromState(queryStatus.state);
        queryStatus.onchange = () => {
          updateFromState(queryStatus.state);
        };
        return;
      } catch {
        // Some browsers don't allow querying geolocation
      }
    }

    // Default to prompt if permission status cannot be queried silently
    setLocationStatus('prompt');
  }, []);

  // Initialize permissions & listen for install events
  useEffect(() => {
    refreshNotificationStatus();
    void refreshLocationStatus();

    // Check display mode changes (e.g. app installed during session)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setIsInstallable(false);
        setInstallState('INSTALLED');
        setInstallPhase('installed');
      }
    };
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    // Inspect getInstalledRelatedApps where supported
    if ('getInstalledRelatedApps' in navigator) {
      (navigator as unknown as { getInstalledRelatedApps: () => Promise<unknown[]> })
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            setIsInstalled(true);
            setIsInstallable(false);
            setInstallState('INSTALLED');
            setInstallPhase('installed');
          }
        })
        .catch(() => {});
    }

    // Check if early install prompt was already captured in index.html before React mounted
    if (typeof window !== 'undefined' && window.__kartzoInstallPrompt && !deferredPromptRef.current) {
      deferredPromptRef.current = window.__kartzoInstallPrompt;
      setIsInstallable(true);
      setInstallState((prev) => (prev === 'INSTALLED' ? 'INSTALLED' : 'READY'));
    }

    // Listen for Chromium PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      if (typeof window !== 'undefined') {
        window.__kartzoInstallPrompt = promptEvent;
      }
      setIsInstallable(true);
      setInstallState((prev) => (prev === 'INSTALLED' ? 'INSTALLED' : 'READY'));
    };

    // Listen for custom early prompt ready event
    const handlePromptReadyCustom = () => {
      if (typeof window !== 'undefined' && window.__kartzoInstallPrompt) {
        deferredPromptRef.current = window.__kartzoInstallPrompt;
        setIsInstallable(true);
        setInstallState((prev) => (prev === 'INSTALLED' ? 'INSTALLED' : 'READY'));
      }
    };

    // Listen for real browser app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPromptRef.current = null;
      if (typeof window !== 'undefined') {
        window.__kartzoInstallPrompt = null;
        window.__kartzoAppInstalled = true;
      }
      isInstallingRef.current = false;
      setInstallState('INSTALLED');
      setInstallPhase('installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('kartzo:installprompt-ready', handlePromptReadyCustom);
    window.addEventListener('kartzo:appinstalled', handleAppInstalled);

    // Auto-refresh notification status when user returns to window/tab from browser settings
    const handleVisibilityOrFocus = () => {
      refreshNotificationStatus();
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('kartzo:installprompt-ready', handlePromptReadyCustom);
      window.removeEventListener('kartzo:appinstalled', handleAppInstalled);
    };
  }, [refreshNotificationStatus, refreshLocationStatus]);

  // Automatically sync and refresh Web Push subscription in background whenever
  // notifications are granted and user is authenticated
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted' && user?.id) {
      void registerPushSubscription().then((synced) => {
        if (synced) {
          void refreshDiagnostics();
        }
      });
    }
  }, [user?.id, refreshDiagnostics]);

  // Request Notification Permission on explicit user interaction
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      return false;
    }

    setIsRequestingNotification(true);
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        setNotificationStatus('granted');
        // Register push subscription in background and update diagnostics
        await registerPushSubscription();
        await refreshDiagnostics();
        return true;
      } else if (result === 'denied') {
        setNotificationStatus('denied');
        await refreshDiagnostics();
        return false;
      } else {
        setNotificationStatus('prompt');
        await refreshDiagnostics();
        return false;
      }
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return false;
    } finally {
      setIsRequestingNotification(false);
    }
  }, [refreshDiagnostics]);

  // Request Location Permission on explicit user interaction
  const requestLocationPermission = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    setIsRequestingLocation(true);

    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location === 'granted' || perm.coarseLocation === 'granted') {
          setLocationStatus('granted');
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          return coords;
        } else {
          setLocationStatus('denied');
          return null;
        }
      } catch (err) {
        console.warn('Capacitor geolocation error:', err);
        setLocationStatus('denied');
        return null;
      } finally {
        setIsRequestingLocation(false);
      }
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      setIsRequestingLocation(false);
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationStatus('granted');
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          setIsRequestingLocation(false);
          resolve(coords);
        },
        (err) => {
          console.warn('Geolocation permission error:', err);
          if (err.code === err.PERMISSION_DENIED) {
            setLocationStatus('denied');
          } else {
            // Keep status as prompt or error but don't mark permanently denied if GPS timed out
            setLocationStatus('prompt');
          }
          setIsRequestingLocation(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  // Trigger Install Dialog on explicit user interaction
  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (checkIsInstalled() || (typeof window !== 'undefined' && window.__kartzoAppInstalled)) {
      setIsInstalled(true);
      setIsInstallable(false);
      setInstallState('INSTALLED');
      setInstallPhase('installed');
      setIsInstallFeedbackOpen(true);
      return 'accepted';
    }

    // Block duplicate clicks if currently in-flight
    if (isInstallingRef.current || installState === 'INSTALLING') {
      return 'dismissed';
    }

    const promptEvent = deferredPromptRef.current || (typeof window !== 'undefined' ? window.__kartzoInstallPrompt : null);

    if (promptEvent) {
      isInstallingRef.current = true;
      setIsInstallFeedbackOpen(true);
      setInstallState('INSTALLING');
      setInstallPhase('preparing');

      // Brief tick to ensure UI paints preparing state
      await new Promise((resolve) => setTimeout(resolve, 300));

      try {
        setInstallPhase('prompt_opened');
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        deferredPromptRef.current = null;
        if (typeof window !== 'undefined') {
          window.__kartzoInstallPrompt = null;
        }

        if (choice.outcome === 'accepted') {
          setInstallPhase('installing');

          // Wait for appinstalled event or safe timeout
          let receivedAppInstalled = false;
          await new Promise<void>((resolve) => {
            const onInstalled = () => {
              receivedAppInstalled = true;
              window.removeEventListener('appinstalled', onInstalled);
              resolve();
            };
            window.addEventListener('appinstalled', onInstalled);
            setTimeout(() => {
              window.removeEventListener('appinstalled', onInstalled);
              resolve();
            }, 3500);
          });

          if (receivedAppInstalled || checkIsInstalled() || (typeof window !== 'undefined' && window.__kartzoAppInstalled)) {
            setIsInstalled(true);
            setIsInstallable(false);
            setInstallState('INSTALLED');
            setInstallPhase('installed');
          } else {
            // Truthful state: User accepted, browser is completing setup in background
            setIsInstallable(false);
            setInstallState('INSTALLING');
            setInstallPhase('completing');
          }
          isInstallingRef.current = false;
          return 'accepted';
        } else {
          setInstallState('DISMISSED');
          setInstallPhase('cancelled');
          isInstallingRef.current = false;
          return 'dismissed';
        }
      } catch (err) {
        console.warn('Failed to call deferred install prompt:', err);
        setInstallState('ERROR');
        setInstallPhase('error');
        isInstallingRef.current = false;
        return 'dismissed';
      }
    }

    // Fallback: If no beforeinstallprompt event is available (iOS, Firefox, or Android browser without prompt), open manual modal
    isInstallingRef.current = false;
    setIsInstallFeedbackOpen(false);
    setInstallState('NOT_AVAILABLE');
    setInstallPhase('unavailable');
    setIsManualInstallOpen(true);
    return 'manual';
  }, [installState]);

  const resetInstallFeedback = useCallback(() => {
    setIsInstallFeedbackOpen(false);
    if (installState === 'DISMISSED' || installState === 'ERROR') {
      setInstallState(deferredPromptRef.current ? 'READY' : 'NOT_AVAILABLE');
      setInstallPhase('idle');
    }
  }, [installState]);

  const sendTestNotification = useCallback(async (userId?: string) => {
    const res = await sendTestPushNotification(userId);
    await refreshDiagnostics();
    return res;
  }, [refreshDiagnostics]);

  const sendTestSwNotification = useCallback(async () => {
    const res = await sendLocalSwTestNotification();
    await refreshDiagnostics();
    return res;
  }, [refreshDiagnostics]);

  const sendTestCloudNotification = useCallback(async (userId?: string) => {
    const res = await sendCloudEdgePushNotification(userId);
    await refreshDiagnostics();
    return res;
  }, [refreshDiagnostics]);

  // Initial diagnostics collection on mount
  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);

  const dismissFirstVisitPrompt = useCallback(() => {
    localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'true');
    setIsFirstVisitPromptOpen(false);
  }, []);

  return (
    <PermissionContext.Provider
      value={{
        notificationStatus,
        locationStatus,
        platform,
        isInstallable,
        isInstalled,
        isNativeApp: Capacitor.isNativePlatform(),
        installState,
        installPhase,
        installStatusMessage: getInstallStatusInfo(installState, installPhase, platform),
        isInstalling: installState === 'INSTALLING',
        isInstallFeedbackOpen,
        setIsInstallFeedbackOpen,
        resetInstallFeedback,
        notificationPrefs,
        updateNotificationPrefs,
        userCoords,
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
        isManualInstallOpen,
        setIsManualInstallOpen,
        isPermissionCenterOpen,
        setIsPermissionCenterOpen,
        isFirstVisitPromptOpen,
        dismissFirstVisitPrompt,
        refreshNotificationStatus,
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermissions = (): PermissionContextType => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
};

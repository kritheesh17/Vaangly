import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { registerPushSubscription, sendTestPushNotification } from '../lib/pushNotifications';

export type PermissionStatus = 'granted' | 'prompt' | 'denied' | 'unsupported';
export type AppPlatform = 'android' | 'ios' | 'desktop' | 'capacitor';

export interface NotificationPreferences {
  appointments: boolean;
  orders: boolean;
  queue: boolean;
  account: boolean;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
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

  // UI state controllers
  isManualInstallOpen: boolean;
  setIsManualInstallOpen: (open: boolean) => void;
  isPermissionCenterOpen: boolean;
  setIsPermissionCenterOpen: (open: boolean) => void;
  isFirstVisitPromptOpen: boolean;
  dismissFirstVisitPrompt: () => void;
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

function detectPlatform(): AppPlatform {
  if (Capacitor.isNativePlatform()) return 'capacitor';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream) return 'ios';
  return 'desktop';
}

function checkIsInstalled(): boolean {
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

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [platform] = useState<AppPlatform>(detectPlatform);
  const [isInstalled, setIsInstalled] = useState<boolean>(checkIsInstalled);
  const [isInstallable, setIsInstallable] = useState<boolean>(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Permission states
  const [notificationStatus, setNotificationStatus] = useState<PermissionStatus>('prompt');
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('prompt');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // In-flight flags
  const [isRequestingNotification, setIsRequestingNotification] = useState<boolean>(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState<boolean>(false);

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
  const refreshNotificationStatus = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') setNotificationStatus('granted');
    else if (perm === 'denied') setNotificationStatus('denied');
    else setNotificationStatus('prompt');
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
          }
        })
        .catch(() => {});
    }

    // Listen for Chromium PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPromptRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // First visit prompt check (delayed slightly for smooth initial page load)
    const timer = setTimeout(() => {
      const alreadyShown = localStorage.getItem(FIRST_VISIT_STORAGE_KEY);
      if (!alreadyShown && !checkIsInstalled()) {
        const isNotifGranted = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
        if (!isNotifGranted) {
          setIsFirstVisitPromptOpen(true);
        }
      }
    }, 1800);

    return () => {
      clearTimeout(timer);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [refreshNotificationStatus, refreshLocationStatus]);

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
        // Register push subscription in background
        void registerPushSubscription();
        return true;
      } else if (result === 'denied') {
        setNotificationStatus('denied');
        return false;
      } else {
        setNotificationStatus('prompt');
        return false;
      }
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return false;
    } finally {
      setIsRequestingNotification(false);
    }
  }, []);

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
    if (checkIsInstalled()) {
      return 'accepted';
    }

    if (deferredPromptRef.current) {
      try {
        await deferredPromptRef.current.prompt();
        const choice = await deferredPromptRef.current.userChoice;
        deferredPromptRef.current = null;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setIsInstallable(false);
          return 'accepted';
        }
        return 'dismissed';
      } catch (err) {
        console.warn('Failed to call deferred install prompt:', err);
      }
    }

    // Fallback: If no beforeinstallprompt event is available (iOS, Firefox, or desktop without prompt), open manual modal
    setIsManualInstallOpen(true);
    return 'manual';
  }, []);

  const sendTestNotification = useCallback(async (userId?: string) => {
    return sendTestPushNotification(userId);
  }, []);

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
        notificationPrefs,
        updateNotificationPrefs,
        userCoords,
        isRequestingNotification,
        isRequestingLocation,
        requestNotificationPermission,
        requestLocationPermission,
        promptInstall,
        sendTestNotification,
        isManualInstallOpen,
        setIsManualInstallOpen,
        isPermissionCenterOpen,
        setIsPermissionCenterOpen,
        isFirstVisitPromptOpen,
        dismissFirstVisitPrompt,
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

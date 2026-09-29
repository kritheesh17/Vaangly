import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface PwaUpdateContextType {
  isUpdateAvailable: boolean;
  isCheckingForUpdates: boolean;
  lastChecked: Date | null;
  appVersion: string;
  buildId: string;
  buildTime: string;
  checkForUpdates: () => Promise<boolean>;
  applyUpdate: () => void;
  dismissUpdateBanner: () => void;
  isBannerDismissed: boolean;
}

const PwaUpdateContext = createContext<PwaUpdateContextType | undefined>(undefined);

export const PwaUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(false);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  const buildId = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'DEV';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

  // 1. Initialize Service Worker with updateViaCache: 'none'
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });

        if (!isMounted) return;
        registrationRef.current = registration;
        setLastChecked(new Date());

        // Check if a service worker is already waiting in background
        if (registration.waiting) {
          waitingWorkerRef.current = registration.waiting;
          setIsUpdateAvailable(true);
        }

        // Listen for new service workers installing
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New update available! Old controller is still running
                console.log('[Vaangly PWA] New update installed and waiting.');
                waitingWorkerRef.current = installingWorker;
                setIsUpdateAvailable(true);
                setIsBannerDismissed(false);
              } else {
                // First-time install of service worker; already active
                console.log('[Vaangly PWA] Service worker installed for the first time.');
              }
            }
          };
        };
      } catch (err) {
        console.warn('[Vaangly PWA] Service worker registration error:', err);
      }
    };

    // When the page finishes loading, register the service worker
    if (document.readyState === 'complete') {
      void registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }

    // 2. Auto-reload when the new service worker takes control (controllerchange)
    let hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const handleControllerChange = () => {
      if (!hadController) {
        // First-time service worker claim; do not reload the page
        hadController = true;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      console.log('[Vaangly PWA] Controller changed, reloading to run latest application version...');
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // 3. Check for updates on visibility change (when returning to the app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef.current) {
        registrationRef.current.update().catch(() => {});
        setLastChecked(new Date());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Periodic update checks every 30 minutes
    const interval = setInterval(() => {
      if (registrationRef.current) {
        registrationRef.current.update().catch(() => {});
        setLastChecked(new Date());
      }
    }, 30 * 60 * 1000);

    return () => {
      isMounted = false;
      window.removeEventListener('load', registerSW);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  // Manual Check for Updates
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    setIsCheckingForUpdates(true);
    try {
      if (!('serviceWorker' in navigator)) return false;

      const reg = registrationRef.current || (await navigator.serviceWorker.getRegistration());
      if (!reg) return false;

      registrationRef.current = reg;
      await reg.update();
      setLastChecked(new Date());

      if (reg.waiting) {
        waitingWorkerRef.current = reg.waiting;
        setIsUpdateAvailable(true);
        setIsBannerDismissed(false);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[Vaangly PWA] Error checking for updates:', err);
      return false;
    } finally {
      setIsCheckingForUpdates(false);
    }
  }, []);

  // Apply update immediately: postMessage SKIP_WAITING to waiting worker
  const applyUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current || registrationRef.current?.waiting;
    if (worker) {
      console.log('[Vaangly PWA] Sending SKIP_WAITING signal to waiting service worker...');
      worker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Fallback reload
      window.location.reload();
    }
  }, []);

  const dismissUpdateBanner = useCallback(() => {
    setIsBannerDismissed(true);
  }, []);

  return (
    <PwaUpdateContext.Provider
      value={{
        isUpdateAvailable,
        isCheckingForUpdates,
        lastChecked,
        appVersion,
        buildId,
        buildTime,
        checkForUpdates,
        applyUpdate,
        dismissUpdateBanner,
        isBannerDismissed,
      }}
    >
      {children}
    </PwaUpdateContext.Provider>
  );
};

export const usePwaUpdate = (): PwaUpdateContextType => {
  const context = useContext(PwaUpdateContext);
  if (!context) {
    throw new Error('usePwaUpdate must be used within a PwaUpdateProvider');
  }
  return context;
};

import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { CartBar } from '../customer/CartBar';
import './AppShell.css';
import { InstallPrompt } from './InstallPrompt';
import { PwaUpdateBanner } from './PwaUpdateBanner';
import { PwaInstallStatusModal } from './PwaInstallStatusModal';
import { FirstVisitPermissionModal } from '../permissions/FirstVisitPermissionModal';
import { ManualInstallModal } from '../permissions/ManualInstallModal';
import { PermissionCenterModal } from '../permissions/PermissionCenterModal';
import { NotificationPermissionGate } from '../permissions/NotificationPermissionGate';
import { usePermissions } from '../../context/PermissionContext';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { role, isAuthenticated, isProfileComplete, isLoading } = useAuth();
  const { itemCount, activeShop } = useCart();
  const { notificationStatus } = usePermissions();
  const [unsupportedAcknowledged, setUnsupportedAcknowledged] = useState(false);
  const [gateDismissed, setGateDismissed] = useState<boolean>(() => {
    try {
      return (
        sessionStorage.getItem('vaango_notif_gate_dismissed') === 'true' ||
        localStorage.getItem('vaango_notif_gate_dismissed') === 'true'
      );
    } catch {
      return false;
    }
  });
  const [isSmallAdminViewport, setIsSmallAdminViewport] = useState(false);

  const handleDismissGate = () => {
    try {
      sessionStorage.setItem('vaango_notif_gate_dismissed', 'true');
      localStorage.setItem('vaango_notif_gate_dismissed', 'true');
    } catch {
      // ignore
    }
    setGateDismissed(true);
  };

  const isCartBarVisible =
    itemCount > 0 &&
    Boolean(activeShop) &&
    location.pathname !== '/cart' &&
    !location.pathname.startsWith('/request-confirmation') &&
    !location.pathname.startsWith('/shopkeeper') &&
    !location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;
    const updateViewport = () => setIsSmallAdminViewport(window.innerWidth < 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [location.pathname]);

  // Global Customer Profile Gate:
  // If an authenticated customer has an incomplete profile, prevent access to normal customer routes
  if (
    !isLoading &&
    isAuthenticated &&
    role === 'customer' &&
    !isProfileComplete &&
    location.pathname !== '/complete-profile'
  ) {
    return <Navigate to="/complete-profile" state={{ from: location }} replace />;
  }

  // Notification Permission Experience:
  // Shows setup guide when not granted, but allows users to continue using Vaango
  // (never blocking access solely because notification permission is denied or dismissed)
  if (
    notificationStatus !== 'granted' &&
    !gateDismissed &&
    !(notificationStatus === 'unsupported' && unsupportedAcknowledged)
  ) {
    return (
      <NotificationPermissionGate
        onContinue={handleDismissGate}
        onAcknowledgeUnsupported={() => {
          setUnsupportedAcknowledged(true);
          handleDismissGate();
        }}
      />
    );
  }

  return (
    <div className="vaango-app-shell">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="vaango-skip-link">
        Skip to main content
      </a>

      {/* Primary Header */}
      <Header />
      <InstallPrompt />
      <PwaInstallStatusModal />
      <PwaUpdateBanner />
      <FirstVisitPermissionModal />
      <ManualInstallModal />
      <PermissionCenterModal />

      {/* Main Content Area with safe bottom padding when CartBar is present */}
      <main
        id="main-content"
        className={`vaango-main-content ${isCartBarVisible ? 'vaango-main-content--with-cart' : ''}`}
      >
        {isSmallAdminViewport && (
          <div className="vaango-admin-size-notice" role="status">
            The admin panel is designed for larger screens; use a tablet or desktop for the best experience
          </div>
        )}
        <Outlet />
      </main>

      {/* Global Floating Cart Bar for Customer Workflows */}
      <CartBar />

      {/* Global Footer (Non-admin screens) */}
      {!location.pathname.startsWith('/admin') && <Footer />}

      {/* Mobile Fixed Navigation */}
      <BottomNav />
    </div>
  );
};

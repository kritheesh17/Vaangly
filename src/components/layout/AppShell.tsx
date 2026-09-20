import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { CartBar } from '../customer/CartBar';
import './AppShell.css';
import { InstallPrompt } from './InstallPrompt';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { role, isAuthenticated, isProfileComplete, isLoading } = useAuth();
  const [isSmallAdminViewport, setIsSmallAdminViewport] = useState(false);

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

  return (
    <div className="vaango-app-shell">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="vaango-skip-link">
        Skip to main content
      </a>

      {/* Primary Header */}
      <Header />
      <InstallPrompt />

      {/* Main Content Area */}
      <main id="main-content" className="vaango-main-content">
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

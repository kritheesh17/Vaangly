import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import './AppShell.css';
import { InstallPrompt } from './InstallPrompt';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const [isSmallAdminViewport, setIsSmallAdminViewport] = useState(false);

  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;
    const updateViewport = () => setIsSmallAdminViewport(window.innerWidth < 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [location.pathname]);

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

      {/* Mobile Fixed Navigation */}
      <BottomNav />
    </div>
  );
};

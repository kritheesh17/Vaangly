import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  FileCheck2,
  Store,
  CreditCard,
  History,
  Layers,
  Menu,
  X,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { NotificationBadge } from '../ui/NotificationBadge';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './AdminLayout.css';

export const AdminLayout: React.FC = () => {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();
  const { pendingApplications, pendingCatalogue } = useSectionUnreadCounts();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const res = await signOut();
      if (res && res.error) {
        toastError(res.error);
      } else {
        success(t('signOut') || 'Logged out successfully');
      }
      navigate('/login');
    } catch (err) {
      console.warn('Admin logout error:', err);
      toastError(err instanceof Error ? err.message : 'Error logging out');
      navigate('/login');
    }
  };

  const navLinks = [
    {
      to: '/admin/dashboard',
      label: t('adminDashboard') || 'Dashboard',
      icon: <LayoutDashboard size={18} />,
    },
    {
      to: '/admin/shops',
      label: t('adminShops') || 'Shops',
      icon: <Store size={18} />,
    },
    {
      to: '/admin/applications',
      label: t('adminApplications') || 'Applications',
      icon: <FileCheck2 size={18} />,
      badge: pendingApplications,
    },
    {
      to: '/admin/catalogue',
      label: 'Catalogue',
      icon: <Layers size={18} />,
      badge: pendingCatalogue,
    },
    {
      to: '/admin/subscriptions',
      label: t('adminSubscriptions') || 'Subscriptions',
      icon: <CreditCard size={18} />,
    },
    {
      to: '/admin/locations',
      label: t('adminLocations') || 'Locations',
      icon: <MapPin size={18} />,
    },
    {
      to: '/admin/audit',
      label: t('adminAuditLog') || 'Audit Logs',
      icon: <History size={18} />,
    },
  ];

  return (
    <div className="vaango-admin-container">
      {/* Mobile Header Bar */}
      <div className="vaango-admin-mobile-header">
        <button
          type="button"
          className="vaango-admin-hamburger"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle admin menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="vaango-admin-brand-logo">
          <div className="vaango-admin-brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z"
                fill="#22C55E"
              />
            </svg>
          </div>
          <span className="vaango-admin-brand-name">Vaango</span>
        </div>

        <span className="vaango-admin-badge-mobile">Admin</span>
      </div>

      {/* Backdrop for mobile drawer */}
      {isMobileMenuOpen && (
        <div
          className="vaango-admin-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Dark Sidebar (Reference Screen 4) */}
      <aside className={`vaango-admin-sidebar ${isMobileMenuOpen ? 'vaango-admin-sidebar--open' : ''}`}>
        <div className="vaango-admin-sidebar__brand">
          <div className="vaango-admin-brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z"
                fill="#22C55E"
              />
            </svg>
          </div>
          <span className="vaango-admin-sidebar__title">Vaango</span>
        </div>

        <nav className="vaango-admin-sidebar__nav" aria-label="Admin Navigation">
          {navLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) =>
                `vaango-admin-sidebar__link ${isActive ? 'vaango-admin-sidebar__link--active' : ''}`
              }
            >
              <span className="vaango-admin-sidebar__icon">{item.icon}</span>
              <span className="vaango-admin-sidebar__label">{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <NotificationBadge count={item.badge} size="sm" />
              )}
            </NavLink>
          ))}
        </nav>

        <div className="vaango-admin-sidebar__footer">
          <div className="vaango-admin-sidebar__user">
            <div className="vaango-admin-sidebar__avatar">
              <ShieldCheck size={18} />
            </div>
            <div className="vaango-admin-sidebar__user-details">
              <span className="vaango-admin-sidebar__user-name">{user?.full_name || 'Administrator'}</span>
              <span className="vaango-admin-sidebar__user-email">{user?.email || 'admin@vaango.in'}</span>
            </div>
          </div>
          <button
            type="button"
            className="vaango-admin-sidebar__logout-btn"
            onClick={handleLogout}
            title={t('signOut') || 'Sign Out'}
            aria-label={t('signOut') || 'Sign Out'}
          >
            <LogOut size={16} />
            <span>{t('signOut') || 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Content Body */}
      <main className="vaango-admin-main">
        <Outlet />
      </main>
    </div>
  );
};


import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  Compass,
  ClipboardList,
  Calendar,
  MoreHorizontal,
  Package,
  LayoutDashboard,
  FileCheck2,
  Store,
  CreditCard,
  Wrench,
  TrendingUp,
  Settings,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { NotificationBadge } from '../ui/NotificationBadge';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import { MoreMenuModal } from './MoreMenuModal';
import './BottomNav.css';
import { useLanguage } from '../../context/LanguageContext';
import { Shop } from '../../types/database';
import { getShopkeeperShop } from '../../lib/shopkeeperApi';
import { getShopBusinessFeatures } from '../../lib/shopBusinessTypes';

interface ShopkeeperNavItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  isActive: (loc: { pathname: string; search: string }) => boolean;
}

export const BottomNav: React.FC = () => {
  const { user, role } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const { pendingApplications, shopkeeperNewRequests, customerActiveOrders } = useSectionUnreadCounts();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);

  // Fetch and sync current shop for shopkeeper navigation
  useEffect(() => {
    if (role !== 'shopkeeper' || !user) {
      setShop(null);
      return;
    }

    let isMounted = true;
    const fetchShop = async () => {
      try {
        const s = await getShopkeeperShop(user.id);
        if (isMounted) setShop(s);
      } catch (err) {
        console.error('Error fetching shop for dynamic navigation:', err);
      }
    };

    void fetchShop();

    const handleShopChange = () => {
      void fetchShop();
    };

    window.addEventListener('vaango-shops-changed', handleShopChange);
    return () => {
      isMounted = false;
      window.removeEventListener('vaango-shops-changed', handleShopChange);
    };
  }, [role, user]);

  // Derive dynamic shopkeeper navigation items based on actual enabled features
  const shopkeeperNavItems = useMemo<ShopkeeperNavItem[]>(() => {
    const features = getShopBusinessFeatures(shop);
    const items: ShopkeeperNavItem[] = [];

    // 1. Home (All shops)
    items.push({
      id: 'home',
      to: '/shopkeeper/dashboard',
      label: t('home') || 'Home',
      icon: Home,
      isActive: (loc) => loc.pathname === '/shopkeeper/dashboard' || loc.pathname === '/shopkeeper',
    });

    // 2. Catalogue (Shops that offer physical products)
    if (features.hasProducts) {
      items.push({
        id: 'catalogue',
        to: '/shopkeeper/catalogue',
        label: t('navCatalogue') || 'Catalogue',
        icon: Package,
        isActive: (loc) =>
          loc.pathname === '/shopkeeper/catalogue' && !loc.search.includes('tab=services'),
      });
    }

    // 3. Orders (Shops with products or general order handling)
    if (features.hasProducts || (!features.hasAppointments && !features.hasServices)) {
      items.push({
        id: 'orders',
        to: '/shopkeeper/requests',
        label: t('navOrders') || 'Orders',
        icon: ClipboardList,
        badgeCount: shopkeeperNewRequests,
        isActive: (loc) =>
          loc.pathname === '/shopkeeper/requests' && !loc.search.includes('group=APPOINTMENT'),
      });
    }

    // 4. Services (Shops with repair, tailoring, grooming, or custom services)
    if (features.hasServices) {
      const servicesUrl = features.hasProducts
        ? '/shopkeeper/catalogue?tab=services'
        : '/shopkeeper/catalogue';
      items.push({
        id: 'services',
        to: servicesUrl,
        label: t('navServices' as any) || 'Services',
        icon: Wrench,
        isActive: (loc) =>
          features.hasProducts
            ? loc.pathname === '/shopkeeper/catalogue' && loc.search.includes('tab=services')
            : loc.pathname === '/shopkeeper/catalogue',
      });
    }

    // 5. Appointments (ONLY shops with appointment capability enabled)
    if (features.hasAppointments) {
      items.push({
        id: 'appointments',
        to: '/shopkeeper/requests?group=APPOINTMENT',
        label: t('navAppointments') || 'Appointments',
        icon: Calendar,
        badgeCount: features.hasProducts ? undefined : shopkeeperNewRequests,
        isActive: (loc) =>
          loc.pathname === '/shopkeeper/requests' && loc.search.includes('group=APPOINTMENT'),
      });
    }

    // 6. Sales Analysis (Dedicated analytics for all shopkeepers)
    items.push({
      id: 'analytics',
      to: '/shopkeeper/analytics',
      label: 'Sales Analysis',
      icon: TrendingUp,
      isActive: (loc) =>
        loc.pathname === '/shopkeeper/analytics' || loc.pathname === '/shopkeeper/sales-analysis',
    });

    // 7. Settings (Direct shop profile & business settings)
    items.push({
      id: 'settings',
      to: '/shopkeeper/profile',
      label: t('navSettings') || 'Settings',
      icon: Settings,
      isActive: (loc) =>
        loc.pathname === '/shopkeeper/profile' || loc.pathname === '/shopkeeper/settings',
    });

    return items;
  }, [shop, shopkeeperNewRequests, t]);

  if (role === 'admin') {
    return (
      <>
        <nav className="vaango-bottom-nav" aria-label={t('operationsConsole')}>
          <div className="vaango-bottom-nav__inner">
            <NavLink
              to="/admin/dashboard"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('adminDashboard')}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <LayoutDashboard size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('adminDashboard')}</span>
            </NavLink>

            <NavLink
              to="/admin/applications"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('adminApplications')}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <FileCheck2 size={22} />
                <NotificationBadge count={pendingApplications} position="overlap" size="sm" />
              </div>
              <span className="vaango-bottom-nav__label">{t('adminApplications')}</span>
            </NavLink>

            <NavLink
              to="/admin/shops"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('adminShops')}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <Store size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('adminShops')}</span>
            </NavLink>

            <NavLink
              to="/admin/subscriptions"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('adminSubscriptions')}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <CreditCard size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('adminSubscriptions')}</span>
            </NavLink>

            <button
              type="button"
              className="vaango-bottom-nav__item vaango-bottom-nav__item--btn"
              onClick={() => setIsMoreOpen(true)}
              aria-label={t('navSettings') || 'More'}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <MoreHorizontal size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('navSettings') || 'More'}</span>
            </button>
          </div>
        </nav>
        <MoreMenuModal isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
      </>
    );
  }

  if (role === 'shopkeeper') {
    const isCompact = shopkeeperNavItems.length >= 6;
    const isScrollable = shopkeeperNavItems.length >= 7;

    return (
      <nav className="vaango-bottom-nav" aria-label={t('navDashboard')}>
        <div
          className={`vaango-bottom-nav__inner ${isCompact ? 'vaango-bottom-nav__inner--compact' : ''} ${
            isScrollable ? 'vaango-bottom-nav__inner--scrollable' : ''
          }`}
        >
          {shopkeeperNavItems.map((item) => {
            const active = item.isActive(location);
            return (
              <NavLink
                key={item.id}
                to={item.to}
                className={`vaango-bottom-nav__item ${active ? 'vaango-bottom-nav__item--active' : ''}`}
                aria-label={item.label}
              >
                <div className="vaango-bottom-nav__icon-wrap">
                  <item.icon size={20} />
                  {item.badgeCount && item.badgeCount > 0 ? (
                    <NotificationBadge count={item.badgeCount} position="overlap" size="sm" />
                  ) : null}
                </div>
                <span className="vaango-bottom-nav__label">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    );
  }

  // Customer Bottom Navigation (Exact match to Reference Images: Home, Explore, Orders, Bookings, More)
  return (
    <>
      <nav className="vaango-bottom-nav" aria-label={t('home')}>
        <div className="vaango-bottom-nav__inner">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('home') || 'Home'}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Home size={22} />
            </div>
            <span className="vaango-bottom-nav__label">{t('home') || 'Home'}</span>
          </NavLink>

          <NavLink
            to="/shops"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('explore') || 'Explore'}
          >
            <div className="vaango-bottom-nav__icon-nav">
              <div className="vaango-bottom-nav__icon-wrap">
                <Compass size={22} />
              </div>
            </div>
            <span className="vaango-bottom-nav__label">{t('explore') || 'Explore'}</span>
          </NavLink>

          <NavLink
            to="/orders"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navOrders') || 'Orders'}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <ClipboardList size={22} />
              <NotificationBadge count={customerActiveOrders} position="overlap" size="sm" />
            </div>
            <span className="vaango-bottom-nav__label">{t('navOrders') || 'Orders'}</span>
          </NavLink>

          <NavLink
            to="/bookings"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navAppointments') || 'Bookings'}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Calendar size={22} />
            </div>
            <span className="vaango-bottom-nav__label">{t('navAppointments') || 'Bookings'}</span>
          </NavLink>

          <button
            type="button"
            className={`vaango-bottom-nav__item vaango-bottom-nav__item--btn ${isMoreOpen ? 'vaango-bottom-nav__item--active' : ''}`}
            onClick={() => setIsMoreOpen(true)}
            aria-label="More options"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <MoreHorizontal size={22} />
            </div>
            <span className="vaango-bottom-nav__label">More</span>
          </button>
        </div>
      </nav>

      <MoreMenuModal isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  );
};

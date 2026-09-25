import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Store, Compass, ClipboardList, Package, LayoutDashboard, FileCheck2, CreditCard, TrendingUp, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { NotificationBadge } from '../ui/NotificationBadge';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import './BottomNav.css';
import { useLanguage } from '../../context/LanguageContext';

export const BottomNav: React.FC = () => {
  const { role } = useAuth();
  const { t } = useLanguage();
  const { pendingApplications, shopkeeperNewRequests, customerActiveOrders } = useSectionUnreadCounts();

  if (role === 'admin') {
    return (
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
        </div>
      </nav>
    );
  }

  if (role === 'shopkeeper') {
    return (
      <nav className="vaango-bottom-nav" aria-label={t('navDashboard')}>
        <div className="vaango-bottom-nav__inner">
          <NavLink
            to="/shopkeeper/dashboard"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navDashboard')}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <LayoutDashboard size={22} />
            </div>
            <span className="vaango-bottom-nav__label">{t('navDashboard')}</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/requests"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navOrders')}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <ClipboardList size={22} />
              <NotificationBadge count={shopkeeperNewRequests} position="overlap" size="sm" />
            </div>
            <span className="vaango-bottom-nav__label">{t('navOrders')}</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/catalogue"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navCatalogue')}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Package size={22} />
            </div>
            <span className="vaango-bottom-nav__label">{t('navCatalogue')}</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/analytics"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navAnalytics')}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <TrendingUp size={22} />
            </div>
            <span className="vaango-bottom-nav__label">{t('navAnalytics')}</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/profile"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label={t('navSettings')}
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Store size={22} />
            </div>
            <span className="vaango-bottom-nav__label">{t('navSettings')}</span>
          </NavLink>
        </div>
      </nav>
    );
  }

  return (
    <nav className="vaango-bottom-nav" aria-label={t('home')}>
      <div className="vaango-bottom-nav__inner">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label={t('home')}
        >
          <div className="vaango-bottom-nav__icon-wrap">
            <Home size={22} />
          </div>
          <span className="vaango-bottom-nav__label">{t('home')}</span>
        </NavLink>

        <NavLink
          to="/shops"
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label={t('explore')}
        >
          <div className="vaango-bottom-nav__icon-wrap">
            <Compass size={22} />
          </div>
          <span className="vaango-bottom-nav__label">{t('explore')}</span>
        </NavLink>

        <NavLink
          to="/orders"
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label={t('activity')}
        >
          <div className="vaango-bottom-nav__icon-wrap">
            <ClipboardList size={22} />
            <NotificationBadge count={customerActiveOrders} position="overlap" size="sm" />
          </div>
          <span className="vaango-bottom-nav__label">{t('activity')}</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label={t('account')}
        >
          <div className="vaango-bottom-nav__icon-wrap">
            <User size={22} />
          </div>
          <span className="vaango-bottom-nav__label">{t('account')}</span>
        </NavLink>
      </div>
    </nav>
  );
};


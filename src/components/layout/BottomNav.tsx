import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { NotificationBadge } from '../ui/NotificationBadge';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import { MoreMenuModal } from './MoreMenuModal';
import './BottomNav.css';
import { useLanguage } from '../../context/LanguageContext';

export const BottomNav: React.FC = () => {
  const { role } = useAuth();
  const { t } = useLanguage();
  const { pendingApplications, shopkeeperNewRequests, customerActiveOrders } = useSectionUnreadCounts();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

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
    return (
      <>
        <nav className="vaango-bottom-nav" aria-label={t('navDashboard')}>
          <div className="vaango-bottom-nav__inner">
            <NavLink
              to="/shopkeeper/dashboard"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('navDashboard') || 'Home'}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <Home size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('home') || 'Home'}</span>
            </NavLink>

            <NavLink
              to="/shopkeeper/catalogue"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('navCatalogue') || 'Products'}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <Package size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('navCatalogue') || 'Products'}</span>
            </NavLink>

            <NavLink
              to="/shopkeeper/requests"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('navOrders') || 'Orders'}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <ClipboardList size={22} />
                <NotificationBadge count={shopkeeperNewRequests} position="overlap" size="sm" />
              </div>
              <span className="vaango-bottom-nav__label">{t('navOrders') || 'Orders'}</span>
            </NavLink>

            <NavLink
              to="/shopkeeper/requests?group=APPOINTMENT"
              className={({ isActive }) =>
                `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
              }
              aria-label={t('navAppointments') || 'Appointments'}
            >
              <div className="vaango-bottom-nav__icon-wrap">
                <Calendar size={22} />
              </div>
              <span className="vaango-bottom-nav__label">{t('navAppointments') || 'Appointments'}</span>
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

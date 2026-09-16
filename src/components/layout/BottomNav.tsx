import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Store, ClipboardList, User, Package, LayoutDashboard, FileCheck2, CreditCard, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './BottomNav.css';
import { useLanguage } from '../../context/LanguageContext';

export const BottomNav: React.FC = () => {
  const { role } = useAuth();
  const { t } = useLanguage();

  if (role === 'admin') {
    return (
      <nav className="vaango-bottom-nav" aria-label="Admin Navigation">
        <div className="vaango-bottom-nav__inner">
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Dashboard"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <LayoutDashboard size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Overview</span>
          </NavLink>

          <NavLink
            to="/admin/applications"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Applications"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <FileCheck2 size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Apps</span>
          </NavLink>

          <NavLink
            to="/admin/shops"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Shops"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Store size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Shops</span>
          </NavLink>

          <NavLink
            to="/admin/subscriptions"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Subscriptions"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <CreditCard size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Billing</span>
          </NavLink>
        </div>
      </nav>
    );
  }

  if (role === 'shopkeeper') {
    return (
      <nav className="vaango-bottom-nav" aria-label="Shopkeeper Navigation">
        <div className="vaango-bottom-nav__inner">
          <NavLink
            to="/shopkeeper/dashboard"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Dashboard"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <LayoutDashboard size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Dashboard</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/requests"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Orders"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <ClipboardList size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Orders</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/catalogue"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Catalogue"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Package size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Catalogue</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/analytics"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Analytics"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <TrendingUp size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Analytics</span>
          </NavLink>

          <NavLink
            to="/shopkeeper/profile"
            className={({ isActive }) =>
              `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
            }
            aria-label="Shop Settings"
          >
            <div className="vaango-bottom-nav__icon-wrap">
              <Store size={22} />
            </div>
            <span className="vaango-bottom-nav__label">Shop</span>
          </NavLink>
        </div>
      </nav>
    );
  }

  const getOrdersLabel = () => 'Requests';

  return (
    <nav className="vaango-bottom-nav" aria-label="Mobile Navigation">
      <div className="vaango-bottom-nav__inner">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label="Home"
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
          aria-label="Local Shops"
        >
          <div className="vaango-bottom-nav__icon-wrap">
            <Store size={22} />
          </div>
            <span className="vaango-bottom-nav__label">{t('shops')}</span>
        </NavLink>

        <NavLink
          to="/orders"
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label={getOrdersLabel()}
        >
          <div className="vaango-bottom-nav__icon-wrap">
            <ClipboardList size={22} />
          </div>
            <span className="vaango-bottom-nav__label">{t('requests')}</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `vaango-bottom-nav__item ${isActive ? 'vaango-bottom-nav__item--active' : ''}`
          }
          aria-label="My Account and settings"
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

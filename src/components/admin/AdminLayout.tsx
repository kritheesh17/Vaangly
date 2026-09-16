import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  FileCheck2,
  Store,
  CreditCard,
  History,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import './AdminLayout.css';

export const AdminLayout: React.FC = () => {
  return (
    <div className="vaango-admin-layout">
      {/* Admin Subheader Navigation Bar */}
      <div className="vaango-admin-bar">
        <div className="container vaango-admin-bar__inner">
          <div className="vaango-admin-bar__brand">
            <ShieldCheck size={20} className="vaango-admin-bar__shield" />
            <span className="vaango-admin-bar__title">Operations Console</span>
            <Badge variant="primary" size="sm">Admin</Badge>
          </div>

          <nav className="vaango-admin-bar__nav" aria-label="Admin console navigation">
            <NavLink
              to="/admin/dashboard"
              className={({ isActive }) =>
                `vaango-admin-nav-item ${isActive ? 'vaango-admin-nav-item--active' : ''}`
              }
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/admin/locations"
              className={({ isActive }) =>
                `vaango-admin-nav-item ${isActive ? 'vaango-admin-nav-item--active' : ''}`
              }
            >
              <MapPin size={16} />
              <span>Locations</span>
            </NavLink>

            <NavLink
              to="/admin/applications"
              className={({ isActive }) =>
                `vaango-admin-nav-item ${isActive ? 'vaango-admin-nav-item--active' : ''}`
              }
            >
              <FileCheck2 size={16} />
              <span>Applications</span>
            </NavLink>

            <NavLink
              to="/admin/shops"
              className={({ isActive }) =>
                `vaango-admin-nav-item ${isActive ? 'vaango-admin-nav-item--active' : ''}`
              }
            >
              <Store size={16} />
              <span>Shops</span>
            </NavLink>

            <NavLink
              to="/admin/subscriptions"
              className={({ isActive }) =>
                `vaango-admin-nav-item ${isActive ? 'vaango-admin-nav-item--active' : ''}`
              }
            >
              <CreditCard size={16} />
              <span>Subscriptions</span>
            </NavLink>

            <NavLink
              to="/admin/audit"
              className={({ isActive }) =>
                `vaango-admin-nav-item ${isActive ? 'vaango-admin-nav-item--active' : ''}`
              }
            >
              <History size={16} />
              <span>Audit Log</span>
            </NavLink>
          </nav>
        </div>
      </div>

      {/* Main Admin Content */}
      <div className="vaango-admin-body">
        <Outlet />
      </div>
    </div>
  );
};

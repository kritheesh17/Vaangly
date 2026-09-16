import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Sun, Moon, Sparkles, User, LogOut, ChevronDown, ShoppingBag, RotateCcw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocationContext } from '../../context/LocationContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { UserRole } from '../../types/database';
import { resetDemoData } from '../../lib/demoData';
import { NotificationBell } from '../shopkeeper/NotificationBell';
import './Header.css';
import { useLanguage } from '../../context/LanguageContext';

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, role, signOut, switchDemoRole } = useAuth();
  const {
    locations,
    selectedLocation,
    setSelectedLocation,
    isLocationModalOpen,
    setIsLocationModalOpen,
  } = useLocationContext();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { success } = useToast();

  const handleRoleChange = (newRole: UserRole) => {
    switchDemoRole(newRole);
  };

  const handleResetDemoData = () => {
    const res = resetDemoData();
    if (res.success) {
      success('Sample shops, appointments & orders restored!');
    }
  };

  return (
    <>
      <header className="vaango-header">
        <div className="container vaango-header__inner">
          {/* Logo & Hometown Tag */}
          <div className="vaango-header__brand-group">
            <Link
              to={
                role === 'admin'
                  ? '/admin/dashboard'
                  : role === 'shopkeeper'
                  ? '/shopkeeper/dashboard'
                  : '/'
              }
              className="vaango-header__logo"
              aria-label="Vaango Home"
            >
              <div className="vaango-header__logo-icon" aria-hidden="true">
                <span>V</span>
              </div>
              <span className="vaango-header__logo-text">Vaango</span>
            </Link>

            {/* Location Selector Pill */}
            <button
              type="button"
              className="vaango-header__location-btn"
              onClick={() => setIsLocationModalOpen(true)}
              aria-label={`Current location: ${selectedLocation.name}. Tap to change.`}
            >
              <MapPin size={16} className="vaango-header__location-icon" />
              <span className="vaango-header__location-name">{selectedLocation.name}</span>
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="vaango-header__desktop-nav" aria-label="Main Navigation">
            {role === 'admin' ? (
              <>
                <Link to="/admin/dashboard" className="vaango-header__nav-link">Admin Console</Link>
                <Link to="/admin/applications" className="vaango-header__nav-link">Applications</Link>
                <Link to="/admin/shops" className="vaango-header__nav-link">Shops</Link>
                <Link to="/admin/subscriptions" className="vaango-header__nav-link">Subscriptions</Link>
                <Link to="/admin/locations" className="vaango-header__nav-link">Locations</Link>
                <Link to="/admin/audit" className="vaango-header__nav-link">Audit</Link>
              </>
            ) : role === 'shopkeeper' ? (
              <>
                <Link to="/shopkeeper/dashboard" className="vaango-header__nav-link">Dashboard</Link>
                <Link to="/shopkeeper/requests" className="vaango-header__nav-link">Orders</Link>
                <Link to="/shopkeeper/catalogue" className="vaango-header__nav-link">Catalogue</Link>
                <Link to="/shopkeeper/analytics" className="vaango-header__nav-link vaango-header__nav-link--highlight">Analytics (Pro)</Link>
                <Link to="/shopkeeper/profile" className="vaango-header__nav-link">Settings</Link>
              </>
            ) : (
              <>
                <Link to="/" className="vaango-header__nav-link">{t('home')}</Link>
                <Link to="/shops" className="vaango-header__nav-link">{t('shops')}</Link>
                <Link to="/orders" className="vaango-header__nav-link">{t('requests')}</Link>
                {(!user || !user.is_verified) && <Link to="/shopkeeper/apply" className="vaango-header__nav-link vaango-header__nav-link--highlight">
                  Partner with Vaango
                </Link>}
              </>
            )}
            {import.meta.env.DEV && <Link to="/design-system" className="vaango-header__nav-link vaango-header__nav-link--badge">
              <Sparkles size={16} />
              <span>Tokens</span>
            </Link>}
          </nav>

          {/* Controls & Actions */}
          <div className="vaango-header__actions">
            {/* Operational Notifications */}
            {user && <NotificationBell />}

            {/* Header Cart Icon if items > 0 */}
            {itemCount > 0 && (
              <Link to="/cart" className="vaango-header__cart-link" aria-label={`View cart with ${itemCount} items`}>
                <ShoppingBag size={20} />
                <span className="vaango-header__cart-badge">{itemCount}</span>
              </Link>
            )}

            {import.meta.env.DEV && (
              <>
                <div className="vaango-header__role-pill" title="Active persona (Customer / Shopkeeper / Admin)">
                  <select
                    value={role || 'customer'}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="vaango-header__role-select"
                    aria-label="Switch active role"
                  >
                    <option value="customer">Role: Customer</option>
                    <option value="shopkeeper">Role: Shopkeeper</option>
                    <option value="admin">Role: Admin</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="vaango-header__reset-btn"
                  onClick={handleResetDemoData}
                  title="Restore Sample Shops & Appointments"
                  aria-label="Restore Sample Shops & Appointments"
                >
                  <RotateCcw size={15} />
                </button>
              </>
            )}

            <button type="button" className="vaango-header__lang-btn" onClick={() => setLanguage(language === 'en' ? 'ta' : 'en')} aria-label={language === 'en' ? 'Switch to Tamil' : 'Switch to English'} title={language === 'en' ? 'தமிழில் காண' : 'View in English'}>
              {language === 'en' ? 'தமிழ்' : 'EN'}
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="vaango-header__theme-btn"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Auth Profile / Login */}
            {user ? (
              <div className="vaango-header__user-wrap">
                <Link to="/profile" className="vaango-header__profile-link" aria-label="View user profile">
                  <div className="vaango-header__user-avatar">
                    <User size={18} />
                  </div>
                  <span className="vaango-header__user-name">{user.full_name.split(' ')[0]}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => signOut().then(() => navigate('/login'))}
                  className="vaango-header__logout-btn"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="vaango-header__login-link">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Alphabetical Location Selector Modal */}
      <Modal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        title="Select Your Town"
        description="Choose a supported location. Vaango displays local shops and merchants available in that town."
        maxWidth="sm"
      >
        <div className="vaango-location-modal-list">
          {locations.map((loc) => {
            const isSelected = selectedLocation.id === loc.id || selectedLocation.name === loc.name;
            return (
              <div
                key={loc.id}
                className={`vaango-location-option ${isSelected ? 'vaango-location-option--active' : ''}`}
                onClick={() => {
                  setSelectedLocation(loc);
                  setIsLocationModalOpen(false);
                }}
              >
                <div>
                  <div className="vaango-location-option__name">{loc.name}</div>
                  <div className="vaango-location-option__state">
                    {loc.state} • {loc.pincode}
                  </div>
                </div>
                {loc.is_launch_town ? (
                  <Badge variant="primary" size="sm">Launch Town</Badge>
                ) : (
                  <Badge variant="neutral" size="sm">Active</Badge>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
};

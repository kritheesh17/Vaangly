import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Sun, Moon, Sparkles, User, LogOut, ChevronDown, ShoppingBag, RotateCcw, Menu, X, ArrowRight } from 'lucide-react';
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
import { LanguageToggle } from '../common/LanguageToggle';

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
  const location = useLocation();
  const { t } = useLanguage();
  const { success } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleRoleChange = (newRole: UserRole) => {
    switchDemoRole(newRole);
  };

  const handleResetDemoData = () => {
    const res = resetDemoData();
    if (res.success) {
      success(t('actionSuccess'));
    }
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      <header className="vaango-header">
        <div className="vaango-header__inner">
          {/* LEFT: Logo & Location Selector */}
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
              aria-label="Vaangly Home"
              onClick={closeMobileMenu}
            >
              <div className="vaango-header__logo-icon" aria-hidden="true">
                <span>V</span>
              </div>
              <span className="vaango-header__logo-text">{t('brand').toUpperCase()}</span>
            </Link>

            {/* Location Selector Pill */}
            <button
              type="button"
              className="vaango-header__location-btn"
              onClick={() => setIsLocationModalOpen(true)}
              aria-label={`${t('location')}: ${selectedLocation.name}. ${t('changeLocation')}.`}
            >
              <MapPin size={14} className="vaango-header__location-icon" />
              <span className="vaango-header__location-name">{selectedLocation.name}</span>
              <ChevronDown size={12} className="vaango-header__location-chevron" />
            </button>
          </div>

          {/* CENTER: Desktop Navigation Links */}
          <nav className="vaango-header__desktop-nav" aria-label="Main Navigation">
            {role === 'admin' ? (
              <>
                <Link to="/admin/dashboard" className="vaango-header__nav-link">{t('navAdmin')}</Link>
                <Link to="/admin/applications" className="vaango-header__nav-link">{t('adminAppsTitle')}</Link>
                <Link to="/admin/shops" className="vaango-header__nav-link">{t('adminShopsTitle')}</Link>
                <Link to="/admin/locations" className="vaango-header__nav-link">{t('adminLocationsTitle')}</Link>
                <Link to="/admin/audit" className="vaango-header__nav-link">{t('navAudit')}</Link>
              </>
            ) : role === 'shopkeeper' ? (
              <>
                <Link to="/shopkeeper/dashboard" className="vaango-header__nav-link">{t('navDashboard')}</Link>
                <Link to="/shopkeeper/requests" className="vaango-header__nav-link">{t('navOrders')}</Link>
                <Link to="/shopkeeper/catalogue" className="vaango-header__nav-link">{t('navCatalogue')}</Link>
                <Link to="/shopkeeper/analytics" className="vaango-header__nav-link vaango-header__nav-link--highlight">{t('navAnalytics')} (Pro)</Link>
                <Link to="/shopkeeper/profile" className="vaango-header__nav-link">{t('navSettings')}</Link>
              </>
            ) : (
              <>
                <Link
                  to="/"
                  className={`vaango-header__nav-link vaango-header__nav-link--home ${location.pathname === '/' && !location.hash ? 'vaango-header__nav-link--active' : ''}`}
                >
                  {t('navHome')}
                </Link>
                <Link
                  to="/shops?group=ORDER"
                  className={`vaango-header__nav-link ${location.pathname === '/shops' && location.search.includes('group=ORDER') ? 'vaango-header__nav-link--active' : ''}`}
                >
                  {t('navOrder')}
                </Link>
                <Link
                  to="/shops?group=APPOINTMENT"
                  className={`vaango-header__nav-link ${location.pathname === '/shops' && location.search.includes('group=APPOINTMENT') ? 'vaango-header__nav-link--active' : ''}`}
                >
                  {t('navAppointments')}
                </Link>
                <Link
                  to="/shops?group=SERVICE"
                  className={`vaango-header__nav-link ${location.pathname === '/shops' && location.search.includes('group=SERVICE') ? 'vaango-header__nav-link--active' : ''}`}
                >
                  {t('navServices')}
                </Link>
                <Link
                  to="/shopkeeper/apply"
                  className="vaango-header__nav-link vaango-header__nav-link--business"
                >
                  <span className="vaango-header__nav-business-full">{t('navOpenShop')}</span>
                  <span className="vaango-header__nav-business-short">{t('navOpenShopShort')}</span>
                </Link>
                <a href="/#how-it-works" className="vaango-header__nav-link vaango-header__nav-link--info">
                  {t('navHowItWorks')}
                </a>
                <a href="/#about" className="vaango-header__nav-link vaango-header__nav-link--info">
                  {t('navAbout')}
                </a>
              </>
            )}
            {import.meta.env.DEV && (
              <Link to="/design-system" className="vaango-header__nav-link vaango-header__nav-link--badge" title="Design tokens showcase">
                <Sparkles size={14} />
                <span>{t('navTokens')}</span>
              </Link>
            )}
          </nav>

          {/* RIGHT: Actions, Language Toggle, Cart, Profile, Controls */}
          <div className="vaango-header__actions">
            {/* Operational Notifications */}
            {user && <NotificationBell />}

            {/* Header Cart Icon if items > 0 */}
            {itemCount > 0 && (
              <Link to="/cart" className="vaango-header__cart-link" aria-label={t('itemsInCart', { count: itemCount })} onClick={closeMobileMenu}>
                <ShoppingBag size={19} />
                <span className="vaango-header__cart-badge">{itemCount}</span>
              </Link>
            )}

            {/* DEV Role Selector & Reset (Only on ultra-wide screens >= 1400px) */}
            {import.meta.env.DEV && (
              <div className="vaango-header__dev-tools">
                <div className="vaango-header__role-pill" title="Active persona (Customer / Shopkeeper / Admin)">
                  <select
                    value={role || 'customer'}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="vaango-header__role-select"
                    aria-label="Switch active role"
                  >
                    <option value="customer">{t('roleCustomer')}</option>
                    <option value="shopkeeper">{t('roleShopkeeper')}</option>
                    <option value="admin">{t('roleAdmin')}</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="vaango-header__reset-btn"
                  onClick={handleResetDemoData}
                  title={t('restoreSampleBtn')}
                  aria-label={t('restoreSampleBtn')}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            )}

            {/* Two-Way Segmented Language Toggle (EN | தமிழ்) - ALWAYS PINNED TOP-RIGHT */}
            <div className="vaango-header__lang-toggle-wrap">
              <LanguageToggle size="sm" />
            </div>

            {/* Segmented Theme Toggle Pill [ ☀️ | 🌙 ] */}
            <div
              className="vaango-header__theme-segmented"
              role="group"
              aria-label="Color theme toggle"
            >
              <button
                type="button"
                className={`vaango-header__theme-opt ${theme === 'light' ? 'vaango-header__theme-opt--active' : ''}`}
                onClick={() => theme !== 'light' && toggleTheme()}
                aria-pressed={theme === 'light'}
                aria-label="Light mode"
                title="Light mode"
              >
                <Sun size={14} />
              </button>
              <button
                type="button"
                className={`vaango-header__theme-opt ${theme === 'dark' ? 'vaango-header__theme-opt--active' : ''}`}
                onClick={() => theme !== 'dark' && toggleTheme()}
                aria-pressed={theme === 'dark'}
                aria-label="Dark mode"
                title="Dark mode"
              >
                <Moon size={14} />
              </button>
            </div>

            {/* Auth Profile / Login & Get Started Buttons */}
            {user ? (
              <div className="vaango-header__user-wrap">
                <Link to="/profile" className="vaango-header__profile-link" aria-label="View user profile" onClick={closeMobileMenu}>
                  <div className="vaango-header__user-avatar">
                    <User size={16} />
                  </div>
                  <span className="vaango-header__user-name">{user.full_name?.split(' ')[0] || t('profile')}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => signOut().then(() => navigate('/login'))}
                  className="vaango-header__logout-btn"
                  title={t('signOut')}
                  aria-label={t('signOut')}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <div className="vaango-header__auth-btns">
                <Link to="/login" className="vaango-header__btn-login">
                  {t('logIn')}
                </Link>
                <Link to="/shops?group=ORDER" className="vaango-header__btn-get-started">
                  {t('getStarted')}
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="vaango-header__hamburger-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="vaango-mobile-menu" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
            <nav className="vaango-mobile-menu__nav">
              <Link to="/" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                {t('navHome')}
              </Link>
              <Link to="/shops?group=ORDER" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                {t('navOrder')}
              </Link>
              <Link to="/shops?group=APPOINTMENT" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                {t('navAppointments')}
              </Link>
              <Link to="/shops?group=SERVICE" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                {t('navServices')}
              </Link>
              <Link to="/shopkeeper/apply" className="vaango-mobile-menu__link vaango-mobile-menu__link--highlight" onClick={closeMobileMenu}>
                {t('navOpenShop')}
              </Link>
              <a href="/#how-it-works" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                {t('navHowItWorks')}
              </a>
              <a href="/#about" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                {t('navAbout')}
              </a>
              {role === 'admin' && (
                <Link to="/admin/dashboard" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                  {t('navAdmin')}
                </Link>
              )}
              {role === 'shopkeeper' && (
                <Link to="/shopkeeper/dashboard" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                  {t('navDashboard')}
                </Link>
              )}
            </nav>

            <div className="vaango-mobile-menu__footer">
              <div className="vaango-mobile-menu__lang-row">
                <span className="vaango-mobile-menu__lang-label">{t('language') || 'Language'}:</span>
                <LanguageToggle size="md" />
              </div>

              <div className="vaango-mobile-menu__theme-row">
                <span className="vaango-mobile-menu__theme-label">
                  {theme === 'dark' ? t('darkThemeActive') : t('lightThemeActive')}
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="vaango-mobile-menu__theme-btn"
                  aria-label="Toggle display theme"
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>

              {!user ? (
                <div className="vaango-mobile-menu__auth-actions">
                  <Link to="/login" className="vaango-mobile-menu__btn-login" onClick={closeMobileMenu}>
                    <User size={18} style={{ marginRight: 6 }} />
                    {t('logIn')}
                  </Link>
                  <Link to="/shops?group=ORDER" className="vaango-mobile-menu__btn-primary" onClick={closeMobileMenu}>
                    {t('getStarted')} <ArrowRight size={16} />
                  </Link>
                </div>
              ) : (
                <div className="vaango-mobile-menu__user-card">
                  <Link to="/profile" className="vaango-mobile-menu__user-info-link" onClick={closeMobileMenu}>
                    <div className="vaango-mobile-menu__user-avatar">
                      <User size={18} />
                    </div>
                    <div className="vaango-mobile-menu__user-details">
                      <span className="vaango-mobile-menu__user-name">{user.full_name}</span>
                      <span className="vaango-mobile-menu__user-sub">{t('profile') || 'View Profile'}</span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      signOut().then(() => navigate('/login'));
                    }}
                    className="vaango-mobile-menu__logout-btn"
                    title={t('signOut')}
                    aria-label={t('signOut')}
                  >
                    <LogOut size={16} />
                    <span>{t('signOut')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Location Selector Modal */}
      <Modal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        title={t('selectTown')}
        description={t('selectTownDesc')}
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
                  <Badge variant="primary" size="sm">{t('launchTown')}</Badge>
                ) : (
                  <Badge variant="neutral" size="sm">{t('activeTown')}</Badge>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
};

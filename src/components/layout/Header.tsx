import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  MapPin,
  Sun,
  Moon,
  Sparkles,
  User,
  LogOut,
  ChevronDown,
  ShoppingBag,
  RotateCcw,
  Menu,
  X,
  ArrowRight,
  Download,
  Shield,
  Smartphone,
  Settings,
  KeyRound,
  Bell,
  Users,
  Palette,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocationContext } from '../../context/LocationContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../ui/Badge';
import { NotificationBadge } from '../ui/NotificationBadge';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import { Modal } from '../ui/Modal';
import { UserRole } from '../../types/database';
import { resetDemoData } from '../../lib/demoData';
import { NotificationBell } from '../shopkeeper/NotificationBell';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
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
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const { pendingApplications, pendingCatalogue, shopkeeperNewRequests, customerActiveOrders } = useSectionUnreadCounts();
  const { isInstalled, promptInstall, isInstalling, setIsPermissionCenterOpen } = usePermissions();

  const [isMobileView, setIsMobileView] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false));

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close account menu on outside click or Escape key
  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen]);

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

  const handleLogout = async () => {
    setIsAccountMenuOpen(false);
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleSwitchAccount = async () => {
    setIsAccountMenuOpen(false);
    try {
      await signOut();
      navigate('/login', { state: { switchAccount: true } });
    } catch (err) {
      console.error('Switch account error:', err);
    }
  };

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
                <Link to="/admin/dashboard" className={`vaango-header__nav-link ${location.pathname === '/admin/dashboard' ? 'vaango-header__nav-link--active' : ''}`}>{t('navAdmin')}</Link>
                <Link to="/admin/applications" className={`vaango-header__nav-link ${location.pathname.startsWith('/admin/applications') ? 'vaango-header__nav-link--active' : ''}`}>
                  <span>{t('adminAppsTitle')}</span>
                  <NotificationBadge count={pendingApplications} size="sm" />
                </Link>
                <Link to="/admin/catalogue" className={`vaango-header__nav-link ${location.pathname.startsWith('/admin/catalogue') ? 'vaango-header__nav-link--active' : ''}`}>
                  <span>Master Catalogue</span>
                  <NotificationBadge count={pendingCatalogue} size="sm" />
                </Link>
                <Link to="/admin/shops" className={`vaango-header__nav-link ${location.pathname.startsWith('/admin/shops') ? 'vaango-header__nav-link--active' : ''}`}>{t('adminShopsTitle')}</Link>
                <Link to="/admin/locations" className={`vaango-header__nav-link ${location.pathname.startsWith('/admin/locations') ? 'vaango-header__nav-link--active' : ''}`}>{t('adminLocationsTitle')}</Link>
                <Link to="/admin/audit" className={`vaango-header__nav-link ${location.pathname.startsWith('/admin/audit') ? 'vaango-header__nav-link--active' : ''}`}>{t('navAudit')}</Link>
              </>
            ) : role === 'shopkeeper' ? (
              <>
                <Link to="/shopkeeper/dashboard" className={`vaango-header__nav-link ${location.pathname === '/shopkeeper/dashboard' ? 'vaango-header__nav-link--active' : ''}`}>{t('navDashboard')}</Link>
                <Link to="/shopkeeper/requests" className={`vaango-header__nav-link ${location.pathname.startsWith('/shopkeeper/requests') ? 'vaango-header__nav-link--active' : ''}`}>
                  <span>{t('navOrders')}</span>
                  <NotificationBadge count={shopkeeperNewRequests} size="sm" />
                </Link>
                <Link to="/shopkeeper/catalogue" className={`vaango-header__nav-link ${location.pathname.startsWith('/shopkeeper/catalogue') ? 'vaango-header__nav-link--active' : ''}`}>{t('navCatalogue')}</Link>
                <Link to="/shopkeeper/analytics" className={`vaango-header__nav-link vaango-header__nav-link--highlight ${location.pathname.startsWith('/shopkeeper/analytics') ? 'vaango-header__nav-link--active' : ''}`}>{t('navAnalytics')} (Pro)</Link>
                <Link to="/shopkeeper/profile" className={`vaango-header__nav-link ${location.pathname.startsWith('/shopkeeper/profile') ? 'vaango-header__nav-link--active' : ''}`}>{t('navSettings')}</Link>
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
                {user && customerActiveOrders > 0 && (
                  <Link
                    to="/orders"
                    className={`vaango-header__nav-link ${location.pathname === '/orders' ? 'vaango-header__nav-link--active' : ''}`}
                  >
                    <span>{t('activity') || 'Orders'}</span>
                    <NotificationBadge count={customerActiveOrders} size="sm" />
                  </Link>
                )}
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
                <NotificationBadge count={itemCount} position="overlap" size="sm" />
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

            {/* Install Vaangly Button (Header Desktop/Tablet) */}
            {!isInstalled && (
              <button
                type="button"
                className="vaangly-install-btn-header hidden md:inline-flex"
                onClick={() => void promptInstall()}
                disabled={isInstalling}
                title={isInstalling ? 'Installing Vaangly...' : 'Install Vaangly on your device'}
              >
                {isInstalling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Installing...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Install App</span>
                  </>
                )}
              </button>
            )}

            {/* Two-Way Segmented Language Toggle (EN | தமிழ்) - ALWAYS PINNED TOP-RIGHT */}
            <div className="vaango-header__lang-toggle-wrap">
              <LanguageToggle size="sm" />
            </div>

            {/* Compact Theme Toggle Button [ 🌙 in light | ☀️ in dark ] */}
            <button
              type="button"
              className="vaango-header__theme-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun size={17} className="vaango-header__theme-icon--sun" />
              ) : (
                <Moon size={17} className="vaango-header__theme-icon--moon" />
              )}
            </button>

            {/* Account / Admin Menu Control or Login Buttons */}
            {user ? (
              <div className="vaango-header__account-wrap" ref={accountMenuRef}>
                <button
                  type="button"
                  className={`vaango-header__account-btn ${isAccountMenuOpen ? 'vaango-header__account-btn--active' : ''}`}
                  onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                  aria-expanded={isAccountMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                  title="Account menu"
                >
                  <div className="vaango-header__account-avatar">
                    {role === 'admin' ? (
                      <ShieldCheck size={16} />
                    ) : (
                      user.full_name?.charAt(0).toUpperCase() || <User size={15} />
                    )}
                  </div>
                  <span className="vaango-header__account-name">
                    {role === 'admin' ? 'Admin' : (user.full_name?.split(' ')[0] || 'Account')}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`vaango-header__account-chevron ${isAccountMenuOpen ? 'vaango-header__account-chevron--open' : ''}`}
                  />
                </button>

                {/* Desktop Dropdown Popover (Only on screens > 640px) */}
                {isAccountMenuOpen && !isMobileView && (
                  <div className="vaango-account-dropdown" role="menu" aria-label="Account menu">
                    <div className="vaango-account-dropdown__header">
                      <div className="vaango-account-dropdown__kicker">
                        {role === 'admin'
                          ? 'Admin Account'
                          : role === 'shopkeeper'
                            ? 'Shopkeeper Account'
                            : 'Customer Account'}
                      </div>
                      <div className="vaango-account-dropdown__name">
                        {user.full_name || (role === 'admin' ? 'Administrator' : 'User')}
                      </div>
                      <div className="vaango-account-dropdown__email" title={user.email || ''}>
                        {user.email}
                      </div>
                    </div>

                    <div className="vaango-account-dropdown__divider" />

                    <button
                      type="button"
                      role="menuitem"
                      className="vaango-account-dropdown__item"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        navigate('/profile');
                      }}
                    >
                      <div className="vaango-account-dropdown__item-left">
                        <Settings size={15} />
                        <span>Account Settings</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="vaango-account-dropdown__item"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setIsChangePasswordOpen(true);
                      }}
                    >
                      <div className="vaango-account-dropdown__item-left">
                        <KeyRound size={15} />
                        <span>Change Password</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="vaango-account-dropdown__item"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setIsPermissionCenterOpen(true);
                      }}
                    >
                      <div className="vaango-account-dropdown__item-left">
                        <Bell size={15} />
                        <span>Notification Settings</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="vaango-account-dropdown__item"
                      onClick={() => {
                        toggleTheme();
                      }}
                    >
                      <div className="vaango-account-dropdown__item-left">
                        <Palette size={15} />
                        <span>Appearance</span>
                      </div>
                      <span className="vaango-account-dropdown__badge">
                        {theme === 'dark' ? 'Dark' : 'Light'}
                      </span>
                    </button>

                    <div className="vaango-account-dropdown__divider" />

                    <button
                      type="button"
                      role="menuitem"
                      className="vaango-account-dropdown__item"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        handleSwitchAccount();
                      }}
                    >
                      <div className="vaango-account-dropdown__item-left">
                        <Users size={15} />
                        <span>Switch Account</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="vaango-account-dropdown__item vaango-account-dropdown__item--danger"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      <div className="vaango-account-dropdown__item-left">
                        <LogOut size={15} />
                        <span>Logout</span>
                      </div>
                    </button>
                  </div>
                )}
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
                <>
                  <Link to="/admin/dashboard" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                    {t('navAdmin')}
                  </Link>
                  <Link to="/admin/applications" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                    <span>{t('adminAppsTitle')}</span>
                    <NotificationBadge count={pendingApplications} size="sm" />
                  </Link>
                  <Link to="/admin/catalogue" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                    <span>Master Catalogue</span>
                    <NotificationBadge count={pendingCatalogue} size="sm" />
                  </Link>
                </>
              )}
              {role === 'shopkeeper' && (
                <>
                  <Link to="/shopkeeper/dashboard" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                    {t('navDashboard')}
                  </Link>
                  <Link to="/shopkeeper/requests" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                    <span>{t('navOrders')}</span>
                    <NotificationBadge count={shopkeeperNewRequests} size="sm" />
                  </Link>
                </>
              )}
              {user && role === 'customer' && (
                <Link to="/orders" className="vaango-mobile-menu__link" onClick={closeMobileMenu}>
                  <span>{t('activity') || 'Orders'}</span>
                  <NotificationBadge count={customerActiveOrders} size="sm" />
                </Link>
              )}
              <Link to="/permissions" className="vaango-mobile-menu__link flex items-center gap-2" onClick={closeMobileMenu}>
                <Shield size={18} />
                <span>Permissions & Privacy</span>
              </Link>
              {isInstalled ? (
                <Link
                  to="/profile"
                  className="vaango-mobile-menu__link w-full text-left flex items-center justify-between"
                  onClick={closeMobileMenu}
                >
                  <div className="flex items-center gap-2">
                    <Smartphone size={18} className="text-emerald-600 dark:text-emerald-400" />
                    <span>App Settings</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                    Installed ✓
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  className="vaango-mobile-menu__link w-full text-left flex items-center gap-2 font-semibold text-primary"
                  disabled={isInstalling}
                  onClick={() => {
                    closeMobileMenu();
                    void promptInstall();
                  }}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Installing Vaangly...</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Install Vaangly App</span>
                    </>
                  )}
                </button>
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
                      {role === 'admin' ? <ShieldCheck size={18} /> : <User size={18} />}
                    </div>
                    <div className="vaango-mobile-menu__user-details">
                      <span className="vaango-mobile-menu__user-name">
                        {user.full_name || (role === 'admin' ? 'Administrator' : 'User')}
                      </span>
                      <span className="vaango-mobile-menu__user-sub">{user.email}</span>
                    </div>
                  </Link>

                  <div className="flex flex-col gap-1 w-full pt-2 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileMenu();
                        navigate('/profile');
                      }}
                      className="vaango-mobile-menu__link flex items-center gap-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <Settings size={15} />
                      <span>Account Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileMenu();
                        setIsChangePasswordOpen(true);
                      }}
                      className="vaango-mobile-menu__link flex items-center gap-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <KeyRound size={15} />
                      <span>Change Password</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileMenu();
                        setIsPermissionCenterOpen(true);
                      }}
                      className="vaango-mobile-menu__link flex items-center gap-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <Bell size={15} />
                      <span>Notification Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileMenu();
                        handleSwitchAccount();
                      }}
                      className="vaango-mobile-menu__link flex items-center gap-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <Users size={15} />
                      <span>Switch Account</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      handleLogout();
                    }}
                    className="vaango-mobile-menu__logout-btn mt-2"
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Mobile Account Bottom Sheet (When on mobile <= 640px) */}
      {isAccountMenuOpen && isMobileView && user && (
        <div
          className="vaango-account-sheet-overlay"
          onClick={() => setIsAccountMenuOpen(false)}
          role="presentation"
        >
          <div
            className="vaango-account-sheet"
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Account menu"
          >
            <div className="vaango-account-sheet__drag-pill" />
            <div className="vaango-account-sheet__header">
              <div className="vaango-account-sheet__user-row">
                <div className="vaango-account-sheet__avatar">
                  {role === 'admin' ? (
                    <ShieldCheck size={20} />
                  ) : (
                    user.full_name?.charAt(0).toUpperCase() || <User size={18} />
                  )}
                </div>
                <div className="vaango-account-sheet__user-info">
                  <span className="vaango-account-sheet__kicker">
                    {role === 'admin'
                      ? 'Admin Account'
                      : role === 'shopkeeper'
                      ? 'Shopkeeper Account'
                      : 'Customer Account'}
                  </span>
                  <div className="vaango-account-sheet__name">
                    {user.full_name || (role === 'admin' ? 'Administrator' : 'User')}
                  </div>
                  <div className="vaango-account-sheet__email" title={user.email || ''}>
                    {user.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="vaango-account-sheet__close-btn"
                onClick={() => setIsAccountMenuOpen(false)}
                aria-label="Close account menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="vaango-account-sheet__menu">
              <button
                type="button"
                role="menuitem"
                className="vaango-account-sheet__item"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  navigate('/profile');
                }}
              >
                <div className="vaango-account-sheet__item-left">
                  <Settings size={18} />
                  <span>Account Settings</span>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                className="vaango-account-sheet__item"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  setIsChangePasswordOpen(true);
                }}
              >
                <div className="vaango-account-sheet__item-left">
                  <KeyRound size={18} />
                  <span>Change Password</span>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                className="vaango-account-sheet__item"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  setIsPermissionCenterOpen(true);
                }}
              >
                <div className="vaango-account-sheet__item-left">
                  <Bell size={18} />
                  <span>Notification Settings</span>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                className="vaango-account-sheet__item"
                onClick={() => {
                  toggleTheme();
                }}
              >
                <div className="vaango-account-sheet__item-left">
                  <Palette size={18} />
                  <span>Appearance</span>
                </div>
                <span className="vaango-account-dropdown__badge">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="vaango-account-sheet__item"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  handleSwitchAccount();
                }}
              >
                <div className="vaango-account-sheet__item-left">
                  <Users size={18} />
                  <span>Switch Account</span>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                className="vaango-account-sheet__item vaango-account-sheet__item--danger"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  handleLogout();
                }}
              >
                <div className="vaango-account-sheet__item-left">
                  <LogOut size={18} />
                  <span>Logout</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Settings,
  Languages,
  MapPin,
  Bell,
  Shield,
  HelpCircle,
  Info,
  Star,
  LogOut,
  ChevronRight,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import './MoreMenuModal.css';

interface MoreMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoreMenuModal: React.FC<MoreMenuModalProps> = ({ isOpen, onClose }) => {
  const { user, role, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { success, info, error: toastError } = useToast();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const profilePath = role === 'shopkeeper' ? '/shopkeeper/profile' : '/profile';

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  const handleToggleLanguage = () => {
    const nextLang = language === 'en' ? 'ta' : 'en';
    setLanguage(nextLang);
    success(nextLang === 'ta' ? 'தமிழ் மொழிக்கு மாற்றப்பட்டது' : 'Language changed to English');
  };

  const handleLogout = async () => {
    onClose();
    try {
      const res = await signOut();
      if (res && res.error) {
        toastError(res.error);
      } else {
        success(language === 'ta' ? 'வெற்றிகரமாக வெளியேறியது' : 'Logged out successfully');
      }
      navigate('/login');
    } catch (err) {
      console.warn('Logout error:', err);
      toastError(err instanceof Error ? err.message : 'Error logging out');
      navigate('/login');
    }
  };

  const handleHelp = () => {
    info(
      language === 'ta'
        ? 'உதவிக்கு: support@vaango.app | +91 98765 43210'
        : 'Support: support@vaango.app | +91 98765 43210'
    );
  };

  const handleAbout = () => {
    info('Vaango v0.1.0 — Your local marketplace & services ecosystem.');
  };

  const handleRate = () => {
    success(language === 'ta' ? 'மதிப்பளித்தமைக்கு நன்றி!' : 'Thank you for rating Vaango 5 stars!');
  };

  return (
    <div className="vaango-more-modal-backdrop" onClick={onClose}>
      <div
        className="vaango-more-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-menu-title"
      >
        {/* Header */}
        <div className="vaango-more-modal__header">
          <button
            type="button"
            className="vaango-more-modal__close-btn"
            onClick={onClose}
            aria-label="Close more menu"
          >
            <X size={20} />
          </button>
          <h2 id="more-menu-title" className="vaango-more-modal__title">
            {t('navSettings') || 'More'}
          </h2>
          <div style={{ width: 36 }} />
        </div>

        {/* User Card if logged in */}
        {user && (
          <button
            type="button"
            className="vaango-more-modal__user-card"
            onClick={() => handleNavigate(profilePath)}
          >
            <div className="vaango-more-modal__user-avatar">
              {user.full_name ? user.full_name.charAt(0).toUpperCase() : <User size={20} />}
            </div>
            <div className="vaango-more-modal__user-info">
              <span className="vaango-more-modal__user-name">{user.full_name || 'Vaango User'}</span>
              <span className="vaango-more-modal__user-sub">{user.phone || user.email || 'View Profile'}</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>
        )}

        {/* Menu Items List */}
        <div className="vaango-more-modal__list">
          {/* Settings */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={() => handleNavigate(user ? profilePath : '/login')}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <Settings size={20} />
              </div>
              <span className="vaango-more-modal__label">Settings</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* Language Switcher */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={handleToggleLanguage}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <Languages size={20} />
              </div>
              <span className="vaango-more-modal__label">Language</span>
            </div>
            <div className="vaango-more-modal__item-right">
              <span className="vaango-more-modal__value">
                {language === 'ta' ? 'தமிழ்' : 'English'} / {language === 'ta' ? 'English' : 'தமிழ்'}
              </span>
              <ChevronRight size={18} className="vaango-more-modal__chevron" />
            </div>
          </button>

          {/* Manage Address */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={() => handleNavigate(user ? profilePath : '/login')}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <MapPin size={20} />
              </div>
              <span className="vaango-more-modal__label">Manage Address</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* Notification Settings */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={() => handleNavigate('/permissions')}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <Bell size={20} />
              </div>
              <span className="vaango-more-modal__label">Notification Settings</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* Privacy & Security */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={() => handleNavigate(user ? profilePath : '/login')}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <Shield size={20} />
              </div>
              <span className="vaango-more-modal__label">Privacy & Security</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* Help & Support */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={handleHelp}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <HelpCircle size={20} />
              </div>
              <span className="vaango-more-modal__label">Help & Support</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* About Vaango */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={handleAbout}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <Info size={20} />
              </div>
              <span className="vaango-more-modal__label">About Vaango</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* Rate the App */}
          <button
            type="button"
            className="vaango-more-modal__item"
            onClick={handleRate}
          >
            <div className="vaango-more-modal__item-left">
              <div className="vaango-more-modal__icon-wrap">
                <Star size={20} />
              </div>
              <span className="vaango-more-modal__label">Rate the App</span>
            </div>
            <ChevronRight size={18} className="vaango-more-modal__chevron" />
          </button>

          {/* Logout (Red) */}
          {user ? (
            <button
              type="button"
              className="vaango-more-modal__item vaango-more-modal__item--logout"
              onClick={handleLogout}
            >
              <div className="vaango-more-modal__item-left">
                <div className="vaango-more-modal__icon-wrap vaango-more-modal__icon-wrap--logout">
                  <LogOut size={20} />
                </div>
                <span className="vaango-more-modal__label vaango-more-modal__label--logout">
                  Logout
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              className="vaango-more-modal__item"
              onClick={() => handleNavigate('/login')}
            >
              <div className="vaango-more-modal__item-left">
                <div className="vaango-more-modal__icon-wrap">
                  <User size={20} />
                </div>
                <span className="vaango-more-modal__label">Login / Register</span>
              </div>
              <ChevronRight size={18} className="vaango-more-modal__chevron" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, MapPin, Phone, Mail, LogOut, CheckCircle2, Languages } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLocationContext } from '../context/LocationContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { UserRole } from '../types/database';
import { Language } from '../lib/i18n';
import { useLanguage } from '../context/LanguageContext';
import './ProfilePage.css';

export const ProfilePage: React.FC = () => {
  const { user, role, switchDemoRole, signOut } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { selectedLocation, setIsLocationModalOpen } = useLocationContext();
  const navigate = useNavigate();

  const { language, setLanguage } = useLanguage();

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getRoleDescription = (r?: UserRole | null) => {
    switch (r) {
      case 'shopkeeper':
        return 'Can manage shop catalogue, accept pre-orders, and update request states.';
      case 'admin':
        return 'Platform governance, location onboarding, and merchant verification.';
      default:
        return 'Can discover shops, place pre-orders, book appointments, and request local services.';
    }
  };

  return (
    <div className="container vaango-profile">
      <div className="vaango-profile__header">
        <h1 className="vaango-profile__title">Account & Preferences</h1>
        <p className="vaango-profile__subtitle">
          Manage your customer identity, browsing hometown, language, and theme.
        </p>
      </div>

      <div className="vaango-profile__grid">
        {/* User Identity Card */}
        <Card variant="elevated" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__avatar-row">
            <div className="vaango-profile-card__avatar">
              <User size={36} />
            </div>
            <div>
              <div className="vaango-profile-card__name-row">
                <h2 className="vaango-profile-card__name">{user?.full_name || 'Ananya Raman'}</h2>
                {user?.is_verified && (
                  <Badge variant="success" size="sm" withDot>
                    Verified Customer
                  </Badge>
                )}
              </div>
              <div className="vaango-profile-card__role-tag">
                <Shield size={14} />
                <span>Active Persona: <strong>{role ? role.toUpperCase() : 'CUSTOMER'}</strong></span>
              </div>
            </div>
          </div>

          <div className="vaango-profile-card__details">
            <div className="vaango-profile-card__item">
              <Phone size={18} className="vaango-profile-card__item-icon" />
              <span>{user?.phone || '+91 98765 43210'}</span>
            </div>
            <div className="vaango-profile-card__item">
              <Mail size={18} className="vaango-profile-card__item-icon" />
              <span>{user?.email || 'ananya.customer@example.com'}</span>
            </div>
            <div className="vaango-profile-card__item" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <MapPin size={18} className="vaango-profile-card__item-icon" />
                <span>{selectedLocation.name}, {selectedLocation.state}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsLocationModalOpen(true)}>
                Change
              </Button>
            </div>
          </div>
        </Card>

        {/* Language Preference */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head">
            <Languages className="vaango-section-icon" />
            <div>
              <h3 className="vaango-card-heading">Language Foundation</h3>
              <p className="vaango-card-subheading">
                Choose your preferred interface language:
              </p>
            </div>
          </div>

          <div className="vaango-role-selector" role="radiogroup" aria-label="Select language">
            <button
              type="button"
              role="radio"
              aria-checked={language === 'en'}
              className={`vaango-role-opt ${language === 'en' ? 'vaango-role-opt--active' : ''}`}
              onClick={() => handleLanguageChange('en')}
            >
              <div className="vaango-role-opt__header">
                <span className="vaango-role-opt__title">English</span>
                {language === 'en' && <CheckCircle2 size={18} className="vaango-role-opt__check" />}
              </div>
              <p className="vaango-role-opt__desc">Default platform language</p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={language === 'ta'}
              className={`vaango-role-opt ${language === 'ta' ? 'vaango-role-opt--active' : ''}`}
              onClick={() => handleLanguageChange('ta')}
            >
              <div className="vaango-role-opt__header">
                <span className="vaango-role-opt__title">தமிழ் (Tamil)</span>
                {language === 'ta' && <CheckCircle2 size={18} className="vaango-role-opt__check" />}
              </div>
              <p className="vaango-role-opt__desc">தமிழ் மொழி இடைமுகம்</p>
            </button>
          </div>
        </Card>

        {/* Role Architecture Testing / Switcher */}
        {import.meta.env.DEV && <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head">
            <Shield className="vaango-section-icon" />
            <div>
              <h3 className="vaango-card-heading">Platform Role Testing</h3>
              <p className="vaango-card-subheading">
                Switch active roles to test customer vs shopkeeper vs admin navigation:
              </p>
            </div>
          </div>

          <div className="vaango-role-selector" role="radiogroup" aria-label="Select platform persona">
            {(['customer', 'shopkeeper', 'admin'] as UserRole[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                className={`vaango-role-opt ${role === r ? 'vaango-role-opt--active' : ''}`}
                onClick={() => switchDemoRole(r)}
              >
                <div className="vaango-role-opt__header">
                  <span className="vaango-role-opt__title">
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </span>
                  {role === r && <CheckCircle2 size={18} className="vaango-role-opt__check" />}
                </div>
                <p className="vaango-role-opt__desc">{getRoleDescription(r)}</p>
              </button>
            ))}
          </div>
        </Card>}

        {/* Appearance & System Settings */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <h3 className="vaango-card-heading">Appearance & Display</h3>
          <p className="vaango-card-subheading">
            Tailored high-contrast light and dark themes using Deep Teal and Deep Navy.
          </p>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Switch
              checked={isDark}
              onChange={toggleTheme}
              label={isDark ? 'Dark Theme Active (Deep Navy)' : 'Light Theme Active (Deep Teal)'}
              description="Saves your preference in local storage with zero screen flash."
            />
          </div>

          <div className="vaango-profile__theme-indicator">
            <span className="vaango-theme-chip" style={{ backgroundColor: '#0A7B83' }}>Primary Deep Teal</span>
            <span className="vaango-theme-chip" style={{ backgroundColor: '#F59E0B', color: '#000' }}>Warm Amber</span>
            <span className="vaango-theme-chip" style={{ backgroundColor: '#0F1828', color: '#FFF' }}>Deep Navy</span>
          </div>
        </Card>

        {/* Account Actions */}
        <div className="vaango-profile__logout-row">
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={handleSignOut}
            leftIcon={<LogOut size={18} />}
          >
            Sign Out of Vaango
          </Button>
        </div>
      </div>
    </div>
  );
};

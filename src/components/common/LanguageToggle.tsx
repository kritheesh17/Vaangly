import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import './LanguageToggle.css';

interface LanguageToggleProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  size = 'sm',
  className = '',
  showLabel = false,
}) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className={`vaangly-lang-toggle vaangly-lang-toggle--${size} ${className}`}
      role="group"
      aria-label={t('changeLanguage') || 'Select display language'}
    >
      {showLabel && (
        <span className="vaangly-lang-toggle__label">
          {t('language') || 'Language'}:
        </span>
      )}
      <div className="vaangly-lang-toggle__track">
        <button
          type="button"
          className={`vaangly-lang-toggle__option ${language === 'en' ? 'vaangly-lang-toggle__option--active' : ''}`}
          onClick={() => setLanguage('en')}
          aria-pressed={language === 'en'}
          aria-label="English"
          title="Switch display to English"
        >
          EN
        </button>
        <span className="vaangly-lang-toggle__divider" aria-hidden="true" />
        <button
          type="button"
          className={`vaangly-lang-toggle__option ${language === 'ta' ? 'vaangly-lang-toggle__option--active' : ''}`}
          onClick={() => setLanguage('ta')}
          aria-pressed={language === 'ta'}
          aria-label="தமிழ் (Tamil)"
          title="தமிழுக்கு மாறுக (Switch display to Tamil)"
        >
          தமிழ்
        </button>
      </div>
    </div>
  );
};

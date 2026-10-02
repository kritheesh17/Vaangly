import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './LanguageDropdown.css';

export const LanguageDropdown: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (lang: 'en' | 'ta') => {
    setLanguage(lang);
    setIsOpen(false);
  };

  return (
    <div className="vaango-lang-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className={`vaango-lang-dropdown__btn ${isOpen ? 'vaango-lang-dropdown__btn--open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('changeLanguage') || 'Select display language'}
      >
        <Globe size={16} className="vaango-lang-dropdown__globe" />
        <span className="vaango-lang-dropdown__current">
          {language === 'ta' ? 'தமிழ்' : 'English'}
        </span>
        <ChevronDown size={14} className={`vaango-lang-dropdown__chevron ${isOpen ? 'vaango-lang-dropdown__chevron--rotated' : ''}`} />
      </button>

      {isOpen && (
        <div className="vaango-lang-dropdown__menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={language === 'en'}
            className={`vaango-lang-dropdown__option ${language === 'en' ? 'vaango-lang-dropdown__option--selected' : ''}`}
            onClick={() => handleSelect('en')}
          >
            <div className="vaango-lang-dropdown__option-left">
              <span className="vaango-lang-dropdown__code-badge">EN</span>
              <span className="vaango-lang-dropdown__option-name">English</span>
            </div>
            {language === 'en' && <Check size={16} className="vaango-lang-dropdown__check" />}
          </button>

          <button
            type="button"
            role="option"
            aria-selected={language === 'ta'}
            className={`vaango-lang-dropdown__option ${language === 'ta' ? 'vaango-lang-dropdown__option--selected' : ''}`}
            onClick={() => handleSelect('ta')}
          >
            <div className="vaango-lang-dropdown__option-left">
              <span className="vaango-lang-dropdown__code-badge">தமிழ்</span>
              <span className="vaango-lang-dropdown__option-name">Tamil</span>
            </div>
            {language === 'ta' && <Check size={16} className="vaango-lang-dropdown__check" />}
          </button>
        </div>
      )}
    </div>
  );
};

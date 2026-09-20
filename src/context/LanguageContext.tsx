import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getTranslation, Language, TranslationKey } from '../lib/i18n';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('vaango_language');
      return saved === 'ta' ? 'ta' : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = useCallback((nextLanguage: Language) => {
    const validated: Language = nextLanguage === 'ta' ? 'ta' : 'en';
    setLanguageState(validated);
    try {
      localStorage.setItem('vaango_language', validated);
    } catch {
      // Safe fallback if storage quota exceeded or disabled
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'en' ? 'ta' : 'en';
      try {
        localStorage.setItem('vaango_language', next);
      } catch {
        // Safe fallback
      }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // Safe in non-browser environments
    }
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      getTranslation(language, key, params),
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};

import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowUpRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './Footer.css';

export const Footer: React.FC = () => {
  const { t } = useLanguage();

  return (
    <footer className="vaangly-footer">
      <div className="container vaangly-footer__inner">
        {/* Brand Column */}
        <div className="vaangly-footer__brand-col">
          <Link to="/" className="vaangly-footer__logo" aria-label="Vaangly Home">
            <div className="vaangly-footer__logo-icon">
              <span>V</span>
            </div>
            <span className="vaangly-footer__logo-text">{t('brand').toUpperCase()}</span>
          </Link>
          <p className="vaangly-footer__tagline">
            {t('footerTagline')}
          </p>
          <div className="vaangly-footer__location-badge">
            <MapPin size={15} />
            <span>{t('servingTowns')}</span>
          </div>
        </div>

        {/* Links Grid */}
        <div className="vaangly-footer__grid">
          {/* Column 1: Core Customer Offerings */}
          <div className="vaangly-footer__col">
            <h4 className="vaangly-footer__heading">{t('exploreHeading')}</h4>
            <ul className="vaangly-footer__links">
              <li>
                <Link to="/shops?group=ORDER" className="vaangly-footer__link">
                  {t('navOrder')}
                </Link>
              </li>
              <li>
                <Link to="/shops?group=APPOINTMENT" className="vaangly-footer__link">
                  {t('navAppointments')}
                </Link>
              </li>
              <li>
                <Link to="/shops?group=SERVICE" className="vaangly-footer__link">
                  {t('navServices')}
                </Link>
              </li>
              <li>
                <Link to="/shops" className="vaangly-footer__link">
                  {t('allBusinesses')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: For Businesses */}
          <div className="vaangly-footer__col">
            <h4 className="vaangly-footer__heading">{t('forBusinessesHeading')}</h4>
            <ul className="vaangly-footer__links">
              <li>
                <Link to="/shopkeeper/apply" className="vaangly-footer__link vaangly-footer__link--highlight">
                  {t('navOpenShop')} <ArrowUpRight size={13} />
                </Link>
              </li>
              <li>
                <Link to="/login?redirect=/shopkeeper/dashboard" className="vaangly-footer__link">
                  {t('logIn')}
                </Link>
              </li>
              <li>
                <Link to="/shopkeeper/analytics" className="vaangly-footer__link">
                  {t('navAnalytics')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div className="vaangly-footer__col">
            <h4 className="vaangly-footer__heading">{t('companyHeading')}</h4>
            <ul className="vaangly-footer__links">
              <li>
                <a href="/#about" className="vaangly-footer__link">
                  {t('navAbout')}
                </a>
              </li>
              <li>
                <a href="/#how-it-works" className="vaangly-footer__link">
                  {t('navHowItWorks')}
                </a>
              </li>
              <li>
                <a href="mailto:support@vaangly.com" className="vaangly-footer__link">
                  {t('supportLink')}
                </a>
              </li>
              <li>
                <a href="#privacy" className="vaangly-footer__link">
                  {t('privacyLink')}
                </a>
              </li>
              <li>
                <a href="#terms" className="vaangly-footer__link">
                  {t('termsLink')}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="vaangly-footer__bottom">
        <div className="container vaangly-footer__bottom-inner">
          <p className="vaangly-footer__copyright">
            {t('copyrightNotice', { year: new Date().getFullYear() })}
          </p>
          <div className="vaangly-footer__socials" aria-label="Social links">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="vaangly-footer__social-link" aria-label="Twitter / X">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="vaangly-footer__social-link" aria-label="Instagram">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="vaangly-footer__social-link" aria-label="LinkedIn">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

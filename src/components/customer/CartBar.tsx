import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import './CartBar.css';

export const CartBar: React.FC = () => {
  const { itemCount, totalAmount, activeShop } = useCart();
  const { t } = useLanguage();
  const location = useLocation();

  // Hide on cart page, confirmation/checkout, and admin/shopkeeper paths
  if (
    itemCount === 0 ||
    !activeShop ||
    location.pathname === '/cart' ||
    location.pathname.startsWith('/request-confirmation') ||
    location.pathname.startsWith('/shopkeeper') ||
    location.pathname.startsWith('/admin')
  ) {
    return null;
  }

  const formattedCount = itemCount === 1 ? t('itemCount') : t('itemsCount', { count: itemCount });

  return (
    <aside className="vaango-cart-bar" aria-label={t('viewCart')}>
      <div className="vaango-cart-bar__inner">
        <div className="vaango-cart-bar__left">
          <div className="vaango-cart-bar__icon-wrap">
            <ShoppingBag size={22} className="vaango-cart-bar__icon" aria-hidden="true" />
          </div>
          <div className="vaango-cart-bar__details">
            <div className="vaango-cart-bar__primary">
              <span className="vaango-cart-bar__count">{formattedCount}</span>
              <span className="vaango-cart-bar__divider">•</span>
              <span className="vaango-cart-bar__total">₹{totalAmount}</span>
            </div>
            {activeShop.name && (
              <div className="vaango-cart-bar__shop-name" title={activeShop.name}>
                {activeShop.name}
              </div>
            )}
          </div>
        </div>

        <Link
          to="/cart"
          className="vaango-cart-bar__btn"
          aria-label={`${t('viewCart')} (${formattedCount}, ₹${totalAmount})`}
        >
          <span>{t('viewCart')}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
};

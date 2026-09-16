import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import './CartBar.css';

export const CartBar: React.FC = () => {
  const { itemCount, totalAmount, activeShop } = useCart();

  if (itemCount === 0 || !activeShop) return null;

  return (
    <aside className="vaango-cart-bar" aria-label="Current Shopping Cart Summary">
      <div className="container vaango-cart-bar__inner">
        <div className="vaango-cart-bar__info">
          <div className="vaango-cart-bar__icon-wrap">
            <ShoppingBag size={20} />
            <span className="vaango-cart-bar__badge">{itemCount}</span>
          </div>
          <div>
            <div className="vaango-cart-bar__total">₹{totalAmount}</div>
            <div className="vaango-cart-bar__shop-name">{activeShop.name}</div>
          </div>
        </div>

        <Link to="/cart" className="vaango-cart-bar__btn">
          <span>View Cart</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    </aside>
  );
};

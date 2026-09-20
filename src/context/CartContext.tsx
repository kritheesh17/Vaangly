import React, { createContext, useContext, useState, useEffect } from 'react';
import { Shop, ShopProduct, Request } from '../types/database';
import { MOCK_SHOP_TYPES, isValidUuid, LEGACY_SHOP_ID_MAP } from '../data/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface CartItem {
  product: ShopProduct;
  quantity: number;
  billed_quantity: number;
}

export const getEffectiveQuantity = (item: CartItem): number =>
  item.product.offer_type === 'bogo' ? item.quantity * 2 : item.quantity;

interface CartContextType {
  items: CartItem[];
  activeShop: Shop | null;
  itemCount: number;
  totalAmount: number;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
  fulfillmentType: 'parcel' | 'dine_in' | null;
  setFulfillmentType: (type: 'parcel' | 'dine_in' | null) => void;
  addItem: (product: ShopProduct, shop: Shop) => { success: boolean; requiresClear?: boolean };
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  submitRequest: (paymentMethod?: 'cash' | 'upi') => Promise<{ success: boolean; request?: Request; error?: string }>;
  isSubmitting: boolean;
  getItemQuantity: (productId: string) => number;
}

const CART_STORAGE_KEY = 'vaango-customer-cart';

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return (parsed.items || []).map((item: CartItem) => ({
          ...item,
          billed_quantity: item.billed_quantity || item.quantity,
        }));
      }
    } catch {
      // ignore parse error
    }
    return [];
  });

  const [activeShop, setActiveShop] = useState<Shop | null>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        let shop: Shop | null = parsed.activeShop || null;
        if (shop && LEGACY_SHOP_ID_MAP[shop.id]) {
          shop = { ...shop, id: LEGACY_SHOP_ID_MAP[shop.id] };
        }
        return shop;
      }
    } catch {
      // ignore parse error
    }
    return null;
  });

  const [orderNotes, setOrderNotes] = useState<string>('');
  const [fulfillmentType, setFulfillmentType] = useState<'parcel' | 'dine_in' | null>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved).fulfillmentType || null : null;
    } catch {
      return null;
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ items, activeShop, fulfillmentType })
      );
    } catch {
      // ignore storage error
    }
  }, [items, activeShop, fulfillmentType]);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.product.price * item.billed_quantity, 0);

  const getItemQuantity = (productId: string): number => {
    const found = items.find((i) => i.product.id === productId);
    return found ? found.quantity : 0;
  };

  const addItem = (product: ShopProduct, shop: Shop) => {
    // Prevent adding out of stock products
    if (!product.is_available) {
      return { success: false, error: 'Product is currently out of stock' };
    }

    // Check if adding from a different shop
    if (activeShop && activeShop.id !== shop.id && items.length > 0) {
      return { success: false, requiresClear: true };
    }

    setActiveShop(shop);

    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        updated[existingIndex].billed_quantity += 1;
        return updated;
      }
      return [...prev, { product, quantity: 1, billed_quantity: 1 }];
    });

    return { success: true };
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems((prev) =>
      prev.map((i) => {
        if (i.product.id === productId) {
          const nextQuantity = Math.min(99, Math.max(1, quantity));
          return { ...i, quantity: nextQuantity, billed_quantity: nextQuantity };
        }
        return i;
      })
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.product.id !== productId);
      if (updated.length === 0) {
        setActiveShop(null);
      }
      return updated;
    });
  };

  const clearCart = () => {
    setItems([]);
    setActiveShop(null);
    setOrderNotes('');
    setFulfillmentType(null);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const submitRequest = async (paymentMethod: 'cash' | 'upi' = 'cash'): Promise<{ success: boolean; request?: Request; error?: string }> => {
    if (isSubmitting) {
      return { success: false, error: 'Your order request is already processing. Please wait.' };
    }

    if (!activeShop || items.length === 0) {
      return { success: false, error: 'Cart is empty.' };
    }

    if (!user) {
      return { success: false, error: 'Please sign in to complete your request.' };
    }

    if (activeShop.status !== 'active' || !activeShop.is_live) {
      return {
        success: false,
        error: 'This shopfront is currently suspended or not accepting new orders.',
      };
    }

    const shopType = MOCK_SHOP_TYPES.find((type) => type.id === activeShop.shop_type_id);
    const offersDineIn = ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '');
    if (offersDineIn && !fulfillmentType) {
      return { success: false, error: 'Please choose Parcel or Eat there before submitting.' };
    }

    // Client-side pre-validation
    const hasOutOfStock = items.some((i) => !i.product.is_available);
    if (hasOutOfStock) {
      return { success: false, error: 'One or more items in your cart are no longer in stock.' };
    }

    setIsSubmitting(true);

    try {
      // Server-side authoritative total calculation
      const serverCalculatedTotal = items.reduce(
        (sum, item) => sum + item.product.price * item.billed_quantity,
        0
      );

      const referenceCode = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const requestPayload = {
        items: items.map((i) => ({
          product_id: i.product.id,
          name: i.product.name,
          price: i.product.price,
          unit: i.product.unit,
          quantity: i.quantity,
          billed_quantity: i.billed_quantity,
          effective_quantity: getEffectiveQuantity(i),
          delivered_quantity: getEffectiveQuantity(i),
          offer_type: i.product.offer_type,
          subtotal: i.product.price * i.billed_quantity,
        })),
        notes: orderNotes.trim() || null,
        shop_name: activeShop.name,
        shop_address: activeShop.address_line,
        shop_phone: activeShop.phone,
        shop_upi_id: activeShop.upi_id,
        shop_upi_qr_url: activeShop.upi_qr_url || null,
        fulfillment_type: fulfillmentType,
        payment_method: paymentMethod,
      };

      let createdRequest: Request;

      if (isSupabaseConfigured) {
        if (!isValidUuid(activeShop.id)) {
          return {
            success: false,
            error: 'The shop ID in your cart is invalid or outdated. Please clear your cart and select an active shop.',
          };
        }

        // Verify that target shop exists in database before inserting request
        const { data: dbShop, error: shopCheckErr } = await supabase
          .from('shops')
          .select('id, status, is_live')
          .eq('id', activeShop.id)
          .maybeSingle();

        if (shopCheckErr || !dbShop) {
          return {
            success: false,
            error: 'This shopfront is not registered in the live database. Please select from active verified shops.',
          };
        }

        if (dbShop.status !== 'active' || !dbShop.is_live) {
          return {
            success: false,
            error: 'This shopfront is currently paused or not accepting new orders.',
          };
        }

        // Insert into Supabase requests table
        const { data, error } = await supabase
          .from('requests')
          .insert({
            reference_code: referenceCode,
            customer_id: user.id,
            shop_id: activeShop.id,
            workflow_group_code: 'ORDER',
            current_state: 'REQUESTED',
            total_estimate: serverCalculatedTotal,
            notes: JSON.stringify(requestPayload),
            fulfillment_type: fulfillmentType,
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(error?.message || 'Failed to submit request to database.');
        }

        createdRequest = data as Request;

        // Insert initial request_events row
        await supabase.from('request_events').insert({
          request_id: createdRequest.id,
          from_state: null,
          to_state: 'REQUESTED',
          actor_id: user.id,
          actor_role: user.role,
          notes: 'Customer submitted initial order request.',
        });
      } else {
        // Mock fallback mode: persist in localStorage request ledger
        createdRequest = {
          id: `req-${Date.now()}`,
          customer_id: user.id,
          shop_id: activeShop.id,
          workflow_group_code: 'ORDER',
          current_state: 'REQUESTED',
          reference_code: referenceCode,
          total_estimate: serverCalculatedTotal,
          customer_paid: false,
                    fulfillment_type: fulfillmentType,
          notes: JSON.stringify(requestPayload),
          scheduled_for: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const existingRequests = JSON.parse(localStorage.getItem('vaango_demo_requests') || '[]');
        localStorage.setItem(
          'vaango_demo_requests',
          JSON.stringify([createdRequest, ...existingRequests])
        );
        window.dispatchEvent(new CustomEvent('vaango-requests-changed', { detail: { newRequest: createdRequest } }));
      }

      // Clear cart on successful submission
      clearCart();

      return { success: true, request: createdRequest };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error submitting request.';
      return { success: false, error: message };
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CartContext.Provider
      value={{
        items,
        activeShop,
        itemCount,
        totalAmount,
        orderNotes,
        setOrderNotes,
        fulfillmentType,
        setFulfillmentType,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        submitRequest,
        isSubmitting,
        getItemQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

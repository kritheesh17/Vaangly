import React, { createContext, useContext, useState, useEffect } from 'react';
import { Shop, ShopProduct, Request, ProductVariant } from '../types/database';
import { MOCK_SHOP_TYPES, isValidUuid } from '../data/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isValidIndianMobile, normalizeIndianPhone } from '../lib/phoneUtils';

export interface CartItem {
  product: ShopProduct;
  quantity: number;
  billed_quantity: number;
  shopId: string;
  shop: Shop;
  selectedVariant?: ProductVariant | null;
}

export const getEffectiveQuantity = (item: CartItem): number =>
  item.product.offer_type === 'bogo' ? item.quantity * 2 : item.quantity;

export interface ShopCartGroup {
  shop: Shop;
  items: CartItem[];
  subtotal: number;
  itemCount: number;
}

interface CartContextType {
  items: CartItem[];
  activeShop: Shop | null;
  itemCount: number;
  totalAmount: number;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
  fulfillmentType: 'DINE_IN' | 'TAKEAWAY' | null;
  setFulfillmentType: (type: 'DINE_IN' | 'TAKEAWAY' | null) => void;
  addItem: (product: ShopProduct, shop: Shop, variant?: ProductVariant | null) => { success: boolean; requiresClear?: boolean; error?: string };
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string | null) => void;
  clearCart: () => void;
  clearShopItems: (shopId: string) => void;
  shopGroups: ShopCartGroup[];
  submitRequest: (paymentMethod?: 'cash' | 'upi', paymentProofPath?: string | null) => Promise<{ success: boolean; request?: Request; error?: string }>;
  submitShopRequest: (
    shopId: string,
    paymentMethod?: 'cash' | 'upi',
    overrideFulfillment?: 'DINE_IN' | 'TAKEAWAY' | null,
    shopNotes?: string,
    paymentProofPath?: string | null
  ) => Promise<{ success: boolean; request?: Request; error?: string }>;
  isSubmitting: boolean;
  getItemQuantity: (productId: string, variantId?: string | null) => number;
}

const CART_STORAGE_KEY = 'vaango-customer-cart';

const normalizeFulfillmentType = (value: unknown): 'DINE_IN' | 'TAKEAWAY' | null => {
  if (value === 'DINE_IN' || value === 'dine_in') return 'DINE_IN';
  if (value === 'TAKEAWAY' || value === 'parcel' || value === 'pickup' || value === 'delivery') return 'TAKEAWAY';
  return null;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const rawItems: any[] = parsed.items || [];
        const fallbackShop: Shop | null = parsed.activeShop || null;

        // Sanitize and ensure backward-compatibility with single-shop saved carts
        const validItems = rawItems
          .filter((i) => i?.product?.id && isValidUuid(i.product.id))
          .map((item: any) => ({
            ...item,
            billed_quantity: item.billed_quantity || item.quantity,
            shopId: item.shopId || (item.shop?.id) || fallbackShop?.id || '',
            shop: item.shop || fallbackShop,
            selectedVariant: item.selectedVariant || null,
          }))
          .filter((i) => Boolean(i.shopId && i.shop));

        return validItems as CartItem[];
      }
    } catch {
      // ignore parse error
    }
    return [];
  });

  const [orderNotes, setOrderNotes] = useState<string>('');
  const [fulfillmentType, setFulfillmentType] = useState<'DINE_IN' | 'TAKEAWAY' | null>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? normalizeFulfillmentType(JSON.parse(saved).fulfillmentType) : null;
    } catch {
      return null;
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active shop fallback for single-shop interfaces
  const activeShop = items.length > 0 ? items[0].shop : null;

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
  const totalAmount = items.reduce((sum, item) => {
    const unitPrice = item.selectedVariant?.price ?? item.product.price;
    return sum + unitPrice * item.billed_quantity;
  }, 0);

  // Derive separated shop groups
  const shopGroups: ShopCartGroup[] = React.useMemo(() => {
    const map = new Map<string, ShopCartGroup>();
    items.forEach((item) => {
      const shopId = item.shopId || item.shop.id;
      const unitPrice = item.selectedVariant?.price ?? item.product.price;
      const itemSubtotal = unitPrice * item.billed_quantity;

      if (!map.has(shopId)) {
        map.set(shopId, {
          shop: item.shop,
          items: [item],
          subtotal: itemSubtotal,
          itemCount: item.quantity,
        });
      } else {
        const group = map.get(shopId)!;
        group.items.push(item);
        group.subtotal += itemSubtotal;
        group.itemCount += item.quantity;
      }
    });
    return Array.from(map.values());
  }, [items]);

  const getItemQuantity = (productId: string, variantId?: string | null): number => {
    const found = items.find(
      (i) =>
        i.product.id === productId &&
        (!variantId || i.selectedVariant?.id === variantId)
    );
    return found ? found.quantity : 0;
  };

  const addItem = (product: ShopProduct, shop: Shop, variant?: ProductVariant | null) => {
    // Validate UUID safety for shop and product
    if (!isValidUuid(shop.id) || !isValidUuid(product.id)) {
      return {
        success: false,
        error: 'Invalid product or shop identifier. Please select from active verified shops.',
      };
    }

    // Prevent adding out of stock products
    if (!product.is_available) {
      return { success: false, error: 'Product is currently out of stock' };
    }

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          i.product.id === product.id &&
          i.shopId === shop.id &&
          ((!variant && !i.selectedVariant) || i.selectedVariant?.id === variant?.id)
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        updated[existingIndex].billed_quantity += 1;
        return updated;
      }

      return [
        ...prev,
        {
          product,
          quantity: 1,
          billed_quantity: 1,
          shopId: shop.id,
          shop,
          selectedVariant: variant || null,
        },
      ];
    });

    return { success: true };
  };

  const updateQuantity = (productId: string, quantity: number, variantId?: string | null) => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return;
    }

    setItems((prev) =>
      prev.map((i) => {
        if (
          i.product.id === productId &&
          (!variantId || i.selectedVariant?.id === variantId)
        ) {
          const nextQuantity = Math.min(99, Math.max(1, quantity));
          return { ...i, quantity: nextQuantity, billed_quantity: nextQuantity };
        }
        return i;
      })
    );
  };

  const removeItem = (productId: string, variantId?: string | null) => {
    setItems((prev) =>
      prev.filter(
        (i) =>
          !(
            i.product.id === productId &&
            (!variantId || i.selectedVariant?.id === variantId)
          )
      )
    );
  };

  const clearShopItems = (shopId: string) => {
    setItems((prev) => prev.filter((i) => i.shopId !== shopId && i.shop.id !== shopId));
  };

  const clearCart = () => {
    setItems([]);
    setOrderNotes('');
    setFulfillmentType(null);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Submit request for a specific shop
  const submitShopRequest = async (
    shopId: string,
    paymentMethod: 'cash' | 'upi' = 'cash',
    overrideFulfillment?: 'DINE_IN' | 'TAKEAWAY' | null,
    shopNotes?: string,
    paymentProofPath?: string | null
  ): Promise<{ success: boolean; request?: Request; error?: string }> => {
    if (isSubmitting) {
      return { success: false, error: 'An order request is already processing. Please wait.' };
    }

    const shopItems = items.filter((i) => i.shopId === shopId || i.shop.id === shopId);
    if (shopItems.length === 0) {
      return { success: false, error: 'No items in cart for this shop.' };
    }

    const targetShop = shopItems[0].shop;

    if (!user) {
      return { success: false, error: 'Please sign in to complete your request.' };
    }

    const customerPhone = user.phone ? (normalizeIndianPhone(user.phone) || user.phone) : null;
    if (!customerPhone || !isValidIndianMobile(customerPhone)) {
      return {
        success: false,
        error: 'Please complete your phone number in your profile before placing an order.',
      };
    }

    if (targetShop.status !== 'active' || !targetShop.is_live) {
      return {
        success: false,
        error: 'This shopfront is currently suspended or not accepting new orders.',
      };
    }

    const chosenFulfillment = overrideFulfillment !== undefined ? overrideFulfillment : fulfillmentType;
    const shopType = MOCK_SHOP_TYPES.find((type) => type.id === targetShop.shop_type_id);
    const offersDineIn = ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '');
    if (offersDineIn && !chosenFulfillment) {
      return { success: false, error: 'Please choose Dine-in or Parcel / Takeaway before submitting.' };
    }

    // Client-side pre-validation
    const hasOutOfStock = shopItems.some((i) => !i.product.is_available);
    if (hasOutOfStock) {
      return { success: false, error: 'One or more items in your cart are no longer in stock.' };
    }

    setIsSubmitting(true);

    try {
      const serverCalculatedTotal = shopItems.reduce((sum, item) => {
        const unitPrice = item.selectedVariant?.price ?? item.product.price;
        return sum + unitPrice * item.billed_quantity;
      }, 0);

      const referenceCode = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const requestPayload = {
        items: shopItems.map((i) => {
          const unitPrice = i.selectedVariant?.price ?? i.product.price;
          return {
            product_id: i.product.id,
            name: i.product.name,
            price: unitPrice,
            unit: i.selectedVariant ? i.selectedVariant.label : i.product.unit,
            quantity: i.quantity,
            billed_quantity: i.billed_quantity,
            effective_quantity: getEffectiveQuantity(i),
            delivered_quantity: getEffectiveQuantity(i),
            offer_type: i.product.offer_type,
            subtotal: unitPrice * i.billed_quantity,
            variant_id: i.selectedVariant?.id || null,
            variant_label: i.selectedVariant?.label || null,
            variant_price: i.selectedVariant?.price || null,
            variant_attributes: i.selectedVariant?.attributes || {},
          };
        }),
        notes: (shopNotes || orderNotes || '').trim() || null,
        customer_name: user.full_name || user.email || 'Customer',
        customer_phone: customerPhone,
        shop_name: targetShop.name,
        shop_address: targetShop.address_line,
        shop_phone: targetShop.phone,
        shop_upi_id: targetShop.upi_id,
        shop_upi_qr_url: targetShop.upi_qr_url || null,
        fulfillment_type: chosenFulfillment,
        payment_method: paymentMethod,
      };

      let createdRequest: Request;

      if (isSupabaseConfigured) {
        if (!isValidUuid(targetShop.id)) {
          return {
            success: false,
            error: 'The shop ID in your cart is invalid or outdated. Please clear your cart and select an active verified shop.',
          };
        }

        const hasInvalidProductUuid = shopItems.some((item) => !isValidUuid(item.product.id));
        if (hasInvalidProductUuid) {
          return {
            success: false,
            error: 'One or more items in your cart have invalid product identifiers.',
          };
        }

        // Verify that target shop exists in database before inserting request
        const { data: dbShop, error: shopCheckErr } = await supabase
          .from('shops')
          .select('id, status, is_live')
          .eq('id', targetShop.id)
          .maybeSingle();

        if (shopCheckErr || !dbShop) {
          return {
            success: false,
            error: 'This shopfront is not registered in the live database.',
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
            customer_phone: customerPhone,
            shop_id: targetShop.id,
            workflow_group_code: 'ORDER',
            current_state: 'REQUESTED',
            total_estimate: serverCalculatedTotal,
            notes: JSON.stringify(requestPayload),
            fulfillment_type: chosenFulfillment,
            payment_method: paymentMethod,
            payment_amount: paymentMethod === 'upi' ? serverCalculatedTotal : null,
            payment_screenshot_url: paymentMethod === 'upi' ? paymentProofPath : null,
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
          shop_id: targetShop.id,
          workflow_group_code: 'ORDER',
          current_state: 'REQUESTED',
          reference_code: referenceCode,
          total_estimate: serverCalculatedTotal,
          customer_paid: false,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'upi' ? 'PAYMENT_PROOF_SUBMITTED' : 'NOT_REQUIRED',
          payment_screenshot_url: paymentMethod === 'upi' ? paymentProofPath : null,
          fulfillment_type: chosenFulfillment,
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

      // Remove only this shop's items from the cart
      clearShopItems(shopId);

      return { success: true, request: createdRequest };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error submitting request.';
      return { success: false, error: message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // Backward compatible single submit
  const submitRequest = async (paymentMethod: 'cash' | 'upi' = 'cash', paymentProofPath?: string | null): Promise<{ success: boolean; request?: Request; error?: string }> => {
    if (shopGroups.length === 0) {
      return { success: false, error: 'Cart is empty.' };
    }
    return submitShopRequest(shopGroups[0].shop.id, paymentMethod, undefined, undefined, paymentProofPath);
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
        clearShopItems,
        shopGroups,
        submitRequest,
        submitShopRequest,
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

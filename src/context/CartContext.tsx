import React, { createContext, useContext, useState, useEffect } from 'react';
import { Shop, ShopProduct, Request, ProductVariant } from '../types/database';
import { MOCK_SHOP_TYPES, isValidUuid } from '../data/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isValidIndianMobile, normalizeIndianPhone } from '../lib/phoneUtils';
import { notifyOrderLifecycle } from '../lib/notificationApi';
import { validateOrderPickupAt } from '../lib/orderPickupUtils';
import { cleanPaymentProofPath } from '../lib/paymentProof';
import { variantIsAvailable } from '../lib/productVariants';
import { fetchCustomerModeration } from '../lib/orderCancellationApi';
import { getStoredMockShops, getStoredMockProducts } from '../lib/shopkeeperApi';

export interface CartItem {
  product: ShopProduct;
  quantity: number;
  billed_quantity: number;
  shopId: string;
  shop: Shop;
  selectedVariant?: ProductVariant | null;
}

export const matchesCartItem = (
  item: CartItem,
  productId: string,
  variantId?: string | null
): boolean => {
  if (item.product.id !== productId) return false;
  const itemVarId = item.selectedVariant?.id ?? null;
  const targetVarId = variantId ?? null;
  return itemVarId === targetVarId;
};

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
  addItem: (
    product: ShopProduct,
    shop: Shop,
    variant?: ProductVariant | null,
    quantityToAdd?: number
  ) => { success: boolean; requiresClear?: boolean; error?: string };
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (
    productId: string,
    quantity: number,
    variantId?: string | null
  ) => { success: boolean; maxStock?: number; error?: string };
  syncCartShops: () => Promise<void>;
  clearCart: () => void;
  clearShopItems: (shopId: string) => void;
  shopGroups: ShopCartGroup[];
  submitRequest: (paymentMethod?: 'pay_at_shop' | 'cash' | 'upi', paymentProofPath?: string | null) => Promise<{ success: boolean; request?: Request; error?: string }>;
  submitShopRequest: (
    shopId: string,
    paymentMethod?: 'pay_at_shop' | 'cash' | 'upi',
    overrideFulfillment?: 'DINE_IN' | 'TAKEAWAY' | 'delivery' | null,
    shopNotes?: string,
    paymentProofPath?: string | null,
    pickupAt?: string | null
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

  const syncCartShops = React.useCallback(async () => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      const shopIds = Array.from(new Set(prev.map((i) => i.shopId || i.shop.id))).filter((id) => isValidUuid(id));
      if (shopIds.length === 0) return prev;

      (async () => {
        try {
          if (isSupabaseConfigured) {
            const { data: dbShops, error } = await supabase
              .from('shops')
              .select('id, name, owner_id, status, is_live, upi_id, upi_qr_url, delivery_available, delivery_fee, free_delivery_above, address_line, phone, photo_url, slot_config')
              .in('id', shopIds);

            if (!error && dbShops && dbShops.length > 0) {
              const shopMap = new Map(dbShops.map((s) => [s.id, s as Shop]));
              setItems((current) =>
                current.map((item) => {
                  const sId = item.shopId || item.shop.id;
                  const fresh = shopMap.get(sId);
                  if (fresh) {
                    return { ...item, shop: { ...item.shop, ...fresh } };
                  }
                  return item;
                })
              );
            }
          } else {
            const storedMockShops = getStoredMockShops();
            const shopMap = new Map(storedMockShops.map((s) => [s.id, s]));
            setItems((current) =>
              current.map((item) => {
                const sId = item.shopId || item.shop.id;
                const fresh = shopMap.get(sId);
                if (fresh) {
                  return { ...item, shop: { ...item.shop, ...fresh } };
                }
                return item;
              })
            );
          }
        } catch (err) {
          console.warn('Failed to sync shop details in cart:', err);
        }
      })();

      return prev;
    });
  }, []);

  useEffect(() => {
    syncCartShops();
  }, [syncCartShops]);

  useEffect(() => {
    const handleShopChanged = () => {
      syncCartShops();
    };
    const handleFocus = () => {
      syncCartShops();
    };
    window.addEventListener('vaango-shops-changed', handleShopChanged);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('vaango-shops-changed', handleShopChanged);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncCartShops]);

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
    if (variantId !== undefined) {
      const found = items.find((i) => matchesCartItem(i, productId, variantId));
      return found ? found.quantity : 0;
    }
    return items
      .filter((i) => i.product.id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  const addItem = (
    product: ShopProduct,
    shop: Shop,
    variant?: ProductVariant | null,
    quantityToAdd: number = 1
  ): { success: boolean; requiresClear?: boolean; error?: string } => {
    const qtyToAdd = Math.max(1, quantityToAdd);

    // Validate UUID safety for shop and product
    if (!isValidUuid(shop.id) || !isValidUuid(product.id)) {
      return {
        success: false,
        error: 'Invalid product or shop identifier. Please select from active verified shops.',
      };
    }

    // Prevent adding out of stock products or unavailable variants
    if (!product.is_available) {
      return { success: false, error: 'Product is currently out of stock' };
    }

    if (product.has_variants) {
      if (!variant) {
        return { success: false, error: 'Please select an available variant.' };
      }
      if (!variantIsAvailable(variant)) {
        return { success: false, error: 'Selected variant is currently out of stock.' };
      }
      if (variant.stock_quantity != null) {
        const currentVariantQty = getItemQuantity(product.id, variant.id);
        if (currentVariantQty + qtyToAdd > variant.stock_quantity) {
          return {
            success: false,
            error: `Only ${variant.stock_quantity} available in stock for ${variant.label || 'this option'}.`,
          };
        }
      }
    } else if (product.track_inventory && product.stock_quantity != null) {
      const currentProdQty = getItemQuantity(product.id, null);
      if (currentProdQty + qtyToAdd > product.stock_quantity) {
        return {
          success: false,
          error: `Only ${product.stock_quantity} available in stock for this product.`,
        };
      }
    }

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          i.product.id === product.id &&
          (i.shopId === shop.id || i.shop.id === shop.id) &&
          matchesCartItem(i, product.id, variant?.id ?? null)
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += qtyToAdd;
        updated[existingIndex].billed_quantity += qtyToAdd;
        return updated;
      }

      return [
        ...prev,
        {
          product,
          quantity: qtyToAdd,
          billed_quantity: qtyToAdd,
          shopId: shop.id,
          shop,
          selectedVariant: variant || null,
        },
      ];
    });

    return { success: true };
  };

  const updateQuantity = (
    productId: string,
    quantity: number,
    variantId?: string | null
  ): { success: boolean; maxStock?: number; error?: string } => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return { success: true };
    }

    const targetItem = items.find((i) => matchesCartItem(i, productId, variantId));
    if (!targetItem) {
      return { success: false, error: 'Item not found in cart.' };
    }

    let maxStock = 99;
    if (targetItem.selectedVariant && targetItem.selectedVariant.stock_quantity != null) {
      maxStock = Math.max(0, targetItem.selectedVariant.stock_quantity);
    } else if (targetItem.product.track_inventory && targetItem.product.stock_quantity != null) {
      maxStock = Math.max(0, targetItem.product.stock_quantity);
    }

    if (maxStock <= 0) {
      return {
        success: false,
        maxStock: 0,
        error: 'This item is currently out of stock.',
      };
    }

    if (quantity > maxStock) {
      setItems((prev) =>
        prev.map((i) => {
          if (matchesCartItem(i, productId, variantId)) {
            return { ...i, quantity: maxStock, billed_quantity: maxStock };
          }
          return i;
        })
      );
      return {
        success: false,
        maxStock,
        error: `Only ${maxStock} units available in stock.`,
      };
    }

    const nextQuantity = Math.min(maxStock, Math.min(99, Math.max(1, quantity)));

    setItems((prev) =>
      prev.map((i) => {
        if (matchesCartItem(i, productId, variantId)) {
          return { ...i, quantity: nextQuantity, billed_quantity: nextQuantity };
        }
        return i;
      })
    );

    return { success: true, maxStock };
  };

  const removeItem = (productId: string, variantId?: string | null) => {
    setItems((prev) =>
      prev.filter((i) => !matchesCartItem(i, productId, variantId))
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
    paymentMethod: 'pay_at_shop' | 'cash' | 'upi' = 'pay_at_shop',
    overrideFulfillment?: 'DINE_IN' | 'TAKEAWAY' | 'delivery' | null,
    shopNotes?: string,
    paymentProofPath?: string | null,
    pickupAt?: string | null
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

    // Customer abuse / moderation check
    try {
      const moderation = await fetchCustomerModeration(user.id);
      if (moderation?.is_suspended) {
        const isExpired = moderation.suspension_expires_at && new Date(moderation.suspension_expires_at).getTime() < Date.now();
        if (!isExpired) {
          const reasonText = moderation.suspension_reason ? `: "${moderation.suspension_reason}"` : '.';
          const untilText = moderation.suspension_expires_at
            ? ` until ${new Date(moderation.suspension_expires_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
            : '';
          return {
            success: false,
            error: `Your ordering privileges have been temporarily suspended${untilText}${reasonText} Please contact support if you believe this is an error.`,
          };
        }
      }
    } catch {
      // Non-blocking fallback if check fails
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

    // Pre-validate requested scheduled pickup time
    const pickupValidation = validateOrderPickupAt(targetShop, pickupAt);
    if (!pickupValidation.valid) {
      return {
        success: false,
        error: pickupValidation.error || 'Invalid pickup time selected.',
      };
    }

    const chosenFulfillment = overrideFulfillment !== undefined ? overrideFulfillment : fulfillmentType;
    const shopType = MOCK_SHOP_TYPES.find((type) => type.id === targetShop.shop_type_id);
    const offersDineIn = ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '');
    if (offersDineIn && !chosenFulfillment) {
      return { success: false, error: 'Please choose Dine-in or Parcel / Takeaway before submitting.' };
    }

    // Client-side pre-validation: validate product and variant availability and stock
    for (const item of shopItems) {
      if (!item.product.is_available) {
        return { success: false, error: `${item.product.name} is currently out of stock.` };
      }
      if (item.product.has_variants) {
        if (!item.selectedVariant || !variantIsAvailable(item.selectedVariant)) {
          return {
            success: false,
            error: `${item.product.name} (${item.selectedVariant?.label || 'Selected Option'}) is currently out of stock.`,
          };
        }
        if (item.selectedVariant.stock_quantity != null && getEffectiveQuantity(item) > item.selectedVariant.stock_quantity) {
          return {
            success: false,
            error: `Only ${item.selectedVariant.stock_quantity} available for ${item.product.name} (${item.selectedVariant.label || 'Option'}).`,
          };
        }
      } else if (item.product.track_inventory && item.product.stock_quantity != null) {
        if (getEffectiveQuantity(item) > item.product.stock_quantity) {
          return {
            success: false,
            error: `Only ${item.product.stock_quantity} available for ${item.product.name}.`,
          };
        }
      }
    }

    setIsSubmitting(true);

    try {
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

        // 1. Authoritative shop check directly from Supabase
        const { data: dbShop, error: shopCheckErr } = await supabase
          .from('shops')
          .select('id, name, owner_id, status, is_live, upi_id, upi_qr_url, delivery_available, delivery_fee, free_delivery_above, address_line, phone')
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

        // 2. Authoritative UPI QR code validation for UPI payments
        if (paymentMethod === 'upi') {
          const rawQr = dbShop.upi_qr_url ? dbShop.upi_qr_url.trim() : '';
          const isValidQr =
            Boolean(rawQr) &&
            !rawQr.toLowerCase().includes('your-project-id') &&
            /^(https?:\/\/|data:image\/)/i.test(rawQr);

          if (!isValidQr) {
            return {
              success: false,
              error: 'UPI payment is unavailable because this shop has not configured its UPI QR code.',
            };
          }
        }

        // 3. Live backend inventory & availability verification
        const productIds = Array.from(new Set(shopItems.map((i) => i.product.id)));
        const { data: dbProducts, error: prodCheckErr } = await supabase
          .from('shops_products')
          .select('id, name, is_available, is_banned, has_variants, variants, track_inventory, stock_quantity')
          .in('id', productIds);

        if (prodCheckErr || !dbProducts) {
          return {
            success: false,
            error: 'Failed to verify current stock and availability with the shop.',
          };
        }

        const prodMap = new Map(dbProducts.map((p) => [p.id, p]));

        for (const cartItem of shopItems) {
          const dbProd = prodMap.get(cartItem.product.id);
          if (!dbProd) {
            return {
              success: false,
              error: `"${cartItem.product.name}" is no longer available in this shop.`,
            };
          }

          if (dbProd.is_banned) {
            return {
              success: false,
              error: `"${dbProd.name}" is no longer available.`,
            };
          }

          if (!dbProd.is_available) {
            return {
              success: false,
              error: `"${dbProd.name}" is currently marked out of stock.`,
            };
          }

          if (cartItem.selectedVariant) {
            const dbVariants: ProductVariant[] = dbProd.variants || [];
            const dbVar = dbVariants.find((v) => v.id === cartItem.selectedVariant?.id);
            if (!dbVar) {
              return {
                success: false,
                error: `Selected option for "${dbProd.name}" is no longer offered.`,
              };
            }
            if (!variantIsAvailable(dbVar)) {
              return {
                success: false,
                error: `Option "${dbVar.label || 'selected'}" for "${dbProd.name}" is currently out of stock.`,
              };
            }
            if (dbVar.stock_quantity != null && dbVar.stock_quantity < cartItem.quantity) {
              return {
                success: false,
                error: `Only ${dbVar.stock_quantity} available for "${dbVar.label || 'option'}" (${dbProd.name}), but you have ${cartItem.quantity} in cart.`,
              };
            }
          } else if (dbProd.track_inventory && dbProd.stock_quantity != null) {
            if (dbProd.stock_quantity < cartItem.quantity) {
              return {
                success: false,
                error: `Only ${dbProd.stock_quantity} available in stock for "${dbProd.name}", but you have ${cartItem.quantity} in cart.`,
              };
            }
          }
        }

        // Calculate authoritative totals with live shop settings
        const itemsTotal = shopItems.reduce((sum, item) => {
          const unitPrice = item.selectedVariant?.price ?? item.product.price;
          return sum + unitPrice * item.billed_quantity;
        }, 0);

        let deliveryCharge = 0;
        if (chosenFulfillment === 'delivery' && dbShop.delivery_available) {
          const fee = Number(dbShop.delivery_fee) || 0;
          const freeAbove = dbShop.free_delivery_above != null ? Number(dbShop.free_delivery_above) : null;
          if (freeAbove != null && freeAbove > 0 && itemsTotal >= freeAbove) {
            deliveryCharge = 0;
          } else {
            deliveryCharge = fee;
          }
        }

        const serverCalculatedTotal = itemsTotal + deliveryCharge;
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
          shop_name: dbShop.name || targetShop.name,
          shop_address: dbShop.address_line || targetShop.address_line,
          shop_phone: dbShop.phone || targetShop.phone,
          shop_upi_id: dbShop.upi_id || targetShop.upi_id || null,
          shop_upi_qr_url: dbShop.upi_qr_url || null,
          fulfillment_type: chosenFulfillment,
          payment_method: paymentMethod,
          pickup_at: pickupAt || null,
        };

        const sanitizedPaymentProofPath =
          paymentMethod === 'upi' && paymentProofPath
            ? cleanPaymentProofPath(paymentProofPath) || null
            : null;

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
            payment_screenshot_url: sanitizedPaymentProofPath,
            pickup_at: pickupAt || null,
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

        // Notify shopkeeper of new incoming order in realtime
        const shopOwnerId = dbShop.owner_id || targetShop.owner_id;
        const customerName = user.full_name || 'Customer';

        if (shopOwnerId) {
          try {
            await notifyOrderLifecycle({
              event: 'ORDER_PLACED',
              requestId: createdRequest.id,
              referenceCode,
              recipientId: shopOwnerId,
              recipientRole: 'shopkeeper',
              shopId: targetShop.id,
              shopName: targetShop.name,
              customerName,
              pickupAt: pickupAt || null,
              fulfillmentType: chosenFulfillment,
              totalEstimate: serverCalculatedTotal,
            });
          } catch (notifErr) {
            console.warn('[Cart] Failed to dispatch shopkeeper order notification:', notifErr);
          }
        }

        // Canonical customer order placed notification
        try {
          await notifyOrderLifecycle({
            event: 'ORDER_PLACED',
            requestId: createdRequest.id,
            referenceCode,
            recipientId: user.id,
            recipientRole: 'customer',
            shopId: targetShop.id,
            shopName: targetShop.name,
            customerName,
            pickupAt: pickupAt || null,
            fulfillmentType: chosenFulfillment,
            totalEstimate: serverCalculatedTotal,
          });
        } catch (custNotifErr) {
          console.warn('[Cart] Failed to dispatch customer order notification:', custNotifErr);
        }
      } else {
        // Mock fallback mode: authoritative shop & inventory check
        const storedShops = getStoredMockShops();
        const liveShop = storedShops.find((s) => s.id === targetShop.id) || targetShop;

        if (paymentMethod === 'upi') {
          const rawQr = liveShop.upi_qr_url ? liveShop.upi_qr_url.trim() : '';
          const isValidQr =
            Boolean(rawQr) &&
            !rawQr.toLowerCase().includes('your-project-id') &&
            /^(https?:\/\/|data:image\/)/i.test(rawQr);

          if (!isValidQr) {
            return {
              success: false,
              error: 'UPI payment is unavailable because this shop has not configured its UPI QR code.',
            };
          }
        }

        const mockProds = getStoredMockProducts(targetShop.id);
        if (mockProds && mockProds.length > 0) {
          const prodMap = new Map(mockProds.map((p) => [p.id, p]));
          for (const cartItem of shopItems) {
            const mProd = prodMap.get(cartItem.product.id);
            if (mProd) {
              if (!mProd.is_available) {
                return { success: false, error: `"${mProd.name}" is currently marked out of stock.` };
              }
              if (cartItem.selectedVariant) {
                const mVar = (mProd.variants || []).find((v) => v.id === cartItem.selectedVariant?.id);
                if (mVar && !variantIsAvailable(mVar)) {
                  return { success: false, error: `Option "${mVar.label || 'selected'}" for "${mProd.name}" is currently out of stock.` };
                }
                if (mVar && mVar.stock_quantity != null && mVar.stock_quantity < cartItem.quantity) {
                  return { success: false, error: `Only ${mVar.stock_quantity} available for "${mVar.label || 'option'}" (${mProd.name}), but you have ${cartItem.quantity} in cart.` };
                }
              } else if (mProd.track_inventory && mProd.stock_quantity != null && mProd.stock_quantity < cartItem.quantity) {
                return { success: false, error: `Only ${mProd.stock_quantity} available in stock for "${mProd.name}", but you have ${cartItem.quantity} in cart.` };
              }
            }
          }
        }

        const itemsTotal = shopItems.reduce((sum, item) => {
          const unitPrice = item.selectedVariant?.price ?? item.product.price;
          return sum + unitPrice * item.billed_quantity;
        }, 0);

        let deliveryCharge = 0;
        if (chosenFulfillment === 'delivery' && liveShop.delivery_available) {
          const fee = Number(liveShop.delivery_fee) || 0;
          const freeAbove = liveShop.free_delivery_above != null ? Number(liveShop.free_delivery_above) : null;
          if (freeAbove != null && freeAbove > 0 && itemsTotal >= freeAbove) {
            deliveryCharge = 0;
          } else {
            deliveryCharge = fee;
          }
        }

        const serverCalculatedTotal = itemsTotal + deliveryCharge;
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
          shop_name: liveShop.name,
          shop_address: liveShop.address_line,
          shop_phone: liveShop.phone,
          shop_upi_id: liveShop.upi_id,
          shop_upi_qr_url: liveShop.upi_qr_url || null,
          fulfillment_type: chosenFulfillment,
          payment_method: paymentMethod,
          pickup_at: pickupAt || null,
        };

        const sanitizedDemoProofPath =
          paymentMethod === 'upi' && paymentProofPath
            ? cleanPaymentProofPath(paymentProofPath) || null
            : null;

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
          payment_screenshot_url: sanitizedDemoProofPath,
          fulfillment_type: chosenFulfillment,
          notes: JSON.stringify(requestPayload),
          scheduled_for: null,
          pickup_at: pickupAt || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const existingRequests = JSON.parse(localStorage.getItem('vaango_demo_requests') || '[]');
        localStorage.setItem(
          'vaango_demo_requests',
          JSON.stringify([createdRequest, ...existingRequests])
        );
        window.dispatchEvent(new CustomEvent('vaango-requests-changed', { detail: { newRequest: createdRequest } }));

        const shopOwnerId = targetShop.owner_id;
        const customerName = user.full_name || 'Customer';

        if (shopOwnerId) {
          void notifyOrderLifecycle({
            event: 'ORDER_PLACED',
            requestId: createdRequest.id,
            referenceCode,
            recipientId: shopOwnerId,
            recipientRole: 'shopkeeper',
            shopId: targetShop.id,
            shopName: targetShop.name,
            customerName,
            pickupAt: pickupAt || null,
            fulfillmentType: chosenFulfillment,
            totalEstimate: serverCalculatedTotal,
          });
        }

        void notifyOrderLifecycle({
          event: 'ORDER_PLACED',
          requestId: createdRequest.id,
          referenceCode,
          recipientId: user.id,
          recipientRole: 'customer',
          shopId: targetShop.id,
          shopName: targetShop.name,
          customerName,
          pickupAt: pickupAt || null,
          fulfillmentType: chosenFulfillment,
          totalEstimate: serverCalculatedTotal,
        });
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
  const submitRequest = async (paymentMethod: 'pay_at_shop' | 'cash' | 'upi' = 'pay_at_shop', paymentProofPath?: string | null): Promise<{ success: boolean; request?: Request; error?: string }> => {
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
        syncCartShops,
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

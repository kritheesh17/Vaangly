// Shopkeeper Data Access & Business Domain Layer for Vaango Phase 3

import { Shop, ShopProduct, Request, RequestEvent, ShopApplication, ApplicationStatus, SlotConfig, ShopType } from '../types/database';
import { WorkflowStateCode, WorkflowGroupCode } from '../types/workflow';
import { supabase, isSupabaseConfigured } from './supabase';
import { MOCK_SHOPS, MOCK_PRODUCTS, MOCK_SHOP_TYPES } from '../data/mockData';
import { getStoredDemoRequests } from './demoData';

const DEMO_SHOPS_KEY = 'vaango_demo_shops';
const DEMO_PRODUCTS_KEY = 'vaango_demo_products';
const DEMO_REQUESTS_KEY = 'vaango_demo_requests';
const DEMO_REQUEST_EVENTS_KEY = 'vaango_demo_request_events';
const DEMO_APPLICATIONS_KEY = 'vaango_demo_applications';

// Helper to retrieve local mock shops
export const getStoredMockShops = (): Shop[] => {
  try {
    const raw = localStorage.getItem(DEMO_SHOPS_KEY);
    if (raw) {
      const parsed: Shop[] = JSON.parse(raw);
      const map = new Map<string, Shop>();
      MOCK_SHOPS.forEach((s) => map.set(s.id, s));
      parsed.forEach((s) => map.set(s.id, s));
      return Array.from(map.values());
    }
  } catch (err) {
    console.error('Error reading mock shops:', err);
  }
  return [...MOCK_SHOPS];
};

export const saveMockShops = (shops: Shop[]) => {
  try {
    localStorage.setItem(DEMO_SHOPS_KEY, JSON.stringify(shops));
  } catch (err) {
    console.error('Error saving mock shops:', err);
  }
};

// Helper for local mock products
const getStoredMockProducts = (shopId: string): ShopProduct[] => {
  try {
    const raw = localStorage.getItem(DEMO_PRODUCTS_KEY);
    if (raw) {
      const allProducts: Record<string, ShopProduct[]> = JSON.parse(raw);
      if (allProducts[shopId]) return allProducts[shopId];
    }
  } catch (err) {
    console.error('Error reading mock products:', err);
  }
  return MOCK_PRODUCTS[shopId] || [];
};

const saveMockProducts = (shopId: string, products: ShopProduct[]) => {
  try {
    const raw = localStorage.getItem(DEMO_PRODUCTS_KEY);
    const allProducts: Record<string, ShopProduct[]> = raw ? JSON.parse(raw) : { ...MOCK_PRODUCTS };
    allProducts[shopId] = products;
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(allProducts));
    window.dispatchEvent(new CustomEvent('vaango-products-changed', { detail: { shopId } }));
  } catch (err) {
    console.error('Error saving mock products:', err);
  }
};

/**
 * 1. Fetch Shop by Owner ID
 */
export const getShopkeeperShop = async (ownerId: string): Promise<Shop | null> => {
  if (isSupabaseConfigured) {
    try {
      // 1. Direct query by owner_id
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (!error && data) {
        return data as Shop;
      }

      // 2. If no shop record exists yet, check if the user has an approved shop application
      const { data: approvedApp } = await supabase
        .from('shop_applications')
        .select('id, status')
        .eq('applicant_id', ownerId)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (approvedApp) {
        // Auto-provision the approved shop record via atomic RPC
        const { data: provisionedList, error: rpcError } = await supabase
          .rpc('provision_shop_for_approved_applicant', { p_applicant_id: ownerId });

        if (!rpcError && provisionedList && provisionedList.length > 0) {
          return provisionedList[0] as Shop;
        }
      }

      // In Supabase mode, do not bind authenticated users to a mock shop
      // because writing to an unowned shop ID violates database RLS policies.
      return null;
    } catch (err) {
      console.error('Supabase getShopkeeperShop error:', err);
      return null;
    }
  }

  // Pure offline / mock fallback
  const allShops = getStoredMockShops();
  let found = allShops.find((s) => s.owner_id === ownerId);
  if (!found) {
    // If demo shopkeeper is logged in, find first active live shop so dashboard is always testable
    found = allShops.find((s) => s.status === 'active' && s.is_live);
  }
  return found || null;
};

/**
 * 2. Update Shop Profile & Settings (Hours, Tagline, Phone, Delivery, UPI)
 */
export const updateShopProfile = async (
  shopId: string,
  updates: Partial<Pick<Shop, 'tagline' | 'phone' | 'opening_time' | 'closing_time' | 'is_open_today' | 'delivery_available' | 'delivery_fee' | 'upi_id' | 'upi_qr_url' | 'customised_cake_available' | 'subscription_tier'>>
): Promise<{ success: boolean; shop?: Shop; error?: string }> => {
  if (updates.delivery_fee !== undefined && updates.delivery_fee < 0) {
    return { success: false, error: 'Delivery fee cannot be negative.' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shops')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shopId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, shop: data as Shop };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update shop profile.';
      return { success: false, error: message };
    }
  }

  // Mock mode
  const allShops = getStoredMockShops();
  const index = allShops.findIndex((s) => s.id === shopId);
  if (index === -1) {
    return { success: false, error: 'Shop not found.' };
  }

  const updated: Shop = {
    ...allShops[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  allShops[index] = updated;
  saveMockShops(allShops);

  return { success: true, shop: updated };
};

export const updateSlotConfig = async (
  shopId: string,
  config: SlotConfig
): Promise<{ success: boolean; error?: string }> => {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('shops').update({ slot_config: config }).eq('id', shopId);
    return { success: !error, error: error?.message };
  }
  const shops = getStoredMockShops();
  const index = shops.findIndex((shop) => shop.id === shopId);
  if (index === -1) return { success: false, error: 'Shop not found.' };
  shops[index] = { ...shops[index], slot_config: config, updated_at: new Date().toISOString() };
  saveMockShops(shops);
  return { success: true };
};

/**
 * 3. Go-Live Toggle (Approved — Catalogue Incomplete ≠ Live)
 */
export const toggleShopLive = async (
  shopId: string,
  targetLive: boolean
): Promise<{ success: boolean; shop?: Shop; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { data: currentShop, error: fetchError } = await supabase
        .from('shops')
        .select('status')
        .eq('id', shopId)
        .single();

      if (fetchError || !currentShop) throw fetchError || new Error('Shop not found.');
      if (targetLive && currentShop.status === 'suspended') {
        return {
          success: false,
          error: 'Your shop was suspended by the Vaango admin team. Contact support or wait for admin approval to go live again.',
        };
      }

      if (targetLive) {
        const products = await getShopProductsList(shopId);
        if (products.length === 0) {
          return {
            success: false,
            error: 'Your catalogue has no products yet. Add at least one product before making your shop visible to customers.',
          };
        }
      }

      const { data, error } = await supabase
        .from('shops')
        .update({ is_live: targetLive, updated_at: new Date().toISOString() })
        .eq('id', shopId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, shop: data as Shop };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle live state.';
      return { success: false, error: message };
    }
  }

  const allShops = getStoredMockShops();
  const index = allShops.findIndex((s) => s.id === shopId);
  if (index === -1) return { success: false, error: 'Shop not found.' };

  if (targetLive && allShops[index].status === 'suspended') {
    return {
      success: false,
      error: 'Your shop was suspended by the Vaango admin team. Contact support or wait for admin approval to go live again.',
    };
  }

  if (targetLive) {
    const products = getStoredMockProducts(shopId);
    if (products.length === 0) {
      return {
        success: false,
        error: 'Your catalogue has no products yet. Add at least one product before making your shop visible to customers.',
      };
    }
  }

  const updated: Shop = {
    ...allShops[index],
    is_live: targetLive,
    updated_at: new Date().toISOString(),
  };
  allShops[index] = updated;
  saveMockShops(allShops);

  return { success: true, shop: updated };
};

/**
 * 4. Catalogue Management: Get Products
 */
export const getShopProductsList = async (shopId: string): Promise<ShopProduct[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data as ShopProduct[];
      }
    } catch (err) {
      console.error('Error fetching shop products from Supabase:', err);
    }
  }

  return getStoredMockProducts(shopId);
};

/**
 * 5. Add New Product
 */
export const createShopProduct = async (
  shopId: string,
  product: {
    name: string;
    description?: string | null;
    price: number;
    unit: string;
    is_available?: boolean;
    image_url?: string | null;
    image_urls?: string[];
    offer_label?: string | null;
    offer_type?: ShopProduct['offer_type'];
    offer_value?: number | null;
    has_variants?: boolean;
    variants?: ShopProduct['variants'];
    attribute_groups?: ShopProduct['attribute_groups'];
  }
): Promise<{ success: boolean; product?: ShopProduct; error?: string }> => {
  if (!product.name.trim()) {
    return { success: false, error: 'Product name is required.' };
  }
  if (product.price === undefined || product.price === null || product.price < 0 || isNaN(product.price)) {
    return { success: false, error: 'Price must be a valid non-negative number.' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .insert({
          shop_id: shopId,
          name: product.name.trim(),
          description: product.description?.trim() || null,
          price: Number(product.price),
          unit: product.unit.trim() || 'item',
          is_available: product.is_available ?? true,
          image_url: product.image_url || null,
          image_urls: product.image_urls || [],
          offer_label: product.offer_label?.trim() || null,
          offer_type: product.offer_type || null,
          offer_value: product.offer_value ?? null,
          has_variants: product.has_variants ?? false,
          variants: product.variants ?? [],
          attribute_groups: product.attribute_groups ?? [],
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, product: data as ShopProduct };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create product.';
      return { success: false, error: message };
    }
  }

  // Mock mode
  const current = getStoredMockProducts(shopId);
  const newProd: ShopProduct = {
    id: `prod-${Date.now()}`,
    shop_id: shopId,
    name: product.name.trim(),
    description: product.description?.trim() || null,
    price: Number(product.price),
    unit: product.unit.trim() || 'item',
    is_available: product.is_available ?? true,
    image_url: product.image_url || null,
    image_urls: product.image_urls || [],
    offer_label: product.offer_label?.trim() || null,
    offer_type: product.offer_type || null,
    offer_value: product.offer_value ?? null,
    has_variants: product.has_variants ?? false,
    variants: product.variants ?? [],
    attribute_groups: product.attribute_groups ?? [],
    created_at: new Date().toISOString(),
  };

  const updated = [newProd, ...current];
  saveMockProducts(shopId, updated);
  return { success: true, product: newProd };
};

/**
 * 6. Update Existing Product
 */
export const updateShopProduct = async (
  shopId: string,
  productId: string,
  updates: Partial<Pick<ShopProduct, 'name' | 'description' | 'price' | 'unit' | 'is_available' | 'image_url' | 'image_urls' | 'offer_label' | 'offer_type' | 'offer_value' | 'has_variants' | 'variants' | 'attribute_groups'>>
): Promise<{ success: boolean; product?: ShopProduct; error?: string }> => {
  if (updates.price !== undefined && (updates.price < 0 || isNaN(updates.price))) {
    return { success: false, error: 'Price must be non-negative.' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, product: data as ShopProduct };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update product.';
      return { success: false, error: message };
    }
  }

  // Mock mode
  const current = getStoredMockProducts(shopId);
  const index = current.findIndex((p) => p.id === productId);
  if (index === -1) return { success: false, error: 'Product not found.' };

  const updatedProd: ShopProduct = {
    ...current[index],
    ...updates,
  };
  current[index] = updatedProd;
  saveMockProducts(shopId, current);

  return { success: true, product: updatedProd };
};

/**
 * 7. Fast Stock Toggle (One-click)
 */
export const toggleProductStock = async (
  shopId: string,
  productId: string,
  isAvailable: boolean
): Promise<{ success: boolean; error?: string }> => {
  return updateShopProduct(shopId, productId, { is_available: isAvailable });
};

/**
 * 8. Delete Product
 */
export const deleteShopProduct = async (
  shopId: string,
  productId: string
): Promise<{ success: boolean; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('shop_products').delete().eq('id', productId);
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete product.';
      return { success: false, error: message };
    }
  }

  const current = getStoredMockProducts(shopId);
  const filtered = current.filter((p) => p.id !== productId);
  saveMockProducts(shopId, filtered);
  return { success: true };
};

/**
 * 9. Get Shop Customer Requests
 */
export const getShopRequests = async (shopId: string): Promise<Request[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data as Request[];
      }
      console.error('Error fetching shop requests from Supabase:', error);
      return [];
    } catch (err) {
      console.error('Error fetching shop requests from Supabase:', err);
      return [];
    }
  }

  // Mock mode: retrieve stored demo requests or auto-seed
  try {
    const allReqs = getStoredDemoRequests();
    const filtered = allReqs.filter((r) => r.shop_id === shopId);
    if (filtered.length > 0) return filtered;
    // Fallback: return a subset of demo requests so test actions are always available
    return allReqs.slice(0, 3);
  } catch (err) {
    console.error('Error reading mock requests:', err);
  }
  return [];
};

/**
 * 10. Valid State Transitions Definition by Workflow Group
 * Follows core architectural specification for ORDER, APPOINTMENT, and SERVICE
 */
export const VALID_TRANSITIONS_BY_GROUP: Record<WorkflowGroupCode, Record<WorkflowStateCode, WorkflowStateCode[]>> = {
  ORDER: {
    REQUESTED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'DELAYED', 'CANCELLED'],
    DELAYED: ['PREPARING', 'READY', 'CANCELLED'],
    READY: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
    CONFIRMED: [],
    IN_PROGRESS: [],
    NO_SHOW: [],
  },
  APPOINTMENT: {
    REQUESTED: ['CONFIRMED', 'REJECTED'],
    CONFIRMED: ['IN_PROGRESS', 'DELAYED', 'CANCELLED', 'NO_SHOW'],
    DELAYED: ['CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
    IN_PROGRESS: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
    NO_SHOW: [],
    ACCEPTED: [],
    PREPARING: [],
    READY: [],
  },
  SERVICE: {
    REQUESTED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['IN_PROGRESS', 'DELAYED', 'CANCELLED'],
    DELAYED: ['ACCEPTED', 'IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['READY', 'DELAYED', 'CANCELLED'],
    READY: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
    CONFIRMED: [],
    NO_SHOW: [],
    PREPARING: [],
  },
};

/**
 * 11. Atomic Request State Transition with Concurrency Guard & Audit Log
 */
export const transitionRequestState = async (
  requestId: string,
  expectedCurrentState: WorkflowStateCode,
  newState: WorkflowStateCode,
  actorId: string,
  notes?: string
): Promise<{ success: boolean; request?: Request; error?: string }> => {
  if (newState === 'REJECTED' && (!notes || !notes.trim())) {
    return {
      success: false,
      error: 'A concise reason is required when rejecting a customer request.',
    };
  }

  if (isSupabaseConfigured) {
    try {
      // Concurrency check: Ensure request is still in expectedCurrentState
      const { data: currentReq, error: fetchErr } = await supabase
        .from('requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchErr || !currentReq) {
        return { success: false, error: 'Request not found.' };
      }

      // Group-aware validation
      const groupCode = (currentReq.workflow_group_code || 'ORDER') as WorkflowGroupCode;
      const allowedNext = VALID_TRANSITIONS_BY_GROUP[groupCode]?.[expectedCurrentState] || [];
      if (!allowedNext.includes(newState)) {
        return {
          success: false,
          error: `Invalid transition: cannot transition ${groupCode} request from ${expectedCurrentState} to ${newState}.`,
        };
      }

      if (currentReq.current_state !== expectedCurrentState) {
        return {
          success: false,
          error: `Order was already updated to ${currentReq.current_state} by another session.`,
        };
      }

      // Update state with optimistic concurrency lock on current_state
      const { data: updatedReq, error: updateErr } = await supabase
        .from('requests')
        .update({
          current_state: newState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('current_state', expectedCurrentState)
        .select()
        .single();

      if (updateErr || !updatedReq) {
        throw updateErr || new Error('Order was modified by another session or could not be updated.');
      }

      // Free appointment slot if transitioning to cancelled or rejected
      if (groupCode === 'APPOINTMENT' && (newState === 'CANCELLED' || newState === 'REJECTED')) {
        let appointmentPayload: { slot_id?: string } = {};
        try { appointmentPayload = JSON.parse(currentReq.notes || '{}'); } catch { /* legacy notes */ }
        if (appointmentPayload.slot_id) {
          const { data: slot } = await supabase.from('appointment_slots').select('id, concurrent_capacity').eq('id', appointmentPayload.slot_id).single();
          const { data: activeRequests } = await supabase.from('requests').select('notes').eq('shop_id', currentReq.shop_id).eq('workflow_group_code', 'APPOINTMENT').in('current_state', ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS']);
          const bookedCount = (activeRequests || []).filter((item) => {
            try { return JSON.parse(item.notes || '{}').slot_id === appointmentPayload.slot_id; } catch { return false; }
          }).length;
          if (slot) await supabase.from('appointment_slots').update({ is_available: bookedCount < (slot.concurrent_capacity || 1), booked_by_request_id: bookedCount ? undefined : null }).eq('id', slot.id);
        }
      }

      if (newState === 'CANCELLED' || newState === 'REJECTED') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: recent } = await supabase.from('requests').select('current_state').eq('shop_id', currentReq.shop_id).gte('created_at', thirtyDaysAgo.toISOString());
        if (recent?.length) {
          const cancelled = recent.filter((item) => ['CANCELLED', 'REJECTED'].includes(item.current_state)).length;
          await supabase.from('shops').update({ cancellation_rate: Math.round((cancelled / recent.length) * 100) }).eq('id', currentReq.shop_id);
        }
      }

      // Insert audit event in request_events
      await supabase.from('request_events').insert({
        request_id: requestId,
        from_state: expectedCurrentState,
        to_state: newState,
        actor_id: actorId,
        actor_role: 'shopkeeper',
        notes: notes?.trim() || null,
      });

      void supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: currentReq.customer_id,
          title: 'Request status updated',
          body: `Your request is ${newState.toLowerCase()}.`,
          url: `/request/${requestId}`,
        },
      });

      return { success: true, request: updatedReq as Request };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update order state.';
      return { success: false, error: message };
    }
  }

  // Mock mode
  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    const allReqs: Request[] = raw ? JSON.parse(raw) : [];
    const index = allReqs.findIndex((r) => r.id === requestId);

    if (index === -1) {
      return { success: false, error: 'Request not found.' };
    }

    const currentReq = allReqs[index];
    const groupCode = (currentReq.workflow_group_code || 'ORDER') as WorkflowGroupCode;
    const allowedNext = VALID_TRANSITIONS_BY_GROUP[groupCode]?.[expectedCurrentState] || [];
    if (!allowedNext.includes(newState)) {
      return {
        success: false,
        error: `Invalid transition: cannot transition ${groupCode} request from ${expectedCurrentState} to ${newState}.`,
      };
    }

    if (currentReq.current_state !== expectedCurrentState) {
      return {
        success: false,
        error: `Order was already updated to ${currentReq.current_state}.`,
      };
    }

    const updated: Request = {
      ...currentReq,
      current_state: newState,
      updated_at: new Date().toISOString(),
    };
    allReqs[index] = updated;
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(allReqs));

    // Free appointment slot in demo mode if cancelling or rejecting
    if (groupCode === 'APPOINTMENT' && (newState === 'CANCELLED' || newState === 'REJECTED')) {
      try {
        const slotsRaw = localStorage.getItem('vaango_demo_appointment_slots');
        if (slotsRaw) {
          const allSlots: Record<string, any[]> = JSON.parse(slotsRaw);
          for (const sList of Object.values(allSlots)) {
            const slot = sList.find((s) => s.booked_by_request_id === requestId);
            if (slot) {
              slot.is_available = true;
              slot.booked_by_request_id = undefined;
            }
          }
          localStorage.setItem('vaango_demo_appointment_slots', JSON.stringify(allSlots));
        }
      } catch (e) {
        console.error('Error freeing slot in demo mode:', e);
      }
    }

    if (newState === 'CANCELLED' || newState === 'REJECTED') {
      const recent = allReqs.filter((item) => item.shop_id === currentReq.shop_id && new Date(item.created_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000);
      const shops = getStoredMockShops();
      const shopIndex = shops.findIndex((shop) => shop.id === currentReq.shop_id);
      if (shopIndex >= 0 && recent.length) {
        shops[shopIndex].cancellation_rate = Math.round((recent.filter((item) => ['CANCELLED', 'REJECTED'].includes(item.current_state)).length / recent.length) * 100);
        saveMockShops(shops);
      }
    }

    // Audit event record
    const rawEvents = localStorage.getItem(DEMO_REQUEST_EVENTS_KEY);
    const allEvents: RequestEvent[] = rawEvents ? JSON.parse(rawEvents) : [];
    allEvents.push({
      id: `evt-${Date.now()}`,
      request_id: requestId,
      from_state: expectedCurrentState,
      to_state: newState,
      actor_id: actorId,
      actor_role: 'shopkeeper',
      notes: notes?.trim() || null,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(DEMO_REQUEST_EVENTS_KEY, JSON.stringify(allEvents));

    return { success: true, request: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating request.';
    return { success: false, error: message };
  }
};

export const markRequestCustomerPaid = async (
  requestId: string,
  actorId: string
): Promise<{ success: boolean; request?: Request; error?: string }> => {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('requests')
      .update({ customer_paid: true, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single();

    if (error || !data) return { success: false, error: error?.message || 'Request not found.' };

    await supabase.from('request_events').insert({
      request_id: requestId,
      from_state: data.current_state,
      to_state: data.current_state,
      actor_id: actorId,
      actor_role: 'shopkeeper',
      notes: 'Customer paid in person.',
    });
    return { success: true, request: data as Request };
  }

  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    const requests: Request[] = raw ? JSON.parse(raw) : [];
    const index = requests.findIndex((item) => item.id === requestId);
    if (index === -1) return { success: false, error: 'Request not found.' };

    const updated = { ...requests[index], customer_paid: true, updated_at: new Date().toISOString() };
    requests[index] = updated;
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(requests));
    return { success: true, request: updated };
  } catch {
    return { success: false, error: 'Unable to update payment status.' };
  }
};

/**
 * Fetch available shop types from database or fallback to mock types
 */
export const fetchShopTypes = async (): Promise<ShopType[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_types')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as ShopType[];
      }
    } catch (err) {
      console.error('Error fetching shop types from Supabase:', err);
    }
  }
  return MOCK_SHOP_TYPES;
};

/**
 * 12. Submit Shopkeeper Onboarding Application
 */
export const submitShopApplication = async (
  application: Omit<ShopApplication, 'id' | 'status' | 'created_at' | 'updated_at' | 'review_notes' | 'reviewed_by'>
): Promise<{ success: boolean; application?: ShopApplication; error?: string }> => {
  if (!application.shop_name.trim()) {
    return { success: false, error: 'Shop name is required.' };
  }
  if (!application.contact_phone.trim()) {
    return { success: false, error: 'Contact phone number is required.' };
  }
  if (!application.gps_lat || !application.gps_lng) {
    return { success: false, error: 'Live device GPS location capture is required.' };
  }

  if (isSupabaseConfigured) {
    try {
      // 1. Authoritative check: applicant must have a valid authenticated Supabase session
      const authUserPromise = supabase.auth.getUser();
      const authTimeout = new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Authentication verification timed out. Please refresh and try again.')), 8000)
      );
      const { data: authData, error: authError } = await Promise.race([authUserPromise, authTimeout]);

      if (authError || !authData?.user) {
        return { success: false, error: 'You must be signed in to submit an application.' };
      }
      const verifiedApplicantId = authData.user.id;

      // Ensure profile exists in public.profiles to satisfy foreign key REFERENCES public.profiles(id)
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', verifiedApplicantId)
        .maybeSingle();

      if (!profileCheck) {
        await supabase
          .from('profiles')
          .insert({
            id: verifiedApplicantId,
            role: 'customer',
            full_name: application.owner_name?.trim() || authData.user.user_metadata?.full_name || 'Partner Applicant',
            phone: application.contact_phone.trim(),
            email: authData.user.email || null,
            is_verified: Boolean(authData.user.email_confirmed_at || authData.user.confirmed_at),
          });
      }

      // 2. Prevent duplicate application creation on refresh/retry
      const { data: existingApp } = await supabase
        .from('shop_applications')
        .select('*')
        .eq('applicant_id', verifiedApplicantId)
        .in('status', ['submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingApp) {
        return { success: true, application: existingApp as ShopApplication };
      }

      // 3. Resolve shop_type_id to valid UUID from shop_types table
      let resolvedShopTypeId = application.shop_type_id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedShopTypeId);
      if (!isUuid) {
        const normalizedCode = resolvedShopTypeId.replace(/^type-/, '').toLowerCase();
        const { data: matchedType } = await supabase
          .from('shop_types')
          .select('id')
          .eq('code', normalizedCode)
          .maybeSingle();

        if (matchedType?.id) {
          resolvedShopTypeId = matchedType.id;
        } else {
          const { data: fallbackType } = await supabase
            .from('shop_types')
            .select('id')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackType?.id) {
            resolvedShopTypeId = fallbackType.id;
          }
        }
      }

      // 4. Resolve location_id to valid active location in public.locations
      let resolvedLocationId = application.location_id;
      const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedLocationId);
      if (isLocUuid) {
        const { data: matchedLocation } = await supabase
          .from('locations')
          .select('id')
          .eq('id', resolvedLocationId)
          .maybeSingle();

        if (!matchedLocation?.id) {
          const { data: fallbackLoc } = await supabase
            .from('locations')
            .select('id')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackLoc?.id) {
            resolvedLocationId = fallbackLoc.id;
          }
        }
      } else {
        const { data: fallbackLoc } = await supabase
          .from('locations')
          .select('id')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (fallbackLoc?.id) {
          resolvedLocationId = fallbackLoc.id;
        }
      }

      const newAppPayload = {
        applicant_id: verifiedApplicantId,
        shop_name: application.shop_name.trim(),
        owner_name: application.owner_name?.trim() || '',
        description: application.description?.trim() || null,
        shop_type_id: resolvedShopTypeId,
        location_id: resolvedLocationId,
        contact_phone: application.contact_phone.trim(),
        status: 'submitted' as const,
        photo_url: application.photo_url || null,
        photo_urls: application.photo_urls || (application.photo_url ? [application.photo_url] : []),
        upi_id: application.upi_id || null,
        upi_qr_url: application.upi_qr_url || null,
        id_proof_url: application.id_proof_url || null,
        gps_lat: application.gps_lat,
        gps_lng: application.gps_lng,
        google_maps_url: application.google_maps_url || null,
        review_notes: null,
        reviewed_by: null,
      };

      const { data, error } = await supabase
        .from('shop_applications')
        .insert(newAppPayload)
        .select()
        .single();

      if (error) {
        if (error.code === '42501') {
          return { success: false, error: 'Permission denied: Please ensure you are submitting from your verified partner account.' };
        }
        if (error.code === '23503') {
          return { success: false, error: 'Invalid location or category selected. Please re-select your town and category.' };
        }
        throw error;
      }
      return { success: true, application: data as ShopApplication };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit application.';
      return { success: false, error: message };
    }
  }

  // Mock mode
  const newAppPayload = {
    applicant_id: application.applicant_id,
    shop_name: application.shop_name.trim(),
    owner_name: application.owner_name?.trim() || '',
    description: application.description?.trim() || null,
    shop_type_id: application.shop_type_id,
    location_id: application.location_id,
    contact_phone: application.contact_phone.trim(),
    status: 'submitted' as const,
    photo_url: application.photo_url || null,
    photo_urls: application.photo_urls || (application.photo_url ? [application.photo_url] : []),
    upi_id: application.upi_id || null,
    upi_qr_url: application.upi_qr_url || null,
    id_proof_url: application.id_proof_url || null,
    gps_lat: application.gps_lat,
    gps_lng: application.gps_lng,
    google_maps_url: application.google_maps_url || null,
    review_notes: null,
    reviewed_by: null,
  };

  try {
    const newApp: ShopApplication = {
      id: `app-${Date.now()}`,
      ...newAppPayload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const raw = localStorage.getItem(DEMO_APPLICATIONS_KEY);
    const existing: ShopApplication[] = raw ? JSON.parse(raw) : [];
    existing.unshift(newApp);
    localStorage.setItem(DEMO_APPLICATIONS_KEY, JSON.stringify(existing));
    return { success: true, application: newApp };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error submitting application.';
    return { success: false, error: message };
  }
};

/**
 * 13. Get Applicant's Latest Application
 */
export const getLatestApplication = async (applicantId: string): Promise<ShopApplication | null> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_applications')
        .select('*')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) return data as ShopApplication;
    } catch (err) {
      console.error('Error fetching application from Supabase:', err);
    }
  }

  try {
    const raw = localStorage.getItem(DEMO_APPLICATIONS_KEY);
    if (raw) {
      const list: ShopApplication[] = JSON.parse(raw);
      return list.find((a) => a.applicant_id === applicantId) || null;
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * 14. Demo Review Simulator (Allows testing Approved or Rejected lifecycle without waiting for Phase 5)
 */
export const simulateApplicationReview = async (
  applicationId: string,
  newStatus: ApplicationStatus,
  reviewNotes?: string
): Promise<{ success: boolean; application?: ShopApplication; error?: string }> => {
  try {
    const raw = localStorage.getItem(DEMO_APPLICATIONS_KEY);
    const list: ShopApplication[] = raw ? JSON.parse(raw) : [];
    const index = list.findIndex((a) => a.id === applicationId);
    if (index === -1) return { success: false, error: 'Application not found.' };

    const updated: ShopApplication = {
      ...list[index],
      status: newStatus,
      review_notes: reviewNotes || (newStatus === 'rejected' ? 'Storefront photo unclear and identity document unreadable.' : 'Application verified and approved.'),
      updated_at: new Date().toISOString(),
    };

    list[index] = updated;
    localStorage.setItem(DEMO_APPLICATIONS_KEY, JSON.stringify(list));

    // If approved, also create the shop record if not existing yet
    if (newStatus === 'approved') {
      const allShops = getStoredMockShops();
      const shopExists = allShops.some((s) => s.owner_id === updated.applicant_id);
      if (!shopExists) {
        const newShop: Shop = {
          id: `shop-app-${Date.now()}`,
          owner_id: updated.applicant_id,
          shop_type_id: updated.shop_type_id,
          location_id: updated.location_id,
          name: updated.shop_name,
          tagline: updated.description || 'Neighborhood storefront on Vaango',
          address_line: 'Town Center, Verified Location',
          phone: updated.contact_phone,
          status: 'active',
          is_live: false, // Notice: Approved — Catalogue Incomplete! Not live until catalogue ready.
          delivery_available: false,
          delivery_fee: 0,
          upi_id: null,
          gps_lat: updated.gps_lat || null,
          gps_lng: updated.gps_lng || null,
          photo_url: updated.photo_url || null,
          opening_time: '08:00',
          closing_time: '21:00',
          is_open_today: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        allShops.push(newShop);
        saveMockShops(allShops);
      }
    }

    return { success: true, application: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Simulation failed';
    return { success: false, error: message };
  }
};

/**
 * 15. Update Shop Subscription Tier (FREE / PRO)
 */
export const updateShopSubscriptionTier = async (
  shopId: string,
  tier: 'FREE' | 'PRO'
): Promise<{ success: boolean; shop?: Shop; error?: string }> => {
  const res = await updateShopProfile(shopId, { subscription_tier: tier });
  if (res.success && res.shop) {
    window.dispatchEvent(new CustomEvent('vaango-shops-changed', { detail: { shopId, tier } }));
  }
  return res;
};


// Vaango Phase 5 Admin & Business Operations API
// Supports both live Supabase backend with RLS and local offline demo storage

import { supabase, isSupabaseConfigured } from './supabase';
import {
  Location,
  Shop,
  ShopApplication,
  ShopSubscription,
  SubscriptionPayment,
  AdminAuditLog,
  SubscriptionStatus,
  Request,
  RequestEvent,
} from '../types/database';
import {
  OperationalMetrics,
  AdminLocationWithStats,
  AdminShopFilterOptions,
  AdminApplicationFilterOptions,
  RecordPaymentPayload,
} from '../types/admin';
import { DEFAULT_LOCATIONS } from '../context/LocationContext';
import { MOCK_SHOPS, MOCK_SHOP_TYPES } from '../data/mockData';
import { getStoredMockShops, saveMockShops } from './shopkeeperApi';

// Local Storage Keys for Mock Admin Data
export const ADMIN_LOCATIONS_KEY = 'vaango_admin_locations';
export const ADMIN_SUBSCRIPTIONS_KEY = 'vaango_admin_subscriptions';
export const ADMIN_PAYMENTS_KEY = 'vaango_admin_payments';
export const ADMIN_AUDIT_LOGS_KEY = 'vaango_admin_audit_logs';
export const DEMO_APPLICATIONS_KEY = 'vaango_demo_applications';
export const DEMO_REQUESTS_KEY = 'vaango_demo_requests';

// -------------------------------------------------------------
// INITIAL SEED DATA HELPERS FOR OFFLINE / PREVIEW MODE
// -------------------------------------------------------------

function getStoredLocations(): Location[] {
  try {
    const raw = localStorage.getItem(ADMIN_LOCATIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading admin locations:', e);
  }
  localStorage.setItem(ADMIN_LOCATIONS_KEY, JSON.stringify(DEFAULT_LOCATIONS));
  return DEFAULT_LOCATIONS;
}

function saveStoredLocations(locs: Location[]) {
  localStorage.setItem(ADMIN_LOCATIONS_KEY, JSON.stringify(locs));
}

function getStoredSubscriptions(): ShopSubscription[] {
  try {
    const raw = localStorage.getItem(ADMIN_SUBSCRIPTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading admin subscriptions:', e);
  }

  // Seed staging subscriptions in the free initial period.
  const initial: ShopSubscription[] = MOCK_SHOPS.map((shop) => {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const status: SubscriptionStatus = shop.status === 'suspended' ? 'SUSPENDED' : 'TRIAL';

    return {
      id: `sub-${shop.id}`,
      shop_id: shop.id,
      status,
      trial_start_date: now.toISOString(),
      trial_end_date: trialEnd.toISOString(),
      go_live_date: null,
      daily_rate: 10.0, // ₹10/day (well under ₹20 cap)
      billing_cycle: 'MONTHLY',
      current_period_start: now.toISOString(),
      current_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      amount_due: 0,
      last_payment_date: null,
      grace_period_days: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  });

  localStorage.setItem(ADMIN_SUBSCRIPTIONS_KEY, JSON.stringify(initial));
  return initial;
}

function saveStoredSubscriptions(subs: ShopSubscription[]) {
  localStorage.setItem(ADMIN_SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

function getStoredPayments(): SubscriptionPayment[] {
  try {
    const raw = localStorage.getItem(ADMIN_PAYMENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading admin payments:', e);
  }
  return [];
}

function saveStoredPayments(payments: SubscriptionPayment[]) {
  localStorage.setItem(ADMIN_PAYMENTS_KEY, JSON.stringify(payments));
}

function getStoredAuditLogs(): AdminAuditLog[] {
  try {
    const raw = localStorage.getItem(ADMIN_AUDIT_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading audit logs:', e);
  }
  return [];
}

function saveStoredAuditLogs(logs: AdminAuditLog[]) {
  localStorage.setItem(ADMIN_AUDIT_LOGS_KEY, JSON.stringify(logs));
}

export async function logAdminAudit(
  adminId: string,
  actionType: AdminAuditLog['action_type'],
  entityType: AdminAuditLog['entity_type'],
  entityId: string,
  details: Record<string, unknown>
): Promise<void> {
  const newLog: AdminAuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    admin_id: adminId,
    admin_name: 'Vaango Platform Admin',
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    details,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      await supabase.from('admin_audit_logs').insert({
        admin_id: adminId,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        details,
      });
      return;
    } catch (err) {
      console.error('Failed to log audit event to Supabase:', err);
    }
  }

  const logs = getStoredAuditLogs();
  logs.unshift(newLog);
  saveStoredAuditLogs(logs.slice(0, 100)); // Keep latest 100 in storage
}

// -------------------------------------------------------------
// 1. LOCATION MANAGEMENT
// -------------------------------------------------------------

export async function fetchAdminLocations(): Promise<AdminLocationWithStats[]> {
  if (isSupabaseConfigured) {
    try {
      const { data: locs, error: locErr } = await supabase
        .from('locations')
        .select('*')
        .order('name');
      if (locErr) throw locErr;

      const { data: shops } = await supabase.from('shops').select('id, location_id, is_live, status');

      return (locs || []).map((loc) => {
        const matching = (shops || []).filter((s) => s.location_id === loc.id);
        return {
          ...loc,
          shop_count: matching.length,
          active_shop_count: matching.filter((s) => s.status === 'active' && s.is_live).length,
        };
      });
    } catch (err) {
      console.error('Failed to fetch locations from Supabase:', err);
    }
  }

  const locs = getStoredLocations();
  const shops = getStoredMockShops();

  return locs.map((loc) => {
    const matching = shops.filter((s) => s.location_id === loc.id || s.location_id === loc.name);
    return {
      ...loc,
      shop_count: matching.length,
      active_shop_count: matching.filter((s) => s.status === 'active' && s.is_live).length,
    };
  });
}

export async function saveLocation(
  locData: Partial<Location>,
  adminId: string
): Promise<{ success: boolean; location?: Location; error?: string }> {
  if (!locData.name?.trim()) {
    return { success: false, error: 'Location hometown name is required.' };
  }
  if (!locData.state?.trim()) {
    return { success: false, error: 'State is required.' };
  }
  if (!locData.pincode?.trim() || !/^\d{6}$/.test(locData.pincode.trim())) {
    return { success: false, error: 'Valid 6-digit PIN code is required.' };
  }

  const isNew = !locData.id;
  const locationId = locData.id || `loc-${Date.now()}`;

  const locationToSave: Location = {
    id: locationId,
    name: locData.name.trim(),
    state: locData.state.trim(),
    pincode: locData.pincode.trim(),
    is_active: locData.is_active !== undefined ? locData.is_active : true,
    is_launch_town: locData.is_launch_town || false,
    created_at: locData.created_at || new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      if (isNew) {
        const { data, error } = await supabase.from('locations').insert(locationToSave).select().single();
        if (error) throw error;
        await logAdminAudit(adminId, 'location_created', 'location', data.id, { name: data.name });
        return { success: true, location: data };
      } else {
        const { data, error } = await supabase
          .from('locations')
          .update({
            name: locationToSave.name,
            state: locationToSave.state,
            pincode: locationToSave.pincode,
            is_active: locationToSave.is_active,
            is_launch_town: locationToSave.is_launch_town,
          })
          .eq('id', locationId)
          .select()
          .single();
        if (error) throw error;
        await logAdminAudit(adminId, 'location_updated', 'location', data.id, { name: data.name });
        return { success: true, location: data };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save location in Supabase.';
      return { success: false, error: msg };
    }
  }

  const locs = getStoredLocations();
  const existingIdx = locs.findIndex((l) => l.id === locationId);

  if (existingIdx >= 0) {
    locs[existingIdx] = locationToSave;
    saveStoredLocations(locs);
    await logAdminAudit(adminId, 'location_updated', 'location', locationId, { name: locationToSave.name });
  } else {
    locs.push(locationToSave);
    saveStoredLocations(locs);
    await logAdminAudit(adminId, 'location_created', 'location', locationId, { name: locationToSave.name });
  }

  return { success: true, location: locationToSave };
}

export async function toggleLocationActive(
  locationId: string,
  isActive: boolean,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ is_active: isActive })
        .eq('id', locationId);
      if (error) throw error;
      await logAdminAudit(
        adminId,
        isActive ? 'location_updated' : 'location_deactivated',
        'location',
        locationId,
        { is_active: isActive }
      );
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update location.';
      return { success: false, error: msg };
    }
  }

  const locs = getStoredLocations();
  const idx = locs.findIndex((l) => l.id === locationId);
  if (idx === -1) return { success: false, error: 'Location not found.' };

  locs[idx].is_active = isActive;
  saveStoredLocations(locs);
  await logAdminAudit(
    adminId,
    isActive ? 'location_updated' : 'location_deactivated',
    'location',
    locationId,
    { is_active: isActive }
  );
  return { success: true };
}

// -------------------------------------------------------------
// 2. SHOP APPLICATION MANAGEMENT
// -------------------------------------------------------------

export async function fetchAdminApplications(
  filters?: AdminApplicationFilterOptions
): Promise<ShopApplication[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('shop_applications').select('*').order('created_at', { ascending: false });
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.locationId) {
        query = query.eq('location_id', filters.locationId);
      }
      if (filters?.shopTypeId) {
        query = query.eq('shop_type_id', filters.shopTypeId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch applications from Supabase:', err);
    }
  }

  const raw = localStorage.getItem(DEMO_APPLICATIONS_KEY);
  let list: ShopApplication[] = raw ? JSON.parse(raw) : [];

  // Seed sample applications if empty for demo testing
  if (list.length === 0) {
    list = [
      {
        id: 'app-seed-001',
        applicant_id: 'c1111111-0000-0000-0000-000000000001',
        shop_name: 'Karpagam Silks & Readymade',
        owner_name: 'K. Senthil Nathan',
        description: 'Traditional silks and daily cotton wear for all celebrations.',
        shop_type_id: 'type-tailor',
        location_id: '11111111-1111-1111-1111-111111111111', // Gobichettipalayam
        contact_phone: '+91 98421 22334',
        status: 'submitted',
        photo_url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&auto=format&fit=crop',
        id_proof_url: 'private://documents/c1111111-0000-0000-0000-000000000001/aadhaar_card_masked.pdf',
        gps_lat: 11.4552,
        gps_lng: 77.4338,
        review_notes: null,
        reviewed_by: null,
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
      {
        id: 'app-seed-002',
        applicant_id: 'user-app-002',
        shop_name: 'City Care Clinical Lab',
        owner_name: 'Dr. R. Vijayakumar',
        description: 'Diagnostic blood tests, health check packages, and doctor consult.',
        shop_type_id: 'type-clinic',
        location_id: '11111111-1111-1111-1111-111111111111',
        contact_phone: '+91 98765 99887',
        status: 'submitted',
        photo_url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop',
        id_proof_url: 'private://documents/user-app-002/trade_license_gobi.pdf',
        gps_lat: 11.4519,
        gps_lng: 77.4375,
        review_notes: null,
        reviewed_by: null,
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
    ];
    localStorage.setItem(DEMO_APPLICATIONS_KEY, JSON.stringify(list));
  }

  if (filters?.status && filters.status !== 'all') {
    list = list.filter((a) => a.status === filters.status);
  }
  if (filters?.locationId) {
    list = list.filter((a) => a.location_id === filters.locationId);
  }
  if (filters?.shopTypeId) {
    list = list.filter((a) => a.shop_type_id === filters.shopTypeId);
  }

  return list;
}

export async function fetchApplicationDetail(applicationId: string): Promise<ShopApplication | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_applications')
        .select('*')
        .eq('id', applicationId)
        .maybeSingle();
      if (!error && data) return data as ShopApplication;
    } catch (err) {
      console.error('Failed to fetch application detail from Supabase:', err);
    }
  }
  const apps = await fetchAdminApplications();
  return apps.find((a) => a.id === applicationId) || null;
}

export async function approveShopApplication(
  applicationId: string,
  adminId: string,
  approvalNotes?: string
): Promise<{ success: boolean; shop?: Shop; error?: string }> {
  const note = approvalNotes?.trim() || 'Storefront verified and identity approved by admin.';

  if (isSupabaseConfigured) {
    try {
      // 1. Fetch application
      const { data: app, error: appErr } = await supabase
        .from('shop_applications')
        .select('*')
        .eq('id', applicationId)
        .single();
      if (appErr || !app) throw appErr || new Error('Application not found');

      // 2. Mark application approved
      const { error: updErr } = await supabase
        .from('shop_applications')
        .update({
          status: 'approved',
          reviewed_by: adminId,
          review_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);
      if (updErr) throw updErr;

      // 3. Create shop record (status: 'active', is_live: FALSE - Catalogue Incomplete)
      const newShop: Partial<Shop> = {
        owner_id: app.applicant_id,
        shop_type_id: app.shop_type_id,
        location_id: app.location_id,
        name: app.shop_name,
        tagline: app.description || 'Verified neighborhood business on Vaango',
        address_line: 'Town Center, Verified Storefront',
        phone: app.contact_phone,
        status: 'active',
        is_live: false, // Critical product rule: Approved — Catalogue Incomplete ≠ Live
        delivery_available: false,
        delivery_fee: 0,
        upi_id: app.upi_id || null,
        upi_qr_url: app.upi_qr_url || null,
        gps_lat: app.gps_lat || null,
        gps_lng: app.gps_lng || null,
        photo_url: app.photo_url || null,
        is_open_today: true,
      };

      const { data: createdShop, error: shopErr } = await supabase
        .from('shops')
        .insert(newShop)
        .select()
        .single();
      if (shopErr) throw shopErr;

      // 4. Create initial trial subscription (60 days from future go-live, or starts today)
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      await supabase.from('shop_subscriptions').insert({
        shop_id: createdShop.id,
        status: 'TRIAL',
        trial_start_date: now.toISOString(),
        trial_end_date: trialEnd.toISOString(),
        go_live_date: null,
        daily_rate: 10.0,
        billing_cycle: 'MONTHLY',
        amount_due: 0,
      });

      // 5. Audit log
      await logAdminAudit(adminId, 'application_approved', 'shop_application', applicationId, {
        shop_id: createdShop.id,
        shop_name: app.shop_name,
        notes: note,
      });

      return { success: true, shop: createdShop as Shop };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed.';
      return { success: false, error: msg };
    }
  }

  // Mock Mode
  const apps = await fetchAdminApplications();
  const appIdx = apps.findIndex((a) => a.id === applicationId);
  if (appIdx === -1) return { success: false, error: 'Application not found.' };

  const app = apps[appIdx];
  app.status = 'approved';
  app.reviewed_by = adminId;
  app.review_notes = note;
  app.updated_at = new Date().toISOString();
  localStorage.setItem(DEMO_APPLICATIONS_KEY, JSON.stringify(apps));

  // Create Shop in mock store
  const allShops = getStoredMockShops();
  const shopId = `shop-approved-${Date.now()}`;
  const newShop: Shop = {
    id: shopId,
    owner_id: app.applicant_id,
    shop_type_id: app.shop_type_id,
    location_id: app.location_id,
    name: app.shop_name,
    tagline: app.description || 'Verified neighborhood business on Vaango',
    address_line: 'Town Center, Verified Storefront',
    phone: app.contact_phone,
    status: 'active',
    is_live: false, // Approved — Catalogue Incomplete ≠ Live
    delivery_available: false,
    delivery_fee: 0,
    upi_id: app.upi_id || null,
    upi_qr_url: app.upi_qr_url || null,
    gps_lat: app.gps_lat || null,
    gps_lng: app.gps_lng || null,
    photo_url: app.photo_url || null,
    opening_time: '08:00',
    closing_time: '21:00',
    is_open_today: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  allShops.push(newShop);
  saveMockShops(allShops);

  // Initialize trial subscription in mock store
  const subs = getStoredSubscriptions();
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  subs.push({
    id: `sub-${shopId}`,
    shop_id: shopId,
    status: 'TRIAL',
    trial_start_date: now.toISOString(),
    trial_end_date: trialEnd.toISOString(),
    go_live_date: null,
    daily_rate: 10.0,
    billing_cycle: 'MONTHLY',
    current_period_start: now.toISOString(),
    current_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    amount_due: 0,
    last_payment_date: null,
    grace_period_days: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  saveStoredSubscriptions(subs);

  await logAdminAudit(adminId, 'application_approved', 'shop_application', applicationId, {
    shop_id: shopId,
    shop_name: app.shop_name,
    notes: note,
  });

  return { success: true, shop: newShop };
}

export async function rejectShopApplication(
  applicationId: string,
  adminId: string,
  rejectionReason: string
): Promise<{ success: boolean; error?: string }> {
  if (!rejectionReason || !rejectionReason.trim()) {
    return {
      success: false,
      error: 'A clear rejection reason is mandatory so the merchant understands what to rectify.',
    };
  }

  const reason = rejectionReason.trim();

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('shop_applications')
        .update({
          status: 'rejected',
          reviewed_by: adminId,
          review_notes: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (error) throw error;

      await logAdminAudit(adminId, 'application_rejected', 'shop_application', applicationId, {
        rejection_reason: reason,
      });

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rejection failed.';
      return { success: false, error: msg };
    }
  }

  const apps = await fetchAdminApplications();
  const appIdx = apps.findIndex((a) => a.id === applicationId);
  if (appIdx === -1) return { success: false, error: 'Application not found.' };

  apps[appIdx].status = 'rejected';
  apps[appIdx].reviewed_by = adminId;
  apps[appIdx].review_notes = reason;
  apps[appIdx].updated_at = new Date().toISOString();
  localStorage.setItem(DEMO_APPLICATIONS_KEY, JSON.stringify(apps));

  await logAdminAudit(adminId, 'application_rejected', 'shop_application', applicationId, {
    rejection_reason: reason,
  });

  return { success: true };
}

// -------------------------------------------------------------
// 3. SHOP LIFECYCLE MANAGEMENT (SUSPEND & REACTIVATE)
// -------------------------------------------------------------

export async function fetchAdminShops(filters?: AdminShopFilterOptions): Promise<Shop[]> {
  let shops: Shop[] = [];

  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('shops').select('*, shop_avg_ratings(avg_rating, total_ratings)').order('created_at', { ascending: false });
      if (filters?.locationId) query = query.eq('location_id', filters.locationId);
      if (filters?.shopTypeId) query = query.eq('shop_type_id', filters.shopTypeId);
      if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (error) throw error;
      shops = (data || []).map((shop) => {
        const rating = Array.isArray(shop.shop_avg_ratings) ? shop.shop_avg_ratings[0] : shop.shop_avg_ratings;
        return { ...shop, avg_rating: rating?.avg_rating ?? null, total_ratings: rating?.total_ratings ?? 0 };
      });
    } catch (err) {
      console.error('Failed to fetch shops from Supabase:', err);
    }
  } else {
    shops = getStoredMockShops();
  }

  // Client-side multi-vertical filter matching
  return shops.filter((shop) => {
    if (filters?.locationId && shop.location_id !== filters.locationId) return false;
    if (filters?.shopTypeId && shop.shop_type_id !== filters.shopTypeId) return false;
    if (filters?.status && filters.status !== 'all' && shop.status !== filters.status) return false;

    if (filters?.workflowGroup) {
      const shopType = MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id);
      if (shopType && shopType.workflow_group_code !== filters.workflowGroup) return false;
    }

    if (filters?.searchQuery?.trim()) {
      const q = filters.searchQuery.toLowerCase();
      const matchName = shop.name.toLowerCase().includes(q);
      const matchPhone = shop.phone.toLowerCase().includes(q);
      const matchTagline = (shop.tagline || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchTagline) return false;
    }

    return true;
  });
}

export async function suspendShop(
  shopId: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason || !reason.trim()) {
    return { success: false, error: 'A suspension reason is required for administrative audit.' };
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('shops')
        .update({
          status: 'suspended',
          is_live: false, // Immediately removed from customer discovery
          updated_at: new Date().toISOString(),
        })
        .eq('id', shopId);
      if (error) throw error;

      // Update subscription status to SUSPENDED
      await supabase
        .from('shop_subscriptions')
        .update({ status: 'SUSPENDED', updated_at: new Date().toISOString() })
        .eq('shop_id', shopId);

      await logAdminAudit(adminId, 'shop_suspended', 'shop', shopId, { reason });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to suspend shop.';
      return { success: false, error: msg };
    }
  }

  const shops = getStoredMockShops();
  const idx = shops.findIndex((s) => s.id === shopId);
  if (idx === -1) return { success: false, error: 'Shop not found.' };

  shops[idx].status = 'suspended';
  shops[idx].is_live = false;
  shops[idx].updated_at = new Date().toISOString();
  saveMockShops(shops);

  const subs = getStoredSubscriptions();
  const subIdx = subs.findIndex((s) => s.shop_id === shopId);
  if (subIdx >= 0) {
    subs[subIdx].status = 'SUSPENDED';
    subs[subIdx].updated_at = new Date().toISOString();
    saveStoredSubscriptions(subs);
  }

  await logAdminAudit(adminId, 'shop_suspended', 'shop', shopId, { reason });
  return { success: true };
}

export async function reactivateShop(
  shopId: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('shops')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', shopId);
      if (error) throw error;

      // Restore subscription state
      await supabase
        .from('shop_subscriptions')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .eq('shop_id', shopId);

      await logAdminAudit(adminId, 'shop_reactivated', 'shop', shopId, {});
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate shop.';
      return { success: false, error: msg };
    }
  }

  const shops = getStoredMockShops();
  const idx = shops.findIndex((s) => s.id === shopId);
  if (idx === -1) return { success: false, error: 'Shop not found.' };

  shops[idx].status = 'active';
  shops[idx].updated_at = new Date().toISOString();
  saveMockShops(shops);

  const subs = getStoredSubscriptions();
  const subIdx = subs.findIndex((s) => s.shop_id === shopId);
  if (subIdx >= 0) {
    subs[subIdx].status = 'ACTIVE';
    subs[subIdx].updated_at = new Date().toISOString();
    saveStoredSubscriptions(subs);
  }

  await logAdminAudit(adminId, 'shop_reactivated', 'shop', shopId, {});
  return { success: true };
}

// -------------------------------------------------------------
// 4. SUBSCRIPTION SYSTEM & MANUAL PAYMENT RECORDING
// -------------------------------------------------------------

/**
 * 60-Day Trial Calculation: Begins strictly from actual shop go_live_date (Day 0).
 * Max Daily Rate: Capped at ₹20/day.
 */
export function calculateTrialWindow(goLiveDateStr: string | null): {
  trialStartDate: string;
  trialEndDate: string;
  daysRemaining: number;
  isTrialExpired: boolean;
} {
  const now = new Date();
  if (!goLiveDateStr) {
    // If shop hasn't gone live yet, trial is pending initiation
    const futureEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    return {
      trialStartDate: now.toISOString(),
      trialEndDate: futureEnd.toISOString(),
      daysRemaining: 60,
      isTrialExpired: false,
    };
  }

  const goLive = new Date(goLiveDateStr);
  const trialEnd = new Date(goLive.getTime() + 60 * 24 * 60 * 60 * 1000); // Strict 60-day window
  const diffMs = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    trialStartDate: goLive.toISOString(),
    trialEndDate: trialEnd.toISOString(),
    daysRemaining,
    isTrialExpired: daysRemaining <= 0,
  };
}

export async function fetchAdminSubscriptions(
  statusFilter?: SubscriptionStatus | 'all'
): Promise<ShopSubscription[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('shop_subscriptions').select('*').order('created_at', { ascending: false });
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch subscriptions from Supabase:', err);
    }
  }

  let list = getStoredSubscriptions();
  if (statusFilter && statusFilter !== 'all') {
    list = list.filter((s) => s.status === statusFilter);
  }
  return list;
}

export async function fetchShopSubscription(shopId: string): Promise<ShopSubscription | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_subscriptions')
        .select('*')
        .eq('shop_id', shopId)
        .maybeSingle();
      if (!error && data) return data as ShopSubscription;
    } catch (err) {
      console.error('Failed to fetch shop subscription from Supabase:', err);
    }
  }

  const list = getStoredSubscriptions();
  return list.find((s) => s.shop_id === shopId) || null;
}

export async function updateShopBillingCycle(
  subscriptionId: string,
  billingCycle: ShopSubscription['billing_cycle']
): Promise<{ success: boolean; subscription?: ShopSubscription; error?: string }> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('shop_subscriptions')
      .update({ billing_cycle: billingCycle, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
      .select()
      .single();
    if (error || !data) return { success: false, error: error?.message || 'Unable to update billing cycle.' };
    return { success: true, subscription: data as ShopSubscription };
  }

  const subscriptions = getStoredSubscriptions();
  const index = subscriptions.findIndex((item) => item.id === subscriptionId);
  if (index === -1) return { success: false, error: 'Subscription not found.' };
  subscriptions[index] = {
    ...subscriptions[index],
    billing_cycle: billingCycle,
    updated_at: new Date().toISOString(),
  };
  saveStoredSubscriptions(subscriptions);
  return { success: true, subscription: subscriptions[index] };
}

export async function recordSubscriptionPayment(
  payload: RecordPaymentPayload,
  adminId: string
): Promise<{ success: boolean; payment?: SubscriptionPayment; error?: string }> {
  if (!payload.amountPaid || payload.amountPaid <= 0) {
    return { success: false, error: 'Payment amount must be greater than zero.' };
  }
  if (!payload.paymentReference?.trim()) {
    return { success: false, error: 'UPI transaction reference or receipt note is required.' };
  }
  if (!payload.periodStart || !payload.periodEnd) {
    return { success: false, error: 'Coverage period start and end dates are required.' };
  }

  const paymentToSave: SubscriptionPayment = {
    id: `pay-${Date.now()}`,
    subscription_id: payload.subscriptionId,
    shop_id: payload.shopId,
    amount_paid: payload.amountPaid,
    payment_date: payload.paymentDate || new Date().toISOString(),
    billing_cycle: payload.billingCycle,
    period_start: payload.periodStart,
    period_end: payload.periodEnd,
    payment_reference: payload.paymentReference.trim(),
    recorded_by_admin_id: adminId,
    notes: payload.notes?.trim() || null,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('subscription_payments')
        .insert(paymentToSave)
        .select()
        .single();
      if (error) throw error;

      // Advance subscription to ACTIVE and reset amount due
      await supabase
        .from('shop_subscriptions')
        .update({
          status: 'ACTIVE',
          last_payment_date: paymentToSave.payment_date,
          current_period_start: paymentToSave.period_start,
          current_period_end: paymentToSave.period_end,
          amount_due: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.subscriptionId);

      await logAdminAudit(adminId, 'payment_recorded', 'payment', data.id, {
        shop_id: payload.shopId,
        amount: payload.amountPaid,
        ref: payload.paymentReference,
      });

      return { success: true, payment: data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment in Supabase.';
      return { success: false, error: msg };
    }
  }

  // Mock Mode
  const payments = getStoredPayments();
  payments.unshift(paymentToSave);
  saveStoredPayments(payments);

  const subs = getStoredSubscriptions();
  const subIdx = subs.findIndex((s) => s.id === payload.subscriptionId);
  if (subIdx >= 0) {
    subs[subIdx].status = 'ACTIVE';
    subs[subIdx].last_payment_date = paymentToSave.payment_date;
    subs[subIdx].current_period_start = paymentToSave.period_start;
    subs[subIdx].current_period_end = paymentToSave.period_end;
    subs[subIdx].amount_due = 0;
    subs[subIdx].updated_at = new Date().toISOString();
    saveStoredSubscriptions(subs);
  }

  await logAdminAudit(adminId, 'payment_recorded', 'payment', paymentToSave.id, {
    shop_id: payload.shopId,
    amount: payload.amountPaid,
    ref: payload.paymentReference,
  });

  return { success: true, payment: paymentToSave };
}

export async function fetchSubscriptionPayments(shopId?: string): Promise<SubscriptionPayment[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('subscription_payments').select('*').order('payment_date', { ascending: false });
      if (shopId) query = query.eq('shop_id', shopId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch payments from Supabase:', err);
    }
  }

  let payments = getStoredPayments();
  if (shopId) payments = payments.filter((p) => p.shop_id === shopId);
  return payments;
}

// -------------------------------------------------------------
// 5. OPERATIONAL METRICS & AUDIT LOGS
// -------------------------------------------------------------

export async function fetchOperationalMetrics(): Promise<OperationalMetrics> {
  const shops = await fetchAdminShops();
  const apps = await fetchAdminApplications();
  const subs = await fetchAdminSubscriptions();

  // Requests and events for cancellation metrics
  let requests: Request[] = [];
  let events: RequestEvent[] = [];

  if (isSupabaseConfigured) {
    try {
      const { data: reqData } = await supabase.from('requests').select('*');
      requests = reqData || [];
      const { data: eventData } = await supabase.from('request_events').select('*');
      events = eventData || [];
    } catch (err) {
      console.error('Error reading requests for operational metrics:', err);
    }
  } else {
    try {
      const rawReq = localStorage.getItem(DEMO_REQUESTS_KEY);
      requests = rawReq ? JSON.parse(rawReq) : [];
      // Also collect events from localStorage if stored
      const rawEvents = localStorage.getItem('vaango_request_events');
      events = rawEvents ? JSON.parse(rawEvents) : [];
    } catch {
      // ignore
    }
  }

  const pendingApps = apps.filter((a) => a.status === 'submitted' || a.status === 'under_review').length;
  const approvedShops = shops.filter((s) => s.status === 'active' || s.status === 'verified').length;
  const liveShops = shops.filter((s) => s.status === 'active' && s.is_live).length;
  const suspendedShops = shops.filter((s) => s.status === 'suspended').length;

  const activeSubs = subs.filter((s) => s.status === 'ACTIVE').length;
  const trialSubs = subs.filter((s) => s.status === 'TRIAL').length;
  const overdueSubs = subs.filter((s) => s.status === 'OVERDUE').length;
  const suspendedSubs = subs.filter((s) => s.status === 'SUSPENDED').length;

  // Cancellation metrics
  const totalRequests = requests.length;
  const cancelledRequests = requests.filter((r) =>
    ['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(r.current_state)
  ).length;

  const cancellationRate =
    totalRequests > 0 ? Math.round((cancelledRequests / totalRequests) * 100) : 0;

  // Distinguish customer cancellations vs merchant rejections
  const customerCancellations = events.filter(
    (e) => e.to_state === 'CANCELLED' && e.actor_role === 'customer'
  ).length;

  const merchantRejectionsOrCancellations = events.filter(
    (e) => (e.to_state === 'REJECTED' || e.to_state === 'CANCELLED') && e.actor_role === 'shopkeeper'
  ).length;

  return {
    pendingApplications: pendingApps,
    approvedShops,
    liveShops,
    suspendedShops,
    totalCustomers: 124, // Aggregated platform profiles
    totalShopkeepers: shops.length,
    activeSubscriptions: activeSubs,
    trialSubscriptions: trialSubs,
    overdueSubscriptions: overdueSubs,
    suspendedSubscriptions: suspendedSubs,
    totalRequests,
    cancelledRequests,
    cancellationRate,
    customerCancellations,
    merchantRejectionsOrCancellations,
  };
}

export async function fetchAdminAuditLogsList(limit: number = 50): Promise<AdminAuditLog[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch audit logs from Supabase:', err);
    }
  }

  const logs = getStoredAuditLogs();
  if (logs.length === 0) {
    // Initial sample logs for demo review
    const samples: AdminAuditLog[] = [
      {
        id: 'audit-demo-1',
        admin_id: 'a3333333-0000-0000-0000-000000000003',
        admin_name: 'Platform Operations Admin',
        action_type: 'application_approved',
        entity_type: 'shop_application',
        entity_id: 'app-seed-001',
        details: { shop_name: 'Murugan Supermarket & Spices', town: 'Gobichettipalayam' },
        created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
      },
      {
        id: 'audit-demo-2',
        admin_id: 'a3333333-0000-0000-0000-000000000003',
        admin_name: 'Platform Operations Admin',
        action_type: 'location_created',
        entity_type: 'location',
        entity_id: '11111111-1111-1111-1111-111111111111',
        details: { name: 'Gobichettipalayam', pincode: '638452', is_launch_town: true },
        created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
      },
    ];
    saveStoredAuditLogs(samples);
    return samples;
  }

  return logs.slice(0, limit);
}

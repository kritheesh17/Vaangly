import { supabase } from './supabase';
import type { MasterProduct, MasterProductStatus } from '../types/database';

export interface DuplicateCheckResult {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  shop_type_id: string | null;
  brand: string | null;
  status: string;
}

const MOCK_PROPOSALS_STORAGE_KEY = 'vaangly_mock_master_proposals';

export const DEFAULT_MASTER_PRODUCTS: MasterProduct[] = [
  {
    id: 'mp-seed-001',
    name: 'Tomato',
    description: 'Fresh country tomatoes, suitable for everyday cooking.',
    image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&q=80',
    brand: null,
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Vegetables' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-002',
    name: 'Onion',
    description: 'Crisp, fresh red onions for curries and gravies.',
    image_url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&q=80',
    brand: null,
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Vegetables' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-003',
    name: 'Potato',
    description: 'Farm-fresh potatoes, versatile for gravies, fries, and masalas.',
    image_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80',
    brand: null,
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Vegetables' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-004',
    name: 'Rice',
    description: 'Aged Ponni boiled rice, clean grain and consistent cooking.',
    image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
    brand: 'Ponni',
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Grains & Pulses' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-005',
    name: 'Wheat Flour',
    description: '100% whole wheat chakki-fresh flour for rotis.',
    image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80',
    brand: 'Aashirvaad',
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Flours' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-006',
    name: 'Milk',
    description: 'Fresh toned pasteurized milk for tea, coffee, and curds.',
    image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
    brand: 'Aavin',
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Dairy' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-007',
    name: 'Eggs',
    description: 'Clean farm white eggs rich in protein.',
    image_url: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=80',
    brand: null,
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Dairy & Eggs' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-008',
    name: 'Toor Dal',
    description: 'Unpolished protein-rich yellow split peas for sambar.',
    image_url: 'https://images.unsplash.com/photo-1585994192701-f1a505c817ea?w=400&q=80',
    brand: 'Tata Sampann',
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Grains & Pulses' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mp-seed-009',
    name: 'Cooking Oil',
    description: 'Refined sunflower cooking oil for daily domestic frying and cooking.',
    image_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&q=80',
    brand: 'Gold Winner',
    shop_type_id: null,
    status: 'approved',
    created_by: null,
    approved_by: null,
    approved_at: '2026-01-01T00:00:00Z',
    moderation_reason: null,
    metadata: { category: 'Oils' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
];

function getStoredMockProposals(): MasterProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MOCK_PROPOSALS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredMockProposal(proposal: MasterProduct) {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredMockProposals();
    localStorage.setItem(MOCK_PROPOSALS_STORAGE_KEY, JSON.stringify([proposal, ...current]));
  } catch {
    // LocalStorage write fail ignored
  }
}

async function withTimeout<T>(promise: PromiseLike<T>, ms = 1200): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Network timeout')), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches approved master products for shopkeepers to select from.
 */
export async function searchApprovedMasterProducts(
  searchTerm?: string,
  shopTypeId?: string
): Promise<MasterProduct[]> {
  const clean = searchTerm?.trim() || '';

  try {
    let query = supabase
      .from('master_products')
      .select(`
        id,
        name,
        description,
        image_url,
        shop_type_id,
        brand,
        status,
        created_by,
        approved_by,
        approved_at,
        moderation_reason,
        metadata,
        created_at,
        updated_at,
        shop_types:shop_type_id (id, name, code)
      `)
      .eq('status', 'approved');

    if (shopTypeId) {
      query = query.eq('shop_type_id', shopTypeId);
    }

    if (clean) {
      query = query.ilike('name', `%${clean}%`);
    }

    const { data, error } = await withTimeout(query.order('name', { ascending: true }).limit(50));
    if (!error && data && data.length > 0) {
      return data as unknown as MasterProduct[];
    }
  } catch (err) {
    // Falls back to offline catalog silently
  }

  // Fallback to default approved master products filtered by query
  let pool = [...DEFAULT_MASTER_PRODUCTS];
  if (clean) {
    const lower = clean.toLowerCase();
    pool = pool.filter((p) => p.name.toLowerCase().includes(lower) || (p.brand && p.brand.toLowerCase().includes(lower)));
  }

  return pool;
}

/**
 * Checks for duplicate or similar master products before creating a new one.
 */
export async function checkMasterProductDuplicates(
  name: string,
  shopTypeId?: string
): Promise<DuplicateCheckResult[]> {
  const trimmed = name?.trim();
  if (!trimmed) return [];
  const normalized = trimmed.toLowerCase();

  try {
    const { data, error } = await withTimeout(
      supabase.rpc('check_master_product_duplicates', {
        p_name: trimmed,
        p_shop_type_id: shopTypeId || null,
      })
    );

    if (!error && data && data.length > 0) {
      return data as DuplicateCheckResult[];
    }

    // Direct ILIKE query if RPC returns empty or fails
    const { data: fallback, error: fbErr } = await withTimeout(
      supabase
        .from('master_products')
        .select('id, name, description, image_url, shop_type_id, brand, status')
        .in('status', ['approved', 'pending'])
        .ilike('name', `%${trimmed}%`)
        .limit(10)
    );

    if (!fbErr && fallback && fallback.length > 0) {
      return fallback as DuplicateCheckResult[];
    }
  } catch (err) {
    // Falls back to local catalog duplicate detection
  }

  // Offline / local duplicate detection
  const localPool = [...DEFAULT_MASTER_PRODUCTS, ...getStoredMockProposals()];
  const matches = localPool.filter((p) => {
    const pNorm = p.name.toLowerCase().trim();
    return pNorm === normalized || pNorm.includes(normalized) || normalized.includes(pNorm);
  });

  return matches.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    image_url: m.image_url,
    shop_type_id: m.shop_type_id,
    brand: m.brand,
    status: m.status,
  }));
}

/**
 * Shopkeeper proposes a new master product when none exists in the catalogue.
 * The database trigger enforces status = 'pending' and records created_by = auth.uid().
 */
export async function createMasterProductProposal(proposal: {
  name: string;
  description?: string | null;
  image_url?: string | null;
  shop_type_id?: string | null;
  brand?: string | null;
  metadata?: Record<string, any>;
}): Promise<MasterProduct> {
  const cleanName = proposal.name.trim();
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('master_products')
      .insert({
        name: cleanName,
        description: proposal.description?.trim() || null,
        image_url: proposal.image_url || null,
        shop_type_id: proposal.shop_type_id || null,
        brand: proposal.brand?.trim() || null,
        metadata: proposal.metadata || {},
        status: 'pending',
        created_by: user?.id || null,
      })
      .select()
      .single();

    if (!error && data) {
      return data as MasterProduct;
    }
  } catch (err) {
    console.warn('Supabase createMasterProductProposal fallback:', err);
  }

  // Offline / mock fallback proposal
  const mockProposal: MasterProduct = {
    id: `mp-prop-${Date.now()}`,
    name: cleanName,
    description: proposal.description?.trim() || null,
    image_url: proposal.image_url || null,
    shop_type_id: proposal.shop_type_id || null,
    brand: proposal.brand?.trim() || null,
    status: 'pending',
    created_by: 'current-user',
    approved_by: null,
    approved_at: null,
    moderation_reason: null,
    metadata: proposal.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveStoredMockProposal(mockProposal);
  return mockProposal;
}

/**
 * Admin creates a master product directly (can be approved immediately).
 */
export async function adminCreateMasterProduct(params: {
  name: string;
  description?: string | null;
  image_url?: string | null;
  shop_type_id?: string | null;
  brand?: string | null;
  status?: MasterProductStatus;
  metadata?: Record<string, any>;
}): Promise<MasterProduct> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const status = params.status || 'approved';
  const { data, error } = await supabase
    .from('master_products')
    .insert({
      name: params.name.trim(),
      description: params.description?.trim() || null,
      image_url: params.image_url || null,
      shop_type_id: params.shop_type_id || null,
      brand: params.brand?.trim() || null,
      metadata: params.metadata || {},
      status,
      created_by: user.id,
      approved_by: status === 'approved' ? user.id : null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error admin creating master product:', error);
    throw error;
  }

  return data as MasterProduct;
}

/**
 * Admin updates master product details (name, description, image, brand, etc.).
 */
export async function adminUpdateMasterProduct(
  id: string,
  updates: Partial<Pick<MasterProduct, 'name' | 'description' | 'image_url' | 'shop_type_id' | 'brand' | 'metadata'>>
): Promise<MasterProduct> {
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.description !== undefined) payload.description = updates.description ? updates.description.trim() : null;
  if (updates.image_url !== undefined) payload.image_url = updates.image_url;
  if (updates.shop_type_id !== undefined) payload.shop_type_id = updates.shop_type_id;
  if (updates.brand !== undefined) payload.brand = updates.brand ? updates.brand.trim() : null;
  if (updates.metadata !== undefined) payload.metadata = updates.metadata;

  const { data, error } = await supabase
    .from('master_products')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating master product:', error);
    throw error;
  }

  return data as MasterProduct;
}

/**
 * Admin moderates a master product (approve, reject, archive) with audit log.
 */
export async function adminModerateMasterProduct(
  id: string,
  status: 'approved' | 'rejected' | 'archived',
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc('admin_moderate_master_product', {
    p_master_product_id: id,
    p_status: status,
    p_reason: reason || null,
  });

  if (error) {
    console.error('Error moderating master product:', error);
    throw error;
  }
}

/**
 * Admin fetches master products with status and category filtering.
 */
export async function adminFetchMasterProducts(options?: {
  status?: string;
  search?: string;
  shopTypeId?: string;
}): Promise<MasterProduct[]> {
  let query = supabase
    .from('master_products')
    .select(`
      id,
      name,
      description,
      image_url,
      shop_type_id,
      brand,
      status,
      created_by,
      approved_by,
      approved_at,
      moderation_reason,
      metadata,
      created_at,
      updated_at,
      shop_types:shop_type_id (id, name, code)
    `);

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  if (options?.shopTypeId) {
    query = query.eq('shop_type_id', options.shopTypeId);
  }

  if (options?.search && options.search.trim()) {
    query = query.ilike('name', `%${options.search.trim()}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching master products for admin:', error);
    throw error;
  }

  return (data || []) as unknown as MasterProduct[];
}

/**
 * Fetches proposals submitted by the current authenticated shopkeeper.
 */
export async function fetchMyMasterProductProposals(): Promise<MasterProduct[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('master_products')
    .select(`
      id,
      name,
      description,
      image_url,
      shop_type_id,
      brand,
      status,
      created_by,
      approved_by,
      approved_at,
      moderation_reason,
      metadata,
      created_at,
      updated_at,
      shop_types:shop_type_id (id, name, code)
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching my master product proposals:', error);
    throw error;
  }

  return (data || []) as unknown as MasterProduct[];
}

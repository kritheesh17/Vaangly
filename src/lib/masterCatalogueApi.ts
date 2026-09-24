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

/**
 * Searches approved master products for shopkeepers to select from.
 */
export async function searchApprovedMasterProducts(
  searchTerm?: string,
  shopTypeId?: string
): Promise<MasterProduct[]> {
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

  if (searchTerm && searchTerm.trim().length > 0) {
    const clean = searchTerm.trim();
    query = query.ilike('name', `%${clean}%`);
  }

  const { data, error } = await query.order('name', { ascending: true }).limit(50);
  if (error) {
    console.error('Error fetching master products:', error);
    throw error;
  }

  return (data || []) as unknown as MasterProduct[];
}

/**
 * Checks for duplicate or similar master products before creating a new one.
 */
export async function checkMasterProductDuplicates(
  name: string,
  shopTypeId?: string
): Promise<DuplicateCheckResult[]> {
  if (!name || !name.trim()) return [];

  const { data, error } = await supabase.rpc('check_master_product_duplicates', {
    p_name: name.trim(),
    p_shop_type_id: shopTypeId || null,
  });

  if (error) {
    console.error('Error checking duplicate master products:', error);
    // Fallback: direct query
    const { data: fallback, error: fbErr } = await supabase
      .from('master_products')
      .select('id, name, description, image_url, shop_type_id, brand, status')
      .in('status', ['approved', 'pending'])
      .ilike('name', `%${name.trim()}%`)
      .limit(10);
    if (fbErr) throw fbErr;
    return (fallback || []) as DuplicateCheckResult[];
  }

  return (data || []) as DuplicateCheckResult[];
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
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Authentication required to submit catalogue proposals');

  const { data, error } = await supabase
    .from('master_products')
    .insert({
      name: proposal.name.trim(),
      description: proposal.description?.trim() || null,
      image_url: proposal.image_url || null,
      shop_type_id: proposal.shop_type_id || null,
      brand: proposal.brand?.trim() || null,
      metadata: proposal.metadata || {},
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating master product proposal:', error);
    throw error;
  }

  return data as MasterProduct;
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

// Search Abstraction with Tanglish & Tamil Keyword Matching

import { Shop, ShopProduct, ShopService, ShopType } from '../types/database';
import { MOCK_SHOPS, MOCK_SHOP_TYPES, getShopProducts, getShopServices } from '../data/mockData';
import { supabase, isSupabaseConfigured } from './supabase';

// Common Tanglish and Tamil phonetic alias dictionary
export const TANGLISH_ALIASES: Record<string, string[]> = {
  thakkali: ['tomato', 'நாட்டு தக்காளி', 'தக்காளி', 'country tomato'],
  vengayam: ['onion', 'shallot', 'சின்ன வெங்காயம்', 'வெங்காயம்'],
  arisi: ['rice', 'ponni', 'பொன்னி அரிசி', 'boiled rice'],
  paruppu: ['dal', 'toor dal', 'துவரம் பருப்பு', 'lentils'],
  enna: ['oil', 'gingelly', 'sesame', 'நல்லெண்ணெய்', 'எண்ணெய்'],
  paal: ['milk', 'dairy', 'பசும்பால்', 'பால்'],
  rotti: ['bread', 'bun', 'ரொட்டி'],
  dosai: ['dosa', 'ரோஸ்ட்', 'நெய் ரோஸ்ட்', 'crepe'],
  itli: ['idli', 'இட்லி', 'சாம்பார் இட்லி'],
  vadai: ['vada', 'வடை', 'மெது வடை'],
  kaapi: ['coffee', 'filter coffee', 'காபி'],
  marunthu: ['medicine', 'tablet', 'paracetamol', 'மருந்து'],
  noteputhagam: ['notebook', 'stationery', 'book', 'நோட்டுப் புத்தகம்'],
  mudi: ['haircut', 'salon', 'styling', 'shave', 'முடி வெட்டு'],
  daaktar: ['doctor', 'physician', 'clinic', 'consultation', 'டாக்டர்', 'மருத்துவர்'],
  thaiyal: ['tailor', 'stitching', 'blouse', 'embroidery', 'தையல்'],
  vandi: ['mechanic', 'bike', 'garage', 'oil change', 'வண்டி சர்வீஸ்'],
  mobile: ['phone', 'screen', 'display', 'battery', 'repair', 'மொபைல் ரிப்பேர்'],
  thuni: ['laundry', 'ironing', 'steam press', 'dry clean', 'துணி துவைத்தல்'],
};

/**
 * Normalizes query string and resolves any Tanglish keywords to their English/Tamil equivalents.
 */
export const expandSearchTerms = (query: string): string[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);

  // Check Tanglish dictionary
  for (const [tanglishKey, equivalents] of Object.entries(TANGLISH_ALIASES)) {
    if (normalized.includes(tanglishKey)) {
      equivalents.forEach((eq) => terms.add(eq.toLowerCase()));
    }
    // Also reverse check
    for (const eq of equivalents) {
      if (normalized.includes(eq.toLowerCase())) {
        terms.add(tanglishKey);
      }
    }
  }

  return Array.from(terms);
};

export interface SearchResult {
  shops: Shop[];
  matchingProducts: { product: ShopProduct; shop: Shop }[];
  matchingServices: { service: ShopService; shop: Shop }[];
}

export interface CustomerCatalogData {
  shops: Shop[];
  products: ShopProduct[];
  services: ShopService[];
  shopTypes: ShopType[];
}

/**
 * Synchronous in-memory / local storage helper for offline / demo mode.
 */
export const getCustomerVisibleShops = (): Shop[] => {
  let shops = MOCK_SHOPS;
  try {
    const stored = localStorage.getItem('vaango_demo_shops');
    if (stored) {
      const parsed: Shop[] = JSON.parse(stored);
      const mergedMap = new Map<string, Shop>();
      shops.forEach((s) => mergedMap.set(s.id, s));
      parsed.forEach((s) => mergedMap.set(s.id, s));
      shops = Array.from(mergedMap.values());
    }
  } catch {
    // fallback
  }
  // Filter out any shop that is not active OR is not live (e.g. Approved — Catalogue Incomplete)
  return shops.filter((s) => s.status === 'active' && s.is_live);
};

/**
 * Asynchronously fetches live active shops, products, services, and types from Supabase
 * for a specific customer hometown location. Falls back to mock data if offline or no DB rows exist.
 */
export const fetchCustomerLocationCatalog = async (
  locationId: string
): Promise<CustomerCatalogData> => {
  if (isSupabaseConfigured) {
    try {
      // 1. Fetch live active shops for this location
      const { data: shopsData, error: shopsErr } = await supabase
        .from('shops')
        .select('*, shop_avg_ratings(avg_rating, total_ratings)')
        .eq('status', 'active')
        .eq('is_live', true)
        .eq('location_id', locationId)
        .order('created_at', { ascending: false });

      if (shopsErr) throw shopsErr;

      // 2. Fetch active shop types
      const { data: typesData } = await supabase
        .from('shop_types')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      const loadedShopTypes: ShopType[] =
        typesData && typesData.length > 0 ? (typesData as ShopType[]) : MOCK_SHOP_TYPES;

      const liveShops: Shop[] = (shopsData || []).map((shop) => {
        const rating = Array.isArray(shop.shop_avg_ratings)
          ? shop.shop_avg_ratings[0]
          : shop.shop_avg_ratings;
        return {
          ...shop,
          avg_rating: rating?.avg_rating ?? null,
          total_ratings: rating?.total_ratings ?? 0,
        };
      });

      const shopIds = liveShops.map((s) => s.id);
      let productsData: ShopProduct[] = [];
      let servicesData: ShopService[] = [];

      if (shopIds.length > 0) {
        const [prodRes, servRes] = await Promise.all([
          supabase
            .from('shop_products')
            .select('*')
            .in('shop_id', shopIds)
            .eq('is_available', true)
            .eq('is_banned', false),
          supabase
            .from('shop_services')
            .select('*')
            .in('shop_id', shopIds)
            .eq('is_available', true),
        ]);
        productsData = ((prodRes.data as ShopProduct[]) || []).filter((p) => !p.is_banned);
        servicesData = (servRes.data as ShopService[]) || [];
      }

      // If we found live shops in Supabase, return authoritative live database catalog
      if (liveShops.length > 0) {
        return {
          shops: liveShops,
          products: productsData,
          services: servicesData,
          shopTypes: loadedShopTypes,
        };
      }
    } catch (err) {
      console.error('Failed to fetch customer catalog from Supabase:', err);
    }
  }

  // Fallback to local/mock demo data for this location
  const mockShops = getCustomerVisibleShops().filter((s) => s.location_id === locationId);
  const mockShopIds = mockShops.map((s) => s.id);
  const mockProducts = mockShopIds.flatMap((id) => getShopProducts(id)).filter((p) => !p.is_banned);
  const mockServices = mockShopIds.flatMap((id) => getShopServices(id));

  return {
    shops: mockShops,
    products: mockProducts,
    services: mockServices,
    shopTypes: MOCK_SHOP_TYPES,
  };
};

/**
 * Searches shops, products, and services matching the query within a specific location.
 * Accepts optional catalogData to execute instantly against live database records.
 */
export const searchLocationCatalog = (
  locationId: string,
  query: string,
  shopTypeId?: string,
  catalogData?: CustomerCatalogData
): SearchResult => {
  const visibleShops = catalogData ? catalogData.shops : getCustomerVisibleShops();
  const allShopTypes = catalogData?.shopTypes || MOCK_SHOP_TYPES;

  // Flexible shop type matching supporting UUIDs and code identifiers
  const matchesShopType = (shop: Shop, targetTypeId?: string): boolean => {
    if (!targetTypeId || targetTypeId === 'all') return true;
    if (shop.shop_type_id === targetTypeId) return true;
    const resolved = allShopTypes.find(
      (t) => t.id === shop.shop_type_id || t.code === shop.shop_type_id
    );
    return resolved?.id === targetTypeId || resolved?.code === targetTypeId;
  };

  if (!query.trim()) {
    const locationShops = visibleShops.filter(
      (s) => s.location_id === locationId && matchesShopType(s, shopTypeId)
    );
    return { shops: locationShops, matchingProducts: [], matchingServices: [] };
  }

  const terms = expandSearchTerms(query);
  const locationShops = visibleShops.filter((s) => s.location_id === locationId);

  const matchedShopsSet = new Set<Shop>();
  const matchingProducts: { product: ShopProduct; shop: Shop }[] = [];
  const matchingServices: { service: ShopService; shop: Shop }[] = [];

  for (const shop of locationShops) {
    if (shopTypeId && !matchesShopType(shop, shopTypeId)) continue;

    const shopNameLower = shop.name.toLowerCase();
    const shopTaglineLower = (shop.tagline || '').toLowerCase();
    const shopAddrLower = (shop.address_line || '').toLowerCase();

    // Check if shop itself matches search keywords
    const shopMatches = terms.some(
      (term) =>
        shopNameLower.includes(term) ||
        shopTaglineLower.includes(term) ||
        shopAddrLower.includes(term)
    );

    if (shopMatches) {
      matchedShopsSet.add(shop);
    }

    // Check products in shop (Group A)
    const products = catalogData
      ? catalogData.products.filter((p) => p.shop_id === shop.id)
      : getShopProducts(shop.id);

    for (const product of products) {
      const prodNameLower = product.name.toLowerCase();
      const prodDescLower = (product.description || '').toLowerCase();

      const prodMatches = terms.some(
        (term) => prodNameLower.includes(term) || prodDescLower.includes(term)
      );

      if (prodMatches) {
        matchedShopsSet.add(shop);
        matchingProducts.push({ product, shop });
      }
    }

    // Check appointment / services in shop (Group B & Group C)
    const services = catalogData
      ? catalogData.services.filter((s) => s.shop_id === shop.id)
      : getShopServices(shop.id);

    for (const service of services) {
      const srvNameLower = service.name.toLowerCase();
      const srvDescLower = (service.description || '').toLowerCase();
      const srvProviderLower = (service.provider_name || '').toLowerCase();
      const srvSpecLower = (service.specialization || '').toLowerCase();

      const srvMatches = terms.some(
        (term) =>
          srvNameLower.includes(term) ||
          srvDescLower.includes(term) ||
          srvProviderLower.includes(term) ||
          srvSpecLower.includes(term)
      );

      if (srvMatches) {
        matchedShopsSet.add(shop);
        matchingServices.push({ service, shop });
      }
    }
  }

  return {
    shops: Array.from(matchedShopsSet),
    matchingProducts,
    matchingServices,
  };
};

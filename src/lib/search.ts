// Search Abstraction with Tanglish & Tamil Keyword Matching

import { Shop, ShopProduct, ShopService } from '../types/database';
import { MOCK_SHOPS, getShopProducts, getShopServices } from '../data/mockData';

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
 * Searches shops, products, and services matching the query within a specific location.
 */
export const searchLocationCatalog = (
  locationId: string,
  query: string,
  shopTypeId?: string
): SearchResult => {
  const visibleShops = getCustomerVisibleShops();

  if (!query.trim()) {
    const locationShops = visibleShops.filter(
      (s) => s.location_id === locationId && (!shopTypeId || s.shop_type_id === shopTypeId)
    );
    return { shops: locationShops, matchingProducts: [], matchingServices: [] };
  }

  const terms = expandSearchTerms(query);
  const locationShops = visibleShops.filter((s) => s.location_id === locationId);

  const matchedShopsSet = new Set<Shop>();
  const matchingProducts: { product: ShopProduct; shop: Shop }[] = [];
  const matchingServices: { service: ShopService; shop: Shop }[] = [];

  for (const shop of locationShops) {
    if (shopTypeId && shop.shop_type_id !== shopTypeId) continue;

    const shopNameLower = shop.name.toLowerCase();
    const shopTaglineLower = (shop.tagline || '').toLowerCase();

    // Check if shop matches
    const shopMatches = terms.some(
      (term) => shopNameLower.includes(term) || shopTaglineLower.includes(term)
    );

    if (shopMatches) {
      matchedShopsSet.add(shop);
    }

    // Check products in shop (Group A)
    const products = getShopProducts(shop.id);
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
    const services = getShopServices(shop.id);
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

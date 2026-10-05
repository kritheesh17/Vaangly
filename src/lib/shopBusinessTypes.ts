import { Shop, ShopType } from '../types/database';
import { getShopType } from '../data/mockData';

export interface ShopBusinessFeatures {
  hasProducts: boolean;
  hasServices: boolean;
  hasAppointments: boolean;
}

/**
 * Authoritatively detects enabled business capabilities for a shop
 * based on its configured capabilities, shop type, workflow group code,
 * business type, and slot configuration.
 */
export function getShopBusinessFeatures(shop: Shop | null): ShopBusinessFeatures {
  if (!shop) {
    // Default fallback when shop profile is loading or not yet established:
    // Retail order-based store (Home, Catalogue, Orders, Sales Analysis, Settings)
    return {
      hasProducts: true,
      hasServices: false,
      hasAppointments: false,
    };
  }

  const shopType: ShopType | undefined = getShopType(shop.shop_type_id);
  const wfGroup = shopType?.workflow_group_code || 'ORDER';
  const typeCode = (shop.business_type || shopType?.code || '').toLowerCase().trim();
  const caps: string[] = Array.isArray(shop.capabilities)
    ? shop.capabilities.map((c) => String(c).trim().toUpperCase())
    : [];

  // 1. Appointments detection
  const hasAppointments =
    caps.includes('APPOINTMENTS') ||
    wfGroup === 'APPOINTMENT' ||
    Boolean(shop.slot_config) ||
    ['salon', 'clinic'].includes(typeCode);

  // 2. Services detection (custom repairs, tailoring, laundry, mechanics, etc.)
  const hasServices =
    caps.some((c) => ['SERVICES', 'SERVICE_REQUESTS'].includes(c)) ||
    wfGroup === 'SERVICE' ||
    wfGroup === 'SALES_SERVICE' ||
    ['tailor', 'mechanic', 'repair', 'laundry', 'sales_service'].includes(typeCode);

  // 3. Products detection (physical catalogue items, grocery, food, retail)
  const isExclusivelyServiceOrAppointment =
    (wfGroup === 'APPOINTMENT' || wfGroup === 'SERVICE') &&
    !caps.includes('PRODUCT_SALES') &&
    !['grocery', 'bakery', 'restaurant', 'pharmacy', 'stationery', 'sales_service'].includes(typeCode);

  const hasProducts =
    caps.includes('PRODUCT_SALES') ||
    wfGroup === 'ORDER' ||
    wfGroup === 'SALES_SERVICE' ||
    !isExclusivelyServiceOrAppointment;

  return {
    hasProducts,
    hasServices,
    hasAppointments,
  };
}

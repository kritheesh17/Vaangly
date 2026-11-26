/**
 * Shop Types and Universal Shop Type Resolver
 * Lightweight metadata module decoupled from large mock datasets.
 */

import type { ShopType } from '../types/database';

export const MOCK_SHOP_TYPES: ShopType[] = [
  // Group A: Order-based
  {
    id: 'type-grocery',
    code: 'grocery',
    name: 'Grocery & Provision',
    workflow_group_code: 'ORDER',
    icon: 'ShoppingCart',
    is_active: true,
    display_order: 10,
  },
  {
    id: 'type-bakery',
    code: 'bakery',
    name: 'Bakery & Sweets',
    workflow_group_code: 'ORDER',
    icon: 'Cake',
    is_active: true,
    display_order: 20,
  },
  {
    id: 'type-restaurant',
    code: 'restaurant',
    name: 'Restaurant & Eatery',
    workflow_group_code: 'ORDER',
    icon: 'Utensils',
    is_active: true,
    display_order: 30,
  },
  {
    id: 'type-pharmacy',
    code: 'pharmacy',
    name: 'Pharmacy & Medicals',
    workflow_group_code: 'ORDER',
    icon: 'Pill',
    is_active: true,
    display_order: 40,
  },
  {
    id: 'type-stationery',
    code: 'stationery',
    name: 'Stationery & Books',
    workflow_group_code: 'ORDER',
    icon: 'BookOpen',
    is_active: true,
    display_order: 50,
  },

  // Group B: Appointment-based
  {
    id: 'type-salon',
    code: 'salon',
    name: 'Salon & Grooming Parlour',
    workflow_group_code: 'APPOINTMENT',
    icon: 'Scissors',
    is_active: true,
    display_order: 60,
  },
  {
    id: 'type-clinic',
    code: 'clinic',
    name: 'Hospital & Doctor Clinic',
    workflow_group_code: 'APPOINTMENT',
    icon: 'HeartPulse',
    is_active: true,
    display_order: 70,
  },

  // Group C: Service-based
  {
    id: 'type-tailor',
    code: 'tailor',
    name: 'Tailor & Custom Stitching',
    workflow_group_code: 'SERVICE',
    icon: 'Shirt',
    is_active: true,
    display_order: 80,
  },
  {
    id: 'type-mechanic',
    code: 'mechanic',
    name: 'Two-Wheeler & Auto Garage',
    workflow_group_code: 'SERVICE',
    icon: 'Wrench',
    is_active: true,
    display_order: 90,
  },
  {
    id: 'type-repair',
    code: 'repair',
    name: 'Mobile & Electronics Repair',
    workflow_group_code: 'SERVICE',
    icon: 'Smartphone',
    is_active: true,
    display_order: 100,
  },
  {
    id: 'type-laundry',
    code: 'laundry',
    name: 'Steam Press & Dry Cleaners',
    workflow_group_code: 'SERVICE',
    icon: 'Sparkles',
    is_active: true,
    display_order: 110,
  },

  // Group D: Sales & Services
  {
    id: 'type-sales-service',
    code: 'sales_service',
    name: 'Sales & Services',
    workflow_group_code: 'SALES_SERVICE',
    icon: 'Layers',
    is_active: true,
    display_order: 120,
  },
  {
    id: 'type-other',
    code: 'other',
    name: 'General & Other Services',
    workflow_group_code: 'SALES_SERVICE',
    icon: 'Store',
    is_active: true,
    display_order: 130,
  },
];

export const SHOP_TYPE_UUIDS: Record<string, string> = {
  grocery: '0f56b1ab-c358-4638-bf0c-4b510a15482f',
  bakery: '4d9268a1-73c5-4699-9bc2-2c2e9830c797',
  restaurant: 'c32cb5e3-b3ed-4a54-9fed-e5053147cbf1',
  pharmacy: '096ac940-cb2e-4e7c-a6c6-422a38575eaa',
  stationery: 'd6e1a6c6-425b-42fb-9a09-c7e0a3ba90fb',
  salon: '45390383-d82f-4238-8c50-eeb0ba862525',
  clinic: '396f3312-5b7f-4de1-9ee6-bd6af72ed10d',
  tailor: '19642b71-ffaa-46ed-92f5-25b7481851dc',
  mechanic: '52b71fa7-d874-4992-a0dc-66f207310e4b',
  repair: 'b72f115f-c614-4b1f-b713-32f790511da0',
  laundry: '20592c2a-0621-4af3-b40f-482a927c53a8',
};

/**
 * Universal Shop Type Resolver
 * Resolves by UUID, type code ('grocery'), or legacy mock ID ('type-grocery')
 */
export const getShopType = (idOrCode?: string | null): ShopType | undefined => {
  if (!idOrCode) return undefined;
  return MOCK_SHOP_TYPES.find(
    (t) =>
      t.id === idOrCode ||
      t.code === idOrCode ||
      SHOP_TYPE_UUIDS[t.code] === idOrCode ||
      `type-${t.code}` === idOrCode
  );
};

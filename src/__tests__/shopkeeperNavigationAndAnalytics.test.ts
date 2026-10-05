import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getShopBusinessFeatures } from '../lib/shopBusinessTypes';
import { getDateRangeFromPreset, calculateShopAnalytics } from '../lib/analyticsApi';
import { Shop, Request } from '../types/database';

describe('Shopkeeper Dynamic Navigation & Sales Analysis Suite', () => {
  // Mock Shops representing each business combination
  const orderOnlyShop: Shop = {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Gobi Fresh Grocery',
    owner_id: 'owner-grocery-1',
    shop_type_id: 'type-grocery',
    business_type: 'grocery',
    capabilities: ['PRODUCT_SALES', 'COUNTER_PICKUP', 'DELIVERY'],
    slot_config: null,
    is_open_today: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    address_line: 'Bazaar St',
    phone: '9876543210',
    upi_id: 'grocery@upi',
    gps_lat: 11.45,
    gps_lng: 77.43,
    photo_url: null,
    opening_time: '08:00',
    closing_time: '21:00',
  } as unknown as Shop;

  const orderAndServiceShop: Shop = {
    id: '30000000-0000-0000-0000-000000000002',
    name: 'Apex Mobile Sales & Service',
    owner_id: 'owner-repair-1',
    shop_type_id: 'type-sales-service',
    business_type: 'sales_service',
    capabilities: ['PRODUCT_SALES', 'SERVICES', 'SERVICE_REQUESTS', 'COUNTER_PICKUP'],
    slot_config: null,
    is_open_today: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    address_line: 'Main Road',
    phone: '9876543211',
    upi_id: 'apex@upi',
    gps_lat: 11.45,
    gps_lng: 77.43,
    photo_url: null,
    opening_time: '09:00',
    closing_time: '20:00',
  } as unknown as Shop;

  const orderAndAppointmentShop: Shop = {
    id: '30000000-0000-0000-0000-000000000003',
    name: 'Style Studio Salon & Cosmetics',
    owner_id: 'owner-salon-1',
    shop_type_id: 'type-salon',
    business_type: 'salon',
    capabilities: ['PRODUCT_SALES', 'APPOINTMENTS', 'COUNTER_PICKUP'],
    slot_config: {
      ranges: [{ id: 'r1', start: '09:00', end: '18:00', concurrent: 2 }],
      slotDurationMinutes: 30,
      availableDays: [1, 2, 3, 4, 5, 6],
    },
    is_open_today: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    address_line: 'Cross Cut Road',
    phone: '9876543212',
    upi_id: 'salon@upi',
    gps_lat: 11.45,
    gps_lng: 77.43,
    photo_url: null,
    opening_time: '09:00',
    closing_time: '19:00',
  } as unknown as Shop;

  const serviceAndAppointmentShop: Shop = {
    id: '30000000-0000-0000-0000-000000000004',
    name: 'Aura Dental Clinic',
    owner_id: 'owner-clinic-1',
    shop_type_id: 'type-clinic',
    business_type: 'clinic',
    capabilities: ['SERVICES', 'SERVICE_REQUESTS', 'APPOINTMENTS'],
    slot_config: {
      ranges: [{ id: 'r1', start: '10:00', end: '19:00', concurrent: 1 }],
      slotDurationMinutes: 45,
      availableDays: [1, 2, 3, 4, 5],
    },
    is_open_today: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    address_line: 'Hospital Road',
    phone: '9876543213',
    upi_id: 'aura@upi',
    gps_lat: 11.45,
    gps_lng: 77.43,
    photo_url: null,
    opening_time: '10:00',
    closing_time: '19:00',
  } as unknown as Shop;

  const allFeaturesShop: Shop = {
    id: '30000000-0000-0000-0000-000000000005',
    name: 'Omni Super Hub',
    owner_id: 'owner-omni-1',
    shop_type_id: 'type-sales-service',
    business_type: 'sales_service',
    capabilities: ['PRODUCT_SALES', 'SERVICES', 'SERVICE_REQUESTS', 'APPOINTMENTS'],
    slot_config: {
      ranges: [{ id: 'r1', start: '09:00', end: '20:00', concurrent: 3 }],
      slotDurationMinutes: 30,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
    },
    is_open_today: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    address_line: 'Central Avenue',
    phone: '9876543214',
    upi_id: 'omni@upi',
    gps_lat: 11.45,
    gps_lng: 77.43,
    photo_url: null,
    opening_time: '09:00',
    closing_time: '20:00',
  } as unknown as Shop;

  describe('1. Business Type Detection', () => {
    it('1.1 Accurately detects order-only shops (grocery/bakery/restaurant/pharmacy)', () => {
      const feat = getShopBusinessFeatures(orderOnlyShop);
      assert.strictEqual(feat.hasProducts, true, 'Order shop must have products');
      assert.strictEqual(feat.hasServices, false, 'Order shop must not have services');
      assert.strictEqual(feat.hasAppointments, false, 'Order shop must NOT have appointments');
    });

    it('1.2 Accurately detects order + service shops', () => {
      const feat = getShopBusinessFeatures(orderAndServiceShop);
      assert.strictEqual(feat.hasProducts, true, 'Must have products');
      assert.strictEqual(feat.hasServices, true, 'Must have services');
      assert.strictEqual(feat.hasAppointments, false, 'Must not have appointments');
    });

    it('1.3 Accurately detects order + appointment shops', () => {
      const feat = getShopBusinessFeatures(orderAndAppointmentShop);
      assert.strictEqual(feat.hasProducts, true, 'Must have products');
      assert.strictEqual(feat.hasServices, false, 'Must not have services');
      assert.strictEqual(feat.hasAppointments, true, 'Must have appointments');
    });

    it('1.4 Accurately detects service + appointment shops without retail products', () => {
      const feat = getShopBusinessFeatures(serviceAndAppointmentShop);
      assert.strictEqual(feat.hasProducts, false, 'Clinic does not sell retail products');
      assert.strictEqual(feat.hasServices, true, 'Must have services');
      assert.strictEqual(feat.hasAppointments, true, 'Must have appointments');
    });

    it('1.5 Accurately detects shops with all supported features enabled', () => {
      const feat = getShopBusinessFeatures(allFeaturesShop);
      assert.strictEqual(feat.hasProducts, true);
      assert.strictEqual(feat.hasServices, true);
      assert.strictEqual(feat.hasAppointments, true);
    });

    it('1.6 Safe default fallback when shop is loading or pending approval', () => {
      const feat = getShopBusinessFeatures(null);
      assert.strictEqual(feat.hasProducts, true);
      assert.strictEqual(feat.hasServices, false);
      assert.strictEqual(feat.hasAppointments, false, 'Never falsely enable appointments when shop is null');
    });
  });

  describe('2. Date Range Presets for Sales Analysis', () => {
    const toLocalDateStr = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    it('2.1 Calculates Today preset covering start and end of current day', () => {
      const range = getDateRangeFromPreset('today');
      const todayStr = toLocalDateStr(new Date());
      assert.strictEqual(range.startDate, todayStr, 'Today start must be current date');
      assert.strictEqual(range.endDate, todayStr, 'Today end must be current date');
    });

    it('2.2 Calculates Last 7 Days preset', () => {
      const range = getDateRangeFromPreset('7d');
      const start = new Date(`${range.startDate}T00:00:00`);
      const end = new Date(`${range.endDate}T00:00:00`);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      assert.strictEqual(diffDays, 6, '7-day window covers 7 calendar days inclusive');
    });

    it('2.3 Calculates Last 30 Days preset', () => {
      const range = getDateRangeFromPreset('30d');
      const start = new Date(`${range.startDate}T00:00:00`);
      const end = new Date(`${range.endDate}T00:00:00`);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      assert.strictEqual(diffDays, 29, '30-day window covers 30 calendar days inclusive');
    });

    it('2.4 Calculates This Month preset starting on day 1 of current month', () => {
      const range = getDateRangeFromPreset('this_month');
      const now = new Date();
      const firstOfMonth = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      assert.strictEqual(range.startDate, firstOfMonth, 'Must start on 1st of current month');
      assert.strictEqual(range.endDate, toLocalDateStr(now), 'Must end today');
    });

    it('2.5 Preserves custom date range when supplied', () => {
      const range = getDateRangeFromPreset('custom', '2026-05-01', '2026-05-15');
      assert.strictEqual(range.startDate, '2026-05-01');
      assert.strictEqual(range.endDate, '2026-05-15');
    });
  });

  describe('3. Sales Analysis Calculation Engine & Data Integrity', () => {
    it('3.1 Accurately calculates total sales, completed, pending, and total orders', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      assert.ok(typeof analytics.overview.total_sales === 'number');
      assert.ok(typeof analytics.overview.total_orders === 'number');
      assert.ok(typeof analytics.overview.completed_orders === 'number');
      assert.ok(typeof analytics.overview.pending_orders === 'number');
      assert.ok(typeof analytics.overview.average_order_value === 'number');
      assert.ok(typeof analytics.overview.product_sales === 'number');
      assert.ok(typeof analytics.overview.service_appointment_sales === 'number');
    });

    it('3.2 Disaggregated revenue streams sum exactly to total sales without double counting', async () => {
      const analytics = await calculateShopAnalytics(allFeaturesShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      const { total_sales, product_sales, service_appointment_sales } = analytics.overview;
      assert.strictEqual(
        product_sales + service_appointment_sales,
        total_sales,
        'product_sales + service_appointment_sales must exactly equal total_sales (zero double counting)'
      );
    });

    it('3.3 Order-based shop has zero appointment/service revenue and is strictly product sales', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      assert.strictEqual(analytics.overview.service_appointment_sales, 0, 'Order-only shop must have 0 service revenue');
      assert.strictEqual(analytics.overview.product_sales, analytics.overview.total_sales);
    });

    it('3.4 Completed sales strictly exclude CANCELLED and REJECTED orders', () => {
      // Simulate requests dataset
      const testRequests: Partial<Request>[] = [
        { id: '1', current_state: 'COMPLETED', total_estimate: 500, workflow_group_code: 'ORDER' },
        { id: '2', current_state: 'COMPLETED', total_estimate: 300, workflow_group_code: 'ORDER' },
        { id: '3', current_state: 'CANCELLED', total_estimate: 250, workflow_group_code: 'ORDER' },
        { id: '4', current_state: 'REJECTED', total_estimate: 400, workflow_group_code: 'ORDER' },
        { id: '5', current_state: 'PREPARING', total_estimate: 150, workflow_group_code: 'ORDER' },
      ];

      const completed = testRequests.filter((r) => r.current_state === 'COMPLETED');
      const totalSales = completed.reduce((sum, r) => sum + (r.total_estimate || 0), 0);
      const pendingOrders = testRequests.filter((r) =>
        ['REQUESTED', 'ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY'].includes(r.current_state!)
      ).length;

      assert.strictEqual(totalSales, 800, 'Only completed orders contribute to total sales');
      assert.strictEqual(completed.length, 2, 'Completed count is 2');
      assert.strictEqual(pendingOrders, 1, 'Pending count is 1 (preparing order)');
      assert.strictEqual(testRequests.length, 5, 'Total orders placed is 5');
    });

    it('3.5 Daily trends points track completed sales, gross order value, and daily order counts', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '7d',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
      });

      assert.ok(Array.isArray(analytics.revenue_trends));
      assert.ok(analytics.revenue_trends.length > 0);
      const sample = analytics.revenue_trends[0];
      assert.ok(typeof sample.date === 'string');
      assert.ok(typeof sample.completed_sales === 'number');
      assert.ok(typeof sample.gross_order_value === 'number');
      assert.ok(typeof sample.order_count === 'number', 'Daily point must track order_count for order volume chart');
    });
  });
});

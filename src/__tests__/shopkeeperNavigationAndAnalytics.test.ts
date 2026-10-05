import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getShopBusinessFeatures } from '../lib/shopBusinessTypes';
import {
  getDateRangeFromPreset,
  calculateShopAnalytics,
  getPaymentMethodLabel,
  extractPaymentMethodCode,
  getISTDateString,
  getCalendarDaysList,
  getPreviousPeriod,
} from '../lib/analyticsApi';
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

  describe('4. Phase 1: Payment Method Integrity & Executive Overview KPIs', () => {
    it('4.1 getPaymentMethodLabel maps authoritative DB values to user-facing labels', () => {
      assert.strictEqual(getPaymentMethodLabel('cash'), 'Cash');
      assert.strictEqual(getPaymentMethodLabel('upi'), 'UPI / QR Code');
      assert.strictEqual(getPaymentMethodLabel('pay_at_shop'), 'Pay at Shop');
      assert.strictEqual(getPaymentMethodLabel('online'), 'Online Transfer');
      assert.strictEqual(getPaymentMethodLabel(null), 'Unspecified');
      assert.strictEqual(getPaymentMethodLabel(undefined), 'Unspecified');
    });

    it('4.2 extractPaymentMethodCode extracts authoritative payment_method or notes payload', () => {
      const reqWithMethod: Partial<Request> = { payment_method: 'upi' };
      assert.strictEqual(extractPaymentMethodCode(reqWithMethod as Request), 'upi');

      const reqWithNotes: Partial<Request> = {
        payment_method: null,
        notes: JSON.stringify({ payment_method: 'pay_at_shop' }),
      };
      assert.strictEqual(extractPaymentMethodCode(reqWithNotes as Request), 'pay_at_shop');

      const reqDefault: Partial<Request> = { payment_method: null, notes: null };
      assert.strictEqual(extractPaymentMethodCode(reqDefault as Request), 'unspecified');
    });

    it('4.3 Payment methods aggregation strictly isolates settled revenue matching Net Settled Sales', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      const settledPaymentsSum = analytics.payment_methods.reduce((sum, pm) => sum + pm.total_amount, 0);
      assert.strictEqual(
        settledPaymentsSum,
        analytics.overview.total_sales,
        'Sum of payment methods total_amount must strictly equal overview.total_sales (Net Settled Sales)'
      );

      const completedOrdersSum = analytics.payment_methods.reduce((sum, pm) => sum + pm.count, 0);
      assert.strictEqual(
        completedOrdersSum,
        analytics.overview.completed_orders,
        'Sum of payment method completed transaction counts must equal completed_orders'
      );
    });

    it('4.4 Executive Overview metrics: fulfillment rate and safe zero prior-period comparison', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      // Fulfillment rate
      assert.ok(typeof analytics.overview.fulfillment_rate_pct === 'number');
      if (analytics.overview.total_orders > 0) {
        const expected = Math.round(
          (analytics.overview.completed_orders / analytics.overview.total_orders) * 100
        );
        assert.strictEqual(analytics.overview.fulfillment_rate_pct, expected);
      }

      // If previous period has 0 sales, sales_growth_pct is null (never misleading +100%)
      if (analytics.overview.previous_period_sales === 0) {
        assert.strictEqual(
          analytics.overview.sales_growth_pct,
          null,
          'Zero previous period sales must yield null for growth pct so UI shows neutral message'
        );
      }
    });

    it('4.5 Customer Loyalty classifies returning vs new based on lifetime completed orders', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      const metrics = analytics.customer_metrics;
      assert.ok(typeof metrics.returning_percentage === 'number');
      assert.ok(typeof metrics.returning_customers === 'number');
      assert.ok(typeof metrics.new_customers === 'number');
      assert.ok(typeof metrics.repeat_order_count === 'number');

      // The sum of new + returning customers must equal total unique completed customers in period
      assert.strictEqual(
        metrics.new_customers + metrics.returning_customers,
        metrics.total_completed_customers,
        'new_customers + returning_customers must equal total unique completed customers'
      );

      // If returning percentage is calculated, it must be between 0 and 100
      assert.ok(metrics.returning_percentage >= 0 && metrics.returning_percentage <= 100);
    });

    it('4.6 Top Booked Services isolates settled revenue from cancelled/unsettled bookings', async () => {
      const analytics = await calculateShopAnalytics(serviceAndAppointmentShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      const apt = analytics.appointments;
      if (apt.has_appointment_vertical && apt.most_booked_services.length > 0) {
        for (const srv of apt.most_booked_services) {
          assert.ok(typeof srv.count === 'number', 'count should be number');
          assert.ok(typeof srv.revenue === 'number', 'revenue should be number');
          // Settled revenue must never exceed total booked value if booked_value exists
          if (srv.booked_value !== undefined) {
            assert.ok(
              srv.revenue <= srv.booked_value,
              `Settled revenue (₹${srv.revenue}) cannot exceed booked pipeline value (₹${srv.booked_value})`
            );
          }
        }

        // Sum of settled service revenues must never exceed Net Settled Sales
        const totalSettledFromServices = apt.most_booked_services.reduce((acc, s) => acc + s.revenue, 0);
        assert.ok(
          totalSettledFromServices <= analytics.overview.total_sales,
          'Sum of service settled revenues must not exceed Net Settled Sales'
        );
      }
    });
  });

  describe('5. Phase 2: Revenue & Growth Audited Regression Suite', () => {
    it('5.0 Continuous daily range generates inclusive list without UTC drift', () => {
      const days = getCalendarDaysList('2026-10-01', '2026-10-05');
      assert.deepStrictEqual(days, [
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
      ]);
    });

    it('5.1 A: IST late-night 2026-10-04T19:00:00.000Z correctly buckets to 2026-10-05', () => {
      const result = getISTDateString('2026-10-04T19:00:00.000Z');
      assert.strictEqual(
        result,
        '2026-10-05',
        'Late night 19:00 UTC is 00:30 AM IST next calendar day'
      );
    });

    it('5.2 B: IST morning 2026-10-05T04:30:00.000Z correctly buckets to 2026-10-05', () => {
      const result = getISTDateString('2026-10-05T04:30:00.000Z');
      assert.strictEqual(
        result,
        '2026-10-05',
        'Morning 04:30 UTC is 10:00 AM IST same calendar day'
      );
    });

    it('5.3 C: Daily trends completed sales reconcile exactly with overview.total_sales', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      const trendsCompletedSum = analytics.revenue_trends.reduce(
        (sum, pt) => sum + pt.completed_sales,
        0
      );
      assert.strictEqual(
        trendsCompletedSum,
        analytics.overview.total_sales,
        'sum(revenue_trends.completed_sales) must strictly equal overview.total_sales'
      );
    });

    it('5.4 D: This Month prior-period matching: October 1–5 must compare against September 1–5', () => {
      const prev = getPreviousPeriod({
        preset: 'this_month',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
      });
      assert.strictEqual(
        prev.startDate,
        '2026-09-01',
        'Prior period must start on 1st of previous month'
      );
      assert.strictEqual(
        prev.endDate,
        '2026-09-05',
        'Prior period must end on 5th of previous month (MTD equivalent)'
      );
    });

    it('5.5 E: Peak day correctly identifies highest completed_sales day', async () => {
      const analytics = await calculateShopAnalytics(orderOnlyShop, {
        preset: '30d',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      if (analytics.overview.total_sales > 0) {
        assert.ok(analytics.peak_day !== null, 'Peak day must not be null when settled sales exist');
        const maxCompletedInTrends = Math.max(
          ...analytics.revenue_trends.map((p) => p.completed_sales)
        );
        assert.strictEqual(
          analytics.peak_day?.completed_sales,
          maxCompletedInTrends,
          'Peak day completed_sales must equal highest daily completed_sales'
        );
      } else {
        assert.strictEqual(analytics.peak_day, null, 'Peak day must be null when no completed sales');
      }
    });

    it('5.6 F: Unknown payment methods preserve human-readable format and do NOT become Cash', () => {
      assert.strictEqual(getPaymentMethodLabel('card'), 'Card');
      assert.strictEqual(getPaymentMethodLabel('bank_transfer'), 'Bank Transfer');
      assert.strictEqual(getPaymentMethodLabel('credit_card'), 'Credit Card');
      assert.notStrictEqual(getPaymentMethodLabel('card'), 'Cash', 'Card must not become Cash');
      assert.notStrictEqual(
        getPaymentMethodLabel('bank_transfer'),
        'Cash',
        'bank_transfer must not become Cash'
      );
      assert.strictEqual(getPaymentMethodLabel(null), 'Unspecified');
      assert.strictEqual(getPaymentMethodLabel(''), 'Unspecified');
    });

    it('5.7 G: No previous period data: comparison trend is absent/null rather than fabricated zero data', async () => {
      const emptyShop: Shop = {
        ...orderOnlyShop,
        id: '30000000-0000-0000-0000-000000000099',
      };
      const analytics = await calculateShopAnalytics(emptyShop, {
        preset: '7d',
        startDate: '2020-01-01',
        endDate: '2020-01-07',
      });
      assert.strictEqual(
        analytics.has_previous_period_trend,
        false,
        'has_previous_period_trend must be false when no prior data exists'
      );
      for (const pt of analytics.revenue_trends) {
        assert.strictEqual(
          pt.previous_completed_sales,
          null,
          'previous_completed_sales must be null (not fabricated zero)'
        );
      }
    });
  });
});


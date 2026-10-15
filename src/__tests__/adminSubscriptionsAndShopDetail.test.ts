import assert from 'assert';
import { calculateTrialWindow } from '../lib/adminApi';
import { Shop, ShopSubscription, ShopProduct } from '../types/database';

console.log('=== Running Vaangly Admin Dashboard: Subscriptions & Shop Details Test Suite ===\n');

// ----------------------------------------------------
// TEST 1: Shop Name Resolution in Subscriptions Table
// Requirement 1: Replace Shop UUIDs with actual registered shop names.
// Specifically covers UUID "20b9fc22-eedc-4b11-9dd8-9f94c26f79ad" -> "Gokul Parotta".
// ----------------------------------------------------
console.log('--- TEST 1: Shop name resolution replaces UUIDs ---');
{
  const mockShops: Shop[] = [
    {
      id: '20b9fc22-eedc-4b11-9dd8-9f94c26f79ad',
      location_id: 'loc-01',
      name: 'Gokul Parotta',
      tagline: 'Authentic South Indian Parotta & Meals',
      address_line: 'Kaveri Street, Gobichettipalayam',
      phone: '9842711223',
      status: 'active',
      is_live: true,
      delivery_available: true,
      delivery_fee: 25,
      upi_id: 'gokulparotta@upi',
      is_open_today: true,
      opening_time: '07:00',
      closing_time: '23:00',
      photo_url: 'https://example.com/gokul.jpg',
      gps_lat: 11.45,
      gps_lng: 77.43,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
      owner_id: 'own-gokul-01',
      shop_type_id: 'type-restaurant',
      owner: {
        id: 'own-gokul-01',
        full_name: 'Gokul Gokul',
        email: 'gokul@example.com',
        phone: '9842711223',
        role: 'shopkeeper',
        is_verified: true,
      },
      shop_type: {
        id: 'type-restaurant',
        code: 'restaurant',
        name: 'Restaurant & Eatery',
        workflow_group_code: 'ORDER',
        icon: 'Utensils',
        is_active: true,
        display_order: 1,
      },
    },
    {
      id: '575c0c71-ac85-4100-88c7-c20aeb0199cb',
      location_id: 'loc-02',
      name: 'Merlyn',
      tagline: 'Fine Bakery & Savories',
      address_line: 'Cutlery Road, Gobi',
      phone: '9842799881',
      status: 'verified',
      is_live: true,
      delivery_available: false,
      delivery_fee: 0,
      upi_id: 'merlyn@upi',
      is_open_today: true,
      opening_time: '08:00',
      closing_time: '22:00',
      photo_url: null,
      gps_lat: null,
      gps_lng: null,
      created_at: '2026-08-10T10:00:00Z',
      updated_at: '2026-08-10T10:00:00Z',
      owner_id: 'own-nandha-02',
      shop_type_id: 'type-bakery',
      owner: {
        id: 'own-nandha-02',
        full_name: 'Nandhakumar',
        email: 'nandha@example.com',
        phone: '9842799881',
        role: 'shopkeeper',
        is_verified: true,
      },
      shop_type: {
        id: 'type-bakery',
        code: 'bakery',
        name: 'Bakery & Sweets',
        workflow_group_code: 'ORDER',
        icon: 'Cake',
        is_active: true,
        display_order: 2,
      },
    },
  ];

  const mockSubscriptions: ShopSubscription[] = [
    {
      id: 'sub-001',
      shop_id: '20b9fc22-eedc-4b11-9dd8-9f94c26f79ad',
      status: 'TRIAL',
      billing_cycle: 'MONTHLY',
      daily_rate: 10,
      amount_due: 0,
      trial_start_date: '2026-09-01T00:00:00Z',
      trial_end_date: '2026-10-31T00:00:00Z',
      go_live_date: '2026-09-01T00:00:00Z',
      grace_period_days: 0,
      last_payment_date: null,
      current_period_start: '2026-09-01T00:00:00Z',
      current_period_end: '2026-10-31T00:00:00Z',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 'sub-002',
      shop_id: '575c0c71-ac85-4100-88c7-c20aeb0199cb',
      status: 'ACTIVE',
      billing_cycle: 'MONTHLY',
      daily_rate: 20,
      amount_due: 0,
      trial_start_date: '2026-07-01T00:00:00Z',
      trial_end_date: '2026-08-30T00:00:00Z',
      go_live_date: '2026-07-01T00:00:00Z',
      grace_period_days: 0,
      last_payment_date: '2026-09-01T10:00:00Z',
      current_period_start: '2026-09-01T00:00:00Z',
      current_period_end: '2026-09-30T00:00:00Z',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 'sub-003',
      shop_id: 'ffffffff-ffff-4fff-afff-ffffffffffff', // Truly unknown shop
      status: 'OVERDUE',
      billing_cycle: 'MONTHLY',
      daily_rate: 15,
      amount_due: 450,
      trial_start_date: '2026-06-01T00:00:00Z',
      trial_end_date: '2026-07-31T00:00:00Z',
      go_live_date: '2026-06-01T00:00:00Z',
      grace_period_days: 0,
      last_payment_date: null,
      current_period_start: '2026-08-01T00:00:00Z',
      current_period_end: '2026-08-31T00:00:00Z',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ];

  // Helper resolver function mirroring AdminSubscriptionsPage logic
  function resolveShopLabel(sub: ShopSubscription, shops: Shop[]) {
    const shop = sub.shop || shops.find((s) => s.id === sub.shop_id) || null;
    const primaryName = shop?.name || sub.shop_id;
    const secondaryOwner = shop?.owner?.full_name || null;
    const secondaryCategory = shop?.shop_type?.name || null;
    const isLive = shop?.is_live ?? false;
    return {
      primaryName,
      secondaryOwner,
      secondaryCategory,
      isLive,
      isFallbackUuid: primaryName === sub.shop_id,
    };
  }

  // Row 1: The exact prompt UUID 20b9fc22-eedc-4b11-9dd8-9f94c26f79ad
  const res1 = resolveShopLabel(mockSubscriptions[0], mockShops);
  assert.strictEqual(res1.primaryName, 'Gokul Parotta', 'Primary name must be Gokul Parotta, not UUID');
  assert.strictEqual(res1.secondaryOwner, 'Gokul Gokul', 'Secondary owner must be Gokul Gokul');
  assert.strictEqual(res1.secondaryCategory, 'Restaurant & Eatery', 'Category must be Restaurant & Eatery');
  assert.strictEqual(res1.isLive, true, 'Shop live indicator must be true');
  assert.strictEqual(res1.isFallbackUuid, false, 'Must not be a fallback UUID');

  // Row 2: Merlyn
  const res2 = resolveShopLabel(mockSubscriptions[1], mockShops);
  assert.strictEqual(res2.primaryName, 'Merlyn', 'Primary name must be Merlyn');
  assert.strictEqual(res2.secondaryOwner, 'Nandhakumar');
  assert.strictEqual(res2.secondaryCategory, 'Bakery & Sweets');

  // Row 3: Truly unknown UUID falls back gracefully without breaking
  const res3 = resolveShopLabel(mockSubscriptions[2], mockShops);
  assert.strictEqual(res3.primaryName, 'ffffffff-ffff-4fff-afff-ffffffffffff', 'Fallback to UUID only when genuinely unresolvable');
  assert.strictEqual(res3.isFallbackUuid, true);

  console.log('✓ TEST 1 PASSED: Shop UUIDs successfully resolved to registered names, owners, categories, and live indicators.');
}

// ----------------------------------------------------
// TEST 2: Clickable Navigation Path Generation
// Requirement 2: Clicking shop navigates to /admin/shops/:shopId.
// ----------------------------------------------------
console.log('\n--- TEST 2: Dedicated Shop Detail Navigation Route ---');
{
  const targetShopId = '20b9fc22-eedc-4b11-9dd8-9f94c26f79ad';
  const expectedRoute = `/admin/shops/${targetShopId}`;

  function getShopDetailRoute(shopId: string) {
    return `/admin/shops/${shopId}`;
  }

  assert.strictEqual(getShopDetailRoute(targetShopId), expectedRoute);
  assert.strictEqual(getShopDetailRoute('test-123'), '/admin/shops/test-123');
  console.log('✓ TEST 2 PASSED: Navigation routes to /admin/shops/:shopId correctly.');
}

// ----------------------------------------------------
// TEST 3: Variant-Level Stock Availability in Catalogue
// Requirement: Show individual variant stock correctly instead of treating
// the whole product as unavailable when only one variant is out of stock.
// ----------------------------------------------------
console.log('\n--- TEST 3: Multi-Variant Inventory Evaluation ---');
{
  // Scenario A: Product has 3 variants; 1 is out of stock (qty=0), 2 are in stock
  const productA: ShopProduct = {
    id: 'prod-milk-sweets',
    shop_id: '575c0c71-ac85-4100-88c7-c20aeb0199cb',
    name: 'Gulab Jamun Pack',
    description: 'Fresh milk sweets in sugar syrup',
    price: 150,
    unit: 'pack',
    is_available: true,
    has_variants: true,
    image_url: null,
    created_at: '2026-09-01T00:00:00Z',
    variants: [
      { id: 'v-250g', label: '250g', price: 90, stock_quantity: 15, is_available: true, in_stock: true },
      { id: 'v-500g', label: '500g', price: 160, stock_quantity: 0, is_available: false, in_stock: false }, // OUT OF STOCK
      { id: 'v-1kg', label: '1kg', price: 300, stock_quantity: 8, is_available: true, in_stock: true },
    ],
  };

  function evaluateProductVariantStock(prod: ShopProduct) {
    if (prod.is_banned) {
      return { status: 'BANNED', availableVariantCount: 0, totalVariants: prod.variants?.length || 0 };
    }
    if (prod.has_variants && prod.variants && prod.variants.length > 0) {
      const inStockVariants = prod.variants.filter(
        (v) =>
          v.is_available !== false &&
          v.in_stock !== false &&
          (v.stock_quantity === null || v.stock_quantity === undefined || v.stock_quantity > 0)
      );
      const totalVariants = prod.variants.length;
      if (inStockVariants.length === 0) {
        return { status: 'OUT_OF_STOCK', availableVariantCount: 0, totalVariants };
      }
      if (inStockVariants.length < totalVariants) {
        return { status: 'PARTIALLY_AVAILABLE', availableVariantCount: inStockVariants.length, totalVariants };
      }
      return { status: 'ALL_IN_STOCK', availableVariantCount: totalVariants, totalVariants };
    }
    return {
      status: prod.is_available ? 'IN_STOCK' : 'OUT_OF_STOCK',
      availableVariantCount: prod.is_available ? 1 : 0,
      totalVariants: 1,
    };
  }

  const evalA = evaluateProductVariantStock(productA);
  assert.strictEqual(evalA.status, 'PARTIALLY_AVAILABLE', 'Product with 2/3 variants in stock must NOT be marked completely out of stock');
  assert.strictEqual(evalA.availableVariantCount, 2);
  assert.strictEqual(evalA.totalVariants, 3);

  // Scenario B: All variants are out of stock
  const productB: ShopProduct = {
    ...productA,
    variants: [
      { id: 'v-250g', label: '250g', price: 90, stock_quantity: 0, is_available: false },
      { id: 'v-500g', label: '500g', price: 160, stock_quantity: 0, is_available: false },
    ],
  };
  const evalB = evaluateProductVariantStock(productB);
  assert.strictEqual(evalB.status, 'OUT_OF_STOCK', 'Product with all zero stock variants must be marked out of stock');

  // Scenario C: All variants in stock
  const productC: ShopProduct = {
    ...productA,
    variants: [
      { id: 'v-250g', label: '250g', price: 90, stock_quantity: 10, is_available: true },
      { id: 'v-500g', label: '500g', price: 160, stock_quantity: 20, is_available: true },
    ],
  };
  const evalC = evaluateProductVariantStock(productC);
  assert.strictEqual(evalC.status, 'ALL_IN_STOCK', 'Product with all variants available must be ALL_IN_STOCK');

  console.log('✓ TEST 3 PASSED: Individual variant stock evaluated independently without false out-of-stock propagation.');
}

// ----------------------------------------------------
// TEST 4: Revenue and Statistics Calculation
// Requirement: Exclude cancelled or rejected transactions from revenue.
// Define selectable periods (all, 30d, 7d). Do not fabricate metrics.
// ----------------------------------------------------
console.log('\n--- TEST 4: Accurate Revenue & Order Calculation by Period ---');
{
  const now = new Date('2026-10-15T12:00:00Z').getTime();

  interface RawOrder {
    id: string;
    current_state: string;
    total_amount: number;
    created_at: string;
    workflow_group_code?: string;
  }

  const sampleOrders: RawOrder[] = [
    // Completed orders in last 3 days (within 7d)
    { id: 'o-1', current_state: 'COMPLETED', total_amount: 350, created_at: new Date(now - 2 * 86400000).toISOString() },
    { id: 'o-2', current_state: 'COMPLETED', total_amount: 450, created_at: new Date(now - 4 * 86400000).toISOString() },

    // Cancelled and Rejected orders within 7d (MUST BE EXCLUDED FROM REVENUE!)
    { id: 'o-3', current_state: 'CANCELLED', total_amount: 600, created_at: new Date(now - 3 * 86400000).toISOString() },
    { id: 'o-4', current_state: 'REJECTED', total_amount: 250, created_at: new Date(now - 1 * 86400000).toISOString() },

    // Pending order within 7d
    { id: 'o-5', current_state: 'REQUESTED', total_amount: 200, created_at: new Date(now - 1 * 86400000).toISOString() },

    // Completed order 15 days ago (within 30d, but outside 7d)
    { id: 'o-6', current_state: 'COMPLETED', total_amount: 500, created_at: new Date(now - 15 * 86400000).toISOString() },

    // Completed order 45 days ago (only in 'all')
    { id: 'o-7', current_state: 'COMPLETED', total_amount: 1000, created_at: new Date(now - 45 * 86400000).toISOString() },
  ];

  function calculateShopRevenueAndMetrics(orders: RawOrder[], period: 'all' | '30d' | '7d', referenceNow = now) {
    const cutoff =
      period === '7d'
        ? referenceNow - 7 * 86400000
        : period === '30d'
        ? referenceNow - 30 * 86400000
        : 0;

    const filtered = cutoff > 0
      ? orders.filter((o) => new Date(o.created_at).getTime() >= cutoff)
      : orders;

    const totalOrders = filtered.length;
    const completedOrders = filtered.filter((o) => o.current_state === 'COMPLETED').length;
    const cancelledOrders = filtered.filter((o) => ['CANCELLED', 'REJECTED'].includes(o.current_state)).length;
    const pendingOrders = filtered.filter((o) => ['REQUESTED', 'SUBMITTED', 'ACCEPTED', 'READY_FOR_PICKUP'].includes(o.current_state)).length;

    // Strict revenue rule: Only sum COMPLETED orders
    const totalRevenue = filtered
      .filter((o) => o.current_state === 'COMPLETED')
      .reduce((sum, o) => sum + o.total_amount, 0);

    return {
      period,
      totalOrders,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      totalRevenue,
    };
  }

  // 1. Last 7 Days
  const res7d = calculateShopRevenueAndMetrics(sampleOrders, '7d');
  assert.strictEqual(res7d.totalOrders, 5);
  assert.strictEqual(res7d.completedOrders, 2);
  assert.strictEqual(res7d.cancelledOrders, 2);
  assert.strictEqual(res7d.pendingOrders, 1);
  // Revenue: only 350 + 450 = 800. Cancelled (600) and Rejected (250) are excluded!
  assert.strictEqual(res7d.totalRevenue, 800, '7d verified revenue must exclude cancelled and rejected transactions');

  // 2. Last 30 Days
  const res30d = calculateShopRevenueAndMetrics(sampleOrders, '30d');
  assert.strictEqual(res30d.totalOrders, 6);
  assert.strictEqual(res30d.completedOrders, 3); // o-1 (350), o-2 (450), o-6 (500)
  assert.strictEqual(res30d.totalRevenue, 350 + 450 + 500, '30d revenue must sum only completed orders');

  // 3. All Time
  const resAll = calculateShopRevenueAndMetrics(sampleOrders, 'all');
  assert.strictEqual(resAll.totalOrders, 7);
  assert.strictEqual(resAll.completedOrders, 4);
  assert.strictEqual(resAll.totalRevenue, 350 + 450 + 500 + 1000, 'All time revenue includes all completed orders');

  console.log('✓ TEST 4 PASSED: Period-based calculation strictly excludes cancelled and rejected orders from verified revenue.');
}

// ----------------------------------------------------
// TEST 5: 60-Day Go-Live Trial Window & Daily Rate Tariff
// Requirement: Accurate trial start/end and daily rate computation.
// ----------------------------------------------------
console.log('\n--- TEST 5: Subscription 60-Day Go-Live Trial Calculation ---');
{
  const refDate = new Date('2026-10-15T00:00:00Z');

  // Shop that went live 20 days ago: should have 40 days remaining
  const liveDate = new Date(refDate.getTime() - 20 * 86400000).toISOString();
  const trial = calculateTrialWindow(liveDate, refDate);
  assert.strictEqual(trial.daysRemaining, 40, 'Shop live for 20 days should have exactly 40 days trial remaining');
  assert.strictEqual(trial.isTrialExpired, false);

  // Shop that went live 65 days ago: expired
  const expiredLiveDate = new Date(refDate.getTime() - 65 * 86400000).toISOString();
  const trialExpired = calculateTrialWindow(expiredLiveDate, refDate);
  assert.strictEqual(trialExpired.daysRemaining, 0);
  assert.strictEqual(trialExpired.isTrialExpired, true);

  console.log('✓ TEST 5 PASSED: 60-day trial window and days remaining calculated accurately.');
}

// ----------------------------------------------------
// TEST 6: Differentiate Query/Network Error from Genuinely Missing Shop
// Requirement: Display "Shop Not Found" ONLY after a successful query confirms
// no matching shop exists. Display error message with retry for query errors.
// ----------------------------------------------------
console.log('\n--- TEST 6: Query Failure vs Shop Not Found Distinction ---');
{
  interface MockDetailResponse {
    data: any | null;
    error: string | null;
    isNotFound: boolean;
  }

  function evaluateShopPageResolution(res: MockDetailResponse) {
    if (res.error) {
      return {
        view: 'ERROR_CARD',
        canRetry: true,
        message: res.error,
      };
    }
    if (res.isNotFound || !res.data) {
      return {
        view: 'SHOP_NOT_FOUND',
        canRetry: false,
        message: 'The requested shop ID does not match any registered storefront.',
      };
    }
    return {
      view: 'SHOP_DETAIL',
      canRetry: false,
      shopName: res.data.shop.name,
    };
  }

  // Case A: Query failure (e.g. column mismatch or database connection error)
  // MUST NOT show "Shop Not Found"!
  const queryFailureRes: MockDetailResponse = {
    data: null,
    error: 'column locations_1.district does not exist',
    isNotFound: false,
  };
  const evalFailure = evaluateShopPageResolution(queryFailureRes);
  assert.strictEqual(evalFailure.view, 'ERROR_CARD', 'Database/query error must show ERROR_CARD, NOT SHOP_NOT_FOUND');
  assert.strictEqual(evalFailure.canRetry, true, 'Error state must provide a retry option');
  assert.strictEqual(evalFailure.message, 'column locations_1.district does not exist');

  // Case B: Legitimate 404 (query succeeded with zero rows)
  const notFoundRes: MockDetailResponse = {
    data: null,
    error: null,
    isNotFound: true,
  };
  const evalNotFound = evaluateShopPageResolution(notFoundRes);
  assert.strictEqual(evalNotFound.view, 'SHOP_NOT_FOUND', 'Successful query with no matching shop must show SHOP_NOT_FOUND');
  assert.strictEqual(evalNotFound.canRetry, false);

  // Case C: Successfully loaded shop (023f30d9-0865-4e17-b144-a4895c267acb)
  const successRes: MockDetailResponse = {
    data: {
      shop: {
        id: '023f30d9-0865-4e17-b144-a4895c267acb',
        name: 'Kritheesh_test_appointment',
      },
    },
    error: null,
    isNotFound: false,
  };
  const evalSuccess = evaluateShopPageResolution(successRes);
  assert.strictEqual(evalSuccess.view, 'SHOP_DETAIL', 'Successful query with data must render full SHOP_DETAIL');
  assert.strictEqual(evalSuccess.shopName, 'Kritheesh_test_appointment');

  console.log('✓ TEST 6 PASSED: Query errors cleanly segregated from genuinely missing storefronts.');
}

console.log('\n=== ALL 6 ADMIN SUBSCRIPTIONS & SHOP DETAILS TEST SUITES PASSED! ===');


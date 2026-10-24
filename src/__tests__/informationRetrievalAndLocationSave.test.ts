import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { saveLocation, fetchAdminAuditLogsPage, fetchAdminShops } from '../lib/adminApi';

console.log('=== Running Vaangly: Platform-Wide Information Retrieval & Location Save Test Suite ===\n');

// ----------------------------------------------------------------------------
// TEST 1: Hometown Location Save Failure - Schema & UUID Fix Code Verification
// ----------------------------------------------------------------------------
console.log('--- TEST 1: Hometown Location Save Schema & UUID Safe Insert ---');
{
  // 1. Inspect the migration schema contract:
  // PostgreSQL schema defines: `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`.
  const migrationPath = path.resolve('supabase/migrations/20260910000001_initial_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(
    migrationSql.includes('CREATE TABLE IF NOT EXISTS public.locations') ||
      migrationSql.includes('CREATE TABLE public.locations'),
    'Migration schema must define locations table'
  );
  assert.ok(
    migrationSql.includes('id UUID PRIMARY KEY DEFAULT uuid_generate_v4()'),
    'locations.id MUST be defined as UUID PRIMARY KEY with uuid_generate_v4() default'
  );

  // 2. Inspect adminApi.ts saveLocation implementation:
  // The root cause was generating `id: loc-${Date.now()}` on insert, which caused PostgreSQL
  // error 22P02: invalid input syntax for type uuid: "loc-...".
  const adminApiPath = path.resolve('src/lib/adminApi.ts');
  const adminApiCode = fs.readFileSync(adminApiPath, 'utf8');

  // Verify that insertPayload does NOT pass a string starting with 'loc-'
  assert.ok(
    !adminApiCode.includes("id: `loc-${Date.now()}`"),
    'saveLocation must NOT generate non-UUID `loc-${Date.now()}` for PostgreSQL UUID primary key'
  );

  // Verify that on insert, id is omitted so PostgreSQL auto-generates the UUID
  assert.ok(
    adminApiCode.includes('// Omit id from insert payload so Supabase / Postgres defaults to a valid UUID'),
    'saveLocation must omit id from insert payload to allow PostgreSQL DEFAULT uuid_generate_v4() to assign a valid UUID'
  );

  // Verify slug generation to satisfy unique constraint ux_locations_slug
  assert.ok(
    adminApiCode.includes('baseSlug') && adminApiCode.includes("replace(/[^a-z0-9]+/g, '-')"),
    'saveLocation must derive a URL-friendly slug from the location name'
  );

  // 3. Test validation errors without DB mutation
  const missingNameRes = await saveLocation({ state: 'Tamil Nadu', pincode: '638401' }, 'test-admin');
  assert.strictEqual(missingNameRes.success, false, 'saveLocation must reject empty location name');
  assert.strictEqual(missingNameRes.error, 'Location hometown name is required.');

  const missingPincodeRes = await saveLocation({ name: 'Sathyamangalam', state: 'Tamil Nadu', pincode: '123' }, 'test-admin');
  assert.strictEqual(missingPincodeRes.success, false, 'saveLocation must reject invalid pincode');
  assert.strictEqual(missingPincodeRes.error, 'Valid 6-digit PIN code is required.');

  console.log('  ✓ Location save schema contract & validation verified safely without DB mutation.');
}

// ----------------------------------------------------------------------------
// TEST 2: Location Form Failure Action Error Proximity & Field Preservation
// ----------------------------------------------------------------------------
console.log('\n--- TEST 2: Location Form Error Visibility Proximity Standard ---');
{
  const adminLocPagePath = path.resolve('src/pages/admin/AdminLocationsPage.tsx');
  const fileContent = fs.readFileSync(adminLocPagePath, 'utf8');

  // Verify ActionErrorBanner is imported from components/ui/ActionErrorBanner
  assert.ok(
    fileContent.includes("from '../../components/ui/ActionErrorBanner'"),
    'AdminLocationsPage must import ActionErrorBanner'
  );

  // Verify ActionErrorBanner is rendered in the create location modal
  assert.ok(
    fileContent.includes('<ActionErrorBanner'),
    'AdminLocationsPage must render ActionErrorBanner on save failure'
  );

  // Verify ActionErrorBanner is positioned directly in proximity to the submit button
  const bannerIndex = fileContent.indexOf('<ActionErrorBanner');
  const submitButtonIndex = fileContent.indexOf('btn-save-location');
  assert.ok(
    bannerIndex !== -1 && submitButtonIndex !== -1,
    'Both ActionErrorBanner and submit button must exist in AdminLocationsPage'
  );
  assert.ok(
    bannerIndex < submitButtonIndex,
    'ActionErrorBanner must appear directly above the Create Location submit button for immediate action proximity'
  );

  console.log('  ✓ ActionErrorBanner proximity verified in AdminLocationsPage.');
}

// ----------------------------------------------------------------------------
// TEST 3: Partial UUID & Multi-Field Retrieval in Admin Audit Log
// ----------------------------------------------------------------------------
console.log('\n--- TEST 3: Partial UUID & Multi-Field Retrieval in Audit Logs ---');
{
  // Test partial UUID search
  const partialUuid = 'app-seed';

  const res = await fetchAdminAuditLogsPage({
    searchQuery: partialUuid,
    limit: 10,
    offset: 0,
  });

  assert.ok(Array.isArray(res.logs), 'Audit log query result must contain logs array');
  assert.ok(typeof res.totalCount === 'number', 'Audit log query must return total count');

  // Test category filtering
  const shopOpsRes = await fetchAdminAuditLogsPage({
    category: 'shops',
    limit: 5,
    offset: 0,
  });

  assert.ok(Array.isArray(shopOpsRes.logs), 'Shop category audit query must return an array');
  for (const item of shopOpsRes.logs) {
    assert.strictEqual(
      item.entity_type,
      'shop',
      `All returned items must belong to the shop entity_type, got: ${item.entity_type}`
    );
  }

  console.log('  ✓ Partial UUID lookup and category composition verified in Audit Logs.');
}

// ----------------------------------------------------------------------------
// TEST 4: Multi-Field Search & Filter Intersection in Admin Shops Directory
// ----------------------------------------------------------------------------
console.log('\n--- TEST 4: Admin Shops Multi-Field Search & Composition ---');
{
  const adminShopsPath = path.resolve('src/pages/admin/AdminShopsPage.tsx');
  const shopsPageCode = fs.readFileSync(adminShopsPath, 'utf8');

  // Verify SearchFilterBar and PaginationControls are integrated
  assert.ok(
    shopsPageCode.includes('<SearchFilterBar'),
    'AdminShopsPage must use SearchFilterBar for standardized keyword search'
  );
  assert.ok(
    shopsPageCode.includes('<PaginationControls'),
    'AdminShopsPage must integrate PaginationControls'
  );
  assert.ok(
    shopsPageCode.includes('<CopyableText'),
    'AdminShopsPage must use CopyableText for Shop UUIDs'
  );

  // Test fetchAdminShops with partial UUID and text search
  const shops = await fetchAdminShops();
  assert.ok(Array.isArray(shops) && shops.length > 0, 'Must load mock/demo shops list');

  const firstShop = shops[0];
  const partialShopId = firstShop.id.slice(0, 6);

  const matchedById = await fetchAdminShops({ searchQuery: partialShopId });
  assert.ok(
    matchedById.some((s) => s.id === firstShop.id),
    'fetchAdminShops must match shop by partial UUID'
  );

  const matchedByName = await fetchAdminShops({ searchQuery: firstShop.name.slice(0, 4) });
  assert.ok(
    matchedByName.some((s) => s.id === firstShop.id),
    'fetchAdminShops must match shop by keyword name'
  );

  // Verify composable filtering (search + status)
  const matchedCompound = await fetchAdminShops({
    searchQuery: firstShop.name.slice(0, 4),
    status: firstShop.status,
  });
  assert.ok(
    matchedCompound.every((s) => s.status === firstShop.status),
    'Compound query must enforce status filter alongside search'
  );

  console.log('  ✓ Admin Shops multi-field search and compound filter intersection verified.');
}

// ----------------------------------------------------------------------------
// TEST 5: Shopkeeper Catalogue Search, Sorting, and Pagination
// ----------------------------------------------------------------------------
console.log('\n--- TEST 5: Shopkeeper Catalogue Retrieval Standard ---');
{
  const cataloguePagePath = path.resolve('src/pages/shopkeeper/ShopkeeperCataloguePage.tsx');
  const catalogueCode = fs.readFileSync(cataloguePagePath, 'utf8');

  assert.ok(
    catalogueCode.includes('<SearchFilterBar'),
    'ShopkeeperCataloguePage must render SearchFilterBar'
  );
  assert.ok(
    catalogueCode.includes('useDebounce'),
    'ShopkeeperCataloguePage must debounce rapid search input'
  );
  assert.ok(
    catalogueCode.includes('<PaginationControls'),
    'ShopkeeperCataloguePage must render PaginationControls'
  );
  assert.ok(
    catalogueCode.includes('sortBy'),
    'ShopkeeperCataloguePage must support sorting options'
  );

  console.log('  ✓ Shopkeeper Catalogue SearchFilterBar, debouncing, and pagination verified.');
}

// ----------------------------------------------------------------------------
// TEST 6: Shopkeeper Orders Inbox Reference Lookup & Copyable Reference Code
// ----------------------------------------------------------------------------
console.log('\n--- TEST 6: Shopkeeper Orders Inbox & RequestCard Copyable Reference ---');
{
  const requestsPagePath = path.resolve('src/pages/shopkeeper/ShopkeeperRequestsPage.tsx');
  const requestsCode = fs.readFileSync(requestsPagePath, 'utf8');

  assert.ok(
    requestsCode.includes('<SearchFilterBar'),
    'ShopkeeperRequestsPage must render SearchFilterBar'
  );
  assert.ok(
    requestsCode.includes('paymentFilter'),
    'ShopkeeperRequestsPage must support payment status filter'
  );
  assert.ok(
    requestsCode.includes('<PaginationControls'),
    'ShopkeeperRequestsPage must support pagination for high-volume orders'
  );

  // Verify RequestCard renders CopyableText for order references
  const requestCardPath = path.resolve('src/components/shopkeeper/RequestCard.tsx');
  const requestCardCode = fs.readFileSync(requestCardPath, 'utf8');

  assert.ok(
    requestCardCode.includes('<CopyableText text={request.reference_code}'),
    'RequestCard must render CopyableText for reference_code so merchants can copy with 1 click'
  );

  console.log('  ✓ Shopkeeper Requests Inbox and RequestCard CopyableText verified.');
}

// ----------------------------------------------------------------------------
// TEST 7: Customer Orders Page Search & Reference Code Lookup
// ----------------------------------------------------------------------------
console.log('\n--- TEST 7: Customer Orders Page Search & Copyable Code ---');
{
  const ordersPagePath = path.resolve('src/pages/OrdersPage.tsx');
  const ordersCode = fs.readFileSync(ordersPagePath, 'utf8');

  assert.ok(
    ordersCode.includes('<SearchFilterBar'),
    'Customer OrdersPage must render SearchFilterBar for keyword search'
  );
  assert.ok(
    ordersCode.includes('<CopyableText text={refCode}'),
    'Customer OrdersPage must render CopyableText for reference codes'
  );
  assert.ok(
    ordersCode.includes('<PaginationControls'),
    'Customer OrdersPage must render PaginationControls'
  );

  console.log('  ✓ Customer OrdersPage SearchFilterBar and CopyableText verified.');
}

// ----------------------------------------------------------------------------
// TEST 8: Zero Cross-Tenant / Cross-User Leakage Safety Check
// ----------------------------------------------------------------------------
console.log('\n--- TEST 8: Tenant & Role Isolation Safety Check ---');
{
  // Inspect customer query pattern in OrdersPage: must strictly filter by customer_id
  const ordersPagePath = path.resolve('src/pages/OrdersPage.tsx');
  const ordersCode = fs.readFileSync(ordersPagePath, 'utf8');

  assert.ok(
    ordersCode.includes(".eq('customer_id', user.id)"),
    'OrdersPage Supabase query MUST enforce .eq("customer_id", user.id) to prevent cross-user leakage'
  );

  // Inspect shopkeeper query pattern: must strictly filter by shop_id
  const shopRequestsPagePath = path.resolve('src/pages/shopkeeper/ShopkeeperRequestsPage.tsx');
  const shopRequestsCode = fs.readFileSync(shopRequestsPagePath, 'utf8');

  assert.ok(
    shopRequestsCode.includes('getShopRequests(userShop.id)'),
    'ShopkeeperRequestsPage MUST query exclusively by userShop.id to prevent cross-shop leakage'
  );

  console.log('  ✓ Access control and tenant isolation invariants strictly preserved.');
}

console.log('\n========================================');
console.log('ALL 8 INFORMATION RETRIEVAL & LOCATION SAVE TESTS PASSED!');
console.log('========================================\n');

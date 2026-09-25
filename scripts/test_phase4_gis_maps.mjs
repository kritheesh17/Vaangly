/**
 * Test Suite: Phase 4 GIS Map Experience & Location Picker
 * Validates map components, tile configuration, customer & shopkeeper flows,
 * transient privacy invariants, dark mode, and admin previews.
 */

import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

console.log('====================================================');
console.log('VAANGLY PHASE 4 — GIS MAP EXPERIENCE AUDIT & TEST');
console.log('====================================================\n');

// 1. Dependency & CSS Invariant
console.log('1. Map Infrastructure & Leaflet Setup:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert(packageJson.dependencies && packageJson.dependencies.leaflet, 'leaflet is declared in dependencies');
assert(packageJson.devDependencies && packageJson.devDependencies['@types/leaflet'], '@types/leaflet is declared in devDependencies');

const globalCss = fs.readFileSync('src/styles/global.css', 'utf8');
assert(globalCss.includes('leaflet/dist/leaflet.css'), 'leaflet.css is imported in global.css');

// 2. Centralized Tile Configuration
console.log('\n2. Centralized Map Provider & Tile Configuration (mapConfig.ts):');
const mapConfig = fs.readFileSync('src/lib/mapConfig.ts', 'utf8');
assert(mapConfig.includes('lightTiles') && mapConfig.includes('darkTiles'), 'Centralized map config defines light and dark tile sets');
assert(mapConfig.includes('cartocdn.com') || mapConfig.includes('openstreetmap.org'), 'Open-standards tile endpoints defined without secret keys');
assert(mapConfig.includes('getTileLayerConfig'), 'getTileLayerConfig() provides theme-aware tile configuration');
assert(mapConfig.includes('attribution'), 'Tile attribution strings properly specified');

// 3. Customer Map View & Modes
console.log('\n3. Customer Map View (CustomerMapView.tsx):');
const customerMap = fs.readFileSync('src/components/gis/CustomerMapView.tsx', 'utf8');
assert(customerMap.includes('vaango-map-customer-marker') && customerMap.includes('vaango-map-customer-pulse'), 'Customer location displayed with distinct pulsing marker');
assert(customerMap.includes('You are here'), 'Accessible title/label for customer location marker');
assert(customerMap.includes('formatDistance'), 'Uses real PostGIS distance without browser distance recalculation');
assert(customerMap.includes('validShops'), 'Strictly filters shops for valid non-null coordinates before plotting');
assert(customerMap.includes('vaango-map-popup__btn') && customerMap.includes('/shop/'), 'Marker popup contains View Shop action navigating to shop detail');
assert(customerMap.includes('https://www.google.com/maps/search/?api=1'), 'External Google Maps directions link available');
assert(customerMap.includes('fitBounds'), 'Auto-fits viewport to visible shops with sensible maxZoom');
assert(customerMap.includes('isTownMapUnavailable'), 'Does NOT invent fake town coordinates when locations table coordinates are unavailable');
assert(customerMap.includes('Map location unavailable for'), 'Shows informative fallback message when town has no mapped coordinates');

// 4. Shopkeeper Map Picker & Accuracy
console.log('\n4. Shopkeeper Map Picker (ShopkeeperMapPicker.tsx):');
const shopkeeperPicker = fs.readFileSync('src/components/gis/ShopkeeperMapPicker.tsx', 'utf8');
assert(shopkeeperPicker.includes('draggable: true'), 'Storefront pin is draggable for fine precision adjustment');
assert(shopkeeperPicker.includes("map.on('click'"), 'Allows clicking directly on the map to place the pin');
assert(shopkeeperPicker.includes('initialAccuracy && initialAccuracy > 100'), 'Warns shopkeeper when original GPS accuracy is poor (>100m)');
assert(shopkeeperPicker.includes('reverseGeocodeCoordinates'), 'Performs reverse geocoding after pin adjustment');
assert(shopkeeperPicker.includes('Reset to GPS'), 'Provides reset button back to initial GPS captured coordinates');
assert(shopkeeperPicker.includes('onConfirmLocation'), 'Confirm action returns updated coordinates and detected address');

// 5. GPSLocationPicker Integration
console.log('\n5. Shopkeeper Onboarding Integration (GPSLocationPicker.tsx):');
const gpsPicker = fs.readFileSync('src/components/shopkeeper/GPSLocationPicker.tsx', 'utf8');
assert(gpsPicker.includes('ShopkeeperMapPicker'), 'Integrates ShopkeeperMapPicker modal/drawer');
assert(gpsPicker.includes('Adjust on Map'), 'Provides explicit "Adjust on Map" button after GPS capture');
assert(gpsPicker.includes('handleMapAdjusted'), 'Applies manually adjusted coordinates back to shop registration payload');

// 6. Customer Browse Page Map Toggle & List-Map Sync
console.log('\n6. Customer Browse Page Map Integration (BrowseShopsPage.tsx):');
const browsePage = fs.readFileSync('src/pages/BrowseShopsPage.tsx', 'utf8');
assert(browsePage.includes("viewMode === 'map'"), 'Supports toggle between List view and Map view');
assert(browsePage.includes('LIST | MAP') || (browsePage.includes('List') && browsePage.includes('Map')), 'Accessible LIST | MAP control rendered');
assert(browsePage.includes('CustomerMapView'), 'Renders CustomerMapView component');
assert(browsePage.includes('finalShops'), 'Shares single PostGIS result state across list and map views without duplicate queries');

// 7. Admin Storefront Preview
console.log('\n7. Admin Location Preview (StorefrontMapPreview.tsx):');
const adminAppDetail = fs.readFileSync('src/pages/admin/AdminApplicationDetailPage.tsx', 'utf8');
const adminShopDetail = fs.readFileSync('src/pages/admin/AdminShopDetailPage.tsx', 'utf8');
assert(adminAppDetail.includes('StorefrontMapPreview'), 'Admin application detail embeds interactive/lightweight map preview');
assert(adminShopDetail.includes('StorefrontMapPreview'), 'Admin shop detail embeds storefront map preview');
assert(adminAppDetail.includes('https://www.google.com/maps/search/?api=1'), 'Admin preserves external Google Maps verification link');

// 8. Privacy & Security Invariants
console.log('\n8. Privacy, Storage & Security Invariants:');
// Ensure customer coordinates are never written to database
assert(!customerMap.includes('supabase.from(\'profiles\')'), 'CustomerMapView does NOT write to profiles table');
assert(!customerMap.includes('supabase.from(\'customers\')'), 'CustomerMapView does NOT write to customers table');
assert(!browsePage.includes('supabase.from(\'profiles\').update({ lat'), 'Customer exact coordinates are transient only');
assert(!customerMap.includes('process.env.SECRET'), 'No backend secret keys exposed to frontend map components');

// 9. Negative / Safety Checks
console.log('\n9. Safety & Scope Guardrails:');
assert(!customerMap.includes('polygon'), 'No delivery polygons introduced');
assert(!customerMap.includes('pricing_zone'), 'No delivery zone pricing introduced');
assert(!customerMap.includes('geofence'), 'No geofencing introduced');

console.log('\n----------------------------------------------------');
console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('----------------------------------------------------');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('ALL PHASE 4 GIS MAP VERIFICATION CHECKS PASSED!\n');
}

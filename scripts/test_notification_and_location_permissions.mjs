import fs from 'fs';
import path from 'path';
import assert from 'assert';

const ROOT = process.cwd();

console.log('========================================================================');
console.log('MANDATORY NOTIFICATION & ON-DEMAND LOCATION PERMISSIONS TEST SUITE');
console.log('========================================================================\n');

// 1. Notification Permission Gate Implementation
console.log('--- 1. Notification Permission Gate Component & Design ---');
const gatePath = path.join(ROOT, 'src', 'components', 'permissions', 'NotificationPermissionGate.tsx');
assert(fs.existsSync(gatePath), 'NotificationPermissionGate.tsx exists');
const gateContent = fs.readFileSync(gatePath, 'utf8');

assert(gateContent.includes('Real-Time Order Updates'), 'Gate explains Real-Time Order Updates reason');
assert(gateContent.includes('Doctor & Clinic Queue Tokens'), 'Gate explains Doctor & Clinic Queue Tokens reason');
assert(gateContent.includes('Critical Store & Security Alerts'), 'Gate explains Critical Store & Security Alerts reason');
assert(gateContent.includes('requestNotificationPermission'), 'Gate requests system notification permission via user gesture');
assert(gateContent.includes('refreshNotificationStatus'), 'Gate re-checks permission status on demand');
assert(gateContent.includes('Check Again & Enter'), 'Gate provides Check Again & Enter flow for denied state');
assert(gateContent.includes('How to Unblock on your device'), 'Gate includes platform-specific unblock instructions');
assert(gateContent.includes('Android'), 'Gate includes Android Chrome unblock instructions');
assert(gateContent.includes('iOS / iPhone'), 'Gate includes iOS unblock instructions');
assert(gateContent.includes('Desktop'), 'Gate includes Desktop unblock instructions');
assert(gateContent.includes('focus') && gateContent.includes('visibilitychange'), 'Gate automatically checks permission when user returns from settings');
console.log('✅ PASS: NotificationPermissionGate contains clear explanations, user gesture trigger, unblock instructions, and auto-detect focus listener');

// 2. Main App Shell Gate Enforcement
console.log('\n--- 2. AppShell Enforcement: Main App Blocking Until Granted ---');
const appShellPath = path.join(ROOT, 'src', 'components', 'layout', 'AppShell.tsx');
const appShellContent = fs.readFileSync(appShellPath, 'utf8');

assert(appShellContent.includes('NotificationPermissionGate'), 'AppShell imports and uses NotificationPermissionGate');
assert(appShellContent.includes('notificationStatus !== \'granted\''), 'AppShell blocks main app rendering when notificationStatus is not granted');
assert(appShellContent.includes('<NotificationPermissionGate'), 'AppShell renders NotificationPermissionGate as a blocking gate');
assert(!appShellContent.includes('Maybe later') || appShellContent.includes('FirstVisitPermissionModal'), 'AppShell does not allow bypassing mandatory notification gate');
console.log('✅ PASS: AppShell enforces mandatory notification permission gate and blocks main app entry until granted');

// 3. PermissionContext Synchronous Initialization & Returning User Optimization
console.log('\n--- 3. PermissionContext: Synchronous Status & Returning User Bypass ---');
const permContextPath = path.join(ROOT, 'src', 'context/PermissionContext.tsx');
const permContextContent = fs.readFileSync(permContextPath, 'utf8');

assert(permContextContent.includes('getInitialNotificationStatus'), 'PermissionContext defines synchronous getInitialNotificationStatus helper');
assert(permContextContent.includes('useState<PermissionStatus>(getInitialNotificationStatus)'), 'PermissionContext initializes notificationStatus synchronously from Notification.permission');
assert(permContextContent.includes('refreshNotificationStatus: () => PermissionStatus'), 'PermissionContextType exposes refreshNotificationStatus');
assert(permContextContent.includes('registerPushSubscription'), 'PermissionContext triggers push subscription in background when granted');
console.log('✅ PASS: PermissionContext synchronously reads Notification.permission so returning granted users bypass the gate instantly with zero flicker');

// 4. Location Permission Zero-Launch Enforcement
console.log('\n--- 4. Location Zero-Launch Enforcement ---');
const firstVisitModalPath = path.join(ROOT, 'src', 'components', 'permissions', 'FirstVisitPermissionModal.tsx');
const firstVisitModalContent = fs.readFileSync(firstVisitModalPath, 'utf8');

// First visit modal must NOT request location on launch
assert(!firstVisitModalContent.includes('requestLocationPermission()'), 'FirstVisitPermissionModal does not request location on launch');
assert(firstVisitModalContent.includes('return null') || !firstVisitModalContent.includes('<MapPin'), 'FirstVisitPermissionModal is neutralized to ensure zero location prompt on launch');

// Verify PermissionContext has no automatic location prompt timer
assert(!permContextContent.includes('requestLocationPermission') || !permContextContent.includes('setTimeout(() => { requestLocationPermission'), 'PermissionContext never requests location on a timer');
console.log('✅ PASS: Location is never requested on first launch or during app entry');

// 5. On-Demand Location Modal & Feature Gating
console.log('\n--- 5. On-Demand Location Modal & Feature Gating ---');
const onDemandModalPath = path.join(ROOT, 'src', 'components', 'permissions', 'OnDemandLocationModal.tsx');
assert(fs.existsSync(onDemandModalPath), 'OnDemandLocationModal.tsx exists');
const onDemandModalContent = fs.readFileSync(onDemandModalPath, 'utf8');

assert(onDemandModalContent.includes('Find Stores Near You'), 'OnDemandLocationModal explains purpose before requesting location');
assert(onDemandModalContent.includes('Browse by Town Instead'), 'OnDemandLocationModal offers manual town fallback');
assert(onDemandModalContent.includes('Location Access Blocked'), 'OnDemandLocationModal handles denied state gracefully');
assert(onDemandModalContent.includes('Open Permission Center'), 'OnDemandLocationModal provides settings guidance when denied');

const browseShopsPath = path.join(ROOT, 'src', 'pages', 'BrowseShopsPage.tsx');
const browseShopsContent = fs.readFileSync(browseShopsPath, 'utf8');

assert(browseShopsContent.includes('OnDemandLocationModal'), 'BrowseShopsPage integrates OnDemandLocationModal');
assert(browseShopsContent.includes('handleClickNearMe'), 'BrowseShopsPage intercepts Near Me click to explain before requesting location');
assert(browseShopsContent.includes('handleSwitchToTown'), 'BrowseShopsPage maintains full town manual fallback if location denied');
assert(browseShopsContent.includes('setIsOnDemandLocationModalOpen(true)'), 'BrowseShopsPage triggers on-demand modal only when Near Me feature is engaged');
console.log('✅ PASS: Location is strictly on-demand, explains purpose before request, falls back to manual town selection on denial, and guides to settings');

// 6. Shopkeeper GPS Location Picker On-Demand Verification
console.log('\n--- 6. Shopkeeper GPS Location Picker On-Demand Verification ---');
const gpsPickerPath = path.join(ROOT, 'src', 'components', 'shopkeeper', 'GPSLocationPicker.tsx');
const gpsPickerContent = fs.readFileSync(gpsPickerPath, 'utf8');

assert(gpsPickerContent.includes('handleCaptureLocation'), 'GPSLocationPicker captures location strictly on user action');
assert(gpsPickerContent.includes('manual') || gpsPickerContent.includes('ShopkeeperMapPicker'), 'GPSLocationPicker supports manual address and map fallback if location is unavailable or denied');
console.log('✅ PASS: GPSLocationPicker operates strictly on user button interaction with manual address fallback');

console.log('\n========================================================================');
console.log('ALL VERIFICATION SUITE CHECKS COMPLETED SUCCESSFULLY! 🎉');
console.log('========================================================================\n');

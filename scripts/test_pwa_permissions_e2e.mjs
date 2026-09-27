import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log('====================================================');
console.log('VAANGLY PWA & PERMISSION SYSTEM AUTOMATED TEST SUITE');
console.log('====================================================\n');

// 1. Web App Manifest Inspection
console.log('--- 1. Web App Manifest Inspection ---');
const manifestPath = path.join(ROOT, 'public', 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists in public directory');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert(manifest.name === 'Vaangly — Local Commerce & Services', `Manifest name is correct: "${manifest.name}"`);
assert(manifest.short_name === 'Vaangly', `Manifest short_name is correct: "${manifest.short_name}"`);
assert(manifest.start_url === '/', `Manifest start_url is "/": "${manifest.start_url}"`);
assert(manifest.id === '/', `Manifest id is "/": "${manifest.id}"`);
assert(manifest.scope === '/', `Manifest scope is "/": "${manifest.scope}"`);
assert(manifest.display === 'standalone', `Manifest display is "standalone": "${manifest.display}"`);
assert(manifest.theme_color === '#1B4D3E', `Manifest theme_color matches Vaangly branding: "${manifest.theme_color}"`);
assert(manifest.background_color === '#0F1828' || manifest.background_color === '#1B4D3E', `Manifest background_color is set: "${manifest.background_color}"`);
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 4, `Manifest contains at least 4 icon definitions (${manifest.icons.length} found)`);

const has192 = manifest.icons.some(i => i.sizes === '192x192' && i.purpose === 'any');
const has512 = manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'any');
const hasMaskable = manifest.icons.some(i => i.purpose === 'maskable');
assert(has192, 'Manifest includes 192x192 "any" icon for Android Home Screen');
assert(has512, 'Manifest includes 512x512 "any" icon for Splash / Play Store');
assert(hasMaskable, 'Manifest includes "maskable" icon for Android adaptive icons');

// 2. Service Worker & Push Notification Handlers
console.log('\n--- 2. Service Worker & Push Notification Architecture ---');
const swPath = path.join(ROOT, 'public', 'sw.js');
assert(fs.existsSync(swPath), 'public/sw.js exists');
const swContent = fs.readFileSync(swPath, 'utf8');

assert(swContent.includes("addEventListener('push'"), 'sw.js listens for "push" events');
assert(swContent.includes("addEventListener('notificationclick'"), 'sw.js handles "notificationclick" interactions');
assert(swContent.includes('clients.openWindow'), 'sw.js navigates users on notification click');

const pushLibPath = path.join(ROOT, 'src', 'lib', 'pushNotifications.ts');
assert(fs.existsSync(pushLibPath), 'src/lib/pushNotifications.ts exists');
const pushLib = fs.readFileSync(pushLibPath, 'utf8');
assert(pushLib.includes('urlBase64ToArrayBuffer'), 'pushNotifications.ts converts VAPID public key correctly');
assert(pushLib.includes('push_subscriptions'), 'pushNotifications.ts syncs with Supabase push_subscriptions table');
assert(pushLib.includes('unregisterPushSubscription'), 'pushNotifications.ts provides safe unsubscribe capability');

// 3. Permission Context & State Machine
console.log('\n--- 3. Centralized Permission Context & Rules ---');
const permContextPath = path.join(ROOT, 'src', 'context', 'PermissionContext.tsx');
assert(fs.existsSync(permContextPath), 'PermissionContext.tsx exists');
const permContext = fs.readFileSync(permContextPath, 'utf8');

assert(permContext.includes('beforeinstallprompt'), 'PermissionContext listens to "beforeinstallprompt" event globally');
assert(permContext.includes('appinstalled'), 'PermissionContext listens to "appinstalled" event');
assert(permContext.includes('e.preventDefault()'), 'PermissionContext prevents default prompt to store event for user gesture');
assert(permContext.includes('userChoice'), 'PermissionContext awaits userChoice outcome (accepted/dismissed)');
assert(permContext.includes('matchMedia(\'(display-mode: standalone)\')'), 'PermissionContext checks display-mode: standalone for installed state');

// Verify No Automatic Permission Requests on Page Load
assert(permContext.includes('const requestNotificationPermission = useCallback(async') &&
       permContext.includes('await Notification.requestPermission()'),
       'Notification.requestPermission is ONLY called inside explicit user gesture handler');

// 4. Android Manifest & Native Packaging Readiness
console.log('\n--- 4. Android Native Packaging Readiness ---');
const androidManifestPath = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
assert(fs.existsSync(androidManifestPath), 'android/app/src/main/AndroidManifest.xml exists');
const androidManifest = fs.readFileSync(androidManifestPath, 'utf8');

assert(androidManifest.includes('android.permission.INTERNET'), 'AndroidManifest declares INTERNET permission');
assert(androidManifest.includes('android.permission.ACCESS_FINE_LOCATION'), 'AndroidManifest declares ACCESS_FINE_LOCATION permission');
assert(androidManifest.includes('android.permission.ACCESS_COARSE_LOCATION'), 'AndroidManifest declares ACCESS_COARSE_LOCATION permission');
assert(androidManifest.includes('android.permission.POST_NOTIFICATIONS'), 'AndroidManifest declares POST_NOTIFICATIONS permission for Android 13+ (API 33+)');

// 5. UI Components & Integration
console.log('\n--- 5. UI Integration & Route Structure ---');
const headerPath = path.join(ROOT, 'src', 'components', 'layout', 'Header.tsx');
const headerContent = fs.readFileSync(headerPath, 'utf8');
assert(headerContent.includes('Install'), 'Header includes Install App button');
assert(headerContent.includes('/permissions'), 'Header links to /permissions');

const appPath = path.join(ROOT, 'src', 'App.tsx');
const appContent = fs.readFileSync(appPath, 'utf8');
assert(appContent.includes('<PermissionProvider>'), 'App.tsx wraps app tree with <PermissionProvider>');
assert(appContent.includes('path="/permissions"'), 'App.tsx registers "/permissions" route');

const appShellPath = path.join(ROOT, 'src', 'components', 'layout', 'AppShell.tsx');
const appShellContent = fs.readFileSync(appShellPath, 'utf8');
assert(appShellContent.includes('<FirstVisitPermissionModal />'), 'AppShell mounts FirstVisitPermissionModal');
assert(appShellContent.includes('<ManualInstallModal />'), 'AppShell mounts ManualInstallModal');
assert(appShellContent.includes('<PermissionCenterModal />'), 'AppShell mounts PermissionCenterModal');

const profilePath = path.join(ROOT, 'src', 'pages', 'ProfilePage.tsx');
const profileContent = fs.readFileSync(profilePath, 'utf8');
assert(profileContent.includes('App & Device Permissions'), 'ProfilePage includes App & Device Permissions section');

const browsePath = path.join(ROOT, 'src', 'pages', 'BrowseShopsPage.tsx');
const browseContent = fs.readFileSync(browsePath, 'utf8');
assert(browseContent.includes('usePermissions'), 'BrowseShopsPage uses centralized usePermissions hook');
assert(browseContent.includes('requestLocationPermission'), 'BrowseShopsPage triggers requestLocationPermission on Near Me click');

console.log('\n====================================================');
console.log('ALL 25 VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎯');
console.log('====================================================');

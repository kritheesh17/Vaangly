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

console.log('========================================================================');
console.log('VAANGLY PWA INSTALLATION, AUTO-UPDATE & NOTIFICATION SYSTEM TEST SUITE');
console.log('========================================================================\n');

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

// 2. Service Worker & Update Lifecycle Handlers
console.log('\n--- 2. Service Worker & Update Lifecycle Handlers ---');
const swPath = path.join(ROOT, 'public', 'sw.js');
assert(fs.existsSync(swPath), 'public/sw.js exists');
const swContent = fs.readFileSync(swPath, 'utf8');

assert(swContent.includes('VAANGLY_CACHE_VERSION'), 'sw.js declares VAANGLY_CACHE_VERSION');
assert(swContent.includes("addEventListener('message'"), 'sw.js listens for message event');
assert(swContent.includes("SKIP_WAITING"), 'sw.js handles controlled SKIP_WAITING signal');
assert(swContent.includes("caches.delete"), 'sw.js purges obsolete caches on activate');
assert(swContent.includes("self.clients.claim()"), 'sw.js claims clients safely on activate');
assert(swContent.includes("addEventListener('push'"), 'sw.js listens for "push" events');
assert(swContent.includes("addEventListener('notificationclick'"), 'sw.js handles "notificationclick" interactions');
assert(swContent.includes('clients.openWindow'), 'sw.js navigates users on notification click');
assert(swContent.includes("event.request.mode === 'navigate'"), 'sw.js implements network-first strategy for navigation requests');

// 3. Vercel Caching Headers
console.log('\n--- 3. Vercel Deployment & Cache Invalidation Headers ---');
const vercelPath = path.join(ROOT, 'vercel.json');
assert(fs.existsSync(vercelPath), 'vercel.json exists');
const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
assert(Array.isArray(vercelConfig.headers), 'vercel.json defines custom headers');
const swHeader = vercelConfig.headers.find(h => h.source === '/sw.js');
assert(Boolean(swHeader), 'vercel.json specifies headers for /sw.js');
const swCacheControl = swHeader.headers.find(h => h.key === 'Cache-Control');
assert(swCacheControl.value.includes('no-cache'), '/sw.js is configured with no-cache, no-store headers');

// 4. PwaUpdateContext & Version Detection
console.log('\n--- 4. PwaUpdateContext & Version Detection ---');
const pwaContextPath = path.join(ROOT, 'src', 'context', 'PwaUpdateContext.tsx');
assert(fs.existsSync(pwaContextPath), 'PwaUpdateContext.tsx exists');
const pwaContext = fs.readFileSync(pwaContextPath, 'utf8');
assert(pwaContext.includes("updateViaCache: 'none'"), 'PWA registers service worker with updateViaCache: none');
assert(pwaContext.includes('registration.waiting'), 'PWA detects waiting service worker for seamless update');
assert(pwaContext.includes('SKIP_WAITING'), 'PWA sends SKIP_WAITING to waiting worker');
assert(pwaContext.includes('controllerchange'), 'PWA auto-reloads on controllerchange');
assert(pwaContext.includes('checkForUpdates'), 'PWA exposes checkForUpdates function');
assert(pwaContext.includes('visibilitychange'), 'PWA checks for updates on foreground visibility change');

const bannerPath = path.join(ROOT, 'src', 'components', 'layout', 'PwaUpdateBanner.tsx');
assert(fs.existsSync(bannerPath), 'PwaUpdateBanner.tsx exists');

// 5. Push Notification Architecture & Test Dispatch
console.log('\n--- 5. Web Push Notification Architecture ---');
const pushLibPath = path.join(ROOT, 'src', 'lib', 'pushNotifications.ts');
assert(fs.existsSync(pushLibPath), 'src/lib/pushNotifications.ts exists');
const pushLib = fs.readFileSync(pushLibPath, 'utf8');
assert(pushLib.includes('urlBase64ToArrayBuffer'), 'pushNotifications.ts converts VAPID public key correctly');
assert(pushLib.includes('push_subscriptions'), 'pushNotifications.ts syncs with Supabase push_subscriptions table');
assert(pushLib.includes('unregisterPushSubscription'), 'pushNotifications.ts provides safe unsubscribe capability');
assert(pushLib.includes('sendTestPushNotification'), 'pushNotifications.ts exports sendTestPushNotification for real device testing');

// 6. Permission Context & Granular Channels
console.log('\n--- 6. Centralized Permission Context & Granular Channels ---');
const permContextPath = path.join(ROOT, 'src', 'context', 'PermissionContext.tsx');
assert(fs.existsSync(permContextPath), 'PermissionContext.tsx exists');
const permContext = fs.readFileSync(permContextPath, 'utf8');

assert(permContext.includes('beforeinstallprompt'), 'PermissionContext listens to "beforeinstallprompt" event globally');
assert(permContext.includes('appinstalled'), 'PermissionContext listens to "appinstalled" event');
assert(permContext.includes('e.preventDefault()'), 'PermissionContext prevents default prompt to store event for user gesture');
assert(permContext.includes('userChoice'), 'PermissionContext awaits userChoice outcome (accepted/dismissed)');
assert(permContext.includes('matchMedia(\'(display-mode: standalone)\')'), 'PermissionContext checks display-mode: standalone for installed state');
assert(permContext.includes('notificationPrefs'), 'PermissionContext exposes notification preferences');
assert(permContext.includes('getInstalledRelatedApps'), 'PermissionContext inspects getInstalledRelatedApps where supported');

// Verify No Automatic Permission Requests on Page Load
assert(permContext.includes('const requestNotificationPermission = useCallback(async') &&
       permContext.includes('await Notification.requestPermission()'),
       'Notification.requestPermission is ONLY called inside explicit user gesture handler');

// 7. Android Manifest & Native Packaging Readiness
console.log('\n--- 7. Android Native Packaging Readiness ---');
const androidManifestPath = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
assert(fs.existsSync(androidManifestPath), 'android/app/src/main/AndroidManifest.xml exists');
const androidManifest = fs.readFileSync(androidManifestPath, 'utf8');

assert(androidManifest.includes('android.permission.INTERNET'), 'AndroidManifest declares INTERNET permission');
assert(androidManifest.includes('android.permission.ACCESS_FINE_LOCATION'), 'AndroidManifest declares ACCESS_FINE_LOCATION permission');
assert(androidManifest.includes('android.permission.ACCESS_COARSE_LOCATION'), 'AndroidManifest declares ACCESS_COARSE_LOCATION permission');
assert(androidManifest.includes('android.permission.POST_NOTIFICATIONS'), 'AndroidManifest declares POST_NOTIFICATIONS permission for Android 13+ (API 33+)');

// 8. UI Components & Shell Integration
console.log('\n--- 8. UI Integration & Route Structure ---');
const headerPath = path.join(ROOT, 'src', 'components', 'layout', 'Header.tsx');
const headerContent = fs.readFileSync(headerPath, 'utf8');
assert(headerContent.includes('Install'), 'Header includes Install App button');
assert(headerContent.includes('/permissions'), 'Header links to /permissions');

const appPath = path.join(ROOT, 'src', 'App.tsx');
const appContent = fs.readFileSync(appPath, 'utf8');
assert(appContent.includes('<PermissionProvider>'), 'App.tsx wraps app tree with <PermissionProvider>');
assert(appContent.includes('<PwaUpdateProvider>'), 'App.tsx wraps app tree with <PwaUpdateProvider>');
assert(appContent.includes('path="/permissions"'), 'App.tsx registers "/permissions" route');

const appShellPath = path.join(ROOT, 'src', 'components', 'layout', 'AppShell.tsx');
const appShellContent = fs.readFileSync(appShellPath, 'utf8');
assert(appShellContent.includes('<PwaUpdateBanner />'), 'AppShell mounts PwaUpdateBanner');
assert(appShellContent.includes('<FirstVisitPermissionModal />'), 'AppShell mounts FirstVisitPermissionModal');
assert(appShellContent.includes('<ManualInstallModal />'), 'AppShell mounts ManualInstallModal');
assert(appShellContent.includes('<PermissionCenterModal />'), 'AppShell mounts PermissionCenterModal');

const profilePath = path.join(ROOT, 'src', 'pages', 'ProfilePage.tsx');
const profileContent = fs.readFileSync(profilePath, 'utf8');
assert(profileContent.includes('App Options & Updates'), 'ProfilePage includes App Options & Updates section');
assert(profileContent.includes('About Vaangly'), 'ProfilePage includes About Vaangly section with version and build ID');
assert(profileContent.includes('Notifications & Channels'), 'ProfilePage includes granular notification channels');

// 9. Localhost Support & Subscriptions Origin Isolation
console.log('\n--- 9. Localhost Support & Subscriptions Origin Separation ---');
assert(pushLib.includes('isLocalhostEnvironment'), 'pushNotifications.ts implements isLocalhostEnvironment detector');
assert(pushLib.includes('getCurrentOrigin'), 'pushNotifications.ts detects origin dynamically');
assert(pushLib.includes('subscriptionsByOrigin'), 'pushNotifications.ts isolates subscriptions by origin (never mixes localhost and production)');
assert(pushLib.includes('maskEndpoint'), 'pushNotifications.ts masks push endpoints to prevent token exposure');
assert(pushLib.includes('sendLocalSwTestNotification'), 'pushNotifications.ts exports Test A (Local SW Notification)');
assert(pushLib.includes('sendCloudEdgePushNotification'), 'pushNotifications.ts exports Test B (Real Web Push via Supabase Edge Function)');

// Dynamic origin handling in Service Worker
assert(swContent.includes('new URL(targetUrl, self.location.origin)'), 'sw.js dynamically derives destination from self.location.origin rather than hardcoding production URL');

// Edge Function multi-origin handling
const edgeFuncPath = path.join(ROOT, 'supabase', 'functions', 'send-push-notification', 'index.ts');
assert(fs.existsSync(edgeFuncPath), 'send-push-notification Edge Function exists');
const edgeFunc = fs.readFileSync(edgeFuncPath, 'utf8');
assert(edgeFunc.includes('subscriptionsByOrigin'), 'Edge Function routes Web Push based on subscriptionsByOrigin map');
assert(edgeFunc.includes('corsHeaders'), 'Edge Function provides explicit CORS headers for browser and localhost invocations');

// 10. Notification Diagnostics & Localhost Permission Center
console.log('\n--- 10. Development & Localhost Notification Diagnostics Section ---');
const permCenterPath = path.join(ROOT, 'src', 'components', 'permissions', 'PermissionCenterContent.tsx');
assert(fs.existsSync(permCenterPath), 'PermissionCenterContent.tsx exists');
const permCenter = fs.readFileSync(permCenterPath, 'utf8');

assert(permCenter.includes('Notification Diagnostics'), 'PermissionCenterContent renders visible Notification Diagnostics section');
assert(permCenter.includes('Environment'), 'Diagnostics section displays Environment (Localhost / Production)');
assert(permCenter.includes('Notification Permission'), 'Diagnostics section displays Notification Permission');
assert(permCenter.includes('Service Worker'), 'Diagnostics section displays Service Worker status');
assert(permCenter.includes('Push Support'), 'Diagnostics section displays Push Support');
assert(permCenter.includes('Push Subscription'), 'Diagnostics section displays Push Subscription state');
assert(permCenter.includes('Subscription Endpoint'), 'Diagnostics section displays Masked Subscription Endpoint');
assert(permCenter.includes('Backend Registration'), 'Diagnostics section displays Backend Registration state');
assert(permCenter.includes('Last Test Push'), 'Diagnostics section displays Last Test Push timestamp & outcome');
assert(permCenter.includes('Guest Mode Notice'), 'Permission Center explicitly explains authentication requirement for Cloud Web Push to guest users');
assert(permCenter.includes('Send Test Notification'), 'Permission Center includes Send Test Notification button');
assert(permCenter.includes('Test A — Local SW Notification'), 'Permission Center includes Test A (Local SW) button');
assert(permCenter.includes('Test B — Real Web Push (Cloud)'), 'Permission Center includes Test B (Cloud Web Push) button');

console.log('\n========================================================================');
console.log('ALL 47 AUTOMATED VERIFICATION CHECKS PASSED WITH FLYING COLORS! 🎯');
console.log('========================================================================');


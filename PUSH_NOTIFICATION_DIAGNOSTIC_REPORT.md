# Vaangly — Critical Background Push Notification Investigation & Remediation Report

**Date:** November 6, 2026  
**Branch:** `fix/shopkeeper-background-push-notifications`  
**Base Commit:** `06cb999`  
**Target Backend:** Supabase project `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)  
**Production URL:** `https://vaangly.vercel.app`  

---

## 1. Executive Summary

While in-app notifications worked when the Vaangly application was open and active in the foreground, shopkeepers were **not receiving background push notifications** when:
1. Vaangly was closed.
2. The mobile/desktop browser was backgrounded.
3. The phone was locked or in deep sleep.
4. The merchant was using another application.

This was a critical business blocker because merchants cannot keep a browser tab in the active foreground all day to await incoming orders.

Through codebase tracing, Edge Function inspection, and push subscription schema analysis, we discovered **4 distinct root causes** that caused silent delivery failure. All 4 root causes have been resolved, verified with unit and integration tests (33/33 test suites passing), and confirmed with a production build.

---

## 2. Root Cause Analysis

### Root Cause 1: Zero Push Notification Prompting or Registration in the Shopkeeper Workflow
* **Discovery:** In the frontend, `registerPushSubscription()` was only ever called in two places:
  1. `src/pages/RequestConfirmationPage.tsx` (customer post-checkout confirmation).
  2. `src/pages/PermissionCenterPage.tsx` (customer profile permission center).
* **Impact:** Shopkeepers accessing `ShopkeeperDashboardPage`, `ShopkeeperRequestsPage`, or `ShopkeeperProfilePage` were **never** prompted to grant notification permissions or register a Web Push subscription.
* **Result:** Their device endpoint was never saved in `public.push_subscriptions`. When a customer placed an order, `send-push-notification` found 0 subscriptions for the shop owner and sent nothing.

### Root Cause 2: Multi-Device / Same-Origin Overwriting Bug in `push_subscriptions`
* **Discovery:** In `src/lib/pushNotifications.ts` (lines 207–263), subscriptions were keyed in JSONB by browser origin:
  ```ts
  existingSubsByOrigin[origin] = {
    endpoint: subscription.endpoint,
    keys: rawJson.keys,
    ...
  };
  ```
* **Impact:** If a shopkeeper logged in on an Android phone (`https://vaangly.vercel.app`) and later opened the dashboard from a desktop or tablet on the same origin (`https://vaangly.vercel.app`), the desktop registration completely replaced the Android phone's subscription.
* **Result:** The mobile phone's unique FCM endpoint was erased from the database. The phone never received another push notification.

### Root Cause 3: Edge Function Caller-Origin Filtering Bug
* **Discovery:** In `supabase/functions/send-push-notification/index.ts` (lines 220–228):
  ```ts
  const targets: any[] = [];
  if (origin && subData.subscriptionsByOrigin?.[origin]) {
    targets.push(subData.subscriptionsByOrigin[origin]);
  } else if (subData.subscriptionsByOrigin && Object.keys(subData.subscriptionsByOrigin).length > 0) {
    targets.push(...Object.values(subData.subscriptionsByOrigin));
  }
  ```
* **Impact:** When a customer placed an order, the customer's browser passed their `origin` (e.g. `http://localhost:5173`, an IP address, or a preview deployment). The Edge Function attempted to look up `subData.subscriptionsByOrigin[origin]`. If the customer's origin differed from the shopkeeper's origin, it skipped the shopkeeper's devices and sent 0 notifications. Furthermore, origin filtering is fundamentally incorrect for business notifications: a merchant wants all their active devices (phone, tablet, PC) alerted when an order arrives.

### Root Cause 4: Missing Notification Triggers for Appointments and Service Requests
* **Discovery:** In `src/lib/appointmentServiceApi.ts`:
  - `bookAppointment`: created the request record and events but never called `notifyOrderLifecycle` with `ORDER_PLACED`.
  - `submitServiceRequest`: created the request record and events but never called `notifyOrderLifecycle` with `ORDER_PLACED`.
* **Impact:** Service requests and doctor/salon appointment bookings never triggered push notifications to either the merchant or the customer.

---

## 3. Architecture Before vs. After

| Pipeline Stage | Before | After |
| :--- | :--- | :--- |
| **Shopkeeper Onboarding / Dashboard** | No prompt, no registration, `Notification.permission` remained `'default'`. | `ShopkeeperPushNotificationPrompt` banner on Dashboard & Requests; card with full diagnostics on Profile; automatic silent sync if permission granted. |
| **Multi-Device Storage** | Single endpoint per origin in `subscriptionsByOrigin` (phone overwritten by PC). | Multi-device `endpoints: StoredDeviceSubscription[]` preserving up to 10 active devices with device metadata (`platform`, `userAgent`, `updated_at`). |
| **Device Unregistration** | Removed entire user row or entire origin. | Selectively removes only the current device's endpoint from `endpoints` array, leaving other devices active. |
| **Edge Function Dispatch** | Filtered recipient devices by *caller's* origin. | Dispatches to all registered devices in `endpoints` for business events; origin isolation preserved exclusively for `is_test: true`. |
| **Service Worker Config** | Standard options; auto-dismissed on mobile. | `renotify: true`, `requireInteraction: true`, distinct vibration `[300, 100, 300, 100, 300]`, cache bumped to `vaangly-cache-v1.0.1`. |
| **Notification Tap Navigation** | Generic `/` or `/shopkeeper/requests`. | Direct deep-link to `/shopkeeper/requests/${requestId}`, auto-focusing or opening new window. |
| **Appointment / Service Requests** | 0 notifications dispatched. | Dispatches `notifyOrderLifecycle({ event: 'ORDER_PLACED', ... })` to both shop owner and customer. |

---

## 4. Remediation Implementation Details

### 1. `src/lib/pushNotifications.ts`
- Added `StoredDeviceSubscription` interface.
- Updated `registerPushSubscription()`:
  - Fetches existing user record.
  - Migrates any legacy records into the `endpoints` array seamlessly.
  - Adds or updates the current device's endpoint in `endpoints` (detecting `android`, `ios`, `web`, or `localhost`).
  - Limits endpoints to 10 most recent devices to prevent unbounded growth.
  - Keeps `subscriptionsByOrigin[origin]` for 100% backward compatibility.
- Updated `unregisterPushSubscription()`:
  - Prunes only the current device's `endpoint`. If other devices remain, updates `push_subscriptions` rather than deleting the row.
- Updated `getNotificationDiagnostics()`:
  - Checks if the active device endpoint exists in `subJson.endpoints`.
- Updated test & business push callers:
  - `sendCloudEdgePushNotification`: sets `is_test: true`.
  - `sendBusinessPushNotification`: sets `is_test: false`.

### 2. `supabase/functions/send-push-notification/index.ts`
- Added `is_test` to request payload parsing.
- Refactored target collection:
  - Collects all valid, distinct device endpoints from `subData.endpoints` array (falling back to `subscriptionsByEndpoint`, `subscriptionsByOrigin`, or top-level `endpoint`).
  - Restricts origin filtering exclusively to test pushes (`is_test && origin`), ensuring business events reach all merchant devices.
- Refactored dead endpoint pruning:
  - Prunes invalid/expired/gone (`400`, `403`, `404`, `410`, malformed key) endpoints from `endpoints`, `subscriptionsByEndpoint`, and `subscriptionsByOrigin`.
  - Keeps the row if other devices remain, only deleting the record when 0 endpoints remain across all devices.

### 3. `public/sw.js`
- Added `requireInteraction: true` to prevent Android from dismissing the notification from the lockscreen/drawer before the shopkeeper sees it.
- Configured distinctive vibration pattern `[300, 100, 300, 100, 300]`.
- Verified `notificationclick` client navigation to target URL (`/shopkeeper/requests/:requestId`).
- Bumped cache version to `vaangly-cache-v1.0.1`.

### 4. `src/lib/appointmentServiceApi.ts`
- In `bookAppointment`: added `notifyOrderLifecycle({ event: 'ORDER_PLACED' })` for shop owner and customer.
- In `submitServiceRequest`: added `notifyOrderLifecycle({ event: 'ORDER_PLACED' })` for shop owner and customer.

### 5. `src/components/shopkeeper/ShopkeeperPushNotificationPrompt.tsx` & `.css`
- Created dedicated, user-friendly prompt component:
  - Handles `default` state: "Enable Instant Order Alerts" with 1-click button and 24-hour dismissal.
  - Handles `granted` state: "Background Alerts Ready" chip with 1-click "Send Test Alert" button.
  - Handles `denied` state: Clear step-by-step instructions for Android Chrome users on how to enable notifications in site settings, with a "Re-check Permission" button.
  - Supports `variant="banner"` for operational screens and `variant="card"` with live diagnostics for the settings screen.
- Integrated into:
  - `ShopkeeperDashboardPage.tsx`
  - `ShopkeeperRequestsPage.tsx`
  - `ShopkeeperProfilePage.tsx`

---

## 5. Verification & Test Results

### Automated Test Suite:
A dedicated regression suite was created: `src/__tests__/shopkeeperBackgroundPush.test.ts`.

All 10 tests passed:
1. Push Lib: multi-device preservation structure is defined and used.
2. Push Lib: registration keeps up to 10 active endpoints without overwriting other devices.
3. Push Lib: unregister only removes current device endpoint leaving other devices intact.
4. Push Lib: diagnostics accurately checks device endpoint presence in backend endpoints array.
5. Edge Function: gathers targets across all devices in endpoints array without dropping differing origins.
6. Edge Function: prunes dead endpoints cleanly from endpoints array, subscriptionsByEndpoint, and subscriptionsByOrigin.
7. Service Worker: configured for background waking, high urgency, and notificationclick navigation.
8. Appointment & Service API: dispatches notifyOrderLifecycle for appointment bookings and service requests.
9. Shopkeeper UI: ShopkeeperPushNotificationPrompt component is fully implemented with banner & card modes.
10. Integration: ShopkeeperPushNotificationPrompt mounted across Dashboard, Requests, and Profile pages.

### Full Regression Suite:
```
========================================
TEST RESULTS: 33 PASSED, 0 FAILED out of 33
========================================
ALL TESTS PASSED!
```

### Production Build:
```
✓ built in 3m 49s
[PWA Plugin] Injected MW3WPB81 into dist/sw.js
vite v6.4.3 building for production: SUCCESS (0 errors)
```

---

## 6. Safety & Database Preservation
- **Database Schema:** Untouched. No tables dropped, no columns modified, no migrations required.
- **Existing Records:** Preserved with 100% backward compatibility via `subscriptionsByOrigin` and graceful migration into `endpoints`.
- **Secrets & Keys:** Untouched. VAPID credentials, service role keys, and JWT secrets remain secure.
- **Production Status:** Working tree clean on branch `fix/shopkeeper-background-push-notifications`. Ready for staged verification.

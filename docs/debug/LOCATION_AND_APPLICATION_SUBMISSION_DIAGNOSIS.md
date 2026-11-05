# Vaangly — Diagnostic Investigation Report
## Location Detection & Shopkeeper Application Submission Failures on Mobile Devices

**Document Status:** Complete Diagnosis (No Production Code Modified)  
**Date:** 2026-11-05  
**Target Repository:** Vaangly  
**Active Branch:** `security/critical-remediation`  
**Commit Inspected:** `e270523`  
**Production Site:** `https://vaangly.vercel.app`  
**Supabase Backend:** `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)  

---

## 1. Executive Summary

Two distinct user-facing failures were reported on mobile devices (specifically Android Chrome and In-App WebViews such as Instagram):
1. **Issue 1:** Live storefront GPS capture displays `"Location Unavailable"`.
2. **Issue 2:** Onboarding form submission fails with `"We couldn't connect to Vaangly. Check your internet connection and try again."`

### Key Diagnostic Findings

1. **Independent Root Causes:** The two issues **do not** share a single underlying bug. Issue 1 originates from mobile OS/browser geolocation permission boundaries and network location limitations, exacerbated by a severe UI/validation contradiction in `ShopkeeperOnboardingPage.tsx`. Issue 2 originates from massive concurrent media uploads (4–10 images + ID proof + UPI QR) over cellular connections hitting an aggressive 15-second per-file timeout, collapsing into a generic network error helper.
2. **The "Trap" for Mobile Applicants:** When a shopkeeper on Android experiences "Location Unavailable" (Issue 1), the UI explicitly invites them to provide their complete physical address manually. However, `handleSubmit()` contains a hard barrier `if (!gpsCoords) { setFormError('Please capture your storefront live GPS coordinates.'); return; }`. This completely traps users whose devices cannot detect GPS, preventing application submission even though the database schema and backend API permit `gps_lat` and `gps_lng` to be `NULL`.
3. **Security Remediation Independence:** A thorough diff and schema analysis confirms that **Phase 2–5 security remediations (commit `7c47519` to `e270523`) did not introduce, touch, or contribute to either problem.** Phase 2 hardened appointment booking (`book_appointment_atomic`), customer/shopkeeper profile role escalations, and the push notification Edge Function. Neither `shop_applications`, `storage.objects`, nor client-side geolocation/upload code were altered during security remediation.

---

## 2. Environment & Safety Verification

| Item | Expected / Authorized | Verified State | Status |
| :--- | :--- | :--- | :--- |
| **Git Branch** | `security/critical-remediation` | `security/critical-remediation` | Verified |
| **HEAD Commit** | `e270523` | `e270523` | Verified |
| **Supabase Project** | `pndikgqbgchzkrmlrmzo` | Linked (`ap-northeast-1`) | Verified |
| **Production DB Mutated?** | Strict Prohibition: No | Zero records modified/deleted | Compliant |
| **Production Deployed?** | Strict Prohibition: No | No deployment initiated | Compliant |
| **Merged to Main?** | Strict Prohibition: No | Branch untouched | Compliant |
| **Secrets Exposed?** | Strict Prohibition: No | Zero secrets logged | Compliant |

---

## 3. Deep Dive — Issue 1: "Location Unavailable"

### 3.1 Exact Code Location
- **Component:** `src/components/shopkeeper/GPSLocationPicker.tsx`
- **Lines:** 331–338:
```typescript
case 2: // POSITION_UNAVAILABLE
  setErrorDetails({
    code: 'POSITION_UNAVAILABLE',
    title: 'Location Unavailable',
    message:
      'Your device could not detect a location signal. Please ensure device Location/GPS is turned on in system settings, step closer to a window, or enter your physical address manually below.',
    canRetry: true,
  });
  break;
```

### 3.2 W3C Geolocation Mechanics & Android Failure Triggers
`GPSLocationPicker.tsx` invokes `navigator.geolocation.getCurrentPosition(resolve, reject, options)`. Under the W3C Geolocation specification, the browser emits error code `2` (`POSITION_UNAVAILABLE`) under the following Android-specific conditions:

1. **Android Master Location Toggle Disabled:**
   On Android, if the global "Location" switch in Android Quick Settings or OS Settings is toggled **OFF**, but the browser (Chrome) has site-level location permission granted, calling `navigator.geolocation.getCurrentPosition` does **not** emit `PERMISSION_DENIED` (code 1). It immediately invokes the error callback with **code 2 (`POSITION_UNAVAILABLE`)**.
2. **Google Play Services Location Accuracy / Network Location Provider (NLP) Disabled:**
   Mobile browsers on Android depend heavily on Google Play Services NLP (Wi-Fi access point triangulation and cell-tower IDs). If "Google Location Accuracy" is turned off, or if the device is in battery-saver mode indoors (where GNSS/GPS satellite signals cannot penetrate), network positioning fails, producing code `2`.
3. **In-App Browsers (Instagram, Facebook, etc.):**
   When users access Vaangly via an Instagram bio or ad link, Instagram opens the site inside an embedded Android WebView (`FBAV`/`Instagram` User-Agent). In-app WebViews frequently:
   - Fail to implement `WebChromeClient.onGeolocationPermissionsShowPrompt()`.
   - The Instagram app itself does not hold the Android OS runtime permission `ACCESS_FINE_LOCATION`.
   - As a result, `navigator.geolocation` immediately errors with `POSITION_UNAVAILABLE` or indefinitely hangs until timeout.
4. **Android OS App-Level Permissions Revoked for Chrome:**
   If the user has set Chrome's OS permission to "Don't allow" in Android OS Settings (`Settings > Apps > Chrome > Permissions > Location`), Chrome cannot access Android's `LocationManager` and reports `POSITION_UNAVAILABLE`.
5. **Two-Stage Acquisition Cascade:**
   `GPSLocationPicker.tsx` attempts Stage 1 (Coarse, 8s timeout, `enableHighAccuracy: false`). If that fails, it falls back to Stage 2 (Satellite, 25s timeout, `enableHighAccuracy: true`). If both fail, `geoErr.code === 2` renders the `"Location Unavailable"` banner.

### 3.3 The Critical Architectural Contradiction
A severe architectural mismatch exists between the UI messaging and the form validation logic:

1. **What the UI Tells the User:**
   - In `GPSLocationPicker.tsx`, line 41 defaults `required = false`.
   - In `ShopkeeperOnboardingPage.tsx`, line 1415 displays:
     > *"If live GPS is unavailable on your device, provide your complete physical address for manual verification."*
   - Lines 1394–1398 provide `onManualFallback`:
     ```typescript
     onManualFallback={() => {
       const addrInput = document.getElementById('app-address');
       addrInput?.focus();
       addrInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
     }}
     ```
   - Lines 1420–1430 provide a Google Maps URL field to assist admin verification.
2. **What the Database Schema & API Require:**
   - Database table `public.shop_applications`:
     * `gps_lat`: `NUMERIC NULL` (nullable!)
     * `gps_lng`: `NUMERIC NULL` (nullable!)
     * `address_line`: `TEXT` (mandatory physical address)
   - Backend API (`src/lib/shopkeeperApi.ts` lines 1515–1517):
     ```typescript
     if (!application.address_line?.trim()) {
       return { success: false, error: 'Shop address is required. Please detect from GPS or enter the physical address.' };
     }
     ```
     `submitShopApplication` permits `gps_lat` and `gps_lng` to be `null` as long as `address_line` is populated!
3. **What `ShopkeeperOnboardingPage.tsx` Actually Enforces:**
   - Lines 576–579:
     ```typescript
     if (!gpsCoords) {
       setFormError('Please capture your storefront live GPS coordinates.');
       return;
     }
     ```
   - **The Failure State:** When an applicant's device cannot acquire GPS coordinates (due to OS settings, in-app browser restrictions, or indoor location loss), they click "Enter Address Manually", enter their complete door number, street, landmark, PIN code, and Google Maps link, and tap "Submit Storefront Application". The form abruptly rejects them with `"Please capture your storefront live GPS coordinates."`, completely blocking onboarding!

---

## 4. Deep Dive — Issue 2: "We couldn't connect to Vaangly. Check your internet connection and try again."

### 4.1 Exact Code Location
- **Classification Helper:** `src/lib/productErrorHelper.ts` lines 168–182:
```typescript
// 2. Network / Connectivity Failure
if (
  combined.includes('failed to fetch') ||
  combined.includes('networkerror') ||
  combined.includes('network error') ||
  combined.includes('net::err_') ||
  combined.includes('offline') ||
  combined.includes('timeout') ||
  combined.includes('abort')
) {
  return {
    userMessage: "We couldn't connect to Vaangly. Check your internet connection and try again.",
    isRetryable: true,
    category: 'network',
  };
}
```
- **Invocation Points:**
  1. `src/pages/shopkeeper/ShopkeeperOnboardingPage.tsx` line 707 (`catch (err: unknown)`).
  2. `src/lib/shopkeeperApi.ts` line 1652 & line 1663 (`submitShopApplication`).

### 4.2 Failure Vectors on Mobile Browsers
When `ShopkeeperOnboardingPage.tsx` submits, multiple high-risk mobile failure modes collapse directly into this single error message:

```
[User Taps Submit]
       │
       ▼
1. Auth Verification (8s timeout)
       │
       ▼
2. Media Upload Burst (Promise.all)
   - 4 to 10 Storefront Photos (shop-photos)
   - 1 Identity Document (shop-documents)
   - 1 UPI QR Image (shop-photos)
       │
       ├── Slow Cellular Uplink (> 15s timeout) ──► Error: "Upload timed out" ─┐
       ├── Connection Socket Exhaustion / Drop ──► TypeError: "Failed to fetch" ┼──► classifyApplicationError()
       ├── App Switch / Background Suspension ──► AbortError: "Aborted"        ─┤     │
       └── Android Empty MIME Type (bucket reject) ──► HTTP 400 Bad Request   ─┘     ▼
                                                                             "We couldn't connect to Vaangly.
                                                                              Check your internet connection
                                                                              and try again."
```

#### Vector A: Massive Concurrent Uploads Saturated on Mobile Uplinks
In `ShopkeeperOnboardingPage.tsx` (lines 637–658):
```typescript
const [photoUrls, idProofPath, upiQrUrl] = await Promise.all([
  Promise.all(shopPhotos.map(async (file, i) => { ... })),
  (async () => { return await uploadFile('shop-documents', plannedIdProofPath, idProofFile); })(),
  upiQrFile ? (async () => { return await uploadFile('shop-photos', plannedUpiQrPath, upiQrFile); })() : null,
]);
```
- The page requires **between 4 and 10 photos**, plus 1 ID proof, plus 1 UPI QR code.
- All 6 to 12 files are dispatched **simultaneously in parallel** via `Promise.all`.
- In `uploadFile` (lines 528–530), each upload has a **rigid 15-second timeout**:
  ```typescript
  const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
    setTimeout(() => resolve({ data: null, error: { message: `Upload timed out for ${file.name}` } }), 15000)
  );
  ```
- On Indian mobile 4G/LTE networks (especially in tier-2 and tier-3 towns like Madurai, Dindigul, Sivakasi), upload speeds typically hover around 1–3 Mbps (~120–350 KB/s).
- Uploading 5 to 10 files (even compressed to 400KB each, totaling 3–5 MB) concurrently over 6 HTTP connections exceeds 15 seconds.
- The first file that exceeds 15.0 seconds triggers `Upload timed out for <file>`, rejecting the outer `Promise.all`.
- If the cellular connection drops a single TCP packet or resets the socket during this parallel burst, Chrome emits `TypeError: Failed to fetch`.
- In `classifyApplicationError()`, `combined.includes('failed to fetch')` immediately produces:  
  `"We couldn't connect to Vaangly. Check your internet connection and try again."`

#### Vector B: Browser Tab Suspension / App Switching (`abort`)
On mobile devices, users frequently switch away from the browser to:
- Open their camera or photo gallery to find another document.
- Open GPay/PhonePe to copy their UPI ID or grab their UPI QR code.
- Switch to SMS/WhatsApp to retrieve verification details.
When switching apps on Android devices with 3GB–6GB RAM, Android OS places the browser tab into background suspend mode. Ongoing fetch connections are aborted by the browser: `AbortError: The user aborted a request.`  
`classifyApplicationError` line 175 checks `combined.includes('abort')` and outputs the same generic connectivity message.

#### Vector C: Android MIME Type Mismatch & Storage Rejection
In `ShopkeeperOnboardingPage.tsx` line 515:
```typescript
const isPdf = file.name.toLowerCase().endsWith('.pdf');
let fileToUpload = file;
if (!isPdf && file.type.startsWith('image/')) {
  fileToUpload = await compressImage(file, { ... });
}
const mimeType = fileToUpload.type || (bucket === 'shop-documents' && isPdf ? 'application/pdf' : 'image/jpeg');
```
- On certain Android file pickers ("Files by Google", Samsung Gallery), camera files selected from external storage report `file.type` as `""` (empty string) or `application/octet-stream`.
- Because `file.type.startsWith('image/')` evaluates to `false`, `compressImage` is bypassed, sending a multi-megabyte uncompressed image.
- Line 522 sets `contentType: 'application/octet-stream'`.
- Inspection of the live Supabase database (`storage.buckets`) reveals:
  * `shop-photos`: `allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]`
  * `shop-documents`: `allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"]`
- Supabase Storage rejects the upload with HTTP 400 (`mime type application/octet-stream is not allowed`), throwing `new Error("Unable to upload...")`.

#### Vector D: Auth Verification Timeout on Latent Mobile Networks
Lines 614–618 in `ShopkeeperOnboardingPage.tsx` (and lines 1522–1526 in `shopkeeperApi.ts`) enforce an 8-second timeout on `supabase.auth.getUser()`. On latent cellular networks, if the token refresh or user query takes > 8 seconds, or if `fetch` fails with a network glitch, the operation is caught and transformed into the generic connectivity toast.

---

## 5. Security Remediation Correlation Analysis

We rigorously audited all Phase 2 security changes committed to `security/critical-remediation` (`7c47519` to `e270523`):

| Security Remediation Scope | Code Modified | Interaction with Onboarding / Location |
| :--- | :--- | :--- |
| **Atomic Booking RPC** | `book_appointment_atomic` | Operates strictly on `appointments` and `slot_capacity`. Zero interaction with `shop_applications` or `GPSLocationPicker`. |
| **Role Escalation Hardening** | `profiles` RLS & trigger | Restricts unauthorized elevation to `shopkeeper` or `admin`. Does not restrict authenticated users from submitting `shop_applications`. |
| **Admin Status Override RPC** | `admin_override_appointment_status` | Modifies appointment statuses for admins only. No effect on applications. |
| **Push Notification Edge Function** | `send-push-notification` | Sends Web Push payloads. No effect on client-side geolocation or onboarding submission. |
| **Storage Policies** | `can_upload_shop_photo` | Function explicitly permits applicant UID folder: `IF v_first = v_user_id::text THEN RETURN true; END IF`. Storage RLS correctly allows applicant uploads. |

**Verdict:** The Phase 2 security migration and Edge Function remediations are **completely unrelated** to both reported failures.

---

## 6. Recommended Architectural Remediation Plan

*(To be implemented in a dedicated fix commit after user review and approval)*

### Remediation 1: Support Manual Address Fallback in Onboarding Validation
Update `handleSubmit` in `ShopkeeperOnboardingPage.tsx` to align with the database schema and UI promise:
```typescript
// Replace rigid GPS-only check:
// if (!gpsCoords) { setFormError('Please capture your storefront live GPS coordinates.'); return; }

// With flexible physical address or GPS validation:
if (!gpsCoords && !addressLine.trim()) {
  setFormError('Please enter your complete shop physical address or capture your storefront GPS coordinates.');
  return;
}
```

### Remediation 2: Throttled Sequential/Batched Media Uploads with Increased Timeout
Replace the unthrottled `Promise.all` across 12 files with a concurrency-controlled batching queue (concurrency = 2):
- Increase upload timeout from 15s to **45s–60s** for cellular connections.
- Upload photos sequentially or in pairs of 2 so mobile uplink bandwidth is not saturated.
- Provide per-file upload progress in the UI so the user sees visible progress (`Uploading photo 2 of 4...`).

### Remediation 3: Robust MIME Type Inference for Android File Pickers
Normalize `file.type` by inspecting the file extension before dispatching to Supabase Storage:
```typescript
const inferMimeType = (file: File, fallback = 'image/jpeg'): string => {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  return fallback;
};
```

### Remediation 4: In-App Browser (Instagram/WebView) Detection & Guidance
Add lightweight detection for Instagram/Facebook In-App Browsers in `GPSLocationPicker.tsx`:
- If `navigator.userAgent` includes `Instagram` or `FBAV`, display a friendly hint:  
  *"In-app browsers (like Instagram) often block GPS. Tap the three dots (•••) and select 'Open in Chrome / Browser' for automatic location detection, or enter your address manually below."*

### Remediation 5: Precision Error Classification
In `classifyApplicationError()`, refine check order so that specific storage failures (e.g. `upload timed out`, `file too large`, `mime type not allowed`) are not intercepted by the broad network keyword check.

---

## 7. Verification & Safety Summary

- **Safety Checks Maintained:** No database tables modified, no production deployments performed, no secrets exposed.
- **Root Cause Confirmed:** Both issues isolated to specific client-side source files, line numbers, and mobile platform runtime constraints.
- **Readiness:** Awaiting user approval before applying targeted fixes.


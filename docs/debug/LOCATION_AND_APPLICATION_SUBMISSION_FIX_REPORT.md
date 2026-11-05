# Vaangly — Location and Mobile Upload Reliability Fix Report

**Branch:** `fix/shopkeeper-onboarding-mobile-reliability`  
**Base Commit:** `e270523`  
**Date:** 2026-11-05  
**Target Repository:** Vaangly  
**Production URL:** `https://vaangly.vercel.app` (Untouched)  
**Supabase Target:** `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)  

---

## 1. Executive Summary

This engineering effort resolves two critical user-facing onboarding defects reported on mobile browsers (Android Chrome, Samsung Internet, and Instagram/Facebook In-App WebViews):
1. **Issue 1 ("Location Unavailable"):** Shop location detection failure caused by Android OS location settings or in-app browser restrictions was hard-blocking shopkeeper applications due to a rigid validation check (`if (!gpsCoords)`), preventing applicants from submitting even after manually entering a complete physical address and Google Maps profile URL.
2. **Issue 2 ("We couldn't connect to Vaangly. Check your internet connection and try again."):** An unthrottled burst of 6 to 12 simultaneous media uploads (4–10 storefront photos, ID proof, UPI QR) via `Promise.all` over cellular connections was exceeding an aggressive 15-second per-file timeout, suffering socket exhaustion, or triggering MIME type rejections from Android file pickers with empty `file.type`, which collapsed into a generic network connectivity error helper.

Both issues have been remediated cleanly, verified against the TypeScript compiler, tested with Vite production bundling, and confirmed by 31 passing test suites across the platform.

---

## 2. Root Causes Confirmed

| Issue | Source Location | Technical Root Cause |
| :--- | :--- | :--- |
| **1. Location Detection Trapping Applicants** | `GPSLocationPicker.tsx` lines 320–358, `ShopkeeperOnboardingPage.tsx` lines 576–579 | `navigator.geolocation` emits error code 2 (`POSITION_UNAVAILABLE`) when Android OS master location is disabled, Google Location Accuracy/NLP is off, or Instagram/Facebook WebViews lack location permissions. While the UI instructed users to enter their physical address manually and the database allowed `gps_lat`/`gps_lng` to be `NULL`, `handleSubmit()` enforced `if (!gpsCoords) { setFormError('Please capture your storefront live GPS coordinates.'); return; }`, trapping the user. |
| **2. Submission Network Error Masking** | `ShopkeeperOnboardingPage.tsx` lines 637–658, `productErrorHelper.ts` lines 168–182 | Dispatching 6 to 12 parallel uploads over mobile uplinks (typically 1–3 Mbps in India) easily exceeded the 15-second timeout. Any dropped TCP connection or timeout caused `classifyApplicationError()` to categorize the failure as a generic network disconnect. Additionally, Android file managers reporting `file.type === ""` or `application/octet-stream` bypassed image compression and were rejected by Supabase Storage `allowed_mime_types`. |

---

## 3. Implementation Details & Changed Files

### 3.1 New Upload & MIME Normalization Utility: `src/lib/fileUploadUtils.ts`
- **Magic Byte Inspection:** Inspects the first 12 bytes of selected files to reliably detect and verify genuine JPEG (`0xFF, 0xD8, 0xFF`), PNG (`0x89, 0x50, 0x4E, 0x47`), WebP (`RIFF...WEBP`), and PDF (`%PDF-`) signatures.
- **Android MIME Normalization:** Replaces empty `file.type` or `application/octet-stream` with the verified MIME type, ensuring Supabase Storage accepts the upload.
- **Spoofing Prevention:** Rejects non-image files masquerading as images (e.g. executable or HTML files renamed to `.jpg`) by strictly requiring magic byte verification.
- **Concurrency-Limited Queue (`executeUploadQueue`):** Replaces unbounded `Promise.all` with a queue strictly capped at **2 concurrent uploads**, preventing cellular uplink saturation and browser socket exhaustion.
- **Transient Error Retry with Backoff:** Automatically retries transient network errors (network drops, timeouts, 502/503/504) up to 2 times with exponential backoff and jitter. Never retries permanent errors (400, 401, 403, RLS violations, payload too large).

### 3.2 Error Classification Refinement: `src/lib/productErrorHelper.ts`
- Reordered checks in `classifyApplicationError()` so that:
  * Unsupported format & MIME errors map to `category: 'validation'` with user guidance: *"Invalid file format. Please upload JPG, PNG, or WebP images (or PDF for documents)."*
  * Storage upload timeouts map to `category: 'storage'` with clear guidance: *"Photo upload timed out on your cellular connection. Please check your signal and try again."*
  * Generic network failures continue to map to `category: 'network'` without masking specific upload or validation issues.

### 3.3 Location Fallback & In-App Browser Guidance: `src/components/shopkeeper/GPSLocationPicker.tsx` & `.css`
- **In-App Browser Detection:** Detects Instagram, Facebook, and WebViews via User-Agent and renders an informational notice recommending Chrome or system browsers for GPS, while explicitly reassuring the user that manual address entry is available.
- **Direct Manual Fallback Action:** Added an explicit `"Enter Address Manually"` button in the prompt state so users who cannot or do not want to use GPS can jump straight to manual entry.
- **Distinct Error Categorization:** Handles `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT`, `UNSUPPORTED`, and `INSECURE_CONTEXT` with specific, actionable copy and one-click manual address fallback.

### 3.4 Onboarding Submission & Validation: `src/pages/shopkeeper/ShopkeeperOnboardingPage.tsx`
- **Flexible Location Requirement:** Updated `handleSubmit` to require valid live GPS coordinates **OR** a complete physical shop address (>= 5 characters):
  ```typescript
  const hasValidGps = gpsCoords != null &&
    typeof gpsCoords.lat === 'number' &&
    typeof gpsCoords.lng === 'number' &&
    !isNaN(gpsCoords.lat) &&
    !isNaN(gpsCoords.lng) &&
    (gpsCoords.lat !== 0 || gpsCoords.lng !== 0);

  const hasValidAddress = Boolean(addressLine && addressLine.trim().length >= 5);

  if (!hasValidGps && !hasValidAddress) {
    setFormError('Please capture your storefront live GPS coordinates or enter your complete physical shop address.');
    return;
  }
  ```
- **Strict Coordinate Storage Rules:** When GPS is unavailable, `gps_lat` and `gps_lng` are stored as `null`. Zero coordinates (`0, 0`) and estimated coordinates are strictly rejected.
- **Extended Mobile Timeout:** Increased upload timeout from 15 seconds to **45 seconds** per file.
- **Pre-upload File Validation:** Pre-validates all storefront photos, ID proofs, and UPI QR images for magic bytes before initiating any storage requests.
- **Live Upload Progress:** Displays live progress (`"Uploading storefront photo 2 of 4..."`, `"Uploaded 3 of 6 files..."`) during submission.
- **Submission Lock:** Enforces `isSubmitting` guard and preserves all user-entered fields on failure.

### 3.5 Admin Application Verification: `src/pages/admin/AdminApplicationDetailPage.tsx`
- **Clear Verification Badging:**
  * When GPS coordinates exist: Displays `<Badge variant="success">GPS Verified</Badge>` with coordinates and map preview.
  * When GPS is null: Displays `<Badge variant="warning">Manual Address Verification</Badge>` with an explanatory note: *"Storefront coordinates were not captured via GPS at submission. Verify the physical shop address and Google Maps profile manually before approval."*
- **Prominent Physical Address:** Displays the complete physical shop address in the applicant details card.

---

## 4. Tests Added & Platform Verification

### 4.1 New Regression Test Suite: `src/__tests__/shopkeeperLocationAndUploadReliability.test.ts`
19 comprehensive tests covering:
1. `GPS available stores exact valid coordinates`
2. `GPS unavailable with valid physical address stores NULL for coordinates (never 0 or estimated)`
3. `Validation rejects submission when BOTH GPS and address are missing`
4. `Permission denied error classification preserves manual fallback`
5. `Timeout error classification preserves manual fallback`
6. `Unsupported browser gracefully detects missing geolocation API`
7. `MIME: Correctly detects JPEG magic bytes [0xFF, 0xD8, 0xFF] regardless of missing file.type`
8. `MIME: Correctly detects PNG magic bytes [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]`
9. `MIME: Correctly detects WebP magic bytes [RIFF ... WEBP]`
10. `MIME: Correctly detects PDF for documents when allowPdf is true`
11. `MIME: Rejects PDF when allowPdf is false (photos bucket)`
12. `MIME: Explicitly rejects dangerous / unsupported formats (e.g. script / executable disguised as jpg)`
13. `Upload Queue: Strictly limits concurrency to 2 simultaneous uploads`
14. `Upload Queue: Automatically retries transient network errors with exponential backoff`
15. `Upload Queue: Permanent errors (e.g. 403 Forbidden / RLS violation) fail immediately without retry`
16. `isTransientUploadError classifies transient vs permanent errors correctly`
17. `classifyApplicationError accurately reports upload timeouts under storage category`
18. `classifyApplicationError accurately reports unsupported MIME types under validation category`
19. `classifyApplicationError accurately reports genuine network failure under network category`

### 4.2 Platform Test Suite Execution Results
```
> node scripts/run_all_tests.mjs

Found 31 test suites in E:\Vango\src\__tests__

Testing adminSubscriptionsAndShopDetail.test.ts... ✓ PASS
Testing appointmentBookingPaymentUI.test.ts... ✓ PASS
Testing appointmentPaymentStatusPresentation.test.ts... ✓ PASS
Testing authEnvironmentAndOAuthFlow.test.ts... ✓ PASS
Testing dashboardDataAuthenticity.test.ts... ✓ PASS
Testing errorVisibilityAndCartUX.test.ts... ✓ PASS
Testing informationRetrievalAndLocationSave.test.ts... ✓ PASS
Testing liveModeNoMockFallback.test.ts... ✓ PASS
Testing masterCatalogueFlow.test.ts... ✓ PASS
Testing mobileResponsiveLayout.test.ts... ✓ PASS
Testing notificationBadge.test.ts... ✓ PASS
Testing notificationDropdownPositioning.test.ts... ✓ PASS
Testing orderCancellationAndAbusePrevention.test.ts... ✓ PASS
Testing orderNotificationLifecycle.test.ts... ✓ PASS
Testing passwordResetFlow.test.ts... ✓ PASS
Testing paymentProofIsolation.test.ts... ✓ PASS
Testing productDetailsCartFlow.test.ts... ✓ PASS
Testing pwaInstallationStateMachine.test.ts... ✓ PASS
Testing requestListOrdering.test.ts... ✓ PASS
Testing runtimeSecurityValidation.test.ts... ✓ PASS
Testing scheduledPickupFlow.test.ts... ✓ PASS
Testing sec01PushNotificationAuth.test.ts... ✓ PASS
Testing sec02AppointmentBookingAuth.test.ts... ✓ PASS
Testing sec03RedirectSanitization.test.ts... ✓ PASS
Testing sec04ShopkeeperRoleEscalation.test.ts... ✓ PASS
Testing sec05HttpSecurityHeaders.test.ts... ✓ PASS
Testing shopkeeperApplicationSubmission.test.ts... ✓ PASS
Testing shopkeeperLocationAndUploadReliability.test.ts... ✓ PASS
Testing shopkeeperNavigationAndAnalytics.test.ts... ✓ PASS
Testing uiRedesignRegressions.test.ts... ✓ PASS
Testing variantInventoryManagement.test.ts... ✓ PASS

========================================
TEST RESULTS: 31 PASSED, 0 FAILED out of 31
========================================

ALL TESTS PASSED!
```

### 4.3 Build Verification
```
> tsc && vite build
✓ 2141 modules transformed.
✓ built in 9.88s
```
TypeScript compilation and production bundling succeeded with zero errors.

---

## 5. Security Impact Assessment

- **RLS & Security Definer Integrity:** No Row-Level Security policies or security definer search paths were modified.
- **Admin Verification Preservation:** Admin review remains mandatory. Applications submitted with manual addresses are flagged with `Manual Address Verification`, requiring admin staff to verify physical storefront details and Google Maps links prior to approving merchant accounts.
- **Storage Security:** Storage policies continue to enforce applicant-isolated upload paths (`can_upload_shop_photo`). Uploads to buckets without matching user IDs are rejected by Supabase RLS.
- **Magic Byte Validation:** Filename extensions alone are never trusted; file headers must strictly match authorized image or PDF signatures, preventing arbitrary file execution or upload tampering.
- **Zero Coordinate Injection Prevention:** When GPS is unavailable, coordinates are strictly stored as `NULL`, never `(0, 0)` or estimated geographic points.

---

## 6. Remaining Limitations & Operating Guidance

1. **In-App WebViews:** Instagram and Facebook in-app browsers cannot be forced to grant GPS permissions from JavaScript. The new guidance banner prompts users to use manual address entry or switch to Chrome/system browser, avoiding user frustration.
2. **Offline Mode:** File uploads require an active internet connection. If the user is completely offline, client-side retry logic handles transient reconnects, but permanent offline states require user action once network access is restored.
3. **Admin Physical Inspection:** Applications submitted without GPS coordinates rely on human admin review of storefront photos and Google Maps links.

---

## 7. Action Boundaries & Safety Status

- **Branch:** `fix/shopkeeper-onboarding-mobile-reliability`
- **Merged into main:** NO
- **Deployed to production:** NO
- **Production data modified:** NO
- **Status:** Complete, verified, and ready for review.


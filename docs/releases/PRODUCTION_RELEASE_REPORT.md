# Vaangly — Production Release Report

**Release Date:** November 5, 2026  
**Target Environment:** Production (`https://vaangly.vercel.app`)  
**Supabase Production Project:** `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)  
**Final Production Commit:** `91f7a755f088e6345f604e6222b11fd6b9e3293f`  
**Git Branch:** `main`  
**Deployment Status:** **READY / OPERATIONAL**  
**Smoke Test Outcome:** **20 PASSED, 0 FAILED (100% PASS)**  

---

## 1. Executive Summary

On November 5, 2026, the authorized release of the combined **Phase 2 Critical Security Remediation** and the **Mobile Location Fallback & Upload Reliability Fix** was successfully merged into `main`, deployed to Vercel production, and verified via end-to-end post-deployment smoke tests.

The live production deployment at `https://vaangly.vercel.app` is now serving the hardened application bundle, enforcing strict HTTP security headers, atomic appointment booking caller validation, secure push notification authorization, and mobile-resilient storefront onboarding.

---

## 2. Git Merge & Branch Lineage

- **Previous `main` Commit:** `5d039d9b4357a1e629d857e3a91b06409f5c8702`
- **Source Integration Branch:** `integration/security-and-onboarding-fixes`
- **Validated Source Commit:** `91f7a755f088e6345f604e6222b11fd6b9e3293f`
- **Merge Strategy:** Clean Fast-Forward (`git merge --ff-only integration/security-and-onboarding-fixes`)
- **Remote Push:** `main` pushed to `origin/main` at `https://github.com/kritheesh17/Vaangly.git` with zero merge conflicts or history rewriting.

### Commit History Integrated into `main`
```
91f7a75 docs(security): add combined staging validation report
30015e7 fix(onboarding): resolve mobile location fallback and upload reliability issues
e270523 docs(security): add Phase 6 final pre-merge verification report
8a66375 docs(security): add Phase 6 production rollout plan
5aeace9 docs(security): add Phase 5 staging acceptance report
74ffba1 docs(security): add Phase 4 staging deployment and validation report
5bb26b2 docs(security): add Phase 3 runtime validation report and test suite
7c47519 security: harden critical authentication and authorization vulnerabilities
c2f7218 test(security): add regression test suites for SEC-01 through SEC-05
```

---

## 3. Vercel Production Deployment

- **Vercel Project:** `vaangly`
- **Vercel Deployment ID:** `2ZGSi6ChxHsWf6LsX96smgBz8i9W`
- **GitHub Deployment ID:** `7575614079`
- **Target Environment:** `Production`
- **Deployment Status:** `READY` (`state: success`, `description: Deployment has completed`)
- **Canonical Production URL:** `https://vaangly.vercel.app`
- **Vercel Edge IDs:** `bom1::...` (Active edge CDN routing traffic to release bundle)

---

## 4. Supabase Production Backend Verification

**Target Project:** `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)

### 4.1 Migration Synchronization
All 71 local migrations are 100% synchronized with the remote PostgreSQL database. No pending migrations exist.
```json
{"local":"20261102000071","remote":"20261102000071","time":"20261102000071"}
```
- **Database Safety Invariant:** Zero database resets performed. Zero production records modified or deleted.

### 4.2 Edge Function Status
- **Function:** `send-push-notification`
- **Status:** `ACTIVE` (version 8)
- **Security Check:** Unauthenticated calls return `HTTP 401 Unauthorized` with code `UNAUTHORIZED`.
- **Edge Secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_EMAIL`, `VAPID_PRIVATE_KEY`, and `VAPID_PUBLIC_KEY` are verified active in Supabase Edge Secrets.

---

## 5. Post-Deployment Smoke Test Results

All smoke tests were executed against the live production URL (`https://vaangly.vercel.app`) and backend (`https://pndikgqbgchzkrmlrmzo.supabase.co`).

| Check ID | Category | Description | Status | Details |
| :--- | :--- | :--- | :--- | :--- |
| **CHK-01** | Security Headers | Strict-Transport-Security (HSTS) | **PASS** | `max-age=63072000; includeSubDomains` enforced |
| **CHK-02** | Security Headers | X-Content-Type-Options | **PASS** | `nosniff` enforced |
| **CHK-03** | Security Headers | X-Frame-Options | **PASS** | `DENY` enforced |
| **CHK-04** | Security Headers | Referrer-Policy | **PASS** | `strict-origin-when-cross-origin` enforced |
| **CHK-05** | Security Headers | Permissions-Policy | **PASS** | `camera=(), microphone=(), geolocation=(self)` |
| **CHK-06** | Security Headers | Content-Security-Policy (CSP) | **PASS** | `frame-ancestors 'none'` and tight domain whitelisting |
| **CHK-07** | Auth & Redirects | Open Redirect Vector Sanitization | **PASS** | Double slash (`//evil.com`), protocol, backslash sanitized to `/` |
| **CHK-08** | Auth & Redirects | Legitimate Route Preservation | **PASS** | Internal paths (`/shops`, `/orders/123`, `/admin`) preserved |
| **CHK-09** | Auth & Redirects | Supabase Auth Service Health | **PASS** | Auth service endpoint healthy; Google OAuth & signups active |
| **CHK-10** | Push Notifications | Edge Function Anonymous Rejection | **PASS** | `send-push-notification` returns HTTP 401 Unauthorized |
| **CHK-11** | Booking Security | Anonymous RPC Call Rejection | **PASS** | `book_appointment_with_token` rejects with `UNAUTHENTICATED` |
| **CHK-12** | Database RLS | `shop_applications` Anonymous Insert | **PASS** | RLS policy blocks anonymous writes to shop applications |
| **CHK-13** | Storage RLS | Anonymous `shop-photos` Upload | **PASS** | Storage policy rejects unauthenticated uploads |
| **CHK-14** | Order RLS | Anonymous Order Status Mutation | **PASS** | RLS policy blocks unauthenticated updates/cancellations |
| **CHK-15** | Customer Workflows | Shop Discovery | **PASS** | Live storefront query returned 5 active shops (`is_live = true`) |
| **CHK-16** | Customer Workflows | Product Catalogue Discovery | **PASS** | Query to `products` table schema verified operational |
| **CHK-17** | Customer Workflows | Appointment Slots Discovery | **PASS** | Query to `appointment_slots` table executed without errors |
| **CHK-18** | Onboarding Resilience | Database Schema Contract | **PASS** | `gps_lat`, `gps_lng`, `address_line`, `status` verified intact |
| **CHK-19** | Onboarding Resilience | Magic Byte MIME Detection | **PASS** | JPEG/PNG headers detected; disguised executables rejected |
| **CHK-20** | Onboarding Resilience | Upload Queue Concurrency | **PASS** | Mobile upload queue strictly throttles parallel requests to max 2 |

### Failed, Blocked, or Untested Checks
- **Failed Checks:** 0
- **Blocked Checks:** 0
- **Not Tested:** 0

---

## 6. Verification of Deployed Assets on Production

Inspection of the minified production JavaScript bundles deployed by Vercel confirmed:
1. **Redirect Sanitization (`authUtils-DrXnv-P_.js`):** Confirmed deployed with double-URL-decode protection, control character rejection, and backslash/scheme guards.
2. **Shopkeeper Location Fallback (`ShopkeeperOnboardingPage-Ch_vQwd0.js`):** Confirmed deployed with decoupled location validation (*"Please capture your storefront live GPS coordinates or enter your complete physical shop address"*).
3. **Mobile Upload Concurrency & Compression:** Confirmed deployed with throttled queue (`executeUploadQueue`, max concurrency 2, retry with backoff, progressive progress feedback).
4. **Admin Verification Flagging (`AdminApplicationDetailPage-BHVvkJc5.js`):** Confirmed deployed with amber warning badge (`variant: "warning", children: "Manual Address Verification"`) when `gps_lat`/`gps_lng` are null.

---

## 7. Rollback Readiness & Status

- **Rollback Invoked?** **NO.** The release is healthy and verified operational across all security and functional boundaries.
- **Rollback Readiness:**
  - Vercel instant deployment rollback is available via the Vercel dashboard to previous deployment `5d039d9` if ever needed.
  - Database rollback is NOT recommended or required; migration 71 is backward-compatible with all existing clients.
  - Production data remains completely intact.

---

## 8. Conclusion

The production release is **COMPLETE and SUCCESSFUL**.

All Phase 2 critical security vulnerabilities (SEC-01 through SEC-05) and mobile onboarding failure modes have been fully resolved in production. Vaangly is live, hardened, and accessible at **https://vaangly.vercel.app**.

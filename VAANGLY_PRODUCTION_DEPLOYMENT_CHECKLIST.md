# VAANGLY — PRODUCTION DEPLOYMENT & ENVIRONMENT SAFETY CHECKLIST

**Date:** October 17, 2026  
**Auditor Roles:** Senior Full-Stack Engineer, Security Auditor, DevOps/Release Engineer  
**Target Domain:** `https://vaangly.vercel.app`  
**Current Git Commit:** `2009f23` (branch `main`)  
**Active Supabase Project Ref:** `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)  
**Legacy/Prototype Project Ref:** `czbywlmfrsbbcolbjdcw` (`INACTIVE`, unlinked)  

---

## 1. Environment & Architecture Identification

```
+-----------------------------------------------------------------------------------+
|                               DEPLOYMENT MAPPING                                  |
+-----------------------------------------------------------------------------------+
| Active Staging & Production Target:  pndikgqbgchzkrmlrmzo                         |
|   - Supabase Region:                 ap-northeast-1 (Tokyo)                       |
|   - Status:                          ACTIVE_HEALTHY                               |
|   - Linked CLI Project:              YES (linked: true)                           |
|   - Applied Migrations:              All 69 migrations (000001 -> 000069)         |
|   - Edge Functions:                  send-push-notification (v7, ACTIVE)          |
+-----------------------------------------------------------------------------------+
| Deployed Frontend (Vercel):          https://vaangly.vercel.app                   |
|   - Verified Target in Asset JS:     https://pndikgqbgchzkrmlrmzo.supabase.co     |
|   - Current Deployed Commit:         802c271 (Pre-bundle-optimization)            |
|   - Pending Release Commit:          2009f23 (Bundle optimization & no mock)      |
+-----------------------------------------------------------------------------------+
| Legacy Quarantine Project:           czbywlmfrsbbcolbjdcw                         |
|   - Supabase Region:                 ap-southeast-2 (Sydney)                      |
|   - Status:                          INACTIVE                                     |
|   - Linked:                          NO (linked: false)                           |
|   - Recommendation:                  DO NOT USE. Retain quarantined.              |
+-----------------------------------------------------------------------------------+
```

---

## 2. Pre-Deployment Verification Checklist (Automated & Tested)

- [x] **2.1 TypeScript Compilation**: Run `tsc` — Verified exit code 0, 0 compiler errors.
- [x] **2.2 Automated Regression Suite**: Run all 21 test suites in `src/__tests__/` — 21 of 21 PASSED (0 failures).
- [x] **2.3 Production Build Size**: Run `npm run build`:
  - Main bundle: `dist/assets/index-XNg3skuH.js` is **477.79 kB** (116.42 kB gzip), strictly below 500 kB budget.
  - `vendor-leaflet`: 149.58 kB (43.34 kB gzip)
  - `vendor-supabase`: 227.02 kB (58.86 kB gzip)
  - `vendor-react`: 165.67 kB (54.21 kB gzip)
  - `vendor-icons`: 56.93 kB (11.82 kB gzip)
  - `mock-data`: 47.81 kB (10.17 kB gzip)
- [x] **2.4 PWA Version Stamping**: Injected build hash into `dist/sw.js` via `pwaVersionPlugin`.
- [x] **2.5 Secret Scrubbing**: Verified zero `service_role` keys, database passwords, or personal credentials exist in `dist/assets/` or git tracked files.
- [x] **2.6 RLS Policy Enforcement**: Verified all 40+ tables in `public` schema have Row Level Security enabled.
- [x] **2.7 Storage Bucket Privacy**: Verified `payment-proofs` and `id-proofs` buckets have `public = false`.
- [x] **2.8 Database Subscription Integrity**: Verified all 7 shops in `pndikgqbgchzkrmlrmzo` have exactly 1 active `TRIAL` subscription; 0 orphan shops, 0 duplicates.

---

## 3. Step-by-Step Vercel Deployment Procedure

Because automated deployments to production are restricted by safety rules, the following controlled deployment steps must be executed:

### Step 1: Push Local Commit to Remote Git Repository
The local branch `main` is ahead of `origin/main` by 1 commit (`2009f23`):
```bash
# Push the verified bundle-optimization & no-mock-fallback commit
git push origin main
```

### Step 2: Vercel Automatic Build & Deploy
Once pushed to `main`, Vercel's GitHub integration will automatically build the new release using:
```bash
# Vercel Build Command:
npm run build

# Vercel Output Directory:
dist
```

### Step 3: Verify Vercel Project Environment Variables in Vercel Dashboard
In [Vercel Dashboard](https://vercel.com) -> **Vaangly** -> **Settings** -> **Environment Variables**, verify that the following variables are configured for Production:

| Variable Name | Required Value / Description | Sensitive? |
| :--- | :--- | :---: |
| `VITE_SUPABASE_URL` | `https://pndikgqbgchzkrmlrmzo.supabase.co` | No |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_Ea-dHCdnXPqX0JGLknChig_uzJNwW50` | No (Public Anon Key) |
| `VITE_VAPID_PUBLIC_KEY` | Active Web Push VAPID Public Key | No |

> [!CAUTION]
> **NEVER add `SUPABASE_SERVICE_ROLE_KEY` to Vercel Environment Variables.** The frontend client bundle has zero need for the service-role key. Storing it in frontend client env variables creates an immediate security vulnerability.

---

## 4. Supabase Dashboard Configuration Checklist (Manual Review)

In [Supabase Dashboard](https://supabase.com/dashboard/project/pndikgqbgchzkrmlrmzo):

### A. Authentication -> URL Configuration
- **Site URL:** `https://vaangly.vercel.app`
- **Redirect URLs:**
  - `https://vaangly.vercel.app/**`
  - `https://vaangly.vercel.app/auth/callback`
  - `https://vaangly.vercel.app/reset-password`
  - `http://localhost:5173/**` (for local development)

### B. Authentication -> Providers -> Google OAuth
- **Client ID:** Configured Google OAuth Client ID.
- **Client Secret:** Configured Google OAuth Secret.
- **Authorized Redirect URIs (in Google Cloud Console):**
  - `https://pndikgqbgchzkrmlrmzo.supabase.co/auth/v1/callback`

### C. Storage -> Buckets Configuration
- **`shop-photos`**: `public = true` (Public storefront and product images).
- **`payment-proofs`**: `public = false` (Strictly private; RLS enforced via `can_read_payment_proof`).
- **`id-proofs`**: `public = false` (Strictly private; RLS enforced for applicant and admin only).

---

## 5. Post-Deployment Verification & Smoke Test Protocol

Immediately after Vercel completes deployment:

### 1. Cache & Service Worker Check
Run the inspection script against `https://vaangly.vercel.app`:
```bash
node scratch/check_deployed_site.mjs
```
- Verify HTTP 200 on `/`, `/manifest.json`, and `/sw.js`.
- Verify the deployed bundle references the new code-split chunks (`vendor-leaflet`, `vendor-supabase`, `vendor-react`).
- Verify `sw.js` cache version matches the build stamp.

### 2. Deep Linking & SPA Routing Check
Visit and hard-refresh (`Ctrl+F5`) each of the following URLs in a browser to confirm Vercel SPA rewrite rules in `vercel.json` are functioning without 404 errors:
- [x] `https://vaangly.vercel.app/` (Homepage)
- [x] `https://vaangly.vercel.app/shops` (Browse Shops)
- [x] `https://vaangly.vercel.app/cart` (Cart)
- [x] `https://vaangly.vercel.app/login` (Login)
- [x] `https://vaangly.vercel.app/permissions` (Permission Center)
- [x] `https://vaangly.vercel.app/admin` (Admin Restricted Portal)

### 3. Live Staging Data Authenticity Check
- Open `https://vaangly.vercel.app/` with network throttling or offline:
  - Verify that if network is disconnected, the app displays an explicit error state with a **Retry** button.
  - Verify **zero mock shops** (`Madurai Spices`, `Kovai Bakery`, `Saravana Store sample`) appear in live mode.
- Open `https://vaangly.vercel.app/shops`:
  - Verify the 7 genuine Kangeyam storefronts load from Supabase (`Saravana Stores`, `Revathi fancy`, `Merlyn`, etc.).

---

## 6. Rollback & Contingency Plan

If unexpected runtime issues occur after deploying:

### Rollback Strategy 1: Instant Vercel Rollback (Recommended)
1. Go to [Vercel Dashboard](https://vercel.com) -> **Vaangly** -> **Deployments**.
2. Locate the previous stable deployment (Commit `802c271`).
3. Click the three dots (`...`) -> **Promote to Production** / **Rollback**.
4. Rollback takes effect globally in < 15 seconds.

### Rollback Strategy 2: Git Revert
```bash
git revert 2009f23 -m "revert: rollback bundle optimization"
git push origin main
```

### Database Rollback Safety
No destructive database migrations were applied. All 69 migrations are additive, backward-compatible, and guarded with `IF NOT EXISTS` / `CREATE OR REPLACE`.

# Vaangly Phase 6 — Controlled Production Security Rollout Plan

**Date:** 2026-11-05  
**Auditor / Release Engineer:** Antigravity AI  
**Source Branch:** `security/critical-remediation`  
**Target Branch:** `main`  
**Verified Source Commit:** `5aeace9` (contains code commit `7c47519` and regression test commit `c2f7218`)  
**Production Frontend URL:** `https://vaangly.vercel.app`  
**Status:** **PENDING USER APPROVAL (CHECKPOINT ZERO)**

---

## 1. Executive Summary & Production Readiness Audit (Phase 0)

A comprehensive pre-deployment audit was conducted on repository `Vaangly` before taking any deployment action:

### 1.1 Source Commit & Diff Integrity
- **Branch:** `security/critical-remediation` is fully up-to-date with `origin/security/critical-remediation`.
- **Commit History:** Exactly 5 commits since `main`:
  1. `c2f7218`: Regression test suites for `SEC-01` through `SEC-05`
  2. `7c47519`: Phase 2 core security remediations (`SEC-01` to `SEC-05`)
  3. `5bb26b2`: Phase 3 runtime validation suite & report
  4. `74ffba1`: Phase 4 staging deployment & validation report
  5. `5aeace9`: Phase 5 staging acceptance report
- **File Diff:** Exactly 16 files modified (+3,666 / -11 lines). Only security remediations, security test suites, and documentation are included. Zero experimental code or unrelated features.

### 1.2 Infrastructure & Environment Identification

> [!CRITICAL]
> **Production vs. Staging Backend Architecture Audit Finding:**
> 1. An inspection of the Supabase organization (`lchxalkiiwpiehpvqejb`) lists only two projects:
>    - `czbywlmfrsbbcolbjdcw`: `name: "vaangly"`, `region: "ap-southeast-2"`, **Status: INACTIVE** (quarantined prototype).
>    - `pndikgqbgchzkrmlrmzo`: `name: "vaangly-staging-test-2"`, `region: "ap-northeast-1"`, **Status: ACTIVE_HEALTHY**.
> 2. An inspection of the live production frontend bundle (`https://vaangly.vercel.app/assets/index-B9GTzLVF.js`) revealed that the deployed production site currently connects to:
>    `https://pndikgqbgchzkrmlrmzo.supabase.co`.
> 3. The prompt explicitly specifies:
>    *"pndikgqbgchzkrmlrmzo is STAGING ONLY. Never assume it is production."*

In strict observance of Safety Rule #1 ("Never assume the staging and production Supabase projects are identical") and Rule #8 ("Stop immediately if a migration, environment, or deployment target is ambiguous"), this rollout plan outlines two explicit paths:

* **Path A (Single Backend Architecture):** If `pndikgqbgchzkrmlrmzo` is the actual live backend supporting both staging and `https://vaangly.vercel.app`, the database migration (`20261102000071`) and Edge Function (`send-push-notification`) are **ALREADY** applied, tested, and active. The remaining rollout action is merging `security/critical-remediation` to `main` for Vercel to build the hardened frontend (SEC-03 redirect sanitizer and SEC-05 HTTP headers).
* **Path B (Separate Dedicated Production Supabase Project):** If a separate, unlinked production Supabase project exists (or will be designated by the user), the migration and Edge Function must be explicitly targeted to that project reference before merging the frontend.

---

## 2. Production Rollout Plan by Component

### Component 1: Database Migration (`SEC-02`, `SEC-04`, `SEC-06`)
- **File:** `supabase/migrations/20261102000071_harden_appointment_booking_and_roles.sql`
- **Impact Assessment:**
  - `CREATE OR REPLACE FUNCTION public.is_admin()`: Adds fixed `search_path=public, auth, pg_temp`. Non-breaking.
  - `CREATE OR REPLACE FUNCTION public.handle_new_user()`: Unconditionally sets `role = 'customer'` on new user signup. Non-breaking for legitimate users.
  - `CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()`: Drops and recreates trigger `trg_prevent_profile_role_escalation` on `public.profiles`. Prevents unauthorized privilege escalation.
  - `CREATE OR REPLACE FUNCTION public.book_appointment_with_token()`: Enforces `auth.uid() = p_customer_id` unless caller is admin or service_role. Prevents cross-customer appointment booking.
  - `REVOKE ALL ON FUNCTION public.book_appointment_with_token(...) FROM PUBLIC, anon;`: Revokes anonymous RPC execution; restricts to `authenticated` and `service_role`.
- **Downtime:** **0 seconds.** All statements execute within a single transaction without table locking or schema rewrites.
- **Rollback Limitation:** If rolled back, the previous definition of `book_appointment_with_token` would re-open `anon` execution privileges.

### Component 2: Edge Function (`SEC-01`)
- **Function:** `supabase/functions/send-push-notification/index.ts`
- **Impact Assessment:**
  - Enforces mandatory Bearer JWT validation.
  - Enforces sender-recipient authorization based on active `requests` (orders / appointments).
  - Sanitizes destination URLs (blocks external redirects).
  - Rejects administrative / security alert title spoofing.
- **Pre-requisite:** Verify `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_EMAIL` are configured in the target project secrets.

### Component 3: Frontend & Security Headers (`SEC-03`, `SEC-05`)
- **Files:** `src/lib/authUtils.ts`, `src/pages/auth/LoginPage.tsx`, `src/pages/auth/AuthCallbackPage.tsx`, `vercel.json`
- **Impact Assessment:**
  - Neutralizes open redirects while preserving legitimate internal paths (`/shop/orders`, `/dashboard`).
  - Activates HSTS (`max-age=63072000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Deployment Mechanism:** Merge `security/critical-remediation` into `main` and push to `origin/main`. Vercel CI/CD will automatically compile and deploy the production site.

---

## 3. Step-by-Step Rollout Execution Sequence

```
+-----------------------------------------------------------------------------------+
|                            ROLLOUT EXECUTION WORKFLOW                             |
+-----------------------------------------------------------------------------------+
| [CHECKPOINT 0] -> User confirms architecture (Path A vs Path B)                   |
|       |                                                                           |
| [STEP 1]       -> Verify target Supabase project reference & secrets              |
|       |                                                                           |
| [STEP 2]       -> Execute database migration dry-run (if Path B)                  |
|       |                                                                           |
| [STEP 3]       -> Apply migration 20261102000071 to target database               |
|       |                                                                           |
| [STEP 4]       -> Deploy Edge Function send-push-notification                     |
|       |                                                                           |
| [STEP 5]       -> Merge security/critical-remediation into main and push          |
|       |                                                                           |
| [STEP 6]       -> Monitor Vercel production deployment build                      |
|       |                                                                           |
| [STEP 7]       -> Execute post-deployment smoke test on https://vaangly.vercel.app|
+-----------------------------------------------------------------------------------+
```

---

## 4. Backup, Recovery & Rollback Strategy

1. **Frontend Rollback:**
   - If frontend issues arise, Vercel provides instant 1-click rollback to the previous deployment (Deployment ID from commit `2009f23`) without redeployment downtime.
2. **Edge Function Rollback:**
   - Previous versions of `send-push-notification` can be redeployed from git commit `c2f7218` or `main`.
3. **Database Migration Rollback:**
   - Under no circumstances will tables be dropped or data reset.
   - If rollback is ever required, an idempotent rollback script will restore previous function definitions while maintaining data integrity.

---

## 5. Post-Deployment Health Checks & Success Criteria

| Check # | Target | Expected Result |
| :--- | :--- | :--- |
| **HC-01** | `https://vaangly.vercel.app` | HTTP 200, clean layout, no uncaught console errors |
| **HC-02** | HTTP Security Headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` present |
| **HC-03** | Customer Login & Navigation | Authentication succeeds; redirect to internal routes (`/dashboard`) works |
| **HC-04** | Open Redirect Defense | Login with `?next=https://evil.com` safely redirects to `/` |
| **HC-05** | Public Product Discovery | Shops, services, and product catalogues render with images |
| **HC-06** | Appointment Booking (Auth) | Authenticated user can select slot, book appointment, and receive token |
| **HC-07** | Anonymous RPC Rejection | Direct anonymous call to `book_appointment_with_token` returns HTTP 401 code `42501` |
| **HC-08** | Edge Function Authorization | Missing JWT returns HTTP 401; unrelated push returns HTTP 403 |
| **HC-09** | Role Escalation Guard | Client metadata cannot alter user role; trigger protects `profiles.role` |
| **HC-10** | Existing Data Preservation | Existing customers, shopkeepers, admins, and orders remain 100% intact |

---

## 6. Approval Checkpoint

> [!IMPORTANT]
> **EXPLICIT USER APPROVAL REQUIRED BEFORE EXECUTION:**
> 
> Please confirm the intended production target architecture before we proceed:
> 1. **Path A:** `pndikgqbgchzkrmlrmzo` is the backend for `https://vaangly.vercel.app`. (Migration 71 and Edge Function are already applied and validated; rollout proceeds to merging frontend into `main`).
> 2. **Path B:** A different Supabase project reference is the dedicated production backend. (Please supply the production project reference).
> 
> *Awaiting your explicit instruction to proceed.*

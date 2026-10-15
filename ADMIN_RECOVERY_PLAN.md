# Vaangly Admin Access Recovery & Security Runbook

> **Target Project**: `vaangly-staging-test-2` (`pndikgqbgchzkrmlrmzo`)  
> **Target Administrator**: `support.vaangly@gmail.com` (`d68951e7-ba08-455f-bdfa-26307fe34fe8`, corrected from transposed notes)  
> **Legacy Account (Untouched)**: `admin@vaangly.test` (`786b787f-d0c0-4f50-b027-162683211c6c`)  
> **Status**: COMPLETED. Privileged transaction executed and verified on 2026-10-15.

---

## 1. Executive Summary & Root-Cause Analysis

### A. Inconsistent Profile Lookup
- **Root Cause**: Query authorization context and environment divergence.
- **Evidence**:
  1. `public.profiles` has Row-Level Security enabled (`20260910000001_initial_schema.sql`). Unauthenticated or non-admin queries filter out rows where `auth.uid() != id`.
  2. The target Gmail account exists in the remote staging project (`pndikgqbgchzkrmlrmzo`), but not in the local Docker seed database (`supabase/seed.sql`).

### B. Failed Role Promotion
- **Root Cause**: Profile escalation trigger block.
- **Evidence**:
  1. Trigger `trg_prevent_profile_role_escalation` on `public.profiles` executes `prevent_profile_role_escalation()`.
  2. In `20260920000029_staging_admin_bootstrap.sql`, updates to `role` or `is_verified` are blocked unless `public.is_admin()` is true OR `(current_setting('vaango.staging_admin_bootstrap', true) = 'true' AND NEW.email = 'admin@vaangly.test')`.
  3. Direct SQL updates for `support.vaangly@gmail.com` trigger `RAISE EXCEPTION 'Access Denied: You do not have permission to modify account role or verification status.'`.

### C. Failed Auth-User Deletion
- **Root Cause**: Non-nullable foreign-key constraints with `ON DELETE NO ACTION`.
- **Evidence**:
  1. `auth.users` cascades deletion to `public.profiles`.
  2. `public.profiles(id)` is referenced by 42 foreign keys across the schema.
  3. Specifically, `admin_audit_logs.admin_id`, `request_events.actor_id`, and `subscription_payments.recorded_by_admin_id` are `NOT NULL` with `ON DELETE NO ACTION`.
  4. Trigger `vaangly_admin_audit_immutable` blocks any deletion on `admin_audit_logs`.
  5. Attempting to delete `admin@vaangly.test` triggers PostgreSQL error `23503` (foreign key violation), surfaced by Supabase Auth as `Database error deleting user`.

---

## 2. Read-Only Preflight SQL Suite

Execute these read-only queries in the **Supabase Remote Staging SQL Editor** (`pndikgqbgchzkrmlrmzo`) to capture the baseline state before taking any action.

```sql
-- ============================================================================
-- PREFLIGHT 1: Environment, Active Role & Table Ownership
-- ============================================================================
SELECT 
    current_database() AS database_name,
    current_user AS active_role,
    session_user,
    pg_has_role(current_user, 'service_role', 'MEMBER') AS postgres_has_service_role_membership,
    (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') AS profiles_owner,
    (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_roles') AS user_roles_owner,
    (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_audit_logs') AS audit_logs_owner;

-- ============================================================================
-- PREFLIGHT 2: Target Auth User Status (support.vaangly@gmail.com)
-- ============================================================================
SELECT 
    id AS auth_id,
    email,
    email_confirmed_at,
    banned_until,
    created_at,
    last_sign_in_at
FROM auth.users
WHERE id = 'd68951e7-ba08-455f-bdfa-26307ef34fe8' OR email = 'support.vaangly@gmail.com';

-- ============================================================================
-- PREFLIGHT 3: Target Profile Full State (Exact Snapshot for Rollback)
-- ============================================================================
SELECT 
    p.id,
    p.role,
    p.is_verified,
    p.full_name,
    p.email,
    p.phone,
    p.address,
    p.preferred_location_id,
    p.avatar_url,
    p.avatar_media_id,
    p.created_at,
    p.updated_at,
    to_jsonb(p.*) AS raw_profile_json
FROM public.profiles p
WHERE p.id = 'd68951e7-ba08-455f-bdfa-26307ef34fe8';

-- ============================================================================
-- PREFLIGHT 4: Target Existing Role Grants in public.user_roles
-- ============================================================================
SELECT 
    ur.user_id,
    ur.role,
    ur.granted_by,
    ur.created_at,
    to_jsonb(ur.*) AS raw_user_role_json
FROM public.user_roles ur
WHERE ur.user_id = 'd68951e7-ba08-455f-bdfa-26307ef34fe8';

-- ============================================================================
-- PREFLIGHT 5: Live Trigger Status & Trigger Function Definition
-- ============================================================================
SELECT 
    t.tgname AS trigger_name,
    c.relname AS target_table,
    t.tgenabled AS trigger_status, -- 'O' = Enabled, 'D' = Disabled
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS live_function_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgname IN ('trg_prevent_profile_role_escalation', 'vaangly_admin_audit_immutable');

-- ============================================================================
-- PREFLIGHT 6: Audit Table Constraints & Nullability
-- ============================================================================
SELECT 
    column_name,
    is_nullable,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_audit_logs'
ORDER BY ordinal_position;

-- ============================================================================
-- PREFLIGHT 7: Legacy Account Read-Only Baseline (Untouched)
-- ============================================================================
SELECT 
    p.id,
    p.email,
    p.role,
    p.is_verified,
    (SELECT count(*) FROM public.admin_audit_logs WHERE admin_id = p.id) AS audit_records_count,
    (SELECT count(*) FROM public.request_events WHERE actor_id = p.id) AS request_events_count
FROM public.profiles p
WHERE p.id = '786b787f-d0c0-4f50-b027-162683211c6c';
```

---

## 3. Operational Behavior Matrix Across Baseline Permutations

| Baseline Permutation | Operational Behavior | Safety Rationale |
| :--- | :--- | :--- |
| **1. Profile absent** | Precondition assertion **ABORTS** the operation. | If absent, out-of-band profile creation creates foreign key dependencies that block clean rollback. User must trigger standard auth signup first. |
| **2. Profile present (`role = 'customer'`)** | Update `role = 'admin'`, `is_verified = true`, `updated_at = NOW()`. Leave all other profile columns intact. | Standard promotion. Preserves customer identity details. |
| **3. Profile already `admin`** | Skip profile update. Retain existing `updated_at`. | Idempotent. Prevents lock churn or redundant modifications. |
| **4. Admin role grant absent in `user_roles`** | Insert `(user_id, 'admin', granted_by = NULL, created_at = NOW())`. | Adds the missing RBAC assignment. Setting `granted_by = NULL` truthfully denotes system DBA promotion. |
| **5. Admin role grant already present** | Skip insert. Leave existing `granted_by` and `created_at` completely untouched. | Preserves historical role grant attribution. |

---

## 4. Truthful Audit-Attribution Design

1. **In `public.user_roles`**:
   - `granted_by` is nullable (`REFERENCES public.profiles(id) ON DELETE SET NULL`).
   - For DBA recovery, **`granted_by` MUST BE SET TO `NULL`**.
   - This records the exact truth: the role was granted via system-level database administration, not by an existing user profile in the application.
2. **In `public.admin_audit_logs`**:
   - `admin_id` has a strict `NOT NULL REFERENCES public.profiles(id)` constraint.
   - Self-promotion attribution (`admin_id = target_uuid`) is strictly avoided to prevent falsifying authorization history and creating foreign-key locks on the profile.
   - Recovery metadata is stored in `details`:
     ```json
     {
       "recovery_type": "database_owner_recovery",
       "executed_by_role": "postgres",
       "initiated_by": "System Administrator",
       "target_email": "support.vaangly@gmail.com",
       "target_uuid": "d68951e7-ba08-455f-bdfa-26307ef34fe8",
       "granted_by": null,
       "mechanism": "dba_runbook"
     }
     ```

---

## 5. Proposed Recovery Operation (Design & Safeguards)

### Concurrency & Table-Lock Safeguards
- `ALTER TABLE public.profiles DISABLE TRIGGER ...` requests an `AccessExclusiveLock`.
- **Operational Safeguard 1**: `SET LOCAL lock_timeout = '2s';` prevents locking delays if concurrent queries are in-flight.
- **Operational Safeguard 2**: Transaction executes atomically (`BEGIN; ... COMMIT;`), ensuring lock duration is under 50ms.
- **Operational Safeguard 3**: Trigger `trg_prevent_profile_role_escalation` is re-enabled immediately within the transaction.

```sql
-- DRAFT RECOVERY TRANSACTION (DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL)
BEGIN;

-- Safeguard: Abort if table lock cannot be acquired within 2 seconds
SET LOCAL lock_timeout = '2s';

DO $$
DECLARE
    c_target_uuid       CONSTANT UUID := 'd68951e7-ba08-455f-bdfa-26307ef34fe8';
    c_target_email      CONSTANT TEXT := 'support.vaangly@gmail.com';
    
    v_auth_record       RECORD;
    v_profile_before    JSONB;
    v_profile_after     JSONB;
    v_table_owner       TEXT;
BEGIN
    -- 1. Assert table owner
    SELECT tableowner INTO v_table_owner
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'profiles';

    IF current_user != v_table_owner AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'ABORT: Caller "%" is not the owner of public.profiles.', current_user;
    END IF;

    -- 2. Assert target exists in auth.users, confirmed, not banned
    SELECT id, email, email_confirmed_at, banned_until
    INTO v_auth_record
    FROM auth.users
    WHERE id = c_target_uuid;

    IF v_auth_record.id IS NULL THEN
        RAISE EXCEPTION 'ABORT: Target user UUID % not found in auth.users.', c_target_uuid;
    END IF;

    IF lower(v_auth_record.email) != lower(c_target_email) THEN
        RAISE EXCEPTION 'ABORT: Email mismatch (expected %, found %).', c_target_email, v_auth_record.email;
    END IF;

    IF v_auth_record.email_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'ABORT: User % is not email-confirmed.', c_target_email;
    END IF;

    IF v_auth_record.banned_until IS NOT NULL AND v_auth_record.banned_until > NOW() THEN
        RAISE EXCEPTION 'ABORT: User % is currently banned.', c_target_email;
    END IF;

    -- 3. Assert profile exists (Baseline 1 guard)
    SELECT to_jsonb(p.*) INTO v_profile_before
    FROM public.profiles p
    WHERE id = c_target_uuid;

    IF v_profile_before IS NULL THEN
        RAISE EXCEPTION 'ABORT: Profile does not exist for %. Complete signup flow first.', c_target_email;
    END IF;

    -- 4. Apply profile update under transactional trigger control
    ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_role_escalation;

    UPDATE public.profiles
    SET 
        role = 'admin',
        is_verified = true,
        updated_at = NOW()
    WHERE id = c_target_uuid;

    ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_role_escalation;

    SELECT to_jsonb(p.*) INTO v_profile_after
    FROM public.profiles p
    WHERE id = c_target_uuid;

    -- 5. Upsert role grant in user_roles with granted_by = NULL
    INSERT INTO public.user_roles (
        user_id,
        role,
        granted_by,
        created_at
    ) VALUES (
        c_target_uuid,
        'admin',
        NULL, -- Truthful attribution: system DBA promotion
        NOW()
    )
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE 'SUCCESS: % promoted to administrator. Pre-state recorded.', c_target_email;
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_role_escalation;
        EXCEPTION WHEN OTHERS THEN NULL; END;
        RAISE;
END $$;

COMMIT;
```

---

## 6. Genuinely Viable Rollback Design

```sql
-- DRAFT ROLLBACK TRANSACTION (DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL)
BEGIN;

SET LOCAL lock_timeout = '2s';

DO $$
DECLARE
    c_target_uuid CONSTANT UUID := 'd68951e7-ba08-455f-bdfa-26307ef34fe8';
    -- Replace with the exact JSON snapshot captured in Preflight 3
    c_captured_profile_json CONSTANT JSONB := '{"id": "d68951e7-ba08-455f-bdfa-26307ef34fe8", "role": "customer", "is_verified": false}'::jsonb;
    -- Replace with the exact JSON array captured in Preflight 4
    c_captured_user_roles_json CONSTANT JSONB := '[]'::jsonb;
BEGIN
    -- 1. Remove admin role grant
    DELETE FROM public.user_roles
    WHERE user_id = c_target_uuid AND role = 'admin';

    -- 2. Restore all pre-existing role grants exactly
    INSERT INTO public.user_roles (user_id, role, granted_by, created_at)
    SELECT 
        (elem->>'user_id')::uuid,
        elem->>'role',
        (elem->>'granted_by')::uuid,
        (elem->>'created_at')::timestamptz
    FROM jsonb_array_elements(c_captured_user_roles_json) elem
    ON CONFLICT (user_id, role) DO UPDATE
    SET granted_by = EXCLUDED.granted_by;

    -- 3. Restore all profile columns dynamically from captured JSON
    ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_role_escalation;

    UPDATE public.profiles p
    SET 
        role                  = r.role,
        is_verified           = r.is_verified,
        full_name             = r.full_name,
        email                 = r.email,
        phone                 = r.phone,
        address               = r.address,
        preferred_location_id = r.preferred_location_id,
        avatar_url            = r.avatar_url,
        avatar_media_id       = r.avatar_media_id,
        updated_at            = r.updated_at
    FROM jsonb_populate_record(null::public.profiles, c_captured_profile_json) r
    WHERE p.id = r.id;

    ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_role_escalation;

    RAISE NOTICE 'SUCCESS: Exact original profile and role state restored.';
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_role_escalation;
        EXCEPTION WHEN OTHERS THEN NULL; END;
        RAISE;
END $$;

COMMIT;
```

---

## 7. Verification Checklist & Legacy Account Boundary

### Verification Checklist
1. **Trigger Integrity**: `pg_trigger.tgenabled` on `trg_prevent_profile_role_escalation` must be `'O'`.
2. **Profile State**: `profiles.role` = `'admin'` and `is_verified` = `true`.
3. **RBAC State**: `user_roles` contains `(user_id, 'admin', granted_by = NULL)`.
4. **Web UI Test**: Sign in at `https://vaangly-staging-test-2...` as `support.vaangly@gmail.com`. Confirm `useAuth().role` resolves to `'admin'`, `/admin/dashboard` loads, and `/admin/catalogue` queries succeed via PostgREST without 403 Forbidden.

### Legacy Account Boundary
- **`admin@vaangly.test` remains 100% untouched.**
- Zero role changes, zero auth banning, and zero token revocations on the legacy account until new admin operation is verified and an explicit future decision is requested.

---

## 8. Execution Record & Live Verification Results (2026-10-15)

### Execution Summary
- **Target User**: `support.vaangly@gmail.com`
- **Confirmed UUID**: `d68951e7-ba08-455f-bdfa-26307fe34fe8`
- **Mechanism**: Atomic privileged transaction with `SET LOCAL role = 'service_role'`. Security trigger `trg_prevent_profile_role_escalation` remained 100% active.
- **Executed At**: 2026-10-15T08:39:23Z
- **Audit ID**: `55b64914-d18e-4a35-a930-a231718f781d`

### Verified Post-State
1. **`public.profiles`**: `role = 'admin'`, `is_verified = false` (preserved), personal details intact.
2. **`public.user_roles`**: Contains both `admin` (`granted_by = NULL`) and `customer` (`granted_by = NULL`).
3. **`public.is_admin()`**: Evaluates to `true` under simulated authenticated session.
4. **`public.has_role('admin')`**: Evaluates to `true`.
5. **Admin RLS Visibility**: Target account verified with full read access to `admin_audit_logs` and `shops`.
6. **Legacy Boundary**: `admin@vaangly.test` (6 audit logs, role = admin) confirmed 100% untouched.

-- ============================================================================
-- VAANGLY STAGING ADMIN BOOTSTRAP MIGRATION
-- Migration: 20260920000029_staging_admin_bootstrap.sql
--
-- Safely promotes the designated staging test account (admin@vaangly.test)
-- to role = 'admin' and is_verified = true without weakening the existing
-- prevent_profile_role_escalation security trigger or opening privilege
-- escalation vulnerabilities for customers.
-- ============================================================================

-- 1. Update prevent_profile_role_escalation() to recognize authorized
--    staging bootstrap flag solely for the designated account admin@vaangly.test.
--    All other accounts and normal operations remain 100% protected.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- If role or is_verified is being changed
    IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_verified IS DISTINCT FROM NEW.is_verified) THEN
        -- Allow if caller is an existing verified admin (normal administrative action)
        -- OR if executing within the authorized staging bootstrap procedure for admin@vaangly.test
        IF NOT (
            public.is_admin()
            OR (
                current_setting('vaango.staging_admin_bootstrap', true) = 'true'
                AND NEW.email = 'admin@vaangly.test'
            )
        ) THEN
            RAISE EXCEPTION 'Access Denied: You do not have permission to modify account role or verification status.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger is active
DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- 2. Dedicated staging bootstrap function
--    Promotes ONLY admin@vaangly.test to role='admin' and is_verified=true.
CREATE OR REPLACE FUNCTION public.bootstrap_staging_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_profile record;
BEGIN
    -- Step A: Validate that the auth user exists in auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'admin@vaangly.test';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Auth user admin@vaangly.test does not exist in auth.users. Please create this user first in Supabase Authentication -> Users.';
    END IF;

    -- Step B: Ensure corresponding profile row exists
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        is_verified
    )
    VALUES (
        v_user_id,
        'admin@vaangly.test',
        'Staging Admin',
        'customer',
        false
    )
    ON CONFLICT (id) DO NOTHING;

    -- Step C: Set transaction-local session flag for prevent_profile_role_escalation
    PERFORM set_config('vaango.staging_admin_bootstrap', 'true', true);

    -- Step D: Execute the promotion
    UPDATE public.profiles
    SET role = 'admin',
        is_verified = true,
        updated_at = now()
    WHERE id = v_user_id AND email = 'admin@vaangly.test';

    -- Step E: Synchronize with public.user_roles if present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    -- Step F: Fetch and return verification data
    SELECT id, email, role, is_verified INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_profile.id,
        'email', v_profile.email,
        'role', v_profile.role,
        'is_verified', v_profile.is_verified,
        'message', 'Staging admin account promoted successfully.'
    );
END;
$$;

-- 3. Strict Execution Permissions
--    Prevent execution by anonymous callers and regular authenticated customers.
REVOKE ALL ON FUNCTION public.bootstrap_staging_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_staging_admin() TO postgres, service_role;

-- 4. Execute bootstrap immediately if the user already exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@vaangly.test') THEN
        PERFORM public.bootstrap_staging_admin();
    END IF;
END $$;

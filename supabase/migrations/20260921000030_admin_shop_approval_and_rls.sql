-- ============================================================================
-- VAANGLY ADMIN APPLICATION APPROVAL & SHOPS RLS MIGRATION
-- Migration: 20260921000030_admin_shop_approval_and_rls.sql
--
-- Enables platform administrators to approve shop applications, insert new
-- storefronts into public.shops, create trial subscriptions, and promote
-- applicant user accounts to role='shopkeeper'.
-- ============================================================================

-- 1. Ensure RLS on public.shops allows administrators full management
DROP POLICY IF EXISTS "Admins can view all shops" ON public.shops;
DROP POLICY IF EXISTS "Admins can update all shops" ON public.shops;
DROP POLICY IF EXISTS "Admins manage all shops" ON public.shops;

CREATE POLICY "Admins manage all shops" ON public.shops
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 2. Allow administrators to update profiles (e.g. promoting approved applicants to shopkeeper)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

CREATE POLICY "Admins can update profiles" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 3. Atomic Database Procedure for Shop Application Approval
CREATE OR REPLACE FUNCTION public.approve_shop_application(
    p_application_id UUID,
    p_admin_id UUID,
    p_review_notes TEXT DEFAULT 'Storefront verified and identity approved by admin.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_app RECORD;
    v_shop RECORD;
    v_admin_id UUID := auth.uid();
    v_now TIMESTAMPTZ := now();
    v_trial_end TIMESTAMPTZ := now() + interval '60 days';
    v_notes TEXT := COALESCE(NULLIF(trim(p_review_notes), ''), 'Storefront verified and identity approved by admin.');
BEGIN
    -- Strict admin guard
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only platform administrators can approve shop applications.';
    END IF;

    -- Fetch and lock application
    SELECT * INTO v_app
    FROM public.shop_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'Application not found with ID %', p_application_id;
    END IF;

    -- Step A: Mark application approved
    UPDATE public.shop_applications
    SET status = 'approved',
        reviewed_by = v_admin_id,
        review_notes = v_notes,
        updated_at = v_now
    WHERE id = p_application_id;

    -- Step B: Create storefront record (active, is_live = false, Catalogue Incomplete)
    INSERT INTO public.shops (
        owner_id,
        shop_type_id,
        location_id,
        name,
        tagline,
        address_line,
        phone,
        status,
        is_live,
        delivery_available,
        delivery_fee,
        upi_id,
        upi_qr_url,
        gps_lat,
        gps_lng,
        photo_url,
        is_open_today,
        created_at,
        updated_at
    )
    VALUES (
        v_app.applicant_id,
        v_app.shop_type_id,
        v_app.location_id,
        v_app.shop_name,
        COALESCE(v_app.description, 'Verified neighborhood business on Vaangly'),
        'Address not provided',
        v_app.contact_phone,
        'active',
        false,
        false,
        0,
        v_app.upi_id,
        v_app.upi_qr_url,
        v_app.gps_lat,
        v_app.gps_lng,
        v_app.photo_url,
        true,
        v_now,
        v_now
    )
    RETURNING * INTO v_shop;

    -- Step C: Create trial subscription (60 days)
    INSERT INTO public.shop_subscriptions (
        shop_id,
        status,
        trial_start_date,
        trial_end_date,
        go_live_date,
        daily_rate,
        billing_cycle,
        amount_due,
        created_at,
        updated_at
    )
    VALUES (
        v_shop.id,
        'TRIAL',
        v_now,
        v_trial_end,
        NULL,
        10.00,
        'MONTHLY',
        0.00,
        v_now,
        v_now
    )
    ON CONFLICT DO NOTHING;

    -- Step D: Upgrade applicant profile to role='shopkeeper' and verified
    IF v_app.applicant_id IS NOT NULL THEN
        UPDATE public.profiles
        SET role = 'shopkeeper',
            is_verified = true,
            updated_at = v_now
        WHERE id = v_app.applicant_id;

    DELETE FROM public.user_roles
    WHERE user_id = v_app.applicant_id AND role = 'customer';

    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (v_app.applicant_id, 'shopkeeper', v_admin_id)
    ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    -- Step E: Write admin audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action_type,
        entity_type,
        entity_id,
        details,
        created_at
    )
    VALUES (
        v_admin_id,
        'application_approved',
        'shop_application',
        p_application_id::text,
        jsonb_build_object(
            'shop_id', v_shop.id,
            'shop_name', v_app.shop_name,
            'notes', v_notes
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', v_shop.id,
        'application_id', p_application_id,
        'message', 'Application approved and shop created successfully.'
    );
END;
$$;

-- 4. Atomic Database Procedure for Shop Application Rejection
CREATE OR REPLACE FUNCTION public.reject_shop_application(
    p_application_id UUID,
    p_admin_id UUID,
    p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_app RECORD;
    v_now TIMESTAMPTZ := now();
    v_admin_id UUID := auth.uid();
    v_reason TEXT := trim(p_rejection_reason);
BEGIN
    -- Strict admin guard
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only platform administrators can reject shop applications.';
    END IF;

    IF v_reason IS NULL OR length(v_reason) = 0 THEN
        RAISE EXCEPTION 'Rejection reason is mandatory.';
    END IF;

    -- Fetch and lock application
    SELECT * INTO v_app
    FROM public.shop_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'Application not found with ID %', p_application_id;
    END IF;

    -- Update application status
    UPDATE public.shop_applications
    SET status = 'rejected',
        reviewed_by = v_admin_id,
        review_notes = v_reason,
        updated_at = v_now
    WHERE id = p_application_id;

    -- Write admin audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action_type,
        entity_type,
        entity_id,
        details,
        created_at
    )
    VALUES (
        v_admin_id,
        'application_rejected',
        'shop_application',
        p_application_id::text,
        jsonb_build_object(
            'shop_name', v_app.shop_name,
            'rejection_reason', v_reason
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'message', 'Application rejected successfully.'
    );
END;
$$;

-- 5. Execution grants
REVOKE ALL ON FUNCTION public.approve_shop_application(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_shop_application(UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_shop_application(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_shop_application(UUID, UUID, TEXT) TO authenticated;

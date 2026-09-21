-- ============================================================================
-- VAANGLY APPROVED SHOPS BACKFILL & CATALOGUE HARDENING
-- Migration: 20260921000032_sync_approved_shops_and_catalogue_hardening.sql
--
-- 1. Helper function public.is_shop_owner_or_admin() (SECURITY DEFINER)
-- 2. Backfills all approved shop applications into public.shops & shop_subscriptions
-- 3. Hardens RLS on public.shop_products, public.shop_services, public.appointment_slots
-- 4. Provides RPC public.provision_shop_for_approved_applicant()
-- ============================================================================

-- 1. SECURITY DEFINER HELPER TO CHECK SHOP OWNERSHIP OR PLATFORM ADMIN
CREATE OR REPLACE FUNCTION public.is_shop_owner_or_admin(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
    SELECT (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops
            WHERE id = p_shop_id
              AND owner_id = auth.uid()
        )
    );
$$;

-- 2. BACKFILL APPROVED APPLICATIONS INTO public.shops
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
SELECT 
    sa.applicant_id,
    sa.shop_type_id,
    sa.location_id,
    sa.shop_name,
    COALESCE(sa.description, 'Verified neighborhood business on Vaango'),
    'Town Center, Verified Storefront',
    sa.contact_phone,
    'active',
    false,
    false,
    0,
    sa.upi_id,
    sa.upi_qr_url,
    sa.gps_lat,
    sa.gps_lng,
    sa.photo_url,
    true,
    sa.updated_at,
    sa.updated_at
FROM public.shop_applications sa
WHERE sa.status = 'approved'
  AND sa.applicant_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.shops s WHERE s.owner_id = sa.applicant_id
  );

-- 3. BACKFILL TRIAL SUBSCRIPTIONS FOR ANY SHOPS MISSING ONE
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
SELECT 
    s.id,
    'TRIAL',
    s.created_at,
    s.created_at + interval '60 days',
    NULL,
    10.00,
    'MONTHLY',
    0.00,
    s.created_at,
    s.created_at
FROM public.shops s
WHERE NOT EXISTS (
    SELECT 1 FROM public.shop_subscriptions sub WHERE sub.shop_id = s.id
)
ON CONFLICT (shop_id) DO NOTHING;

-- 4. RPC TO ATOMICALLY PROVISION SHOP FOR APPROVED APPLICANTS IF MISSING
CREATE OR REPLACE FUNCTION public.provision_shop_for_approved_applicant(p_applicant_id uuid)
RETURNS SETOF public.shops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_app RECORD;
    v_shop public.shops%ROWTYPE;
BEGIN
    -- Only allow self or platform admin
    IF NOT (auth.uid() = p_applicant_id OR public.is_admin()) THEN
        RAISE EXCEPTION 'Access Denied: You cannot provision storefronts for other accounts.';
    END IF;

    -- If shop already exists, return it immediately
    SELECT * INTO v_shop
    FROM public.shops
    WHERE owner_id = p_applicant_id
    LIMIT 1;

    IF v_shop.id IS NOT NULL THEN
        RETURN NEXT v_shop;
        RETURN;
    END IF;

    -- Fetch latest approved application
    SELECT * INTO v_app
    FROM public.shop_applications
    WHERE applicant_id = p_applicant_id
      AND status = 'approved'
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_app.id IS NULL THEN
        RETURN;
    END IF;

    -- Insert storefront
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
    ) VALUES (
        v_app.applicant_id,
        v_app.shop_type_id,
        v_app.location_id,
        v_app.shop_name,
        COALESCE(v_app.description, 'Verified neighborhood business on Vaango'),
        'Town Center, Verified Storefront',
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
        now(),
        now()
    )
    RETURNING * INTO v_shop;

    -- Create subscription
    INSERT INTO public.shop_subscriptions (
        shop_id,
        status,
        trial_start_date,
        trial_end_date,
        daily_rate,
        billing_cycle,
        amount_due,
        created_at,
        updated_at
    ) VALUES (
        v_shop.id,
        'TRIAL',
        now(),
        now() + interval '60 days',
        10.00,
        'MONTHLY',
        0.00,
        now(),
        now()
    )
    ON CONFLICT (shop_id) DO NOTHING;

    RETURN NEXT v_shop;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_shop_for_approved_applicant(uuid) TO authenticated;

-- 5. REFRESH RLS POLICIES ON CATALOGUE & SERVICES USING SECURITY DEFINER HELPER
-- 5A. SHOP PRODUCTS
DROP POLICY IF EXISTS "Shop owners and admins view shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins insert shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins update shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins delete shop products" ON public.shop_products;

CREATE POLICY "Shop owners and admins view shop products" ON public.shop_products
    FOR SELECT TO authenticated
    USING (
        public.is_shop_owner_or_admin(shop_id)
    );

CREATE POLICY "Shop owners and admins insert shop products" ON public.shop_products
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_shop_owner_or_admin(shop_id)
    );

CREATE POLICY "Shop owners and admins update shop products" ON public.shop_products
    FOR UPDATE TO authenticated
    USING (
        public.is_shop_owner_or_admin(shop_id)
    )
    WITH CHECK (
        public.is_shop_owner_or_admin(shop_id)
    );

CREATE POLICY "Shop owners and admins delete shop products" ON public.shop_products
    FOR DELETE TO authenticated
    USING (
        public.is_shop_owner_or_admin(shop_id)
    );

-- 5B. SHOP SERVICES
DROP POLICY IF EXISTS "Shop owners and admins manage shop services" ON public.shop_services;

CREATE POLICY "Shop owners and admins manage shop services" ON public.shop_services
    FOR ALL TO authenticated
    USING (
        public.is_shop_owner_or_admin(shop_id)
    )
    WITH CHECK (
        public.is_shop_owner_or_admin(shop_id)
    );

-- 5C. APPOINTMENT SLOTS
DROP POLICY IF EXISTS "Shop owners and admins manage slots" ON public.appointment_slots;

CREATE POLICY "Shop owners and admins manage slots" ON public.appointment_slots
    FOR ALL TO authenticated
    USING (
        public.is_shop_owner_or_admin(shop_id)
    )
    WITH CHECK (
        public.is_shop_owner_or_admin(shop_id)
    );

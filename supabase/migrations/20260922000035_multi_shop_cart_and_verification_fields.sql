-- ============================================================================
-- VAANGLY MULTI-SHOP CART, VERIFICATION FIELDS & PRODUCT RATINGS MIGRATION
-- Migration: 20260922000035_multi_shop_cart_and_verification_fields.sql
-- ============================================================================

-- 1. ADD STRUCTURED VERIFICATION ADDRESS FIELDS TO SHOP APPLICATIONS
ALTER TABLE public.shop_applications
    ADD COLUMN IF NOT EXISTS area TEXT,
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS taluk TEXT,
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);

-- 2. ADD STRUCTURED ADDRESS FIELDS TO SHOPS
ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS area TEXT,
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS taluk TEXT,
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);

-- 3. ENHANCE SHOP RATINGS WITH CUSTOMER REVIEW TEXT
ALTER TABLE public.shop_ratings
    ADD COLUMN IF NOT EXISTS review TEXT;

-- 4. ENSURE RLS ON SHOP RATINGS REQUIRES COMPLETED ORDERS
DROP POLICY IF EXISTS "Customers insert own rating" ON public.shop_ratings;
CREATE POLICY "Customers insert own rating" ON public.shop_ratings
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = customer_id
        AND EXISTS (
            SELECT 1 FROM public.requests r
            WHERE r.id = shop_ratings.request_id
              AND r.customer_id = auth.uid()
              AND r.current_state = 'COMPLETED'
        )
    );

DROP POLICY IF EXISTS "Customers update own rating" ON public.shop_ratings;
CREATE POLICY "Customers update own rating" ON public.shop_ratings
    FOR UPDATE TO authenticated
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

-- 5. CREATE PRODUCT RATINGS TABLE & POLICIES
CREATE TABLE IF NOT EXISTS public.product_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.shop_products(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, product_id, request_id)
);

ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product ratings" ON public.product_ratings;
CREATE POLICY "Public read product ratings" ON public.product_ratings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Customers insert product rating for completed purchase" ON public.product_ratings;
CREATE POLICY "Customers insert product rating for completed purchase" ON public.product_ratings
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = customer_id
        AND EXISTS (
            SELECT 1 FROM public.requests r
            WHERE r.id = product_ratings.request_id
              AND r.customer_id = auth.uid()
              AND r.current_state = 'COMPLETED'
        )
    );

DROP POLICY IF EXISTS "Customers update own product rating" ON public.product_ratings;
CREATE POLICY "Customers update own product rating" ON public.product_ratings
    FOR UPDATE TO authenticated
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

-- View for Product Average Ratings
CREATE OR REPLACE VIEW public.product_avg_ratings AS
    SELECT product_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS total_ratings
    FROM public.product_ratings GROUP BY product_id;

-- 6. ALLOW SHOPKEEPERS TO READ CUSTOMER PROFILES FOR ORDERS PLACED AT THEIR SHOP
DROP POLICY IF EXISTS "Shopkeepers can view order customer profiles" ON public.profiles;
CREATE POLICY "Shopkeepers can view order customer profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.requests r
            JOIN public.shops s ON s.id = r.shop_id
            WHERE r.customer_id = profiles.id
              AND s.owner_id = auth.uid()
        )
    );

-- 7. UPDATE APPROVE_SHOP_APPLICATION PROCEDURE TO POPULATE STRUCTURED ADDRESS FIELDS
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
    v_now TIMESTAMPTZ := now();
    v_notes TEXT := COALESCE(NULLIF(trim(p_review_notes), ''), 'Storefront verified and identity approved by admin.');
    v_composed_address TEXT;
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
        reviewed_by = p_admin_id,
        review_notes = v_notes,
        updated_at = v_now
    WHERE id = p_application_id;

    -- Compute structured formatted address
    v_composed_address := COALESCE(
        NULLIF(
            TRIM(
                COALESCE(v_app.area, '') ||
                CASE WHEN v_app.taluk IS NOT NULL AND v_app.taluk != '' THEN ', ' || v_app.taluk ELSE '' END ||
                CASE WHEN v_app.district IS NOT NULL AND v_app.district != '' THEN ', ' || v_app.district ELSE '' END ||
                CASE WHEN v_app.pincode IS NOT NULL AND v_app.pincode != '' THEN ' - ' || v_app.pincode ELSE '' END
            ),
            ''
        ),
        'Town Center, Verified Storefront'
    );

    -- Step B: Create storefront record
    INSERT INTO public.shops (
        owner_id,
        shop_type_id,
        location_id,
        name,
        tagline,
        address_line,
        area,
        district,
        taluk,
        pincode,
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
        v_composed_address,
        v_app.area,
        v_app.district,
        v_app.taluk,
        v_app.pincode,
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
        'trial',
        v_now,
        v_now + interval '60 days',
        NULL,
        10.00,
        'monthly',
        0.00,
        v_now,
        v_now
    )
    ON CONFLICT (shop_id) DO NOTHING;

    -- Step D: Promote applicant user account to role='shopkeeper'
    UPDATE public.profiles
    SET role = 'shopkeeper',
        updated_at = v_now
    WHERE id = v_app.applicant_id;

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', v_shop.id,
        'application_id', p_application_id,
        'owner_id', v_app.applicant_id
    );
END;
$$;

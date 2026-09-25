-- Migration: 20261002000052_group_d_sales_and_services.sql
-- Description: Introduces Group D (Sales & Services), adds capability-based tracking,
-- and preserves all existing shop types, workflows, and bakery dine-in/takeaway behaviors.

BEGIN;

-- 1. Insert Group D into public.workflow_groups
INSERT INTO public.workflow_groups (id, code, name, description, icon)
VALUES (
    '22222222-2222-2222-2222-222222222224',
    'SALES_SERVICE',
    'Sales & Services',
    'Combined retail product sales and on-demand repair, maintenance, or custom services',
    'Layers'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon;

-- 2. Insert Group D Shop Types
INSERT INTO public.shop_types (code, name, workflow_group_code, icon, display_order)
VALUES
    ('sales_service', 'Sales & Services', 'SALES_SERVICE', 'Layers', 120),
    ('other', 'General & Other Services', 'SALES_SERVICE', 'Store', 130)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    workflow_group_code = EXCLUDED.workflow_group_code,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order;

-- 3. Add additive capability columns to shop_applications
ALTER TABLE public.shop_applications
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS offerings TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;

-- 4. Add additive capability columns to shops
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;

-- 5. Backfill capabilities for existing shops based on their shop_type
UPDATE public.shops s
SET capabilities = CASE st.workflow_group_code
  WHEN 'ORDER' THEN 
    CASE WHEN st.code IN ('bakery', 'restaurant', 'hotel', 'cafe', 'café', 'food')
      THEN '["PRODUCT_SALES", "DINE_IN", "TAKEAWAY", "COUNTER_PICKUP", "DELIVERY"]'::jsonb
      ELSE '["PRODUCT_SALES", "COUNTER_PICKUP", "DELIVERY"]'::jsonb
    END
  WHEN 'APPOINTMENT' THEN '["APPOINTMENTS", "SERVICES"]'::jsonb
  WHEN 'SERVICE' THEN '["SERVICES", "SERVICE_REQUESTS"]'::jsonb
  ELSE '["PRODUCT_SALES", "SERVICES", "SERVICE_REQUESTS"]'::jsonb
END
FROM public.shop_types st
WHERE s.shop_type_id = st.id
  AND (s.capabilities IS NULL OR s.capabilities = '[]'::jsonb);

-- 6. Update approve_shop_application function to carry business_type and capabilities
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
    v_composed_address TEXT;
    v_capabilities JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only platform administrators can approve shop applications.';
    END IF;

    SELECT * INTO v_app FROM public.shop_applications WHERE id = p_application_id FOR UPDATE;
    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'Application not found with ID %', p_application_id;
    END IF;

    UPDATE public.shop_applications
    SET status = 'approved', reviewed_by = v_admin_id, review_notes = v_notes, updated_at = v_now
    WHERE id = p_application_id;

    v_composed_address := COALESCE(
        NULLIF(trim(v_app.address_line), ''),
        NULLIF(TRIM(
            COALESCE(v_app.area, '') ||
            CASE WHEN v_app.taluk IS NOT NULL AND v_app.taluk != '' THEN ', ' || v_app.taluk ELSE '' END ||
            CASE WHEN v_app.district IS NOT NULL AND v_app.district != '' THEN ', ' || v_app.district ELSE '' END ||
            CASE WHEN v_app.pincode IS NOT NULL AND v_app.pincode != '' THEN ' - ' || v_app.pincode ELSE '' END
        ), ''),
        'Address not provided'
    );

    v_capabilities := COALESCE(v_app.capabilities, '[]'::jsonb);
    IF v_capabilities = '[]'::jsonb THEN
      SELECT CASE st.workflow_group_code
        WHEN 'ORDER' THEN 
          CASE WHEN st.code IN ('bakery', 'restaurant', 'hotel', 'cafe', 'café', 'food')
            THEN '["PRODUCT_SALES", "DINE_IN", "TAKEAWAY", "COUNTER_PICKUP", "DELIVERY"]'::jsonb
            ELSE '["PRODUCT_SALES", "COUNTER_PICKUP", "DELIVERY"]'::jsonb
          END
        WHEN 'APPOINTMENT' THEN '["APPOINTMENTS", "SERVICES"]'::jsonb
        WHEN 'SERVICE' THEN '["SERVICES", "SERVICE_REQUESTS"]'::jsonb
        ELSE '["PRODUCT_SALES", "SERVICES", "SERVICE_REQUESTS"]'::jsonb
      END INTO v_capabilities
      FROM public.shop_types st WHERE st.id = v_app.shop_type_id;
    END IF;

    INSERT INTO public.shops (
        owner_id, shop_type_id, location_id, name, tagline, address_line,
        area, district, taluk, pincode, phone, status, is_live,
        delivery_available, delivery_fee, upi_id, upi_qr_url, gps_lat,
        gps_lng, photo_url, is_open_today, business_type, capabilities,
        created_at, updated_at
    )
    VALUES (
        v_app.applicant_id, v_app.shop_type_id, v_app.location_id, v_app.shop_name,
        LEFT(COALESCE(v_app.description, 'Verified neighborhood business on Vaangly'), 200),
        v_composed_address, v_app.area, v_app.district, v_app.taluk, v_app.pincode,
        v_app.contact_phone, 'active', false, false, 0, v_app.upi_id, v_app.upi_qr_url,
        v_app.gps_lat, v_app.gps_lng, v_app.photo_url, true,
        COALESCE(v_app.business_type, 'General Retail & Services'),
        COALESCE(v_capabilities, '["PRODUCT_SALES"]'::jsonb),
        v_now, v_now
    )
    RETURNING * INTO v_shop;

    INSERT INTO public.shop_subscriptions (
        shop_id, status, trial_start_date, trial_end_date, go_live_date,
        daily_rate, billing_cycle, amount_due, created_at, updated_at
    )
    VALUES (
        v_shop.id, 'TRIAL', v_now, v_trial_end, NULL,
        10.00, 'MONTHLY', 0.00, v_now, v_now
    )
    ON CONFLICT (shop_id) DO NOTHING;

    UPDATE public.profiles SET role = 'shopkeeper', updated_at = v_now
    WHERE id = v_app.applicant_id;

    DELETE FROM public.user_roles
    WHERE user_id = v_app.applicant_id AND role = 'customer';

    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (v_app.applicant_id, 'shopkeeper', v_admin_id)
    ON CONFLICT (user_id, role) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', v_shop.id,
        'application_id', p_application_id,
        'owner_id', v_app.applicant_id
    );
END;
$$;

COMMIT;

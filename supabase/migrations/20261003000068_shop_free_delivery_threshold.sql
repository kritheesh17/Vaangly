-- Migration: 20261003000068_shop_free_delivery_threshold.sql
-- Description: Adds configurable free_delivery_above threshold to shops and shop_applications
--              Ensures delivery settings are explicitly configured rather than assumed.

BEGIN;

-- 1. Add free_delivery_above to public.shops
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS free_delivery_above NUMERIC(12,2) DEFAULT NULL;

-- Add check constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shops_free_delivery_above_check'
  ) THEN
    ALTER TABLE public.shops
      ADD CONSTRAINT shops_free_delivery_above_check
      CHECK (free_delivery_above IS NULL OR free_delivery_above > 0);
  END IF;
END $$;

-- 2. Add delivery settings to public.shop_applications
ALTER TABLE public.shop_applications
  ADD COLUMN IF NOT EXISTS delivery_available BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_above NUMERIC(12,2) DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_applications_free_delivery_above_check'
  ) THEN
    ALTER TABLE public.shop_applications
      ADD CONSTRAINT shop_applications_free_delivery_above_check
      CHECK (free_delivery_above IS NULL OR free_delivery_above > 0);
  END IF;
END $$;

-- 3. Update public.approve_shop_application to copy delivery settings from application to shop
CREATE OR REPLACE FUNCTION public.approve_shop_application(
    p_application_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_app public.shop_applications%ROWTYPE;
    v_shop public.shops%ROWTYPE;
    v_existing_shop_id UUID;
    v_now TIMESTAMPTZ := now();
    v_trial_end TIMESTAMPTZ := now() + INTERVAL '30 days';
    v_composed_address TEXT;
    v_capabilities JSONB;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Only administrators can approve applications.'
        );
    END IF;

    SELECT * INTO v_app FROM public.shop_applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
    END IF;

    IF v_app.status != 'SUBMITTED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only applications with SUBMITTED status can be approved.'
        );
    END IF;

    UPDATE public.shop_applications
    SET status = 'APPROVED',
        review_notes = p_notes,
        reviewed_by = v_admin_id,
        updated_at = v_now
    WHERE id = p_application_id;

    v_composed_address := COALESCE(
        NULLIF(TRIM(v_app.address_line), ''),
        NULLIF(TRIM(CONCAT_WS(', ',
            NULLIF(TRIM(v_app.area), ''),
            NULLIF(TRIM(v_app.taluk), ''),
            NULLIF(TRIM(v_app.district), ''),
            NULLIF(TRIM(v_app.pincode), '')
        )), ''),
        'Address not provided'
    );

    IF v_app.capabilities IS NOT NULL AND jsonb_array_length(v_app.capabilities) > 0 THEN
      v_capabilities := v_app.capabilities;
    ELSE
      SELECT CASE st.workflow_group_code
        WHEN 'ORDER' THEN
          CASE
            WHEN LOWER(st.code) IN ('restaurant', 'hotel', 'bakery') THEN '["PRODUCT_SALES", "COUNTER_PICKUP", "DELIVERY", "DINE_IN", "TAKEAWAY"]'::jsonb
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
        delivery_available, delivery_fee, free_delivery_above,
        upi_id, upi_qr_url, gps_lat, gps_lng, photo_url, is_open_today,
        business_type, capabilities, created_at, updated_at
    )
    VALUES (
        v_app.applicant_id, v_app.shop_type_id, v_app.location_id, v_app.shop_name,
        LEFT(COALESCE(v_app.description, 'Verified neighborhood business on Vaangly'), 200),
        v_composed_address, v_app.area, v_app.district, v_app.taluk, v_app.pincode,
        v_app.contact_phone, 'active', false,
        COALESCE(v_app.delivery_available, false),
        COALESCE(v_app.delivery_fee, 0),
        v_app.free_delivery_above,
        v_app.upi_id, v_app.upi_qr_url,
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
        0, 'DAILY', 0, v_now, v_now
    );

    UPDATE public.profiles
    SET role = 'shopkeeper', updated_at = v_now
    WHERE id = v_app.applicant_id AND role = 'customer';

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', v_shop.id,
        'application_id', p_application_id,
        'status', 'APPROVED',
        'message', 'Application approved and shopfront created successfully.'
    );
END;
$$;

COMMIT;

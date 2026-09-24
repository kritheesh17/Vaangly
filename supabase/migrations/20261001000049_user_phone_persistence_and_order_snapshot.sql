-- ============================================================================
-- Migration: 20261001000049_user_phone_persistence_and_order_snapshot.sql
-- Description: Ensures robust user phone persistence in public.profiles and
--              first-class customer contact snapshotting on public.requests.
-- ============================================================================

BEGIN;

-- 1. Add dedicated customer_phone column on public.requests for direct order snapshots
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS customer_phone text;

CREATE INDEX IF NOT EXISTS idx_requests_customer_phone
  ON public.requests(customer_phone)
  WHERE customer_phone IS NOT NULL;

-- 2. Backfill existing request customer_phone from notes json if valid
UPDATE public.requests
SET customer_phone = NULLIF(TRIM(notes::json->>'customer_phone'), '')
WHERE customer_phone IS NULL
  AND notes IS NOT NULL
  AND notes LIKE '{%customer_phone%';

-- 3. Update handle_new_user() trigger to reliably persist phone from metadata on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_raw_phone text;
  v_clean_phone text;
BEGIN
  v_raw_phone := COALESCE(NEW.phone, NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''));

  -- Normalize 10-digit Indian phone numbers to canonical +91XXXXXXXXXX
  IF v_raw_phone IS NOT NULL AND v_raw_phone != '' THEN
    -- Strip non-digits except leading +
    v_clean_phone := regexp_replace(v_raw_phone, '[^0-9+]', '', 'g');
    IF v_clean_phone ~ '^\+91[6-9][0-9]{9}$' THEN
      v_raw_phone := v_clean_phone;
    ELSIF v_clean_phone ~ '^91[6-9][0-9]{9}$' THEN
      v_raw_phone := '+' || v_clean_phone;
    ELSIF v_clean_phone ~ '^0[6-9][0-9]{9}$' THEN
      v_raw_phone := '+91' || substring(v_clean_phone from 2);
    ELSIF v_clean_phone ~ '^[6-9][0-9]{9}$' THEN
      v_raw_phone := '+91' || v_clean_phone;
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    email,
    phone,
    is_verified
  )
  VALUES (
    NEW.id,
    'customer',
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'User'
    ),
    NEW.email,
    v_raw_phone,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update approve_shop_application() to synchronize applicant profile phone
CREATE OR REPLACE FUNCTION public.approve_shop_application(
  p_application_id uuid,
  p_admin_id uuid,
  p_review_notes text DEFAULT 'Storefront verified and identity approved by admin.'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_app RECORD;
    v_shop RECORD;
    v_admin_id UUID := auth.uid();
    v_now TIMESTAMPTZ := now();
    v_trial_end TIMESTAMPTZ := now() + interval '60 days';
    v_notes TEXT := COALESCE(NULLIF(trim(p_review_notes), ''), 'Storefront verified and identity approved by admin.');
    v_composed_address TEXT;
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
        NULLIF(TRIM(
            COALESCE(v_app.area, '') ||
            CASE WHEN v_app.taluk IS NOT NULL AND v_app.taluk != '' THEN ', ' || v_app.taluk ELSE '' END ||
            CASE WHEN v_app.district IS NOT NULL AND v_app.district != '' THEN ', ' || v_app.district ELSE '' END ||
            CASE WHEN v_app.pincode IS NOT NULL AND v_app.pincode != '' THEN ' - ' || v_app.pincode ELSE '' END
        ), ''),
        'Address not provided'
    );

    INSERT INTO public.shops (
        owner_id, shop_type_id, location_id, name, tagline, address_line,
        area, district, taluk, pincode, phone, status, is_live,
        delivery_available, delivery_fee, upi_id, upi_qr_url, gps_lat,
        gps_lng, photo_url, is_open_today, created_at, updated_at
    )
    VALUES (
        v_app.applicant_id, v_app.shop_type_id, v_app.location_id, v_app.shop_name,
        LEFT(COALESCE(v_app.description, 'Verified neighborhood business on Vaangly'), 200),
        v_composed_address, v_app.area, v_app.district, v_app.taluk, v_app.pincode,
        v_app.contact_phone, 'active', false, false, 0, v_app.upi_id, v_app.upi_qr_url,
        v_app.gps_lat, v_app.gps_lng, v_app.photo_url, true, v_now, v_now
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

    -- Update applicant profile role and guarantee phone is populated
    UPDATE public.profiles
    SET role = 'shopkeeper',
        phone = COALESCE(public.profiles.phone, v_app.contact_phone),
        updated_at = v_now
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
$function$;

COMMIT;

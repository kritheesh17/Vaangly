-- Migration: 20260930000047_harden_food_order_type_and_shop_types.sql
-- Description: Fixes NULL check in validate_food_order_type and ensures approve_shop_application
-- carries the exact verified address_line from shop_applications into public.shops.

-- 1. Fix validate_food_order_type() to properly reject NULL fulfillment_type
-- In SQL, `NULL NOT IN ('DINE_IN', 'TAKEAWAY')` evaluates to UNKNOWN/NULL (falsy in IF).
-- Explicitly checking IS NULL ensures food orders cannot be submitted without Dine-in or Takeaway choice.
CREATE OR REPLACE FUNCTION public.validate_food_order_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_type_code TEXT;
BEGIN
  IF NEW.workflow_group_code = 'ORDER' THEN
    SELECT code INTO v_shop_type_code
    FROM public.shop_types st
    JOIN public.shops s ON s.shop_type_id = st.id
    WHERE s.id = NEW.shop_id;

    IF v_shop_type_code IN ('restaurant', 'hotel', 'bakery', 'cafe', 'café', 'food')
       AND (NEW.fulfillment_type IS NULL OR NEW.fulfillment_type NOT IN ('DINE_IN', 'TAKEAWAY')) THEN
      RAISE EXCEPTION 'Food orders require order type DINE_IN or TAKEAWAY';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_food_order_type ON public.requests;
CREATE TRIGGER trg_validate_food_order_type
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_food_order_type();

-- 2. Enhance approve_shop_application to directly prioritize v_app.address_line
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

GRANT EXECUTE ON FUNCTION public.approve_shop_application(UUID, UUID, TEXT) TO authenticated, service_role;

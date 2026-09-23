-- Migration: 20260930000046_controlled_shop_go_live.sql
-- Description: Unblocks shopkeeper Go Live via a secure, controlled RPC while preserving
-- security boundaries (guarding ownership, category, and approval fields).

-- 1. Update guard_shopkeeper_shop_details() to permit is_live and location updates by shop owners,
-- while firmly protecting owner_id, shop_type_id, location_id, and status against unauthorized tampering.
CREATE OR REPLACE FUNCTION public.guard_shopkeeper_shop_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.shop_type_id IS DISTINCT FROM OLD.shop_type_id
       OR NEW.location_id IS DISTINCT FROM OLD.location_id
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Shopkeeper cannot change shop ownership, approval, or category fields';
    END IF;

    -- Prevent reactivating a suspended shop
    IF NEW.is_live AND (OLD.status = 'suspended' OR NEW.status = 'suspended') THEN
      RAISE EXCEPTION 'A suspended shop cannot be made live. Contact support for assistance.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_shopkeeper_shop_details ON public.shops;
CREATE TRIGGER trg_guard_shopkeeper_shop_details
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.guard_shopkeeper_shop_details();

-- 2. Update require_shop_upi_qr() so shop_applications and shops only validate UPI QR if UPI ID is actually provided
-- (cash-only merchants must not be globally blocked by UPI requirements).
CREATE OR REPLACE FUNCTION public.require_shop_upi_qr()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'shop_applications'
     AND (TG_OP = 'INSERT' OR NEW.upi_id IS DISTINCT FROM OLD.upi_id OR NEW.upi_qr_url IS DISTINCT FROM OLD.upi_qr_url)
     AND NULLIF(trim(COALESCE(NEW.upi_id, '')), '') IS NOT NULL
     AND (
       NULLIF(trim(COALESCE(NEW.upi_qr_url, '')), '') IS NULL
       OR lower(NEW.upi_qr_url) LIKE '%your-project-id%'
       OR NEW.upi_qr_url !~* '^(https?://|data:image/)'
     ) THEN
    RAISE EXCEPTION 'UPI QR code is required to accept UPI payments';
  ELSIF TG_TABLE_NAME = 'shops'
     AND (TG_OP = 'INSERT' OR NEW.upi_id IS DISTINCT FROM OLD.upi_id OR NEW.upi_qr_url IS DISTINCT FROM OLD.upi_qr_url)
     AND NULLIF(trim(COALESCE(NEW.upi_id, '')), '') IS NOT NULL
     AND (
       NULLIF(trim(COALESCE(NEW.upi_qr_url, '')), '') IS NULL
       OR lower(NEW.upi_qr_url) LIKE '%your-project-id%'
       OR NEW.upi_qr_url !~* '^(https?://|data:image/)'
     ) THEN
    RAISE EXCEPTION 'UPI QR code is required to accept UPI payments';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Controlled Security-Definer RPC for Shopkeeper Go Live / Offline Toggle
CREATE OR REPLACE FUNCTION public.toggle_shop_live(
  p_shop_id UUID,
  p_is_live BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_shop RECORD;
  v_caller_id UUID := auth.uid();
  v_workflow_group TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_shop
  FROM public.shops
  WHERE id = p_shop_id
  FOR UPDATE;

  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'Shop not found.';
  END IF;

  -- Verify caller ownership or admin role
  IF v_shop.owner_id <> v_caller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access Denied: You can only change the live status of your own shop.';
  END IF;

  -- Going Live validations
  IF p_is_live THEN
    -- Check suspension
    IF v_shop.status = 'suspended' THEN
      RAISE EXCEPTION 'Your shop was suspended by platform administrators and cannot be made live. Please contact support.';
    END IF;

    -- Check application approval status
    IF NOT EXISTS (
      SELECT 1 FROM public.shop_applications
      WHERE applicant_id = v_shop.owner_id
        AND status = 'approved'
    ) AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Your shop application is still awaiting admin approval.';
    END IF;

    -- Check physical location and GPS coordinates
    IF NULLIF(trim(COALESCE(v_shop.address_line, '')), '') IS NULL
       OR v_shop.gps_lat IS NULL
       OR v_shop.gps_lng IS NULL THEN
      RAISE EXCEPTION 'Please configure your shop address and GPS storefront coordinates before going live.';
    END IF;

    -- Check catalogue readiness by business workflow group
    SELECT workflow_group_code INTO v_workflow_group
    FROM public.shop_types
    WHERE id = v_shop.shop_type_id;

    IF v_workflow_group = 'ORDER' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.shop_products
        WHERE shop_id = p_shop_id AND is_available = true
      ) THEN
        RAISE EXCEPTION 'Your catalogue has no items yet. Add at least one product before making your shop visible to customers.';
      END IF;
    ELSIF v_workflow_group IN ('SERVICE', 'APPOINTMENT') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.shop_services
        WHERE shop_id = p_shop_id AND is_available = true
      ) AND v_shop.slot_config IS NULL THEN
        RAISE EXCEPTION 'Your catalogue has no services or appointment slots yet. Add at least one service before making your shop visible to customers.';
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.shop_products WHERE shop_id = p_shop_id AND is_available = true
      ) AND NOT EXISTS (
        SELECT 1 FROM public.shop_services WHERE shop_id = p_shop_id AND is_available = true
      ) AND v_shop.slot_config IS NULL THEN
        RAISE EXCEPTION 'Your catalogue has no items yet. Add at least one product or service before making your shop visible to customers.';
      END IF;
    END IF;

    -- Perform update to make live
    UPDATE public.shops
    SET is_live = true,
        status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END,
        updated_at = v_now
    WHERE id = p_shop_id
    RETURNING * INTO v_shop;

    -- Update subscription go_live_date if not previously recorded
    UPDATE public.shop_subscriptions
    SET go_live_date = COALESCE(go_live_date, v_now),
        updated_at = v_now
    WHERE shop_id = p_shop_id;

  ELSE
    -- Take offline / pause
    UPDATE public.shops
    SET is_live = false,
        updated_at = v_now
    WHERE id = p_shop_id
    RETURNING * INTO v_shop;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'shop', row_to_json(v_shop)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_shop_live(UUID, BOOLEAN) TO authenticated, service_role;

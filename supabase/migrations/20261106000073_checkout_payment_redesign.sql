-- ==============================================================================
-- Migration: 20261106000073_checkout_payment_redesign.sql
-- Description: Checkout Payment Redesign, Acceptance-Gated Proof & Query Indexes
--
-- 1. Updates validate_request_payment_fields() so that customer order requests
--    can be placed without requiring upfront payment proof.
-- 2. Restricts payment screenshot submission on orders strictly to accepted states
--    ('CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED').
-- 3. Rejects payment submissions for unaccepted ('REQUESTED'), cancelled, or rejected orders.
-- 4. Preserves appointment booking and appointment payment workflows 100% intact.
-- 5. Adds composite performance indexes for customer catalog and active orders.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_request_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_shopkeeper BOOLEAN;
  v_method TEXT;
  v_payload JSONB;
BEGIN
  -- Parse legacy notes JSON if payment_method column is empty
  BEGIN
    v_payload := CASE
      WHEN NEW.notes IS NOT NULL AND NEW.notes LIKE '{%}' THEN NEW.notes::jsonb
      ELSE '{}'::jsonb
    END;
  EXCEPTION WHEN OTHERS THEN
    v_payload := '{}'::jsonb;
  END;

  v_method := lower(COALESCE(NULLIF(NEW.payment_method, ''), v_payload->>'payment_method', 'cash'));
  IF v_method IN ('cash', 'pay_at_shop') THEN
    v_method := 'cash';
  ELSIF v_method = 'upi' THEN
    v_method := 'upi';
  ELSE
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  NEW.payment_method := v_method;

  IF TG_OP = 'INSERT' THEN
    IF v_method = 'upi' THEN
      -- In the redesigned checkout flow, orders are submitted without upfront payment.
      -- APPOINTMENT holds also insert without upfront payment proof.
      IF NULLIF(trim(COALESCE(NEW.payment_screenshot_url, '')), '') IS NULL THEN
        NEW.payment_status := 'PAYMENT_PENDING';
        NEW.customer_paid := FALSE;
      ELSE
        NEW.payment_status := 'PAYMENT_PROOF_SUBMITTED';
        NEW.customer_paid := FALSE;
      END IF;

      IF NEW.payment_amount IS NULL OR NEW.payment_amount IS DISTINCT FROM NEW.total_estimate THEN
        NEW.payment_amount := NEW.total_estimate;
      END IF;
    ELSE
      -- Cash / Pay at shop
      NEW.payment_amount := NULL;
      NEW.payment_screenshot_url := NULL;
      IF NEW.payment_status NOT IN ('unpaid', 'NOT_REQUIRED', 'pending') THEN
        NEW.payment_status := 'NOT_REQUIRED';
      END IF;
      NEW.payment_verified_at := NULL;
      NEW.payment_verified_by := NULL;
      NEW.payment_rejection_reason := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_is_shopkeeper := public.is_admin() OR EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id = OLD.shop_id AND s.owner_id = auth.uid()
  );

  IF NOT v_is_shopkeeper AND NOT public.is_admin() THEN
    -- Customer updating proof
    IF NEW.payment_screenshot_url IS DISTINCT FROM OLD.payment_screenshot_url THEN
      IF NEW.payment_method <> 'upi' OR NULLIF(trim(COALESCE(NEW.payment_screenshot_url, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A payment proof is only valid for a UPI request';
      END IF;

      -- Enforce order acceptance gate for product orders
      IF OLD.workflow_group_code <> 'APPOINTMENT' THEN
        IF OLD.current_state IN ('REQUESTED') THEN
          RAISE EXCEPTION 'Payment proof cannot be submitted before shopkeeper acceptance';
        END IF;
        IF OLD.current_state IN ('REJECTED', 'CANCELLED', 'EXPIRED') THEN
          RAISE EXCEPTION 'Payment cannot be submitted for rejected or cancelled requests';
        END IF;
        IF OLD.current_state NOT IN ('ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED') THEN
          RAISE EXCEPTION 'Payment can only be submitted after the order has been accepted';
        END IF;
      END IF;

      NEW.payment_status := 'PAYMENT_PROOF_SUBMITTED';
      NEW.customer_paid := FALSE;
      NEW.hold_expires_at := NULL; -- appointment hold converted to active proof
    END IF;
  ELSE
    -- Shopkeeper updating payment verification
    IF NEW.payment_status IN ('PAYMENT_VERIFIED', 'paid') THEN
      NEW.payment_verified_at := COALESCE(NEW.payment_verified_at, now());
      NEW.paid_at := COALESCE(NEW.paid_at, now());
      NEW.payment_verified_by := COALESCE(NEW.payment_verified_by, auth.uid());
      NEW.paid_by := COALESCE(NEW.paid_by, auth.uid());
      NEW.payment_rejection_reason := NULL;
      NEW.customer_paid := TRUE;
    ELSIF NEW.payment_status IN ('PAYMENT_REJECTED', 'failed') THEN
      NEW.payment_verified_at := NULL;
      NEW.paid_at := NULL;
      NEW.payment_verified_by := NULL;
      NEW.paid_by := NULL;
      NEW.customer_paid := FALSE;
      NEW.payment_rejection_reason := COALESCE(NULLIF(NEW.payment_rejection_reason, ''), 'Payment verification declined by shopkeeper');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Composite Performance Indexes
CREATE INDEX IF NOT EXISTS idx_shops_active_location
  ON public.shops(location_id, status, is_live, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_products_shop_available
  ON public.shop_products(shop_id, is_available, is_banned);

CREATE INDEX IF NOT EXISTS idx_requests_customer_active_orders
  ON public.requests(customer_id, current_state);

COMMIT;

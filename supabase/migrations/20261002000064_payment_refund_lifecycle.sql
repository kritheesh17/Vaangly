-- Payment/refund lifecycle for orders, services, and appointments.
-- Vaangly does not have a gateway refund integration: online refunds remain
-- operationally required until a verified provider action is recorded.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_method TEXT,
  ADD COLUMN IF NOT EXISTS refund_reference TEXT,
  ADD COLUMN IF NOT EXISTS refund_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_recorded_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_refund_status_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_refund_status_check
  CHECK (refund_status IN ('not_required', 'required', 'initiated', 'refunded', 'failed'));

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_refund_method_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_refund_method_check
  CHECK (refund_method IS NULL OR refund_method IN ('cash', 'upi', 'other'));

CREATE INDEX IF NOT EXISTS idx_requests_refund_status
  ON public.requests(shop_id, refund_status, updated_at DESC);

-- Preserve the same safety signal for already-cancelled verified payments.
UPDATE public.requests
SET refund_status = 'required',
    refund_amount = COALESCE(refund_amount, payment_amount, total_estimate, 0),
    refund_reason = COALESCE(NULLIF(refund_reason, ''), 'Cancelled after verified payment.')
WHERE current_state IN ('CANCELLED', 'REJECTED')
  AND refund_status = 'not_required'
  AND (customer_paid IS TRUE OR payment_status IN ('PAYMENT_VERIFIED', 'paid'));

-- A cancellation does not mean a refund happened. It only creates the
-- explicit operational obligation when a payment had already been verified,
-- or when a payment on a cancelled/rejected request becomes verified later.
CREATE OR REPLACE FUNCTION public.require_refund_for_cancelled_paid_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_terminal BOOLEAN;
  v_is_paid BOOLEAN;
BEGIN
  v_is_terminal := NEW.current_state IN ('CANCELLED', 'REJECTED');
  v_is_paid := (NEW.customer_paid IS TRUE OR NEW.payment_status IN ('PAYMENT_VERIFIED', 'paid')
                OR OLD.customer_paid IS TRUE OR OLD.payment_status IN ('PAYMENT_VERIFIED', 'paid'));

  -- Trigger when transitioning into terminal state while paid,
  -- OR when payment becomes verified while already in terminal state.
  IF v_is_terminal
     AND v_is_paid
     AND (OLD.refund_status IS NULL OR OLD.refund_status IN ('not_required', 'failed'))
     AND (NEW.refund_status IS NULL OR NEW.refund_status <> 'refunded') THEN
    NEW.refund_status := 'required';
    NEW.refund_amount := COALESCE(OLD.refund_amount, NEW.payment_amount, OLD.payment_amount, NEW.total_estimate, OLD.total_estimate, 0);
    NEW.refund_method := NULL;
    NEW.refund_reference := NULL;
    NEW.refund_initiated_at := NULL;
    NEW.refund_completed_at := NULL;
    NEW.refund_reason := COALESCE(NULLIF(NEW.refund_reason, ''), NULLIF(OLD.refund_reason, ''), 'Cancelled after verified payment.');
    NEW.refund_recorded_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_require_refund_for_cancelled_paid_request ON public.requests;
CREATE TRIGGER a_require_refund_for_cancelled_paid_request
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.require_refund_for_cancelled_paid_request();

-- Customers can observe the automatically-created "required" state when they
-- cancel a paid request, but cannot mark a refund initiated, completed, or
-- failed (or alter its amount/method/reference).
CREATE OR REPLACE FUNCTION public.validate_request_refund_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_authorized BOOLEAN;
  v_auto_requirement BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.refund_status <> 'not_required'
       OR NEW.refund_amount IS NOT NULL
       OR NEW.refund_method IS NOT NULL
       OR NEW.refund_reference IS NOT NULL
       OR NEW.refund_initiated_at IS NOT NULL
       OR NEW.refund_completed_at IS NOT NULL
       OR NEW.refund_recorded_by IS NOT NULL THEN
      RAISE EXCEPTION 'Refund fields are database-controlled';
    END IF;
    RETURN NEW;
  END IF;

  v_is_authorized := public.is_admin() OR EXISTS (
    SELECT 1 FROM public.shops s WHERE s.id = OLD.shop_id AND s.owner_id = auth.uid()
  );

  v_auto_requirement := NEW.current_state IN ('CANCELLED', 'REJECTED')
    AND NEW.refund_status = 'required'
    AND NEW.refund_amount = COALESCE(OLD.refund_amount, NEW.payment_amount, OLD.payment_amount, NEW.total_estimate, OLD.total_estimate, 0)
    AND NEW.refund_method IS NULL
    AND NEW.refund_reference IS NULL
    AND NEW.refund_initiated_at IS NULL
    AND NEW.refund_completed_at IS NULL
    AND NEW.refund_recorded_by IS NULL;

  IF NOT v_is_authorized
     AND (
       NEW.refund_status IS DISTINCT FROM OLD.refund_status
       OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
       OR NEW.refund_method IS DISTINCT FROM OLD.refund_method
       OR NEW.refund_reference IS DISTINCT FROM OLD.refund_reference
       OR NEW.refund_initiated_at IS DISTINCT FROM OLD.refund_initiated_at
       OR NEW.refund_completed_at IS DISTINCT FROM OLD.refund_completed_at
       OR NEW.refund_reason IS DISTINCT FROM OLD.refund_reason
       OR NEW.refund_recorded_by IS DISTINCT FROM OLD.refund_recorded_by
     )
     AND NOT v_auto_requirement THEN
    RAISE EXCEPTION 'Customers cannot change refund state';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS z_validate_request_refund_fields ON public.requests;
CREATE TRIGGER z_validate_request_refund_fields
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_request_refund_fields();

-- The platform has no payment-gateway refund API. This RPC is deliberately
-- restricted to refunding a Pay-at-Shop payment that the shopkeeper has
-- physically returned; it never claims a UPI/bank refund was processed.
CREATE OR REPLACE FUNCTION public.record_pay_at_shop_refund(
  p_request_id UUID,
  p_refund_method TEXT DEFAULT 'cash',
  p_refund_reference TEXT DEFAULT NULL,
  p_refund_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_request RECORD;
  v_method TEXT := lower(trim(COALESCE(p_refund_method, 'cash')));
  v_actor_id UUID;
  v_amount NUMERIC(12,2);
BEGIN
  SELECT r.*, s.owner_id INTO v_request
  FROM public.requests r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
  END IF;
  IF NOT (public.is_admin() OR v_request.owner_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the authorized shopkeeper can record this refund.');
  END IF;
  IF v_request.current_state NOT IN ('CANCELLED', 'REJECTED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'A refund can only be recorded after cancellation or rejection.');
  END IF;
  IF lower(COALESCE(NULLIF(trim(v_request.payment_method), ''), 'cash')) NOT IN ('cash', 'pay_at_shop') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Online refunds must be processed by the external payment provider.');
  END IF;
  IF v_request.refund_status NOT IN ('required', 'initiated', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request does not have a refundable payment.');
  END IF;
  IF v_method NOT IN ('cash', 'upi', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund method.');
  END IF;

  v_actor_id := COALESCE(auth.uid(), v_request.owner_id);
  v_amount := COALESCE(v_request.refund_amount, v_request.payment_amount, v_request.total_estimate, 0);

  UPDATE public.requests
  SET payment_status = 'refunded',
      refund_status = 'refunded',
      refund_amount = v_amount,
      refund_method = v_method,
      refund_reference = NULLIF(trim(p_refund_reference), ''),
      refund_completed_at = now(),
      refund_reason = COALESCE(NULLIF(trim(p_refund_reason), ''), refund_reason, 'Cancelled after verified payment.'),
      refund_recorded_by = v_actor_id,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.request_events (request_id, from_state, to_state, actor_id, actor_role, notes)
  VALUES (
    p_request_id, v_request.current_state, v_request.current_state, v_actor_id, 'shopkeeper',
    'Refund returned by shopkeeper: ' || v_amount::text || ' via ' || v_method || '.'
  );

  RETURN jsonb_build_object('success', true, 'refund_amount', v_amount, 'refund_completed_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.record_pay_at_shop_refund(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pay_at_shop_refund(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

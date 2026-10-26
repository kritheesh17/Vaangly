-- ==============================================================================
-- Migration: 20261026000070_order_cancellation_and_customer_moderation.sql
-- Description: Production-Quality Order Cancellation, Abuse Monitoring, and
--              Customer Moderation System for Vaangly.
--
-- 1. Extend public.requests with first-class cancellation request & status tracking.
-- 2. Create public.customer_cancellation_events to track genuine qualifying cancellations.
-- 3. Create public.cancellation_policy_settings for administrator-configurable thresholds.
-- 4. Create public.customer_moderation for warnings, flags, and server-side ordering suspension.
-- 5. Update state machine: allow READY -> CANCELLED upon authorized approval.
-- 6. Enforce server-side customer suspension in validate_request_creation_and_mutation().
-- 7. Add atomic RPCs for direct cancellation, requesting cancellation, shopkeeper response,
--    and admin moderation.
-- 8. Define strict Row Level Security (RLS) policies.
-- ==============================================================================

BEGIN;

-- 1. EXTEND PUBLIC.REQUESTS FOR CANCELLATION REQUESTS
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancellation_request_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_explanation TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_actor_role TEXT;

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_cancellation_request_status_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_cancellation_request_status_check
  CHECK (cancellation_request_status IN ('none', 'pending', 'approved', 'rejected'));

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_cancellation_actor_role_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_cancellation_actor_role_check
  CHECK (cancellation_actor_role IS NULL OR cancellation_actor_role IN ('customer', 'shopkeeper', 'admin'));

CREATE INDEX IF NOT EXISTS idx_requests_cancellation_pending
  ON public.requests(shop_id, cancellation_request_status)
  WHERE cancellation_request_status = 'pending';


-- 2. CANCELLATION POLICY SETTINGS (Configurable thresholds with safe defaults)
CREATE TABLE IF NOT EXISTS public.cancellation_policy_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  window_days INT NOT NULL DEFAULT 30 CHECK (window_days > 0),
  first_warning_threshold INT NOT NULL DEFAULT 1 CHECK (first_warning_threshold > 0),
  second_warning_threshold INT NOT NULL DEFAULT 2 CHECK (second_warning_threshold >= first_warning_threshold),
  review_threshold INT NOT NULL DEFAULT 3 CHECK (review_threshold >= second_warning_threshold),
  exclude_unaccepted_orders BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

INSERT INTO public.cancellation_policy_settings (
  id, window_days, first_warning_threshold, second_warning_threshold, review_threshold, exclude_unaccepted_orders
) VALUES (
  'default', 30, 1, 2, 3, TRUE
) ON CONFLICT (id) DO NOTHING;


-- 3. CUSTOMER MODERATION (Server-enforced warnings, review flags, and suspensions)
CREATE TABLE IF NOT EXISTS public.customer_moderation (
  customer_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspension_reason TEXT,
  suspended_at TIMESTAMPTZ,
  suspension_expires_at TIMESTAMPTZ,
  suspended_by UUID REFERENCES public.profiles(id),
  flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  flagged_at TIMESTAMPTZ,
  flag_reason TEXT,
  warning_count INT NOT NULL DEFAULT 0,
  last_warning_at TIMESTAMPTZ,
  last_warning_level TEXT CHECK (last_warning_level IS NULL OR last_warning_level IN ('reminder', 'formal_warning')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_moderation_suspended
  ON public.customer_moderation(customer_id)
  WHERE is_suspended IS TRUE;

CREATE INDEX IF NOT EXISTS idx_customer_moderation_flagged
  ON public.customer_moderation(flagged_for_review)
  WHERE flagged_for_review IS TRUE;


-- 4. CUSTOMER CANCELLATION EVENTS (Audit trail for qualifying cancellation abuse monitoring)
CREATE TABLE IF NOT EXISTS public.customer_cancellation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_reference VARCHAR(30) NOT NULL,
  previous_state VARCHAR(40) NOT NULL,
  preparation_started BOOLEAN NOT NULL DEFAULT FALSE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  actor_role VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  explanation TEXT,
  is_qualifying BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cancellation_event_request UNIQUE(request_id)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_events_customer_window
  ON public.customer_cancellation_events(customer_id, is_qualifying, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cancellation_events_shop
  ON public.customer_cancellation_events(shop_id, created_at DESC);


-- 5. UPDATE REQUEST STATE MACHINE: ALLOW READY -> CANCELLED UPON APPROVAL
CREATE OR REPLACE FUNCTION public.validate_request_state_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_group VARCHAR(30);
    v_valid BOOLEAN := FALSE;
BEGIN
    IF OLD.current_state = NEW.current_state THEN
        RETURN NEW;
    END IF;

    v_group := NEW.workflow_group_code;

    -- State Machine Rules by Vertical Group
    IF v_group = 'ORDER' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'ACCEPTED' AND NEW.current_state IN ('PREPARING', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'PREPARING' AND NEW.current_state IN ('READY', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('PREPARING', 'READY', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'READY' AND NEW.current_state IN ('COMPLETED', 'CANCELLED') THEN
            v_valid := TRUE;
        END IF;

    ELSIF v_group = 'APPOINTMENT' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('CONFIRMED', 'REJECTED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'CONFIRMED' AND NEW.current_state IN ('IN_PROGRESS', 'DELAYED', 'CANCELLED', 'NO_SHOW') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'IN_PROGRESS' AND NEW.current_state IN ('COMPLETED', 'CANCELLED') THEN
            v_valid := TRUE;
        END IF;

    ELSIF v_group = 'SERVICE' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'ACCEPTED' AND NEW.current_state IN ('IN_PROGRESS', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('ACCEPTED', 'IN_PROGRESS', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'IN_PROGRESS' AND NEW.current_state IN ('READY', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'READY' AND NEW.current_state IN ('COMPLETED', 'CANCELLED') THEN
            v_valid := TRUE;
        END IF;

    ELSIF v_group = 'SALES_SERVICE' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'ACCEPTED' AND NEW.current_state IN ('PREPARING', 'IN_PROGRESS', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'PREPARING' AND NEW.current_state IN ('READY', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'IN_PROGRESS' AND NEW.current_state IN ('READY', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('ACCEPTED', 'PREPARING', 'IN_PROGRESS', 'READY', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'READY' AND NEW.current_state IN ('COMPLETED', 'CANCELLED') THEN
            v_valid := TRUE;
        END IF;
    END IF;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Illegal workflow transition: Cannot move % request from % to %', v_group, OLD.current_state, NEW.current_state;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 6. SERVER-SIDE CUSTOMER SUSPENSION ENFORCEMENT ON ORDER CREATION
CREATE OR REPLACE FUNCTION public.check_customer_ordering_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_mod RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_mod
    FROM public.customer_moderation
    WHERE customer_id = NEW.customer_id;

    IF FOUND AND v_mod.is_suspended THEN
      -- If suspension had a defined expiry time that has passed, auto-clear
      IF v_mod.suspension_expires_at IS NOT NULL AND v_mod.suspension_expires_at <= NOW() THEN
        UPDATE public.customer_moderation
        SET is_suspended = FALSE,
            updated_at = NOW()
        WHERE customer_id = NEW.customer_id;
      ELSE
        RAISE EXCEPTION 'Your ordering privileges are temporarily suspended. Reason: %',
          COALESCE(v_mod.suspension_reason, 'Account under review. Please contact support.');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_customer_ordering_suspension ON public.requests;
CREATE TRIGGER trg_check_customer_ordering_suspension
  BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.check_customer_ordering_suspension();


-- 7. ATOMIC RPC: DIRECT CUSTOMER ORDER CANCELLATION (Pre-fulfillment / REQUESTED)
CREATE OR REPLACE FUNCTION public.cancel_order_directly(
  p_request_id UUID,
  p_reason TEXT,
  p_explanation TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_is_customer BOOLEAN;
  v_is_admin BOOLEAN;
  v_actor_id UUID;
  v_actor_role TEXT;
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Customer cancelled order');
  v_policy RECORD;
  v_is_qualifying BOOLEAN := FALSE;
  v_qualifying_count INT := 0;
  v_window_start TIMESTAMPTZ;
  v_warning_level TEXT := NULL;
BEGIN
  SELECT r.*, s.owner_id AS shop_owner_id, s.name AS shop_name
  INTO v_req
  FROM public.requests r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
  END IF;

  v_actor_id := auth.uid();
  v_is_admin := public.is_admin();
  v_is_customer := (v_actor_id IS NOT NULL AND v_actor_id = v_req.customer_id);

  IF NOT (v_is_admin OR v_is_customer) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the customer who placed this order or an administrator can cancel it.');
  END IF;

  v_actor_role := CASE WHEN v_is_admin THEN 'admin' ELSE 'customer' END;

  -- Verify current state
  IF v_req.current_state IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This order is in a terminal state (' || v_req.current_state || ') and cannot be cancelled.');
  END IF;

  -- Only pending / unaccepted orders can be cancelled directly by the customer
  IF v_is_customer AND v_req.current_state <> 'REQUESTED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orders already accepted or in preparation require a cancellation request to the shopkeeper.');
  END IF;

  -- Update request atomically to CANCELLED
  UPDATE public.requests
  SET current_state = 'CANCELLED',
      cancellation_requested = TRUE,
      cancellation_request_status = 'approved',
      cancellation_reason = v_reason,
      cancellation_explanation = NULLIF(trim(p_explanation), ''),
      cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
      cancelled_by = COALESCE(v_actor_id, v_req.customer_id),
      cancelled_at = NOW(),
      cancellation_actor_role = v_actor_role,
      updated_at = NOW()
  WHERE id = p_request_id;

  -- Insert audit event into request_events
  INSERT INTO public.request_events (
    request_id, from_state, to_state, actor_id, actor_role, notes, created_at
  ) VALUES (
    p_request_id, v_req.current_state, 'CANCELLED',
    COALESCE(v_actor_id, v_req.customer_id), v_actor_role,
    'Order cancelled directly by ' || v_actor_role || '. Reason: ' || v_reason,
    NOW()
  );

  -- Fetch policy
  SELECT * INTO v_policy FROM public.cancellation_policy_settings WHERE id = 'default';
  IF NOT FOUND THEN
    v_policy := ROW('default', 30, 1, 2, 3, TRUE, NOW(), NULL)::public.cancellation_policy_settings;
  END IF;

  -- If policy does not exclude unaccepted orders and customer cancelled, it qualifies
  IF v_is_customer THEN
    IF v_req.current_state = 'REQUESTED' AND v_policy.exclude_unaccepted_orders THEN
      v_is_qualifying := FALSE;
    ELSE
      v_is_qualifying := TRUE;
    END IF;
  END IF;

  -- Record in customer_cancellation_events
  INSERT INTO public.customer_cancellation_events (
    customer_id, request_id, shop_id, order_reference, previous_state,
    preparation_started, actor_id, actor_role, reason, explanation,
    is_qualifying, created_at
  ) VALUES (
    v_req.customer_id, p_request_id, v_req.shop_id, v_req.reference_code,
    v_req.current_state, FALSE, COALESCE(v_actor_id, v_req.customer_id),
    v_actor_role, v_reason, NULLIF(trim(p_explanation), ''),
    v_is_qualifying, NOW()
  ) ON CONFLICT (request_id) DO NOTHING;

  -- If qualifying, evaluate abuse thresholds and record warning/flag
  IF v_is_qualifying THEN
    v_window_start := NOW() - (v_policy.window_days || ' days')::interval;
    SELECT COUNT(*) INTO v_qualifying_count
    FROM public.customer_cancellation_events
    WHERE customer_id = v_req.customer_id
      AND is_qualifying IS TRUE
      AND created_at >= v_window_start;

    INSERT INTO public.customer_moderation (customer_id, warning_count, updated_at)
    VALUES (v_req.customer_id, v_qualifying_count, NOW())
    ON CONFLICT (customer_id) DO UPDATE
    SET warning_count = v_qualifying_count,
        updated_at = NOW();

    IF v_qualifying_count >= v_policy.review_threshold THEN
      v_warning_level := 'admin_review';
      UPDATE public.customer_moderation
      SET flagged_for_review = TRUE,
          flagged_at = NOW(),
          flag_reason = 'Exceeded ' || v_policy.review_threshold || ' qualifying cancellations within ' || v_policy.window_days || ' days.',
          last_warning_level = 'formal_warning',
          last_warning_at = NOW()
      WHERE customer_id = v_req.customer_id;
    ELSIF v_qualifying_count >= v_policy.second_warning_threshold THEN
      v_warning_level := 'formal_warning';
      UPDATE public.customer_moderation
      SET last_warning_level = 'formal_warning',
          last_warning_at = NOW()
      WHERE customer_id = v_req.customer_id;
    ELSIF v_qualifying_count >= v_policy.first_warning_threshold THEN
      v_warning_level := 'reminder';
      UPDATE public.customer_moderation
      SET last_warning_level = 'reminder',
          last_warning_at = NOW()
      WHERE customer_id = v_req.customer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Order cancelled successfully.',
    'request_id', p_request_id,
    'reference_code', v_req.reference_code,
    'qualifying_cancellation', v_is_qualifying,
    'qualifying_count', v_qualifying_count,
    'warning_level', v_warning_level
  );
END;
$$;


-- 8. ATOMIC RPC: REQUEST ORDER CANCELLATION (Post-Acceptance / Processing / Ready)
CREATE OR REPLACE FUNCTION public.request_order_cancellation(
  p_request_id UUID,
  p_reason TEXT,
  p_explanation TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_actor_id UUID := auth.uid();
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Customer requested cancellation');
BEGIN
  SELECT r.*, s.owner_id AS shop_owner_id
  INTO v_req
  FROM public.requests r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
  END IF;

  IF NOT (public.is_admin() OR (v_actor_id IS NOT NULL AND v_actor_id = v_req.customer_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the customer who placed this order can request its cancellation.');
  END IF;

  IF v_req.current_state IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This order is in a terminal state (' || v_req.current_state || ') and cannot be cancelled.');
  END IF;

  IF v_req.cancellation_request_status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A cancellation request is already pending review by the shopkeeper.');
  END IF;

  -- Set cancellation request details
  UPDATE public.requests
  SET cancellation_requested = TRUE,
      cancellation_request_status = 'pending',
      cancellation_reason = v_reason,
      cancellation_explanation = NULLIF(trim(p_explanation), ''),
      cancellation_requested_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  -- Record audit event
  INSERT INTO public.request_events (
    request_id, from_state, to_state, actor_id, actor_role, notes, created_at
  ) VALUES (
    p_request_id, v_req.current_state, v_req.current_state,
    COALESCE(v_actor_id, v_req.customer_id), 'customer',
    'Customer submitted cancellation request. Reason: ' || v_reason,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cancellation request submitted to shopkeeper.',
    'request_id', p_request_id,
    'reference_code', v_req.reference_code,
    'current_state', v_req.current_state,
    'status', 'pending'
  );
END;
$$;


-- 9. ATOMIC RPC: SHOPKEEPER RESPOND TO CANCELLATION REQUEST (Approve / Reject)
CREATE OR REPLACE FUNCTION public.respond_to_cancellation_request(
  p_request_id UUID,
  p_action TEXT,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_admin();
  v_is_shop_owner BOOLEAN;
  v_action TEXT := lower(trim(COALESCE(p_action, '')));
  v_policy RECORD;
  v_is_qualifying BOOLEAN := FALSE;
  v_qualifying_count INT := 0;
  v_window_start TIMESTAMPTZ;
  v_warning_level TEXT := NULL;
  v_prep_started BOOLEAN := FALSE;
BEGIN
  SELECT r.*, s.owner_id AS shop_owner_id, s.name AS shop_name
  INTO v_req
  FROM public.requests r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
  END IF;

  v_is_shop_owner := (v_actor_id IS NOT NULL AND v_actor_id = v_req.shop_owner_id);

  IF NOT (v_is_admin OR v_is_shop_owner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the authorized shopkeeper or an administrator can respond to cancellation requests for this shop.');
  END IF;

  IF v_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action must be "approve" or "reject".');
  END IF;

  -- Safe race condition handling:
  IF v_req.current_state IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order has already transitioned to ' || v_req.current_state || '. Cancellation response can no longer be processed.'
    );
  END IF;

  IF v_req.cancellation_request_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending cancellation request exists for this order.');
  END IF;

  IF v_action = 'approve' THEN
    v_prep_started := v_req.current_state IN ('PREPARING', 'IN_PROGRESS', 'READY');

    -- Transition order to CANCELLED atomically
    UPDATE public.requests
    SET current_state = 'CANCELLED',
        cancellation_request_status = 'approved',
        cancelled_by = COALESCE(v_actor_id, v_req.shop_owner_id),
        cancelled_at = NOW(),
        cancellation_actor_role = 'shopkeeper',
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Record audit event in request_events
    INSERT INTO public.request_events (
      request_id, from_state, to_state, actor_id, actor_role, notes, created_at
    ) VALUES (
      p_request_id, v_req.current_state, 'CANCELLED',
      COALESCE(v_actor_id, v_req.shop_owner_id), 'shopkeeper',
      'Shopkeeper approved customer cancellation request. Original reason: ' || COALESCE(v_req.cancellation_reason, 'None'),
      NOW()
    );

    -- Customer requested this cancellation after shop acceptance -> It is a genuine qualifying cancellation
    v_is_qualifying := TRUE;

    INSERT INTO public.customer_cancellation_events (
      customer_id, request_id, shop_id, order_reference, previous_state,
      preparation_started, actor_id, actor_role, reason, explanation,
      is_qualifying, created_at
    ) VALUES (
      v_req.customer_id, p_request_id, v_req.shop_id, v_req.reference_code,
      v_req.current_state, v_prep_started, COALESCE(v_actor_id, v_req.shop_owner_id),
      'shopkeeper', COALESCE(v_req.cancellation_reason, 'Customer cancellation approved'),
      v_req.cancellation_explanation, v_is_qualifying, NOW()
    ) ON CONFLICT (request_id) DO NOTHING;

    -- Fetch policy and update abuse stats
    SELECT * INTO v_policy FROM public.cancellation_policy_settings WHERE id = 'default';
    IF NOT FOUND THEN
      v_policy := ROW('default', 30, 1, 2, 3, TRUE, NOW(), NULL)::public.cancellation_policy_settings;
    END IF;

    v_window_start := NOW() - (v_policy.window_days || ' days')::interval;
    SELECT COUNT(*) INTO v_qualifying_count
    FROM public.customer_cancellation_events
    WHERE customer_id = v_req.customer_id
      AND is_qualifying IS TRUE
      AND created_at >= v_window_start;

    INSERT INTO public.customer_moderation (customer_id, warning_count, updated_at)
    VALUES (v_req.customer_id, v_qualifying_count, NOW())
    ON CONFLICT (customer_id) DO UPDATE
    SET warning_count = v_qualifying_count,
        updated_at = NOW();

    IF v_qualifying_count >= v_policy.review_threshold THEN
      v_warning_level := 'admin_review';
      UPDATE public.customer_moderation
      SET flagged_for_review = TRUE,
          flagged_at = NOW(),
          flag_reason = 'Customer reached ' || v_qualifying_count || ' qualifying cancellations within ' || v_policy.window_days || ' days.',
          last_warning_level = 'formal_warning',
          last_warning_at = NOW()
      WHERE customer_id = v_req.customer_id;
    ELSIF v_qualifying_count >= v_policy.second_warning_threshold THEN
      v_warning_level := 'formal_warning';
      UPDATE public.customer_moderation
      SET last_warning_level = 'formal_warning',
          last_warning_at = NOW()
      WHERE customer_id = v_req.customer_id;
    ELSIF v_qualifying_count >= v_policy.first_warning_threshold THEN
      v_warning_level := 'reminder';
      UPDATE public.customer_moderation
      SET last_warning_level = 'reminder',
          last_warning_at = NOW()
      WHERE customer_id = v_req.customer_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'approved',
      'message', 'Cancellation request approved. Order transitioned to cancelled.',
      'request_id', p_request_id,
      'reference_code', v_req.reference_code,
      'qualifying_count', v_qualifying_count,
      'warning_level', v_warning_level
    );

  ELSE -- reject
    IF NULLIF(trim(p_rejection_reason), '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'A rejection reason is required when declining a cancellation request.');
    END IF;

    UPDATE public.requests
    SET cancellation_request_status = 'rejected',
        cancellation_rejected_reason = trim(p_rejection_reason),
        cancellation_rejected_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO public.request_events (
      request_id, from_state, to_state, actor_id, actor_role, notes, created_at
    ) VALUES (
      p_request_id, v_req.current_state, v_req.current_state,
      COALESCE(v_actor_id, v_req.shop_owner_id), 'shopkeeper',
      'Shopkeeper declined cancellation request. Reason: ' || trim(p_rejection_reason),
      NOW()
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'rejected',
      'message', 'Cancellation request declined. Order retained in ' || v_req.current_state || '.',
      'request_id', p_request_id,
      'reference_code', v_req.reference_code,
      'current_state', v_req.current_state,
      'rejection_reason', trim(p_rejection_reason)
    );
  END IF;
END;
$$;


-- 10. ATOMIC RPC: ADMIN CUSTOMER MODERATION ACTIONS
CREATE OR REPLACE FUNCTION public.admin_moderate_customer(
  p_customer_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_duration_hours INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_action TEXT := lower(trim(COALESCE(p_action, '')));
  v_reason TEXT := trim(COALESCE(p_reason, ''));
  v_mod public.customer_moderation%ROWTYPE;
  v_expires_at TIMESTAMPTZ := NULL;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Administrator authorization required.');
  END IF;

  IF v_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A valid reason is required for moderation actions.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer profile not found.');
  END IF;

  SELECT * INTO v_mod FROM public.customer_moderation WHERE customer_id = p_customer_id;
  IF NOT FOUND THEN
    INSERT INTO public.customer_moderation (customer_id) VALUES (p_customer_id)
    RETURNING * INTO v_mod;
  END IF;

  IF v_action = 'suspend' THEN
    IF p_duration_hours IS NOT NULL AND p_duration_hours > 0 THEN
      v_expires_at := NOW() + (p_duration_hours || ' hours')::interval;
    END IF;

    UPDATE public.customer_moderation
    SET is_suspended = TRUE,
        suspension_reason = v_reason,
        suspended_at = NOW(),
        suspension_expires_at = v_expires_at,
        suspended_by = v_admin_id,
        updated_at = NOW()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_mod;

    PERFORM public.write_admin_audit(
      'customer_suspended', 'customer', p_customer_id,
      to_jsonb(v_mod), to_jsonb(v_mod), v_reason
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Customer ordering privileges suspended.',
      'customer_id', p_customer_id,
      'is_suspended', true,
      'suspension_expires_at', v_expires_at
    );

  ELSIF v_action = 'reinstate' THEN
    UPDATE public.customer_moderation
    SET is_suspended = FALSE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspension_expires_at = NULL,
        suspended_by = NULL,
        flagged_for_review = FALSE,
        admin_notes = COALESCE(admin_notes || E'\n', '') || '[' || NOW()::text || '] Reinstated: ' || v_reason,
        updated_at = NOW()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_mod;

    PERFORM public.write_admin_audit(
      'customer_reinstated', 'customer', p_customer_id,
      to_jsonb(v_mod), to_jsonb(v_mod), v_reason
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Customer ordering privileges reinstated.',
      'customer_id', p_customer_id,
      'is_suspended', false
    );

  ELSIF v_action = 'issue_warning' THEN
    UPDATE public.customer_moderation
    SET warning_count = warning_count + 1,
        last_warning_at = NOW(),
        last_warning_level = 'formal_warning',
        admin_notes = COALESCE(admin_notes || E'\n', '') || '[' || NOW()::text || '] Warning issued: ' || v_reason,
        updated_at = NOW()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_mod;

    PERFORM public.write_admin_audit(
      'customer_warning_issued', 'customer', p_customer_id,
      to_jsonb(v_mod), to_jsonb(v_mod), v_reason
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Formal warning recorded.',
      'customer_id', p_customer_id,
      'warning_count', v_mod.warning_count
    );

  ELSIF v_action = 'clear_flag' THEN
    UPDATE public.customer_moderation
    SET flagged_for_review = FALSE,
        flag_reason = NULL,
        admin_notes = COALESCE(admin_notes || E'\n', '') || '[' || NOW()::text || '] Flag cleared: ' || v_reason,
        updated_at = NOW()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_mod;

    PERFORM public.write_admin_audit(
      'customer_flag_cleared', 'customer', p_customer_id,
      to_jsonb(v_mod), to_jsonb(v_mod), v_reason
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Review flag cleared.',
      'customer_id', p_customer_id,
      'flagged_for_review', false
    );

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action: ' || v_action);
  END IF;
END;
$$;


-- 11. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.cancellation_policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_cancellation_events ENABLE ROW LEVEL SECURITY;

-- Settings: Public read; admin manage
DROP POLICY IF EXISTS "Public read cancellation policy settings" ON public.cancellation_policy_settings;
CREATE POLICY "Public read cancellation policy settings"
  ON public.cancellation_policy_settings
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins manage cancellation policy settings" ON public.cancellation_policy_settings;
CREATE POLICY "Admins manage cancellation policy settings"
  ON public.cancellation_policy_settings
  FOR ALL USING (public.is_admin());

-- Customer Moderation: Customers read own status; Admins manage all; Shopkeepers cannot read unrelated customers
DROP POLICY IF EXISTS "Customers read own moderation status" ON public.customer_moderation;
CREATE POLICY "Customers read own moderation status"
  ON public.customer_moderation
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Admins read and manage all customer moderation" ON public.customer_moderation;
CREATE POLICY "Admins read and manage all customer moderation"
  ON public.customer_moderation
  FOR ALL USING (public.is_admin());

-- Cancellation Events: Customer reads own events; Shop owner reads shop events; Admins read all
DROP POLICY IF EXISTS "Customers read own cancellation events" ON public.customer_cancellation_events;
CREATE POLICY "Customers read own cancellation events"
  ON public.customer_cancellation_events
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Shop owners read shop cancellation events" ON public.customer_cancellation_events;
CREATE POLICY "Shop owners read shop cancellation events"
  ON public.customer_cancellation_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = customer_cancellation_events.shop_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read all cancellation events" ON public.customer_cancellation_events;
CREATE POLICY "Admins read all cancellation events"
  ON public.customer_cancellation_events
  FOR SELECT USING (public.is_admin());

COMMIT;

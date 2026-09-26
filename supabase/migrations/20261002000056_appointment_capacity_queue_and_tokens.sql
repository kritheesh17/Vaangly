-- Migration: 20261002000056_appointment_capacity_queue_and_tokens.sql
-- Description: Configurable appointment capacity, interval windows, queue/token sequence numbering,
--              atomic concurrency guards, Pay Online temporary holds, and Pay-at-Shop immediate confirmation.

BEGIN;

-- 1. EXTEND SHOP_SERVICES TABLE
ALTER TABLE public.shop_services
  ADD COLUMN IF NOT EXISTS interval_minutes INTEGER DEFAULT 30 CHECK (interval_minutes > 0),
  ADD COLUMN IF NOT EXISTS capacity_per_interval INTEGER DEFAULT 1 CHECK (capacity_per_interval >= 1),
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0 CHECK (buffer_minutes >= 0),
  ADD COLUMN IF NOT EXISTS advance_booking_days INTEGER DEFAULT 7 CHECK (advance_booking_days >= 0),
  ADD COLUMN IF NOT EXISTS payment_requirement TEXT DEFAULT 'flexible' CHECK (payment_requirement IN ('flexible', 'online_only', 'shop_only'));

-- 2. EXTEND APPOINTMENT_SLOTS CAPACITY CONSTRAINTS
ALTER TABLE public.appointment_slots
  DROP CONSTRAINT IF EXISTS appointment_slots_concurrent_capacity_check;
ALTER TABLE public.appointment_slots
  ADD CONSTRAINT appointment_slots_concurrent_capacity_check
  CHECK (concurrent_capacity BETWEEN 1 AND 500);

ALTER TABLE public.appointment_slots
  DROP CONSTRAINT IF EXISTS appointment_slots_capacity_check;
ALTER TABLE public.appointment_slots
  ADD CONSTRAINT appointment_slots_capacity_check
  CHECK (capacity BETWEEN 1 AND 500);

ALTER TABLE public.appointment_slots
  ADD COLUMN IF NOT EXISTS holds_count INTEGER NOT NULL DEFAULT 0 CHECK (holds_count >= 0);

-- 3. EXTEND REQUESTS TABLE FOR TOKENS AND AUDIT
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS token_number INTEGER,
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.profiles(id);

-- Update check constraints on requests to support pay_at_shop and flexible statuses
ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_payment_method_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'upi', 'pay_at_shop', 'online'));

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_payment_status_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_payment_status_check
  CHECK (payment_status IN (
    'NOT_REQUIRED', 'PAYMENT_PENDING', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED',
    'unpaid', 'pending', 'paid', 'failed', 'refunded', 'cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_requests_slot_token
  ON public.requests(shop_id, workflow_group_code, scheduled_for, token_number);

-- 4. UPDATE PAYMENT VALIDATION TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.validate_request_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_payload JSONB;
  v_method TEXT;
  v_is_shopkeeper BOOLEAN;
BEGIN
  BEGIN
    v_payload := COALESCE(NEW.notes::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_payload := '{}'::jsonb;
  END;

  v_method := lower(COALESCE(NULLIF(NEW.payment_method, ''), v_payload->>'payment_method', 'cash'));
  IF v_method IN ('pay_at_shop', 'cash') THEN
    v_method := 'cash';
  ELSIF v_method IN ('online', 'upi') THEN
    v_method := 'upi';
  ELSE
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  NEW.payment_method := v_method;

  IF TG_OP = 'INSERT' THEN
    IF v_method = 'upi' THEN
      -- Allow APPOINTMENT holds to be inserted without payment proof initially
      IF NEW.workflow_group_code = 'APPOINTMENT' AND NEW.hold_expires_at IS NOT NULL THEN
        NEW.payment_status := 'PAYMENT_PENDING';
        NEW.customer_paid := FALSE;
      ELSIF NULLIF(trim(COALESCE(NEW.payment_screenshot_url, '')), '') IS NULL THEN
        RAISE EXCEPTION 'UPI payment proof is required before submitting the request';
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
      NEW.payment_status := 'PAYMENT_PROOF_SUBMITTED';
      NEW.customer_paid := FALSE;
      NEW.hold_expires_at := NULL; -- hold converted to active proof
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
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. ATOMIC APPOINTMENT BOOKING RPC
CREATE OR REPLACE FUNCTION public.book_appointment_with_token(
  p_slot_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_service_id UUID,
  p_service_name TEXT,
  p_price NUMERIC,
  p_payment_method TEXT,
  p_notes TEXT DEFAULT NULL,
  p_is_online_hold BOOLEAN DEFAULT FALSE,
  p_hold_minutes INTEGER DEFAULT 10
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_slot public.appointment_slots%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_caller_id UUID;
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_next_token INTEGER;
  v_request_id UUID;
  v_ref_code TEXT;
  v_payload JSONB;
  v_hold_expires TIMESTAMPTZ := NULL;
  v_payment_method TEXT;
  v_payment_status TEXT;
  v_current_state TEXT;
BEGIN
  v_caller_id := COALESCE(auth.uid(), p_customer_id);
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to book an appointment.');
  END IF;

  -- Lock slot row
  SELECT * INTO v_slot
  FROM public.appointment_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appointment slot not found.');
  END IF;

  -- Verify shop is active
  SELECT * INTO v_shop
  FROM public.shops
  WHERE id = v_slot.shop_id;

  IF NOT FOUND OR v_shop.status <> 'active' OR v_shop.is_live IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'This shop is currently not accepting bookings.');
  END IF;

  -- Clean up any expired holds on this slot
  UPDATE public.requests
  SET current_state = 'EXPIRED',
      payment_status = 'PAYMENT_REJECTED',
      updated_at = now()
  WHERE shop_id = v_slot.shop_id
    AND workflow_group_code = 'APPOINTMENT'
    AND current_state = 'REQUESTED'
    AND payment_status = 'PAYMENT_PENDING'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now()
    AND notes IS NOT NULL
    AND notes::jsonb->>'slot_id' = p_slot_id::text;

  v_capacity := COALESCE(v_slot.capacity, v_slot.concurrent_capacity, 1);

  -- Count current active reservations on this slot (confirmed + valid active holds)
  SELECT COUNT(*)::INTEGER INTO v_active_count
  FROM public.requests r
  WHERE r.shop_id = v_slot.shop_id
    AND r.workflow_group_code = 'APPOINTMENT'
    AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
    AND (
      r.hold_expires_at IS NULL
      OR r.hold_expires_at >= now()
      OR r.payment_status IN ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'paid')
    )
    AND r.notes IS NOT NULL
    AND r.notes::jsonb->>'slot_id' = p_slot_id::text;

  IF v_active_count >= v_capacity THEN
    UPDATE public.appointment_slots
    SET is_available = FALSE,
        confirmed_count = v_active_count,
        updated_at = now()
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'INTERVAL_FULL',
      'error', 'This interval is now full. Please choose another time.'
    );
  END IF;

  -- Normalize payment method
  IF lower(p_payment_method) IN ('online', 'upi') THEN
    v_payment_method := 'upi';
  ELSE
    v_payment_method := 'cash';
  END IF;

  -- Determine hold vs immediate confirmation
  IF p_is_online_hold AND v_payment_method = 'upi' THEN
    v_hold_expires := now() + (COALESCE(p_hold_minutes, 10) || ' minutes')::interval;
    v_payment_status := 'PAYMENT_PENDING';
    v_current_state := 'REQUESTED';
    v_next_token := NULL; -- Assigned on final payment
  ELSE
    v_hold_expires := NULL;
    IF v_payment_method = 'cash' THEN
      v_payment_status := 'NOT_REQUIRED';
      v_current_state := 'CONFIRMED';
    ELSE
      v_payment_status := 'PAYMENT_PROOF_SUBMITTED';
      v_current_state := 'REQUESTED';
    END IF;

    -- Atomically assign next sequential token number for this interval
    SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
    FROM public.requests
    WHERE shop_id = v_slot.shop_id
      AND workflow_group_code = 'APPOINTMENT'
      AND current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
      AND notes IS NOT NULL
      AND notes::jsonb->>'slot_id' = p_slot_id::text;
  END IF;

  v_ref_code := 'APT-' || floor(1000 + random() * 9000)::text;

  v_payload := jsonb_build_object(
    'service_id', p_service_id,
    'service_name', p_service_name,
    'slot_id', v_slot.id,
    'slot_date', v_slot.slot_date,
    'start_time', v_slot.start_time,
    'end_time', v_slot.end_time,
    'price', p_price,
    'customer_name', p_customer_name,
    'customer_phone', p_customer_phone,
    'payment_method', CASE WHEN v_payment_method = 'cash' THEN 'pay_at_shop' ELSE 'online' END,
    'token_number', v_next_token,
    'notes', p_notes,
    'shop_name', v_shop.name,
    'shop_address', v_shop.address_line,
    'shop_phone', v_shop.phone,
    'shop_upi_id', v_shop.upi_id,
    'shop_upi_qr_url', v_shop.upi_qr_url
  );

  INSERT INTO public.requests (
    customer_id,
    shop_id,
    reference_code,
    workflow_group_code,
    current_state,
    total_estimate,
    payment_method,
    payment_amount,
    payment_status,
    customer_phone,
    scheduled_for,
    token_number,
    hold_expires_at,
    notes
  ) VALUES (
    v_caller_id,
    v_slot.shop_id,
    v_ref_code,
    'APPOINTMENT',
    v_current_state,
    COALESCE(p_price, 0),
    v_payment_method,
    CASE WHEN v_payment_method = 'upi' THEN COALESCE(p_price, 0) ELSE NULL END,
    v_payment_status,
    p_customer_phone,
    (v_slot.slot_date || ' ' || v_slot.start_time),
    v_next_token,
    v_hold_expires,
    v_payload::text
  ) RETURNING id INTO v_request_id;

  -- Update slot confirmed count and availability
  UPDATE public.appointment_slots
  SET confirmed_count = v_active_count + 1,
      is_available = (v_active_count + 1 < v_capacity),
      booked_by_request_id = CASE WHEN v_active_count = 0 THEN v_request_id ELSE booked_by_request_id END,
      updated_at = now()
  WHERE id = p_slot_id;

  -- Insert request event
  INSERT INTO public.request_events (
    request_id,
    from_state,
    to_state,
    actor_id,
    actor_role,
    notes
  ) VALUES (
    v_request_id,
    NULL,
    v_current_state,
    v_caller_id,
    'customer',
    CASE
      WHEN v_hold_expires IS NOT NULL THEN 'Customer placed temporary hold on slot for online payment.'
      ELSE 'Appointment booked with Token #' || v_next_token::text || ' (' || CASE WHEN v_payment_method = 'cash' THEN 'Pay at Shop' ELSE 'Paid Online' END || ')'
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'reference_code', v_ref_code,
    'token_number', v_next_token,
    'queue_number', CASE WHEN v_next_token IS NOT NULL THEN '#' || v_next_token::text ELSE NULL END,
    'customers_ahead', CASE WHEN v_next_token IS NOT NULL THEN GREATEST(v_next_token - 1, 0) ELSE 0 END,
    'time_window', (v_slot.start_time || ' – ' || v_slot.end_time),
    'slot_date', v_slot.slot_date,
    'is_hold', (v_hold_expires IS NOT NULL),
    'hold_expires_at', v_hold_expires,
    'capacity', v_capacity,
    'remaining_capacity', GREATEST(v_capacity - (v_active_count + 1), 0),
    'payment_method', CASE WHEN v_payment_method = 'cash' THEN 'pay_at_shop' ELSE 'online' END,
    'payment_status', v_payment_status,
    'price', p_price
  );
END;
$$;

-- 6. RPC TO CONFIRM ONLINE PAYMENT AND ATOMICALLY ASSIGN TOKEN
CREATE OR REPLACE FUNCTION public.confirm_appointment_online_payment(
  p_request_id UUID,
  p_screenshot_url TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req public.requests%ROWTYPE;
  v_slot public.appointment_slots%ROWTYPE;
  v_slot_id UUID;
  v_next_token INTEGER;
  v_payload JSONB;
BEGIN
  SELECT * INTO v_req
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
  END IF;

  IF NOT public.is_admin() AND auth.uid() IS DISTINCT FROM v_req.customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied.');
  END IF;

  BEGIN
    v_slot_id := (v_req.notes::jsonb->>'slot_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_slot_id := NULL;
  END;

  IF v_slot_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appointment slot reference missing.');
  END IF;

  -- Lock slot row
  SELECT * INTO v_slot
  FROM public.appointment_slots
  WHERE id = v_slot_id
  FOR UPDATE;

  -- Check if already assigned token
  IF v_req.token_number IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'token_number', v_req.token_number,
      'queue_number', '#' || v_req.token_number::text,
      'customers_ahead', GREATEST(v_req.token_number - 1, 0)
    );
  END IF;

  -- Assign next sequential token number for this interval
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.requests
  WHERE shop_id = v_req.shop_id
    AND workflow_group_code = 'APPOINTMENT'
    AND current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
    AND notes IS NOT NULL
    AND notes::jsonb->>'slot_id' = v_slot_id::text;

  v_payload := COALESCE(v_req.notes::jsonb, '{}'::jsonb);
  v_payload := v_payload || jsonb_build_object('token_number', v_next_token);

  UPDATE public.requests
  SET token_number = v_next_token,
      payment_screenshot_url = p_screenshot_url,
      payment_status = 'PAYMENT_PROOF_SUBMITTED',
      current_state = 'REQUESTED',
      hold_expires_at = NULL,
      notes = v_payload::text,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.request_events (
    request_id,
    from_state,
    to_state,
    actor_id,
    actor_role,
    notes
  ) VALUES (
    p_request_id,
    v_req.current_state,
    'REQUESTED',
    v_req.customer_id,
    'customer',
    'Payment proof submitted for appointment. Token #' || v_next_token::text || ' assigned.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'token_number', v_next_token,
    'queue_number', '#' || v_next_token::text,
    'customers_ahead', GREATEST(v_next_token - 1, 0)
  );
END;
$$;

-- 7. RPC TO MARK PAY-AT-SHOP PAYMENT RECEIVED (STAFF / SHOPKEEPER ONLY)
CREATE OR REPLACE FUNCTION public.mark_appointment_paid(
  p_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_is_shopkeeper BOOLEAN;
BEGIN
  SELECT r.*, s.owner_id INTO v_req
  FROM public.requests r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
  END IF;

  v_is_shopkeeper := public.is_admin() OR (v_req.owner_id = auth.uid());
  IF NOT v_is_shopkeeper THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the shopkeeper or staff can mark payment as received.');
  END IF;

  UPDATE public.requests
  SET customer_paid = TRUE,
      payment_status = 'PAYMENT_VERIFIED',
      paid_at = now(),
      paid_by = auth.uid(),
      payment_verified_at = now(),
      payment_verified_by = auth.uid(),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.request_events (
    request_id,
    from_state,
    to_state,
    actor_id,
    actor_role,
    notes
  ) VALUES (
    p_request_id,
    v_req.current_state,
    v_req.current_state,
    auth.uid(),
    'shopkeeper',
    'Shopkeeper marked Pay-at-Shop payment as received.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'paid_at', now(),
    'paid_by', auth.uid()
  );
END;
$$;

-- 8. RPC TO UPDATE APPOINTMENT QUEUE STATUS (WAITING, CALLED, SERVING, COMPLETED, CANCELLED, NO_SHOW)
CREATE OR REPLACE FUNCTION public.update_appointment_queue_status(
  p_request_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_is_shopkeeper BOOLEAN;
  v_target_state TEXT;
  v_slot_id UUID;
BEGIN
  SELECT r.*, s.owner_id INTO v_req
  FROM public.requests r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
  END IF;

  v_is_shopkeeper := public.is_admin() OR (v_req.owner_id = auth.uid());
  IF NOT v_is_shopkeeper THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only shopkeeper or authorized staff can update queue status.');
  END IF;

  CASE lower(trim(p_status))
    WHEN 'waiting' THEN v_target_state := 'CONFIRMED';
    WHEN 'called' THEN v_target_state := 'ACCEPTED';
    WHEN 'serving' THEN v_target_state := 'IN_PROGRESS';
    WHEN 'completed' THEN v_target_state := 'COMPLETED';
    WHEN 'cancelled' THEN v_target_state := 'CANCELLED';
    WHEN 'no_show' THEN v_target_state := 'NO_SHOW';
    WHEN 'no-show' THEN v_target_state := 'NO_SHOW';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid queue status: ' || p_status);
  END CASE;

  UPDATE public.requests
  SET current_state = v_target_state,
      completed_at = CASE WHEN v_target_state = 'COMPLETED' THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN v_target_state IN ('CANCELLED', 'NO_SHOW') THEN now() ELSE cancelled_at END,
      updated_at = now()
  WHERE id = p_request_id;

  -- If terminal cancellation or no-show, release slot availability
  IF v_target_state IN ('CANCELLED', 'NO_SHOW') THEN
    BEGIN
      v_slot_id := (v_req.notes::jsonb->>'slot_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_slot_id := NULL;
    END;

    IF v_slot_id IS NOT NULL THEN
      UPDATE public.appointment_slots
      SET confirmed_count = GREATEST(confirmed_count - 1, 0),
          is_available = TRUE,
          updated_at = now()
      WHERE id = v_slot_id;
    END IF;
  END IF;

  INSERT INTO public.request_events (
    request_id,
    from_state,
    to_state,
    actor_id,
    actor_role,
    notes
  ) VALUES (
    p_request_id,
    v_req.current_state,
    v_target_state,
    auth.uid(),
    'shopkeeper',
    COALESCE(p_notes, 'Status updated to ' || p_status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'current_state', v_target_state,
    'queue_status', lower(trim(p_status))
  );
END;
$$;

-- 9. RPC TO FETCH APPOINTMENT QUEUE FOR SHOPKEEPER VIEW
CREATE OR REPLACE FUNCTION public.get_shop_appointment_queue(
  p_shop_id UUID,
  p_date DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_shopkeeper BOOLEAN;
  v_result JSONB;
BEGIN
  v_is_shopkeeper := public.is_admin() OR EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id = p_shop_id AND s.owner_id = auth.uid()
  );

  IF NOT v_is_shopkeeper THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied.');
  END IF;

  WITH slot_bookings AS (
    SELECT
      r.id AS request_id,
      r.reference_code,
      r.token_number,
      r.current_state,
      r.customer_paid,
      r.payment_method,
      r.payment_status,
      r.total_estimate,
      r.scheduled_for,
      r.paid_at,
      r.created_at,
      (r.notes::jsonb->>'slot_id')::UUID AS slot_id,
      (r.notes::jsonb->>'service_name') AS service_name,
      (r.notes::jsonb->>'start_time') AS start_time,
      (r.notes::jsonb->>'end_time') AS end_time,
      (r.notes::jsonb->>'customer_name') AS customer_name,
      (r.notes::jsonb->>'customer_phone') AS customer_phone,
      r.notes::jsonb->>'notes' AS customer_notes
    FROM public.requests r
    WHERE r.shop_id = p_shop_id
      AND r.workflow_group_code = 'APPOINTMENT'
      AND r.scheduled_for::date = p_date
      AND r.current_state NOT IN ('EXPIRED')
  ),
  slots AS (
    SELECT
      s.id AS slot_id,
      s.slot_date,
      s.start_time,
      s.end_time,
      COALESCE(s.capacity, s.concurrent_capacity, 1) AS capacity,
      s.confirmed_count,
      s.is_available
    FROM public.appointment_slots s
    WHERE s.shop_id = p_shop_id
      AND s.slot_date = p_date
    ORDER BY s.start_time ASC
  )
  SELECT jsonb_build_object(
    'success', true,
    'date', p_date,
    'intervals', COALESCE(jsonb_agg(
      jsonb_build_object(
        'slot_id', s.slot_id,
        'start_time', s.start_time,
        'end_time', s.end_time,
        'capacity', s.capacity,
        'confirmed_count', (
          SELECT COUNT(*)::INTEGER FROM slot_bookings b
          WHERE b.slot_id = s.slot_id AND b.current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW')
        ),
        'is_available', s.is_available,
        'bookings', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'request_id', b.request_id,
              'reference_code', b.reference_code,
              'token_number', b.token_number,
              'queue_number', CASE WHEN b.token_number IS NOT NULL THEN '#' || b.token_number::text ELSE 'Holding' END,
              'customer_name', b.customer_name,
              'customer_phone', b.customer_phone,
              'service_name', b.service_name,
              'current_state', b.current_state,
              'queue_status', CASE b.current_state
                WHEN 'CONFIRMED' THEN 'waiting'
                WHEN 'ACCEPTED' THEN 'called'
                WHEN 'IN_PROGRESS' THEN 'serving'
                WHEN 'COMPLETED' THEN 'completed'
                WHEN 'CANCELLED' THEN 'cancelled'
                WHEN 'NO_SHOW' THEN 'no_show'
                ELSE 'waiting'
              END,
              'payment_method', b.payment_method,
              'payment_status', b.payment_status,
              'customer_paid', b.customer_paid,
              'total_amount', b.total_estimate,
              'paid_at', b.paid_at,
              'customer_notes', b.customer_notes
            ) ORDER BY COALESCE(b.token_number, 999999) ASC, b.created_at ASC
          ) FROM slot_bookings b WHERE b.slot_id = s.slot_id
        ), '[]'::jsonb)
      ) ORDER BY s.start_time ASC
    ), '[]'::jsonb)
  ) INTO v_result
  FROM slots s;

  RETURN v_result;
END;
$$;

-- 10. BACKWARDS COMPATIBILITY FOR book_appointment_slot
CREATE OR REPLACE FUNCTION public.book_appointment_slot(
    p_slot_id UUID,
    p_request_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_capacity INTEGER;
    v_booked INTEGER;
    v_shop_active BOOLEAN;
    v_next_token INTEGER;
BEGIN
    SELECT (s.status = 'active' AND s.is_live = TRUE), COALESCE(a.capacity, a.concurrent_capacity, 1)
      INTO v_shop_active, v_capacity
      FROM public.appointment_slots a
      JOIN public.shops s ON s.id = a.shop_id
     WHERE a.id = p_slot_id
     FOR UPDATE OF a;

    IF v_shop_active IS NOT TRUE OR v_capacity IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(*) INTO v_booked
      FROM public.requests r
     WHERE r.workflow_group_code = 'APPOINTMENT'
       AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED')
       AND r.notes IS NOT NULL
       AND r.notes::jsonb->>'slot_id' = p_slot_id::text;

    IF v_booked >= v_capacity THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
      FROM public.requests
     WHERE workflow_group_code = 'APPOINTMENT'
       AND current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED')
       AND notes IS NOT NULL
       AND notes::jsonb->>'slot_id' = p_slot_id::text;

    UPDATE public.requests
       SET token_number = COALESCE(token_number, v_next_token)
     WHERE id = p_request_id;

    UPDATE public.appointment_slots
       SET confirmed_count = v_booked + 1,
           is_available = (v_booked + 1 < v_capacity),
           booked_by_request_id = CASE WHEN v_booked = 0 THEN p_request_id ELSE booked_by_request_id END,
           updated_at = now()
     WHERE id = p_slot_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

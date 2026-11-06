-- ============================================================================
-- VAANGLY APPOINTMENT RELIABILITY & OVERBOOKING PREVENTION
-- Migration: 20261106000072_appointment_overbooking_prevention_and_lifecycle.sql
--
-- Features:
-- 1. Deterministic time parsing helper: parse_time_to_minutes(text)
-- 2. Concurrency-safe atomic booking RPC: book_appointment_with_token
--    - Server-side availability validation with row-level locks
--    - Idempotency guard: prevents double booking from rapid repeated clicks
--    - Overlap duration checking: [start, end) conflicts
--    - Back-to-back appointment support without false conflicts
--    - Multi-capacity & staff/resource support
--    - Automatic expired hold reclamation
-- 3. Double-release prevention trigger: sync_appointment_slot_on_request_change
--    - Executes exactly once when moving from active to terminal state
--    - Recalculates confirmed count authoritatively from database state
-- 4. Atomic rescheduling RPC: reschedule_appointment
--    - Atomically transfers reservation from old slot to new slot
--    - Aborts cleanly if new slot is full, leaving old reservation intact
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TIME PARSING HELPER FUNCTION
-- Converts "09:00 AM", "1:30 PM", "14:00" etc. into minutes from midnight (0..1439)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parse_time_to_minutes(p_time TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
  v_is_12h BOOLEAN;
  v_is_pm BOOLEAN := FALSE;
  v_parts TEXT[];
  v_hours INTEGER := 0;
  v_minutes INTEGER := 0;
BEGIN
  IF p_time IS NULL OR trim(p_time) = '' THEN
    RETURN 0;
  END IF;

  v_clean := upper(trim(p_time));
  v_is_12h := (position('AM' IN v_clean) > 0 OR position('PM' IN v_clean) > 0);

  IF v_is_12h THEN
    v_is_pm := (position('PM' IN v_clean) > 0);
    v_clean := trim(replace(replace(v_clean, 'AM', ''), 'PM', ''));
    v_parts := string_to_array(v_clean, ':');
    v_hours := COALESCE(NULLIF(trim(v_parts[1]), '')::INTEGER, 0);
    IF array_length(v_parts, 1) >= 2 THEN
      v_minutes := COALESCE(NULLIF(trim(v_parts[2]), '')::INTEGER, 0);
    END IF;

    IF v_is_pm AND v_hours < 12 THEN
      v_hours := v_hours + 12;
    ELSIF NOT v_is_pm AND v_hours = 12 THEN
      v_hours := 0;
    END IF;
  ELSE
    v_parts := string_to_array(v_clean, ':');
    v_hours := COALESCE(NULLIF(trim(v_parts[1]), '')::INTEGER, 0);
    IF array_length(v_parts, 1) >= 2 THEN
      v_minutes := COALESCE(NULLIF(trim(v_parts[2]), '')::INTEGER, 0);
    END IF;
  END IF;

  RETURN (v_hours * 60) + v_minutes;
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. HARDENED ATOMIC APPOINTMENT BOOKING RPC
-- ----------------------------------------------------------------------------
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
  v_service public.shop_services%ROWTYPE;
  v_caller_id UUID;
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_overlapping_count INTEGER := 0;
  v_slot_start_min INTEGER;
  v_slot_end_min INTEGER;
  v_service_provider TEXT := NULL;
  v_existing_req RECORD;
  v_next_token INTEGER;
  v_request_id UUID;
  v_ref_code TEXT;
  v_payload JSONB;
  v_hold_expires TIMESTAMPTZ := NULL;
  v_payment_method TEXT;
  v_payment_status TEXT;
  v_current_state TEXT;
  v_now_kolkata TIMESTAMPTZ;
  v_today_kolkata DATE;
  v_current_min_kolkata INTEGER;
BEGIN
  -- 1. Authoritative caller validation
  IF current_setting('role', true) = 'service_role' OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    IF p_customer_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Customer ID is required.');
    END IF;
    v_caller_id := p_customer_id;
  ELSE
    IF auth.uid() IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'UNAUTHENTICATED',
        'error', 'You must be signed in to book an appointment.'
      );
    END IF;

    IF p_customer_id IS NOT NULL AND p_customer_id <> auth.uid() THEN
      IF NOT public.is_admin() THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'FORBIDDEN',
          'error', 'Unauthorized: You can only book appointments for your own account.'
        );
      END IF;
      v_caller_id := p_customer_id;
    ELSE
      v_caller_id := auth.uid();
    END IF;
  END IF;

  -- 2. Lock slot row for concurrency control
  SELECT * INTO v_slot
  FROM public.appointment_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appointment slot not found.');
  END IF;

  -- 3. Verify shop is active and live
  SELECT * INTO v_shop
  FROM public.shops
  WHERE id = v_slot.shop_id;

  IF NOT FOUND OR v_shop.status <> 'active' OR v_shop.is_live IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'This shop is currently not accepting bookings.');
  END IF;

  -- 4. Idempotency Guard: prevent duplicate booking from repeated clicks or rapid retries
  SELECT r.id, r.reference_code, r.current_state, r.token_number, r.payment_status
  INTO v_existing_req
  FROM public.requests r
  WHERE r.customer_id = v_caller_id
    AND r.shop_id = v_slot.shop_id
    AND r.workflow_group_code = 'APPOINTMENT'
    AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
    AND (
      r.hold_expires_at IS NULL
      OR r.hold_expires_at >= now()
      OR r.payment_status IN ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'paid')
    )
    AND r.notes IS NOT NULL
    AND r.notes::jsonb->>'slot_id' = p_slot_id::text
  LIMIT 1;

  IF FOUND THEN
    -- Return existing reservation idempotently
    RETURN jsonb_build_object(
      'success', true,
      'already_booked', true,
      'request_id', v_existing_req.id,
      'reference_code', v_existing_req.reference_code,
      'token_number', v_existing_req.token_number,
      'current_state', v_existing_req.current_state,
      'payment_status', v_existing_req.payment_status,
      'message', 'You already have an active appointment reservation for this slot.'
    );
  END IF;

  -- 5. Timezone & Past Slot Guard (Asia/Kolkata timezone standard)
  v_now_kolkata := now() AT TIME ZONE 'Asia/Kolkata';
  v_today_kolkata := v_now_kolkata::date;
  v_current_min_kolkata := public.parse_time_to_minutes(to_char(v_now_kolkata, 'HH12:MI AM'));
  v_slot_start_min := public.parse_time_to_minutes(v_slot.start_time);
  v_slot_end_min := public.parse_time_to_minutes(v_slot.end_time);

  IF v_slot.slot_date < v_today_kolkata THEN
    RETURN jsonb_build_object('success', false, 'error', 'This appointment date has already passed. Please choose a future date.');
  END IF;

  IF v_slot.slot_date = v_today_kolkata AND v_slot_start_min <= v_current_min_kolkata THEN
    RETURN jsonb_build_object('success', false, 'error', 'This appointment slot has already started or passed. Please choose a future slot.');
  END IF;

  -- 6. Clean up expired holds on this shop
  UPDATE public.requests
  SET current_state = 'EXPIRED',
      payment_status = 'PAYMENT_REJECTED',
      updated_at = now()
  WHERE shop_id = v_slot.shop_id
    AND workflow_group_code = 'APPOINTMENT'
    AND current_state = 'REQUESTED'
    AND payment_status = 'PAYMENT_PENDING'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();

  -- 7. Slot-Level Capacity Check
  v_capacity := GREATEST(1, COALESCE(v_slot.capacity, v_slot.concurrent_capacity, 1));

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

  -- 8. Overlap Duration & Resource Capacity Check
  -- Determine provider/resource from service if assigned
  IF p_service_id IS NOT NULL THEN
    SELECT * INTO v_service
    FROM public.shop_services
    WHERE id = p_service_id;
    IF FOUND THEN
      v_service_provider := NULLIF(trim(v_service.provider_name), '');
    END IF;
  END IF;

  -- Check overlapping appointments on same date for same resource:
  -- [start_A, end_A) overlaps [start_B, end_B) iff start_A < end_B AND start_B < end_A
  -- (e.g. 9:00–9:30 conflicts with 9:15–9:45; 9:00–9:30 does NOT conflict with 9:30–10:00)
  IF v_slot_end_min > v_slot_start_min THEN
    SELECT COUNT(*)::INTEGER INTO v_overlapping_count
    FROM public.requests r
    WHERE r.shop_id = v_slot.shop_id
      AND r.workflow_group_code = 'APPOINTMENT'
      AND r.scheduled_for::date = v_slot.slot_date
      AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
      AND (
        r.hold_expires_at IS NULL
        OR r.hold_expires_at >= now()
        OR r.payment_status IN ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'paid')
      )
      AND r.notes IS NOT NULL
      -- Must belong to the same staff/resource if provider is specified
      AND (
        (v_service_provider IS NOT NULL AND r.notes::jsonb->>'provider_name' = v_service_provider)
        OR (v_slot.service_id IS NOT NULL AND (r.notes::jsonb->>'service_id')::uuid = v_slot.service_id)
      )
      -- Strict interval overlap check:
      AND public.parse_time_to_minutes(r.notes::jsonb->>'start_time') < v_slot_end_min
      AND v_slot_start_min < public.parse_time_to_minutes(r.notes::jsonb->>'end_time');

    IF v_overlapping_count >= v_capacity THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'RESOURCE_OVERLAPPING_FULL',
        'error', 'The service provider or resource is already fully booked for this time window.'
      );
    END IF;
  END IF;

  -- 9. Normalize payment method
  IF lower(p_payment_method) IN ('online', 'upi') THEN
    v_payment_method := 'upi';
  ELSE
    v_payment_method := 'cash';
  END IF;

  -- 10. Determine hold vs immediate confirmation
  IF p_is_online_hold AND v_payment_method = 'upi' THEN
    v_hold_expires := now() + (COALESCE(p_hold_minutes, 10) || ' minutes')::interval;
    v_payment_status := 'PAYMENT_PENDING';
    v_current_state := 'REQUESTED';
    v_next_token := NULL; -- Assigned on final payment submission
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
    'provider_name', v_service_provider,
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
    to_timestamp(v_slot.slot_date::text || ' ' || v_slot.start_time, 'YYYY-MM-DD HH12:MI AM'),
    v_next_token,
    v_hold_expires,
    v_payload::text
  ) RETURNING id INTO v_request_id;

  -- 11. Authoritative slot update
  UPDATE public.appointment_slots
  SET confirmed_count = v_active_count + 1,
      is_available = (v_active_count + 1 < v_capacity),
      booked_by_request_id = CASE WHEN v_active_count = 0 THEN v_request_id ELSE booked_by_request_id END,
      updated_at = now()
  WHERE id = p_slot_id;

  -- 12. Insert request audit event
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

-- ----------------------------------------------------------------------------
-- 3. UNIFIED DOUBLE-RELEASE PREVENTION TRIGGER
-- Guarantees exact-once slot release and authoritatively recalculates confirmed count
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_appointment_slot_on_request_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_slot_id UUID;
  v_slot public.appointment_slots%ROWTYPE;
  v_active_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Only operates on APPOINTMENT requests
  IF NEW.workflow_group_code <> 'APPOINTMENT' THEN
    RETURN NEW;
  END IF;

  -- Exact-once terminal check: ONLY fires when moving FROM an active state TO a terminal state
  -- Eliminates double-release if a cancelled appointment is subsequently updated.
  IF (NEW.current_state IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
      AND OLD.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')) THEN

    BEGIN
      v_slot_id := (NEW.notes::jsonb->>'slot_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_slot_id := NULL;
    END;

    IF v_slot_id IS NOT NULL THEN
      -- Lock the slot row
      SELECT * INTO v_slot
      FROM public.appointment_slots
      WHERE id = v_slot_id
      FOR UPDATE;

      IF FOUND THEN
        v_capacity := GREATEST(1, COALESCE(v_slot.capacity, v_slot.concurrent_capacity, 1));

        -- Recalculate true active count excluding this terminal request
        SELECT COUNT(*)::INTEGER INTO v_active_count
        FROM public.requests r
        WHERE r.shop_id = v_slot.shop_id
          AND r.workflow_group_code = 'APPOINTMENT'
          AND r.id <> NEW.id
          AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
          AND (
            r.hold_expires_at IS NULL
            OR r.hold_expires_at >= now()
            OR r.payment_status IN ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'paid')
          )
          AND r.notes IS NOT NULL
          AND r.notes::jsonb->>'slot_id' = v_slot_id::text;

        UPDATE public.appointment_slots
        SET confirmed_count = v_active_count,
            is_available = (v_active_count < v_capacity),
            booked_by_request_id = CASE WHEN booked_by_request_id = NEW.id THEN NULL ELSE booked_by_request_id END,
            updated_at = now()
        WHERE id = v_slot_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace legacy triggers with single authoritative trigger
DROP TRIGGER IF EXISTS trg_release_slot_on_request_terminal ON public.requests;
DROP TRIGGER IF EXISTS trg_vaangly_release_slot_on_request_terminal ON public.requests;
DROP TRIGGER IF EXISTS trg_sync_appointment_slot_on_request_change ON public.requests;

CREATE TRIGGER trg_sync_appointment_slot_on_request_change
  AFTER UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_slot_on_request_change();

-- ----------------------------------------------------------------------------
-- 4. ATOMIC APPOINTMENT RESCHEDULING RPC
-- Atomically swaps slot reservation from old slot to new slot
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_request_id UUID,
  p_new_slot_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req public.requests%ROWTYPE;
  v_old_slot_id UUID;
  v_old_slot public.appointment_slots%ROWTYPE;
  v_new_slot public.appointment_slots%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_caller_id UUID;
  v_is_authorized BOOLEAN := FALSE;
  v_new_capacity INTEGER;
  v_new_active_count INTEGER;
  v_new_slot_start_min INTEGER;
  v_new_slot_end_min INTEGER;
  v_new_token INTEGER;
  v_payload JSONB;
  v_now_kolkata TIMESTAMPTZ;
  v_today_kolkata DATE;
  v_current_min_kolkata INTEGER;
BEGIN
  v_caller_id := auth.uid();

  -- 1. Fetch request with lock
  SELECT * INTO v_req
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appointment request not found.');
  END IF;

  IF v_req.workflow_group_code <> 'APPOINTMENT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only appointments can be rescheduled.');
  END IF;

  -- 2. Authorization check: caller must be customer, shop owner, or admin
  IF public.is_admin() THEN
    v_is_authorized := TRUE;
  ELSIF v_req.customer_id = v_caller_id THEN
    v_is_authorized := TRUE;
  ELSE
    SELECT (owner_id = v_caller_id) INTO v_is_authorized
    FROM public.shops
    WHERE id = v_req.shop_id;
  END IF;

  IF NOT COALESCE(v_is_authorized, FALSE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You do not have permission to reschedule this appointment.');
  END IF;

  -- 3. State eligibility check
  IF v_req.current_state IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW', 'COMPLETED') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot reschedule an appointment in ' || v_req.current_state || ' status.'
    );
  END IF;

  -- Extract old slot id
  BEGIN
    v_old_slot_id := (v_req.notes::jsonb->>'slot_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_old_slot_id := NULL;
  END;

  IF v_old_slot_id = p_new_slot_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'The new slot is identical to the current slot.');
  END IF;

  -- 4. Lock both old and new slots in deterministic order to prevent deadlocks
  IF v_old_slot_id IS NOT NULL AND v_old_slot_id < p_new_slot_id THEN
    SELECT * INTO v_old_slot FROM public.appointment_slots WHERE id = v_old_slot_id FOR UPDATE;
    SELECT * INTO v_new_slot FROM public.appointment_slots WHERE id = p_new_slot_id FOR UPDATE;
  ELSE
    SELECT * INTO v_new_slot FROM public.appointment_slots WHERE id = p_new_slot_id FOR UPDATE;
    IF v_old_slot_id IS NOT NULL THEN
      SELECT * INTO v_old_slot FROM public.appointment_slots WHERE id = v_old_slot_id FOR UPDATE;
    END IF;
  END IF;

  IF v_new_slot.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'New appointment slot not found.');
  END IF;

  IF v_new_slot.shop_id <> v_req.shop_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'The selected slot belongs to a different shop.');
  END IF;

  -- 5. Validate new slot is in future
  v_now_kolkata := now() AT TIME ZONE 'Asia/Kolkata';
  v_today_kolkata := v_now_kolkata::date;
  v_current_min_kolkata := public.parse_time_to_minutes(to_char(v_now_kolkata, 'HH12:MI AM'));
  v_new_slot_start_min := public.parse_time_to_minutes(v_new_slot.start_time);
  v_new_slot_end_min := public.parse_time_to_minutes(v_new_slot.end_time);

  IF v_new_slot.slot_date < v_today_kolkata OR
     (v_new_slot.slot_date = v_today_kolkata AND v_new_slot_start_min <= v_current_min_kolkata) THEN
    RETURN jsonb_build_object('success', false, 'error', 'The selected new slot is in the past. Please choose a future slot.');
  END IF;

  -- 6. Check capacity on new slot
  v_new_capacity := GREATEST(1, COALESCE(v_new_slot.capacity, v_new_slot.concurrent_capacity, 1));

  SELECT COUNT(*)::INTEGER INTO v_new_active_count
  FROM public.requests r
  WHERE r.shop_id = v_new_slot.shop_id
    AND r.workflow_group_code = 'APPOINTMENT'
    AND r.id <> v_req.id
    AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
    AND (
      r.hold_expires_at IS NULL
      OR r.hold_expires_at >= now()
      OR r.payment_status IN ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'paid')
    )
    AND r.notes IS NOT NULL
    AND r.notes::jsonb->>'slot_id' = p_new_slot_id::text;

  IF v_new_active_count >= v_new_capacity THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INTERVAL_FULL',
      'error', 'The selected new slot is already full. Your current appointment remains reserved.'
    );
  END IF;

  -- 7. Assign sequential token number on new slot
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_new_token
  FROM public.requests
  WHERE shop_id = v_new_slot.shop_id
    AND workflow_group_code = 'APPOINTMENT'
    AND id <> v_req.id
    AND current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')
    AND notes IS NOT NULL
    AND notes::jsonb->>'slot_id' = p_new_slot_id::text;

  -- 8. Release capacity on old slot
  IF v_old_slot.id IS NOT NULL THEN
    UPDATE public.appointment_slots
    SET confirmed_count = GREATEST(confirmed_count - 1, 0),
        is_available = TRUE,
        booked_by_request_id = CASE WHEN booked_by_request_id = v_req.id THEN NULL ELSE booked_by_request_id END,
        updated_at = now()
    WHERE id = v_old_slot.id;
  END IF;

  -- 9. Reserve capacity on new slot
  UPDATE public.appointment_slots
  SET confirmed_count = v_new_active_count + 1,
      is_available = (v_new_active_count + 1 < v_new_capacity),
      booked_by_request_id = CASE WHEN v_new_active_count = 0 THEN v_req.id ELSE booked_by_request_id END,
      updated_at = now()
  WHERE id = v_new_slot.id;

  -- 10. Update request record with new slot metadata
  v_payload := COALESCE(v_req.notes::jsonb, '{}'::jsonb);
  v_payload := v_payload || jsonb_build_object(
    'slot_id', v_new_slot.id,
    'slot_date', v_new_slot.slot_date,
    'start_time', v_new_slot.start_time,
    'end_time', v_new_slot.end_time,
    'token_number', v_new_token,
    'rescheduled_at', now(),
    'rescheduled_from_slot_id', v_old_slot_id
  );

  UPDATE public.requests
  SET scheduled_for = to_timestamp(v_new_slot.slot_date::text || ' ' || v_new_slot.start_time, 'YYYY-MM-DD HH12:MI AM'),
      token_number = v_new_token,
      notes = v_payload::text,
      updated_at = now()
  WHERE id = p_request_id;

  -- 11. Insert audit event
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
    v_caller_id,
    CASE WHEN v_caller_id = v_req.customer_id THEN 'customer' ELSE 'shopkeeper' END,
    'Appointment rescheduled to ' || v_new_slot.slot_date::text || ' (' || v_new_slot.start_time || ' – ' || v_new_slot.end_time || ') Token #' || v_new_token::text || '.' || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN ' Reason: ' || p_reason ELSE '' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'new_slot_id', v_new_slot.id,
    'slot_date', v_new_slot.slot_date,
    'time_window', (v_new_slot.start_time || ' – ' || v_new_slot.end_time),
    'token_number', v_new_token,
    'queue_number', '#' || v_new_token::text,
    'message', 'Appointment successfully rescheduled.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. REAL-TIME AUTHORITATIVE SLOT AVAILABILITY RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_appointment_slot_availability(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_slot public.appointment_slots%ROWTYPE;
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_holds_count INTEGER;
BEGIN
  SELECT * INTO v_slot
  FROM public.appointment_slots
  WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot not found.');
  END IF;

  v_capacity := GREATEST(1, COALESCE(v_slot.capacity, v_slot.concurrent_capacity, 1));

  SELECT
    COUNT(*)::INTEGER,
    COUNT(CASE WHEN r.hold_expires_at IS NOT NULL AND r.hold_expires_at >= now() THEN 1 END)::INTEGER
  INTO v_active_count, v_holds_count
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

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot.id,
    'slot_date', v_slot.slot_date,
    'start_time', v_slot.start_time,
    'end_time', v_slot.end_time,
    'capacity', v_capacity,
    'active_count', v_active_count,
    'holds_count', v_holds_count,
    'remaining_capacity', GREATEST(0, v_capacity - v_active_count),
    'is_available', (v_active_count < v_capacity)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. PERMISSIONS & GRANTS
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.book_appointment_with_token FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment_with_token TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reschedule_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_appointment_slot_availability TO authenticated, anon, service_role;

COMMIT;

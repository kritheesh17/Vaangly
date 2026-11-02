-- ============================================================================
-- VAANGLY SECURITY REMEDIATION: PHASE 2 (SEC-02, SEC-04, SEC-06)
-- Migration: 20261102000071_harden_appointment_booking_and_roles.sql
--
-- Remediates:
-- 1. SEC-02: Enforce strict auth.uid() validation in book_appointment_with_token,
--    prevent customer impersonation, revoke execution from anon/PUBLIC, and grant
--    solely to authenticated and service_role.
-- 2. SEC-04: Authoritatively enforce 'customer' default role on signup in
--    handle_new_user(), ignoring any user_metadata->>'role'. Reinforce role
--    escalation guard on public.profiles.
-- 3. SEC-06: Fix mutable search_path on public.is_admin() by enforcing
--    SET search_path = public, auth, pg_temp.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEC-06: Harden is_admin() with explicit fixed search_path
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT (
    current_setting('role', true) = 'service_role'
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, auth, pg_temp;

-- ----------------------------------------------------------------------------
-- 2. SEC-04: Enforce role='customer' unconditionally on account signup
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_raw_phone text;
  v_clean_phone text;
BEGIN
  v_raw_phone := COALESCE(NEW.phone, NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''));

  -- Normalize 10-digit Indian phone numbers to canonical +91XXXXXXXXXX
  IF v_raw_phone IS NOT NULL AND v_raw_phone != '' THEN
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

  -- Strictly assign role='customer'. Never trust client-supplied metadata for roles.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Re-assert prevent_profile_role_escalation trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If role or is_verified is being changed
  IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_verified IS DISTINCT FROM NEW.is_verified) THEN
    -- Allow if caller is an existing verified admin or authorized staging bootstrap
    IF NOT (
      public.is_admin()
      OR (
        current_setting('vaango.staging_admin_bootstrap', true) = 'true'
        AND NEW.email = 'admin@vaangly.test'
      )
    ) THEN
      RAISE EXCEPTION 'Access Denied: You do not have permission to modify account role or verification status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ----------------------------------------------------------------------------
-- 3. SEC-02: Enforce booking authentication, impersonation checks & privileges
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
  -- Authoritative caller validation:
  -- 1. service_role callers (system automation/edge functions) may supply p_customer_id
  -- 2. Authenticated users MUST have auth.uid() matching p_customer_id (or be an admin)
  -- 3. Anonymous callers are strictly rejected
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

    -- Prevent customer impersonation: caller can only book for themselves unless admin
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
    to_timestamp(v_slot.slot_date::text || ' ' || v_slot.start_time, 'YYYY-MM-DD HH12:MI AM'),
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

-- Explicitly revoke execution privileges from PUBLIC and anonymous visitors
REVOKE ALL ON FUNCTION public.book_appointment_with_token(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, INTEGER
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.book_appointment_with_token(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, INTEGER
) FROM anon;

-- Grant execution privileges exclusively to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.book_appointment_with_token(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.book_appointment_with_token(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, INTEGER
) TO service_role;


-- Migration: 20261002000057_fix_appointment_token_rpc_fields.sql
-- Description: Align upi_qr_url column reference in book_appointment_with_token

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

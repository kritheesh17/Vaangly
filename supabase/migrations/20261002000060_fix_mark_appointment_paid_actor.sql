-- Migration: 20261002000060_fix_mark_appointment_paid_actor.sql
-- Description: Ensure actor_id is populated from auth.uid() or shop owner in mark_appointment_paid and update_appointment_queue_status

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
  v_actor_id UUID;
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

  v_actor_id := COALESCE(auth.uid(), v_req.owner_id);

  UPDATE public.requests
  SET customer_paid = TRUE,
      payment_status = 'PAYMENT_VERIFIED',
      paid_at = now(),
      paid_by = v_actor_id,
      payment_verified_at = now(),
      payment_verified_by = v_actor_id,
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
    v_actor_id,
    'shopkeeper',
    'Shopkeeper marked Pay-at-Shop payment as received.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'paid_at', now(),
    'paid_by', v_actor_id
  );
END;
$$;

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
  v_actor_id UUID;
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

  v_actor_id := COALESCE(auth.uid(), v_req.owner_id);

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
    v_actor_id,
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

-- Migration: 20261002000067_flexible_appointment_slots.sql
-- Description: Supports flexible appointment slots with custom durations, individual slot capacities,
--              atomic synchronization, and strict preservation of confirmed bookings.

BEGIN;

-- 1. Ensure appointment_slots has proper capacity and timing constraints
ALTER TABLE public.appointment_slots
  ALTER COLUMN concurrent_capacity SET DEFAULT 1,
  ALTER COLUMN capacity SET DEFAULT 1;

-- 2. Secure RPC to synchronize flexible appointment slots for a shop
-- Enforces shopkeeper ownership RLS, updates slot durations and capacities,
-- and strictly preserves existing bookings.
CREATE OR REPLACE FUNCTION public.sync_shop_appointment_slots(
  p_shop_id UUID,
  p_slots JSONB, -- JSON array of { start_time, end_time, capacity, slot_date, service_id }
  p_start_date DATE,
  p_end_date DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_owner BOOLEAN := FALSE;
  v_slot_item JSONB;
  v_start_time TEXT;
  v_end_time TEXT;
  v_capacity INTEGER;
  v_slot_date DATE;
  v_service_id UUID;
  v_existing_id UUID;
  v_existing_confirmed INTEGER;
  v_upserted_count INTEGER := 0;
BEGIN
  v_caller_id := auth.uid();

  -- Security check: caller must be shop owner or platform admin
  IF public.is_admin() THEN
    v_is_owner := TRUE;
  ELSE
    SELECT (owner_id = v_caller_id) INTO v_is_owner
    FROM public.shops
    WHERE id = p_shop_id;
  END IF;

  IF NOT COALESCE(v_is_owner, FALSE) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You can only modify appointment schedules for your own shop.'
    );
  END IF;

  IF p_slots IS NULL OR jsonb_array_length(p_slots) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0);
  END IF;

  -- Process each slot in the payload
  FOR v_slot_item IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    v_start_time := v_slot_item->>'start_time';
    v_end_time := v_slot_item->>'end_time';
    v_capacity := GREATEST(1, LEAST(500, COALESCE((v_slot_item->>'capacity')::INTEGER, 1)));
    v_slot_date := (v_slot_item->>'slot_date')::DATE;
    v_service_id := CASE 
      WHEN v_slot_item->>'service_id' IS NOT NULL AND v_slot_item->>'service_id' <> '' 
      THEN (v_slot_item->>'service_id')::UUID 
      ELSE NULL 
    END;

    -- Look up existing slot for this date, time and service
    SELECT id, COALESCE(confirmed_count, 0)
    INTO v_existing_id, v_existing_confirmed
    FROM public.appointment_slots
    WHERE shop_id = p_shop_id
      AND slot_date = v_slot_date
      AND start_time = v_start_time
      AND (
        (service_id IS NULL AND v_service_id IS NULL)
        OR service_id = v_service_id
      )
    FOR UPDATE;

    IF FOUND THEN
      -- Update existing slot: adjust duration and capacity while preserving confirmed bookings!
      -- If existing confirmed bookings exceed new capacity, capacity is pegged to at least confirmed count
      -- so no existing appointment is cancelled or invalidated.
      UPDATE public.appointment_slots
      SET end_time = v_end_time,
          capacity = GREATEST(v_capacity, v_existing_confirmed),
          concurrent_capacity = GREATEST(v_capacity, v_existing_confirmed),
          is_available = (v_existing_confirmed < GREATEST(v_capacity, v_existing_confirmed)),
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      -- Insert brand new slot
      INSERT INTO public.appointment_slots (
        shop_id,
        service_id,
        slot_date,
        start_time,
        end_time,
        capacity,
        concurrent_capacity,
        confirmed_count,
        is_available,
        created_at
      ) VALUES (
        p_shop_id,
        v_service_id,
        v_slot_date,
        v_start_time,
        v_end_time,
        v_capacity,
        v_capacity,
        0,
        TRUE,
        now()
      );
    END IF;

    v_upserted_count := v_upserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_upserted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_shop_appointment_slots(UUID, JSONB, DATE, DATE) TO authenticated;

COMMIT;

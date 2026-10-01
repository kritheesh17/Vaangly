-- ============================================================================
-- Migration: 20261002000066_fix_scheduled_pickup_time_validation.sql
-- Description:
-- Fix invalid input syntax error in vaangly_validate_request_pickup_time()
-- where TIME WITHOUT TIME ZONE columns (shops.opening_time, shops.closing_time)
-- were compared against empty string ('') resulting in PostgreSQL 22007 error:
-- "invalid input syntax for type time: \"\"".
-- Properly uses NULL checks and direct TIME values without text conversions.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.vaangly_validate_request_pickup_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop public.shops%ROWTYPE;
  v_timezone text := 'Asia/Kolkata';
  v_local_pickup timestamp;
  v_local_now timestamp;
  v_pickup_time time;
  v_pickup_date date;
  v_now_date date;
  v_pickup_dow integer;
  v_open_time time;
  v_close_time time;
  v_break jsonb;
  v_break_start text;
  v_break_end text;
  v_break_start_time time;
  v_break_end_time time;
  v_adv_days integer;
  v_avail_days jsonb;
BEGIN
  -- Only validate for ORDER workflows when pickup_at is explicitly specified
  IF NEW.workflow_group_code = 'ORDER' AND NEW.pickup_at IS NOT NULL THEN
    -- Fetch target shop
    SELECT * INTO v_shop
    FROM public.shops
    WHERE id = NEW.shop_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target shop does not exist.';
    END IF;

    -- Determine shop timezone
    IF v_shop.slot_config IS NOT NULL AND (v_shop.slot_config->>'timeZone') IS NOT NULL THEN
      v_timezone := v_shop.slot_config->>'timeZone';
    END IF;

    -- Convert timestamps to shop local time
    v_local_pickup := NEW.pickup_at AT TIME ZONE v_timezone;
    v_local_now := now() AT TIME ZONE v_timezone;
    v_pickup_time := v_local_pickup::time;
    v_pickup_date := v_local_pickup::date;
    v_now_date := v_local_now::date;
    v_pickup_dow := EXTRACT(DOW FROM v_local_pickup)::integer;

    -- 1. Must be strictly in the future (at least after current local time)
    IF NEW.pickup_at <= now() THEN
      RAISE EXCEPTION 'Scheduled pickup time must be in the future.';
    END IF;

    -- If scheduled for today, must not be already started or past
    IF v_pickup_date = v_now_date AND v_pickup_time <= (v_local_now::time) THEN
      RAISE EXCEPTION 'Scheduled pickup time has already started or passed today.';
    END IF;

    -- 2. Respect advance booking days constraint if configured
    IF v_shop.slot_config IS NOT NULL AND (v_shop.slot_config->>'advanceBookingDays') IS NOT NULL THEN
      v_adv_days := (v_shop.slot_config->>'advanceBookingDays')::integer;
      IF v_adv_days > 0 AND v_pickup_date > (v_now_date + v_adv_days) THEN
        RAISE EXCEPTION 'Scheduled pickup date exceeds maximum advance booking limit (% days).', v_adv_days;
      END IF;
    END IF;

    -- 3. Respect available days if configured
    IF v_shop.slot_config IS NOT NULL AND jsonb_typeof(v_shop.slot_config->'availableDays') = 'array' THEN
      v_avail_days := v_shop.slot_config->'availableDays';
      IF jsonb_array_length(v_avail_days) > 0 AND NOT (v_avail_days @> to_jsonb(v_pickup_dow)) THEN
        RAISE EXCEPTION 'The shop is closed on the selected pickup day.';
      END IF;
    END IF;

    -- 4. Respect shop operating hours (TIME columns handled directly without empty-string casts)
    IF v_shop.opening_time IS NOT NULL THEN
      v_open_time := v_shop.opening_time;
    END IF;

    IF v_shop.closing_time IS NOT NULL THEN
      v_close_time := v_shop.closing_time;
    END IF;

    IF v_open_time IS NOT NULL AND v_close_time IS NOT NULL THEN
      IF v_pickup_time < v_open_time OR v_pickup_time > v_close_time THEN
        RAISE EXCEPTION 'Scheduled pickup time (%:%) is outside shop operating hours (% to %).',
          to_char(v_pickup_time, 'HH12:MI AM'),
          to_char(v_local_pickup, 'YYYY-MM-DD'),
          to_char(v_open_time, 'HH12:MI AM'),
          to_char(v_close_time, 'HH12:MI AM');
      END IF;
    END IF;

    -- 5. Respect shop breaks if configured
    IF v_shop.slot_config IS NOT NULL AND jsonb_typeof(v_shop.slot_config->'breaks') = 'array' THEN
      FOR v_break IN SELECT * FROM jsonb_array_elements(v_shop.slot_config->'breaks') LOOP
        v_break_start := v_break->>'start';
        v_break_end := v_break->>'end';

        IF v_break_start IS NOT NULL AND v_break_end IS NOT NULL THEN
          -- Convert 12h or 24h format if needed
          BEGIN
            IF v_break_start ~* '(AM|PM)' THEN
              v_break_start_time := to_timestamp(v_break_start, 'HH12:MI AM')::time;
            ELSE
              v_break_start_time := v_break_start::time;
            END IF;

            IF v_break_end ~* '(AM|PM)' THEN
              v_break_end_time := to_timestamp(v_break_end, 'HH12:MI AM')::time;
            ELSE
              v_break_end_time := v_break_end::time;
            END IF;

            IF v_pickup_time >= v_break_start_time AND v_pickup_time < v_break_end_time THEN
              RAISE EXCEPTION 'Scheduled pickup time falls during shop break hours (% to %).',
                v_break_start, v_break_end;
            END IF;
          EXCEPTION
            WHEN OTHERS THEN
              -- If break time parsing fails, skip strict break check to avoid blocking valid orders
              NULL;
          END;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Re-attach trigger to requests table
DROP TRIGGER IF EXISTS z_validate_request_pickup_time ON public.requests;
CREATE TRIGGER z_validate_request_pickup_time
  BEFORE INSERT OR UPDATE OF pickup_at, workflow_group_code, shop_id ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.vaangly_validate_request_pickup_time();

COMMIT;

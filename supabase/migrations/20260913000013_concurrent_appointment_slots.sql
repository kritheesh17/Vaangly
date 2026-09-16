ALTER TABLE public.appointment_slots
  ADD COLUMN IF NOT EXISTS concurrent_capacity INTEGER NOT NULL DEFAULT 1
  CHECK (concurrent_capacity BETWEEN 1 AND 10);

CREATE OR REPLACE FUNCTION public.book_appointment_slot(
    p_slot_id UUID,
    p_request_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_capacity INTEGER;
    v_booked INTEGER;
BEGIN
    SELECT concurrent_capacity INTO v_capacity
    FROM public.appointment_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF v_capacity IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(*) INTO v_booked
    FROM public.requests r
    WHERE r.workflow_group_code = 'APPOINTMENT'
      AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW')
      AND r.notes::jsonb->>'slot_id' = p_slot_id::text;

    IF v_booked >= v_capacity THEN
        RETURN FALSE;
    END IF;

    UPDATE public.appointment_slots
    SET is_available = (v_booked + 1 < v_capacity),
        booked_by_request_id = CASE WHEN v_booked = 0 THEN p_request_id ELSE booked_by_request_id END
    WHERE id = p_slot_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

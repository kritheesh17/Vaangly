-- VAANGO PHASE 6: PRODUCTION HARDENING, SECURITY & RELIABILITY MIGRATION
-- Supports PostgreSQL / Supabase with Row Level Security (RLS)

-- 1. PREVENT PROFILE ROLE ESCALATION (CRITICAL SECURITY)
-- Regular users must NEVER be able to update their own role or is_verified status.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- If role or is_verified is being changed
    IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_verified IS DISTINCT FROM NEW.is_verified) THEN
        -- Only an authorized admin may change role or verification
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access Denied: You do not have permission to modify account role or verification status.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_escalation();


-- 2. CUSTOMER CANCELLATION RLS POLICY ON REQUESTS
-- Customers can only cancel their own requests if the request is still in an eligible pre-fulfillment state.
DROP POLICY IF EXISTS "Customers can cancel own eligible requests" ON public.requests;
CREATE POLICY "Customers can cancel own eligible requests" ON public.requests
    FOR UPDATE USING (
        auth.uid() = customer_id
        AND current_state IN ('REQUESTED', 'ACCEPTED', 'CONFIRMED')
    ) WITH CHECK (
        auth.uid() = customer_id
        AND current_state = 'CANCELLED'
    );


-- 3. DATABASE-ENFORCED REQUEST STATE MACHINE
-- Rejects illegal state jumps at the database level (e.g. COMPLETED -> PREPARING, REJECTED -> ACCEPTED).
CREATE OR REPLACE FUNCTION public.validate_request_state_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_group VARCHAR(30);
    v_valid BOOLEAN := FALSE;
BEGIN
    -- If state hasn't changed, allow
    IF OLD.current_state = NEW.current_state THEN
        RETURN NEW;
    END IF;

    v_group := NEW.workflow_group_code;

    -- State Machine Rules by Vertical Group
    IF v_group = 'ORDER' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'ACCEPTED' AND NEW.current_state IN ('PREPARING', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'PREPARING' AND NEW.current_state IN ('READY', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('PREPARING', 'READY', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'READY' AND NEW.current_state = 'COMPLETED' THEN
            v_valid := TRUE;
        END IF;

    ELSIF v_group = 'APPOINTMENT' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('CONFIRMED', 'REJECTED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'CONFIRMED' AND NEW.current_state IN ('IN_PROGRESS', 'DELAYED', 'CANCELLED', 'NO_SHOW') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'IN_PROGRESS' AND NEW.current_state = 'COMPLETED' THEN
            v_valid := TRUE;
        END IF;

    ELSIF v_group = 'SERVICE' THEN
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'ACCEPTED' AND NEW.current_state IN ('IN_PROGRESS', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('ACCEPTED', 'IN_PROGRESS', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'IN_PROGRESS' AND NEW.current_state IN ('READY', 'DELAYED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'READY' AND NEW.current_state = 'COMPLETED' THEN
            v_valid := TRUE;
        END IF;
    END IF;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Illegal workflow transition: Cannot move % request from % to %', v_group, OLD.current_state, NEW.current_state;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_request_state_transition ON public.requests;
CREATE TRIGGER trg_validate_request_state_transition
    BEFORE UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_request_state_transition();


-- 4. AUTOMATIC APPOINTMENT SLOT RELEASE ON CANCELLATION / REJECTION
-- Ensures slots are never orphaned or permanently held when an appointment is terminated.
CREATE OR REPLACE FUNCTION public.release_slot_on_request_terminal()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.workflow_group_code = 'APPOINTMENT' AND NEW.current_state IN ('CANCELLED', 'REJECTED', 'EXPIRED') THEN
        UPDATE public.appointment_slots
        SET is_available = TRUE,
            booked_by_request_id = NULL
        WHERE booked_by_request_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_slot_on_request_terminal ON public.requests;
CREATE TRIGGER trg_release_slot_on_request_terminal
    AFTER UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.release_slot_on_request_terminal();


-- 5. ATOMIC APPOINTMENT BOOKING TRANSACTION FUNCTION
-- Guarantees atomicity: locks slot, creates request, links booking, and creates initial audit event.
CREATE OR REPLACE FUNCTION public.book_appointment_transaction(
    p_customer_id UUID,
    p_shop_id UUID,
    p_slot_id UUID,
    p_reference_code VARCHAR(30),
    p_total_estimate NUMERIC(10, 2),
    p_scheduled_for TIMESTAMPTZ,
    p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_available BOOLEAN;
    v_request_id UUID;
    v_request_row public.requests%ROWTYPE;
BEGIN
    -- 1. Row-level lock on the target slot
    SELECT is_available INTO v_available
    FROM public.appointment_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF v_available IS NOT TRUE THEN
        RAISE EXCEPTION 'SLOT_UNAVAILABLE: Appointment slot has already been booked by another user.';
    END IF;

    -- 2. Insert request record
    INSERT INTO public.requests (
        reference_code,
        customer_id,
        shop_id,
        workflow_group_code,
        current_state,
        total_estimate,
        scheduled_for,
        notes
    ) VALUES (
        p_reference_code,
        p_customer_id,
        p_shop_id,
        'APPOINTMENT',
        'REQUESTED',
        p_total_estimate,
        p_scheduled_for,
        p_notes
    ) RETURNING * INTO v_request_row;

    -- 3. Reserve slot
    UPDATE public.appointment_slots
    SET is_available = FALSE,
        booked_by_request_id = v_request_row.id
    WHERE id = p_slot_id;

    -- 4. Record initial request event
    INSERT INTO public.request_events (
        request_id,
        from_state,
        to_state,
        actor_id,
        actor_role,
        notes
    ) VALUES (
        v_request_row.id,
        NULL,
        'REQUESTED',
        p_customer_id,
        'customer',
        'Customer booked appointment slot'
    );

    RETURN to_jsonb(v_request_row);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. PRIVATE STORAGE: SHOPKEEPER KYC DOCUMENT SECURITY POLICIES
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects'
    ) THEN
        -- Allow authenticated merchants to upload their own KYC ID proofs
        DROP POLICY IF EXISTS "Merchants can upload own KYC documents" ON storage.objects;
        CREATE POLICY "Merchants can upload own KYC documents" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'shop-documents'
                AND auth.role() = 'authenticated'
                AND (storage.foldername(name))[1] = (auth.uid())::text
            );

        -- Allow merchants to read only their own uploaded KYC documents
        DROP POLICY IF EXISTS "Merchants can view own KYC documents" ON storage.objects;
        CREATE POLICY "Merchants can view own KYC documents" ON storage.objects
            FOR SELECT USING (
                bucket_id = 'shop-documents'
                AND (
                    public.is_admin()
                    OR (storage.foldername(name))[1] = (auth.uid())::text
                )
            );
    END IF;
END $$;

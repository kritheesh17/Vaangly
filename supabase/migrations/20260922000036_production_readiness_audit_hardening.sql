-- ==============================================================================
-- Migration: 20260922000036_production_readiness_audit_hardening.sql
-- Description: Production Readiness Hardening
-- 1. Permits PRE-FULFILLMENT CANCELLATION (REQUESTED -> CANCELLED) in requests state machine.
-- 2. Closes unverified role escalation by defaulting all new auth users to 'customer'.
-- 3. Restricts notification creation to trusted admin/server-side RPCs.
-- 4. Grants SELECT permissions on product_avg_ratings view for customer storefronts.
-- ==============================================================================

-- 1. STATE MACHINE FIX: ALLOW PRE-FULFILLMENT CANCELLATION
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
        -- Allow cancellation directly while in REQUESTED before merchant fulfillment begins
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED', 'CANCELLED') THEN
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
        -- Allow cancellation directly while in REQUESTED before shop confirmation
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('CONFIRMED', 'REJECTED', 'CANCELLED') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'CONFIRMED' AND NEW.current_state IN ('IN_PROGRESS', 'DELAYED', 'CANCELLED', 'NO_SHOW') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'DELAYED' AND NEW.current_state IN ('CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW') THEN
            v_valid := TRUE;
        ELSIF OLD.current_state = 'IN_PROGRESS' AND NEW.current_state = 'COMPLETED' THEN
            v_valid := TRUE;
        END IF;

    ELSIF v_group = 'SERVICE' THEN
        -- Allow cancellation directly while in REQUESTED before merchant acceptance
        IF OLD.current_state = 'REQUESTED' AND NEW.current_state IN ('ACCEPTED', 'REJECTED', 'CANCELLED') THEN
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

-- 2. SECURITY HARDENING: DEFAULT SIGNUPS TO 'customer' TO PREVENT ROLE ESCALATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
    'customer', -- Never trust raw_user_meta_data for role escalation; merchant role requires approved application
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'User'
    ),
    NEW.email,
    COALESCE(NEW.phone, NULLIF(NEW.raw_user_meta_data->>'phone', '')),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.vaangly_sync_auth_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. NOTIFICATION RLS: clients may read/update their own rows, but never insert.
DROP POLICY IF EXISTS vaangly_notifications_service_insert ON public.notifications;
DROP POLICY IF EXISTS "Users can create operational notifications" ON public.notifications;

REVOKE INSERT ON public.notifications FROM PUBLIC, anon, authenticated;

-- Ensure recipients can only view and update their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = recipient_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- 4. GRANT PERMISSIONS ON product_avg_ratings VIEW
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'product_avg_ratings' AND schemaname = 'public') THEN
    EXECUTE 'GRANT SELECT ON public.product_avg_ratings TO authenticated, anon';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vaangly_create_admin_notification(
    p_recipient_id UUID,
    p_shop_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_reference_id TEXT DEFAULT NULL,
    p_reference_code TEXT DEFAULT NULL
)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_notification public.notifications;
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Trusted notification access required';
    END IF;

    INSERT INTO public.notifications(
        recipient_id, shop_id, type, notification_type, title, message,
        reference_id, reference_code
    )
    VALUES (
        p_recipient_id, p_shop_id, p_type, p_type, p_title, p_message,
        p_reference_id, p_reference_code
    )
    RETURNING * INTO v_notification;

    RETURN v_notification;
END;
$$;

CREATE OR REPLACE FUNCTION public.vaangly_create_notification_from_event(
    p_event_id UUID, p_recipient_id UUID, p_notification_type TEXT,
    p_title TEXT, p_message TEXT, p_reference_id UUID DEFAULT NULL, p_reference_code TEXT DEFAULT NULL
)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_notification public.notifications;
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Trusted notification access required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.notification_events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Notification event not found';
    END IF;

    INSERT INTO public.notifications(
        recipient_id, event_id, type, notification_type, title, message,
        reference_id, reference_code
    )
    VALUES (
        p_recipient_id, p_event_id, p_notification_type, p_notification_type,
        p_title, p_message, p_reference_id::text, p_reference_code
    )
    RETURNING * INTO v_notification;

    RETURN v_notification;
END;
$$;

REVOKE ALL ON FUNCTION public.vaangly_create_admin_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vaangly_create_admin_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.vaangly_create_notification_from_event(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vaangly_create_notification_from_event(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

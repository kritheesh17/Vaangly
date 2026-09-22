-- ==============================================================================
-- Migration: 20260922000036_production_readiness_audit_hardening.sql
-- Description: Production Readiness Hardening
-- 1. Permits PRE-FULFILLMENT CANCELLATION (REQUESTED -> CANCELLED) in requests state machine.
-- 2. Closes unverified role escalation by defaulting all new auth users to 'customer'.
-- 3. Restores authenticated operational notifications INSERT RLS policy.
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

-- 3. NOTIFICATION RLS: RESTORE OPERATIONAL NOTIFICATIONS CREATION FOR AUTHENTICATED USERS
DROP POLICY IF EXISTS vaangly_notifications_service_insert ON public.notifications;
DROP POLICY IF EXISTS "Users can create operational notifications" ON public.notifications;

CREATE POLICY "Users can create operational notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
);

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

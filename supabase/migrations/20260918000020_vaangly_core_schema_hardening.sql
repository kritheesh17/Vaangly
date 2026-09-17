-- Vaangly additive hardening follow-up to migration 19.
-- Preserves legacy functions, triggers, policies, table names, and frontend RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(p_role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin();
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_business_member(p_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_business_member(p_business_id);
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_hospital_staff(p_hospital_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_hospital_staff(p_hospital_id);
$$;

CREATE OR REPLACE FUNCTION public.vaangly_sync_auth_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, CASE WHEN NEW.raw_user_meta_data ->> 'role' = 'shopkeeper' THEN 'shopkeeper' ELSE 'customer' END)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_sync_auth_user_role') THEN
    CREATE TRIGGER vaangly_sync_auth_user_role
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.vaangly_sync_auth_user_role();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.write_admin_audit(
  p_action_type text, p_entity_type text, p_entity_id uuid,
  p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  INSERT INTO public.admin_audit_logs(admin_id, action_type, entity_type, entity_id, details, before_data, after_data, reason)
  VALUES (auth.uid(), p_action_type, p_entity_type, p_entity_id::text,
          jsonb_build_object('before', p_before, 'after', p_after, 'reason', p_reason),
          p_before, p_after, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_business(p_business_id uuid, p_reason text)
RETURNS public.businesses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business public.businesses;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Suspension reason is required'; END IF;
  UPDATE public.businesses
  SET suspended_at = now(), suspended_by = auth.uid(), suspension_reason = trim(p_reason), is_live = false, updated_at = now()
  WHERE id = p_business_id RETURNING * INTO v_business;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
  UPDATE public.business_status SET admin_suspended = true, updated_by = auth.uid() WHERE business_id = p_business_id;
  PERFORM public.write_admin_audit('business_suspended', 'business', p_business_id, NULL, to_jsonb(v_business), p_reason);
  RETURN v_business;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_business(p_business_id uuid)
RETURNS public.businesses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business public.businesses;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE public.businesses
  SET suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL, updated_at = now()
  WHERE id = p_business_id RETURNING * INTO v_business;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
  UPDATE public.business_status SET admin_suspended = false, updated_by = auth.uid() WHERE business_id = p_business_id;
  PERFORM public.write_admin_audit('business_reactivated', 'business', p_business_id, NULL, to_jsonb(v_business), NULL);
  RETURN v_business;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_business_operational_status(
  p_business_id uuid, p_status text, p_message text DEFAULT NULL
)
RETURNS public.business_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.business_status;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN RAISE EXCEPTION 'Business membership required'; END IF;
  IF p_status NOT IN ('accepting', 'not_accepting', 'busy', 'delayed') THEN RAISE EXCEPTION 'Invalid operational status'; END IF;
  UPDATE public.business_status
  SET shopkeeper_status = p_status, status_message = p_message, updated_by = auth.uid(), updated_at = now()
  WHERE business_id = p_business_id AND NOT admin_suspended RETURNING * INTO v_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business is suspended or does not exist'; END IF;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.vaangly_assert_slot_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.capacity < 1 OR NEW.capacity > 100 THEN RAISE EXCEPTION 'Appointment capacity must be between 1 and 100'; END IF;
  IF NEW.confirmed_count < 0 OR NEW.confirmed_count > NEW.capacity THEN
    RAISE EXCEPTION 'Confirmed appointments cannot exceed slot capacity';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_assert_slot_capacity') THEN
    CREATE TRIGGER vaangly_assert_slot_capacity
    BEFORE INSERT OR UPDATE ON public.appointment_slots
    FOR EACH ROW EXECUTE FUNCTION public.vaangly_assert_slot_capacity();
  END IF;
END $$;

INSERT INTO public.request_status_transitions(request_kind, from_state, to_state, allowed_roles, action_label)
VALUES
  ('ORDER', 'REQUESTED', 'ACCEPTED', ARRAY['shopkeeper', 'admin'], 'Accept order'),
  ('ORDER', 'REQUESTED', 'REJECTED', ARRAY['shopkeeper', 'admin'], 'Reject order'),
  ('ORDER', 'ACCEPTED', 'PREPARING', ARRAY['shopkeeper', 'admin'], 'Start preparing'),
  ('ORDER', 'ACCEPTED', 'CANCELLED', ARRAY['customer', 'shopkeeper', 'admin'], 'Cancel order'),
  ('ORDER', 'PREPARING', 'READY', ARRAY['shopkeeper', 'admin'], 'Mark ready'),
  ('ORDER', 'PREPARING', 'CANCELLED', ARRAY['shopkeeper', 'admin'], 'Cancel order'),
  ('ORDER', 'READY', 'COMPLETED', ARRAY['shopkeeper', 'admin'], 'Complete order'),
  ('APPOINTMENT', 'REQUESTED', 'CONFIRMED', ARRAY['shopkeeper', 'admin'], 'Confirm appointment'),
  ('APPOINTMENT', 'REQUESTED', 'REJECTED', ARRAY['shopkeeper', 'admin'], 'Reject appointment'),
  ('APPOINTMENT', 'CONFIRMED', 'IN_PROGRESS', ARRAY['shopkeeper', 'admin'], 'Start appointment'),
  ('APPOINTMENT', 'CONFIRMED', 'CANCELLED', ARRAY['customer', 'shopkeeper', 'admin'], 'Cancel appointment'),
  ('APPOINTMENT', 'IN_PROGRESS', 'COMPLETED', ARRAY['shopkeeper', 'admin'], 'Complete appointment'),
  ('SERVICE', 'REQUESTED', 'ACCEPTED', ARRAY['shopkeeper', 'admin'], 'Accept service'),
  ('SERVICE', 'REQUESTED', 'REJECTED', ARRAY['shopkeeper', 'admin'], 'Reject service'),
  ('SERVICE', 'ACCEPTED', 'IN_PROGRESS', ARRAY['shopkeeper', 'admin'], 'Start service'),
  ('SERVICE', 'IN_PROGRESS', 'READY', ARRAY['shopkeeper', 'admin'], 'Mark ready'),
  ('SERVICE', 'READY', 'COMPLETED', ARRAY['shopkeeper', 'admin'], 'Complete service')
ON CONFLICT (request_kind, from_state, to_state) DO NOTHING;

CREATE OR REPLACE FUNCTION public.vaangly_transition_request_state(
  p_request_id uuid, p_to_state text, p_notes text DEFAULT NULL
)
RETURNS public.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request public.requests; v_from_state text; v_role text;
BEGIN
  SELECT * INTO v_request FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF public.is_admin() THEN v_role := 'admin';
  ELSIF public.is_business_member(v_request.shop_id) THEN v_role := 'shopkeeper';
  ELSIF v_request.customer_id = auth.uid() THEN v_role := 'customer';
  ELSE RAISE EXCEPTION 'Request access denied'; END IF;
  v_from_state := v_request.current_state;
  IF NOT EXISTS (
    SELECT 1 FROM public.request_status_transitions t
    WHERE t.request_kind = COALESCE(v_request.request_kind, v_request.workflow_group_code)
      AND t.from_state = v_from_state AND t.to_state = p_to_state
      AND t.is_enabled AND v_role = ANY(t.allowed_roles)
  ) THEN RAISE EXCEPTION 'Transition is not allowed'; END IF;
  UPDATE public.requests SET current_state = p_to_state, updated_at = now() WHERE id = p_request_id RETURNING * INTO v_request;
  INSERT INTO public.request_events(request_id, from_state, to_state, actor_id, actor_role, notes)
  VALUES (p_request_id, v_from_state, p_to_state, auth.uid(), v_role, p_notes);
  INSERT INTO public.notification_events(event_type, aggregate_type, aggregate_id, actor_id)
  VALUES ('request_state_changed', 'request', p_request_id, auth.uid());
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.vaangly_create_notification_from_event(
  p_event_id uuid, p_recipient_id uuid, p_notification_type text,
  p_title text, p_message text, p_reference_id uuid DEFAULT NULL, p_reference_code text DEFAULT NULL
)
RETURNS public.notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_notification public.notifications;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Trusted notification access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Notification event not found';
  END IF;
  INSERT INTO public.notifications(recipient_id, event_id, notification_type, title, message, reference_id, reference_code)
  VALUES (p_recipient_id, p_event_id, p_notification_type, p_title, p_message, p_reference_id, p_reference_code)
  RETURNING * INTO v_notification;
  RETURN v_notification;
END;
$$;

CREATE OR REPLACE FUNCTION public.vaangly_validate_private_media()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.media_assets m
    WHERE m.id = NEW.media_asset_id AND m.visibility = 'private'
      AND m.media_kind = CASE WHEN TG_TABLE_NAME = 'payment_evidence' THEN 'payment_evidence' ELSE 'identity_document' END
  ) THEN
    RAISE EXCEPTION 'Sensitive evidence must reference matching private media';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_validate_payment_evidence_media') THEN
    CREATE TRIGGER vaangly_validate_payment_evidence_media
    BEFORE INSERT OR UPDATE ON public.payment_evidence
    FOR EACH ROW EXECUTE FUNCTION public.vaangly_validate_private_media();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_validate_identity_media') THEN
    CREATE TRIGGER vaangly_validate_identity_media
    BEFORE INSERT OR UPDATE ON public.business_application_media
    FOR EACH ROW WHEN (NEW.media_role = 'identity_document')
    EXECUTE FUNCTION public.vaangly_validate_private_media();
  END IF;
END $$;

ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE OR REPLACE FUNCTION public.vaangly_prevent_admin_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Administrative audit logs are immutable';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_admin_audit_immutable') THEN
    CREATE TRIGGER vaangly_admin_audit_immutable
    BEFORE UPDATE OR DELETE ON public.admin_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.vaangly_prevent_admin_audit_mutation();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.write_admin_audit(text, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_business(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_operational_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vaangly_transition_request_state(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vaangly_create_notification_from_event(uuid, uuid, text, text, text, uuid, text) TO authenticated;

COMMIT;

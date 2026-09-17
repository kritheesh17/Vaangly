REVOKE EXECUTE ON FUNCTION public.suspend_business(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_business(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_business_operational_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vaangly_transition_request_state(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vaangly_create_notification_from_event(uuid, uuid, text, text, text, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.suspend_business(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_operational_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vaangly_transition_request_state(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vaangly_create_notification_from_event(uuid, uuid, text, text, text, uuid, text) TO authenticated;

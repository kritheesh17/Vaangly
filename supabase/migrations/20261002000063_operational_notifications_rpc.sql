-- Migration: 20261002000063_operational_notifications_rpc.sql
-- Description: Allow authenticated actors (customers placing orders, shop owners updating orders)
-- to create operational notification rows via vaangly_create_admin_notification.

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
    -- Allow service_role, admin, OR authenticated users for valid order/request events:
    IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required to create notification';
        END IF;

        -- Validate that the caller has legitimate relation to the event:
        -- 1. Caller is sending to themselves
        -- 2. Caller is shop owner (sending to customer or self)
        -- 3. Caller is customer (sending to shop owner)
        IF p_recipient_id <> auth.uid() THEN
            IF p_shop_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.shops WHERE id = p_shop_id AND owner_id = auth.uid()
            ) AND NOT EXISTS (
                SELECT 1 FROM public.shops WHERE id = p_shop_id AND owner_id = p_recipient_id
            ) THEN
                RAISE EXCEPTION 'Not authorized to send notification for this shop';
            END IF;
        END IF;
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

REVOKE ALL ON FUNCTION public.vaangly_create_admin_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vaangly_create_admin_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

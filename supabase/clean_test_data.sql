-- ============================================================================
-- VAANGLY CONTROLLED TEST-DATA RESET SCRIPT
-- Purpose: Complete cleanup of test data while strictly preserving schema,
--          RLS, triggers, functions, system tables, and platform admin.
-- Target Admin Preserved: admin@vaangly.test (786b787f-d0c0-4f50-b027-162683211c6c)
-- ============================================================================

BEGIN;

-- Temporarily disable the immutable guard on admin_audit_logs solely for this one-time cleanup
ALTER TABLE public.admin_audit_logs DISABLE TRIGGER vaangly_admin_audit_immutable;

DO $$
DECLARE
    v_admin_id uuid;
BEGIN
    -- 1. Verify Platform Admin Exists
    SELECT id INTO v_admin_id
    FROM auth.users
    WHERE email = 'admin@vaangly.test';

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'FATAL: Platform admin account admin@vaangly.test not found in auth.users! Aborting reset.';
    END IF;

    -- 2. Purge Child Order / Rating / Payment Data
    DELETE FROM public.request_events;
    DELETE FROM public.request_item_options;
    DELETE FROM public.request_items;
    DELETE FROM public.shop_ratings;
    DELETE FROM public.product_ratings;
    DELETE FROM public.business_ratings;
    DELETE FROM public.payment_evidence;
    DELETE FROM public.payment_records;

    -- 3. Purge Requests (Orders)
    DELETE FROM public.requests;

    -- 4. Purge Appointments & Slots
    DELETE FROM public.appointment_slots;
    DELETE FROM public.appointments;

    -- 5. Purge Catalogue & Products
    DELETE FROM public.shop_products;
    DELETE FROM public.shop_services;
    DELETE FROM public.product_variant_values;
    DELETE FROM public.product_variants;
    DELETE FROM public.product_translations;
    DELETE FROM public.product_images;
    DELETE FROM public.product_attribute_options;
    DELETE FROM public.product_attribute_definitions;
    DELETE FROM public.products;
    DELETE FROM public.services;

    -- 6. Purge Subscriptions & Billing
    DELETE FROM public.subscription_payments;
    DELETE FROM public.shop_subscriptions;
    DELETE FROM public.business_subscriptions;

    -- 7. Purge Test Admin Audit Logs
    DELETE FROM public.admin_audit_logs;

    -- 8. Purge Business / Shop Metrics & Hours
    DELETE FROM public.business_daily_metrics;
    DELETE FROM public.business_payment_accounts;
    DELETE FROM public.business_hour_exceptions;
    DELETE FROM public.business_hours;
    DELETE FROM public.business_status;
    DELETE FROM public.business_members;
    DELETE FROM public.business_media;

    -- 9. Purge Shop Applications
    DELETE FROM public.business_application_media;
    DELETE FROM public.business_applications;
    DELETE FROM public.shop_applications;

    -- 10. Purge Shops & Businesses
    DELETE FROM public.shops;
    DELETE FROM public.businesses;

    -- 11. Purge Media Assets & Notifications
    DELETE FROM public.media_assets;
    DELETE FROM public.notifications;
    DELETE FROM public.notification_events;
    DELETE FROM public.push_subscriptions;

    -- 12. Purge Non-Admin User Roles
    DELETE FROM public.user_roles
    WHERE user_id != v_admin_id;

    -- 13. Purge Non-Admin Profiles
    DELETE FROM public.profiles
    WHERE id != v_admin_id;

    -- 14. Purge Non-Admin Auth Users (Cascade will clear auth.identities, sessions, etc.)
    DELETE FROM auth.users
    WHERE id != v_admin_id;

    -- 15. Verify Admin Account Integrity
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_admin_id AND role = 'admin' AND is_verified = true
    ) THEN
        PERFORM public.bootstrap_staging_admin();
    END IF;

    RAISE NOTICE 'Vaangly test data reset successfully completed. Admin % preserved.', v_admin_id;
END $$;

-- Re-enable the immutable guard on admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE TRIGGER vaangly_admin_audit_immutable;

COMMIT;

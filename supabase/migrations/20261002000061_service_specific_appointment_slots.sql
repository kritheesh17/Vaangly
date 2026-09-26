-- Migration: Allow service-specific appointment slots and eliminate single-service limitation per shop
ALTER TABLE public.appointment_slots DROP CONSTRAINT IF EXISTS unique_shop_slot;
ALTER TABLE public.appointment_slots DROP CONSTRAINT IF EXISTS unique_shop_service_slot;

-- Unique constraint per shop, service, date, and start_time
-- If service_id is NULL, coalesce to a fallback UUID so NULLs also conflict deterministically
CREATE UNIQUE INDEX IF NOT EXISTS ux_appointment_slots_shop_service_date_start
ON public.appointment_slots(
    shop_id,
    COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid),
    slot_date,
    start_time
);

CREATE INDEX IF NOT EXISTS idx_appointment_slots_lookup
ON public.appointment_slots(shop_id, service_id, slot_date);

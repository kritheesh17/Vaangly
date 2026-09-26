-- Migration: Add explicit unique constraint on (shop_id, service_id, slot_date, start_time) for upsert onConflict support
ALTER TABLE public.appointment_slots
ADD CONSTRAINT unique_shop_service_slot UNIQUE (shop_id, service_id, slot_date, start_time);

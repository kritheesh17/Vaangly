-- Rollback Script: 67 to 69
-- Purpose: Safely rolls back migrations 67, 68, and 69 if needed on staging/production.

BEGIN;

-- 1. Rollback Migration 69 (Variant inventory triggers and functions)
DROP TRIGGER IF EXISTS trg_validate_shop_product_variant_payload ON public.shop_products;
DROP FUNCTION IF EXISTS public.validate_shop_product_variant_payload();

-- Revert release_request_inventory to migration 30 definition
CREATE OR REPLACE FUNCTION public.release_request_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_product public.shop_products%ROWTYPE;
  v_quantity NUMERIC(12,3);
BEGIN
  IF OLD.current_state IS DISTINCT FROM NEW.current_state
     AND NEW.current_state IN ('CANCELLED', 'REJECTED')
     AND NOT OLD.inventory_released THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements((NEW.notes::jsonb)->'items') LOOP
      v_quantity := COALESCE(NULLIF(v_item->>'effective_quantity', '')::numeric, NULLIF(v_item->>'quantity', '')::numeric, 0);
      SELECT * INTO v_product FROM public.shop_products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
      IF FOUND AND v_product.track_inventory AND v_quantity > 0 THEN
        UPDATE public.shop_products
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_quantity
        WHERE id = v_product.id;
      END IF;
    END LOOP;
    NEW.inventory_released := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Rollback Migration 68 (Free delivery threshold)
ALTER TABLE public.shops DROP COLUMN IF EXISTS free_delivery_above;
ALTER TABLE public.shop_applications DROP COLUMN IF EXISTS free_delivery_above;
ALTER TABLE public.shop_applications DROP COLUMN IF EXISTS delivery_available;
ALTER TABLE public.shop_applications DROP COLUMN IF EXISTS delivery_fee;

-- 3. Rollback Migration 67 (Appointment slots defaults)
ALTER TABLE public.appointment_slots ALTER COLUMN concurrent_capacity DROP DEFAULT;
ALTER TABLE public.appointment_slots ALTER COLUMN capacity DROP DEFAULT;

COMMIT;

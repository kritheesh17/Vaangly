-- Allow shopkeepers to edit storefront details without exposing approval or ownership fields.

CREATE OR REPLACE FUNCTION public.guard_shopkeeper_shop_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.shop_type_id IS DISTINCT FROM OLD.shop_type_id
       OR NEW.location_id IS DISTINCT FROM OLD.location_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.is_live IS DISTINCT FROM OLD.is_live
       OR NEW.gps_lat IS DISTINCT FROM OLD.gps_lat
       OR NEW.gps_lng IS DISTINCT FROM OLD.gps_lng THEN
      RAISE EXCEPTION 'Shopkeeper cannot change shop ownership, approval, security, or verified location fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_shopkeeper_shop_details ON public.shops;
CREATE TRIGGER trg_guard_shopkeeper_shop_details
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.guard_shopkeeper_shop_details();

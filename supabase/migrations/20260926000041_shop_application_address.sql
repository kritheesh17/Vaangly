-- Carry the canonical physical address from onboarding applications into shops.

ALTER TABLE public.shop_applications
  ADD COLUMN IF NOT EXISTS address_line TEXT NULL;

CREATE OR REPLACE FUNCTION public.apply_shop_application_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NULLIF(trim(COALESCE(NEW.address_line, '')), '') IS NOT NULL THEN
    NEW.address_line := trim(NEW.address_line);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_shop_application_address ON public.shop_applications;
CREATE TRIGGER trg_apply_shop_application_address
  BEFORE INSERT OR UPDATE ON public.shop_applications
  FOR EACH ROW EXECUTE FUNCTION public.apply_shop_application_address();

CREATE OR REPLACE FUNCTION public.copy_shop_application_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_address TEXT;
BEGIN
  SELECT NULLIF(trim(address_line), '')
    INTO v_address
  FROM public.shop_applications
  WHERE applicant_id = NEW.owner_id
    AND status = 'approved'
    AND NULLIF(trim(address_line), '') IS NOT NULL
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_address IS NOT NULL THEN
    NEW.address_line := v_address;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_copy_shop_application_address ON public.shops;
CREATE TRIGGER trg_copy_shop_application_address
  BEFORE INSERT ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.copy_shop_application_address();

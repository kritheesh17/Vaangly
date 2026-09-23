-- Keep table-specific UPI validation in table-specific trigger functions.
-- NEW.payment_method is valid only for public.requests.

CREATE OR REPLACE FUNCTION public.require_shop_upi_qr()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'shop_applications'
     AND (TG_OP = 'INSERT' OR NEW.upi_id IS DISTINCT FROM OLD.upi_id OR NEW.upi_qr_url IS DISTINCT FROM OLD.upi_qr_url)
     AND NULLIF(trim(COALESCE(NEW.upi_id, '')), '') IS NOT NULL
     AND (
       NULLIF(trim(COALESCE(NEW.upi_qr_url, '')), '') IS NULL
       OR lower(NEW.upi_qr_url) LIKE '%your-project-id%'
       OR NEW.upi_qr_url !~* '^(https?://|data:image/)'
     ) THEN
    RAISE EXCEPTION 'UPI QR code is required to accept UPI payments';
  ELSIF TG_TABLE_NAME = 'shops'
     AND (TG_OP = 'INSERT' OR NEW.upi_id IS DISTINCT FROM OLD.upi_id OR NEW.upi_qr_url IS DISTINCT FROM OLD.upi_qr_url)
     AND NULLIF(trim(COALESCE(NEW.upi_id, '')), '') IS NOT NULL
     AND (
       NULLIF(trim(COALESCE(NEW.upi_qr_url, '')), '') IS NULL
       OR lower(NEW.upi_qr_url) LIKE '%your-project-id%'
       OR NEW.upi_qr_url !~* '^(https?://|data:image/)'
     ) THEN
    RAISE EXCEPTION 'UPI QR code is required to accept UPI payments';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_request_shop_upi_qr()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(COALESCE(NEW.payment_method, '')) = 'upi'
     AND NOT EXISTS (
       SELECT 1
       FROM public.shops
       WHERE id = NEW.shop_id
         AND NULLIF(trim(COALESCE(upi_id, '')), '') IS NOT NULL
         AND NULLIF(trim(COALESCE(upi_qr_url, '')), '') IS NOT NULL
         AND lower(upi_qr_url) NOT LIKE '%your-project-id%'
         AND upi_qr_url ~* '^(https?://|data:image/)'
     ) THEN
    RAISE EXCEPTION 'UPI payment is unavailable because this shop has not configured its UPI QR code';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_request_shop_upi_qr ON public.requests;
CREATE TRIGGER trg_require_request_shop_upi_qr
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.require_request_shop_upi_qr();

-- Use canonical order types for food orders while preserving legacy request values.

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_fulfillment_type_check,
  DROP CONSTRAINT IF EXISTS vaangly_requests_fulfillment_type_check;

UPDATE public.requests
SET fulfillment_type = CASE fulfillment_type
  WHEN 'dine_in' THEN 'DINE_IN'
  WHEN 'parcel' THEN 'TAKEAWAY'
  WHEN 'pickup' THEN 'TAKEAWAY'
  WHEN 'delivery' THEN 'TAKEAWAY'
  ELSE fulfillment_type
END
WHERE fulfillment_type IN ('dine_in', 'parcel', 'pickup', 'delivery');

ALTER TABLE public.requests
  ADD CONSTRAINT vaangly_requests_fulfillment_type_values_check
  CHECK (fulfillment_type IS NULL OR fulfillment_type IN ('DINE_IN', 'TAKEAWAY', 'dine_in', 'parcel', 'pickup', 'delivery'));

CREATE OR REPLACE FUNCTION public.validate_food_order_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_type_code TEXT;
BEGIN
  IF NEW.workflow_group_code = 'ORDER' THEN
    SELECT code INTO v_shop_type_code
    FROM public.shop_types st
    JOIN public.shops s ON s.shop_type_id = st.id
    WHERE s.id = NEW.shop_id;

    IF v_shop_type_code IN ('restaurant', 'hotel', 'bakery', 'cafe', 'café', 'food')
       AND NEW.fulfillment_type NOT IN ('DINE_IN', 'TAKEAWAY') THEN
      RAISE EXCEPTION 'Food orders require order type DINE_IN or TAKEAWAY';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_food_order_type ON public.requests;
CREATE TRIGGER trg_validate_food_order_type
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_food_order_type();

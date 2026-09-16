ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT
  CHECK (fulfillment_type IN ('parcel', 'dine_in'))
  DEFAULT NULL;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS offer_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS offer_type TEXT NULL
    CHECK (offer_type IN ('bogo', 'percent_off', 'flat_off')),
  ADD COLUMN IF NOT EXISTS offer_value NUMERIC NULL;
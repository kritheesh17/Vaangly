ALTER TABLE public.shop_applications
  ADD COLUMN IF NOT EXISTS upi_id TEXT NULL;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS slot_config JSONB NULL;
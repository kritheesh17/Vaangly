ALTER TABLE public.shop_applications
  ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS upi_qr_url TEXT NULL;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS upi_qr_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS customised_cake_available BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attribute_groups JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS customer_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_screenshot_url TEXT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users upload payment proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'payment-proofs' AND auth.role() = 'authenticated');

CREATE POLICY "Public read payment proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Customers can update own payment proof" ON public.requests;
CREATE POLICY "Customers can update own payment proof" ON public.requests
  FOR UPDATE USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

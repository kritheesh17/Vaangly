CREATE TABLE IF NOT EXISTS public.shop_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (request_id)
);
ALTER TABLE public.shop_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers insert own rating" ON public.shop_ratings;
CREATE POLICY "Customers insert own rating" ON public.shop_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.shop_ratings;
CREATE POLICY "Anyone can view ratings" ON public.shop_ratings FOR SELECT USING (true);
CREATE OR REPLACE VIEW public.shop_avg_ratings AS
  SELECT shop_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS total_ratings
  FROM public.shop_ratings GROUP BY shop_id;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push subscription" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscription" ON public.push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS cancellation_rate INTEGER DEFAULT 0;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE public.shop_applications ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

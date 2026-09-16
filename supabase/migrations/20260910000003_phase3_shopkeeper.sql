-- VAANGO PHASE 3: SHOPKEEPER MVP DATABASE SCHEMA & RLS EXTENSIONS

-- 1. EXTEND SHOPS TABLE WITH SHOPKEEPER OPERATIONAL FIELDS
ALTER TABLE public.shops 
    ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS delivery_available BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee >= 0),
    ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(10, 7);

-- Set Murugan Supermarket (Seed Shop) to is_live = TRUE so customer MVP continues functioning seamlessly
UPDATE public.shops
SET is_live = TRUE,
    delivery_available = TRUE,
    delivery_fee = 20.00,
    upi_id = 'muruganstore@upi',
    gps_lat = 11.4533,
    gps_lng = 77.4361
WHERE id = 'shop-gobi-grocery-1';

UPDATE public.shops
SET is_live = TRUE
WHERE id IN (
    'shop-gobi-bakery-1',
    'shop-gobi-restaurant-1',
    'shop-gobi-pharmacy-1',
    'shop-gobi-stationery-1'
);

-- 2. EXTEND SHOP APPLICATIONS TABLE WITH ONBOARDING FIELDS
ALTER TABLE public.shop_applications
    ADD COLUMN IF NOT EXISTS owner_name VARCHAR(140),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(10, 7);

-- 3. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_shops_is_live ON public.shops(is_live);
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_shop ON public.shop_products(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_applications_applicant ON public.shop_applications(applicant_id);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES UPDATE

-- (A) SHOPS POLICIES:
-- Drop older public read policy to enforce that customers ONLY see shops that are active AND live
DROP POLICY IF EXISTS "Public read active shops" ON public.shops;

CREATE POLICY "Public read live active shops" ON public.shops
    FOR SELECT USING (
        status = 'active' AND is_live = TRUE
    );

-- Shopkeepers can read their own shop regardless of live status
DROP POLICY IF EXISTS "Owners can read their shop" ON public.shops;
CREATE POLICY "Owners can read their shop" ON public.shops
    FOR SELECT USING (
        auth.uid() = owner_id
    );

-- Shopkeepers can update their own shop
DROP POLICY IF EXISTS "Owners can update their shop" ON public.shops;
CREATE POLICY "Owners can update their shop" ON public.shops
    FOR UPDATE USING (
        auth.uid() = owner_id
    ) WITH CHECK (
        auth.uid() = owner_id
    );

-- (B) SHOP PRODUCTS POLICIES:
-- Public can only see products belonging to live active shops
DROP POLICY IF EXISTS "Public read shop products" ON public.shop_products;
CREATE POLICY "Public read shop products" ON public.shop_products
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND status = 'active' 
              AND is_live = TRUE
        )
    );

-- Shopkeepers can view all their own products
CREATE POLICY "Owners can view own shop products" ON public.shop_products
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- Shopkeepers can insert products into their own shop
CREATE POLICY "Owners can insert shop products" ON public.shop_products
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- Shopkeepers can update their own products
CREATE POLICY "Owners can update shop products" ON public.shop_products
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- Shopkeepers can delete their own products
CREATE POLICY "Owners can delete shop products" ON public.shop_products
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- (C) REQUESTS POLICIES:
-- Shopkeepers can update status of requests belonging to their shop
CREATE POLICY "Shop owners can update shop requests" ON public.requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = requests.shop_id 
              AND owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = requests.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- (D) REQUEST EVENTS POLICIES:
-- Shop owners can insert request events when transitioning state
CREATE POLICY "Shop owners can insert request events" ON public.request_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.requests r
            JOIN public.shops s ON s.id = r.shop_id
            WHERE r.id = request_events.request_id 
              AND s.owner_id = auth.uid()
        )
    );

-- (E) SHOP APPLICATIONS POLICIES:
CREATE POLICY "Applicants can read own applications" ON public.shop_applications
    FOR SELECT USING (
        auth.uid() = applicant_id
    );

CREATE POLICY "Applicants can submit applications" ON public.shop_applications
    FOR INSERT WITH CHECK (
        auth.uid() = applicant_id
    );

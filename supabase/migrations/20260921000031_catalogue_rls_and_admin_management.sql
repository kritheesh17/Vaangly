-- ============================================================================
-- VAANGLY CATALOGUE & SERVICES RLS MANAGEMENT
-- Migration: 20260921000031_catalogue_rls_and_admin_management.sql
--
-- Grants both storefront owners (auth.uid() = owner_id) AND platform admins
-- (public.is_admin()) full permission to create, update, and manage products,
-- services, and appointment slots.
-- ============================================================================

-- 1. SHOP PRODUCTS: Owners and Admins manage products
DROP POLICY IF EXISTS "Owners can view own shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Owners can insert shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Owners can update shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Owners can delete shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Admins manage all shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins view shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins insert shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins update shop products" ON public.shop_products;
DROP POLICY IF EXISTS "Shop owners and admins delete shop products" ON public.shop_products;

CREATE POLICY "Shop owners and admins view shop products" ON public.shop_products
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Shop owners and admins insert shop products" ON public.shop_products
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Shop owners and admins update shop products" ON public.shop_products
    FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Shop owners and admins delete shop products" ON public.shop_products
    FOR DELETE TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_products.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- 2. SHOP SERVICES: Owners and Admins manage services
DROP POLICY IF EXISTS "Owners manage shop services" ON public.shop_services;
DROP POLICY IF EXISTS "Shop owners and admins manage shop services" ON public.shop_services;

CREATE POLICY "Shop owners and admins manage shop services" ON public.shop_services
    FOR ALL TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_services.shop_id 
              AND owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_services.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- 3. APPOINTMENT SLOTS: Owners and Admins manage slots
DROP POLICY IF EXISTS "Shop owners manage slots" ON public.appointment_slots;
DROP POLICY IF EXISTS "Shop owners and admins manage slots" ON public.appointment_slots;

CREATE POLICY "Shop owners and admins manage slots" ON public.appointment_slots
    FOR ALL TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = appointment_slots.shop_id 
              AND owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = appointment_slots.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- 4. STORAGE: Admins and Owners can upload product photos
DROP POLICY IF EXISTS "vaangly_shop_photos_admin_insert" ON storage.objects;
CREATE POLICY "vaangly_shop_photos_admin_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'shop-photos'
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1
              FROM public.shops
              WHERE shops.id::text = (storage.foldername(name))[1]
                AND shops.owner_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1
              FROM public.shops
              WHERE shops.id::text = (storage.foldername(name))[2]
                AND shops.owner_id = auth.uid()
            )
        )
    );

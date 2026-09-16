-- VAANGO STORAGE ARCHITECTURE SETUP
-- Buckets and Row Level Security for Supabase Storage

-- 1. Create Storage Buckets
-- shop-photos: Public bucket for storefront & product imagery
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-photos', 'shop-photos', true)
ON CONFLICT (id) DO NOTHING;

-- shop-documents: Private bucket for shopkeeper ID proofs & licenses (Restricted)
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-documents', 'shop-documents', false)
ON CONFLICT (id) DO NOTHING;

-- prescriptions: Private bucket for medical prescriptions (Strictly customer + shopkeeper access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies for 'shop-photos'
CREATE POLICY "Public Read Shop Photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'shop-photos');

CREATE POLICY "Shopkeepers Upload Shop Photos" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'shop-photos' 
        AND auth.role() = 'authenticated'
    );

-- 3. Storage Policies for 'shop-documents' (Private KYC)
CREATE POLICY "Applicants View Own Documents" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'shop-documents' 
        AND auth.uid() = owner
    );

CREATE POLICY "Applicants Upload Own Documents" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'shop-documents' 
        AND auth.uid() = owner
    );

-- 4. Storage Policies for 'prescriptions' (Private Health Data)
CREATE POLICY "Customers View Own Prescriptions" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'prescriptions' 
        AND auth.uid() = owner
    );

CREATE POLICY "Customers Upload Prescriptions" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'prescriptions' 
        AND auth.uid() = owner
    );

-- Migration: 20260919000027_storage_buckets_and_application_rls.sql
-- Description: Create private shop-documents bucket, ensure storage RLS, and verify shop_applications RLS

-- 1. Create private shop-documents storage bucket for KYC / ID proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-documents',
  'shop-documents',
  FALSE,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. Ensure public shop-photos storage bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-photos',
  'shop-photos',
  TRUE,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760;

-- 3. Storage Policies for shop-documents (private KYC ID proofs)
DROP POLICY IF EXISTS "Merchants can upload own KYC documents" ON storage.objects;
CREATE POLICY "Merchants can upload own KYC documents"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shop-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Merchants can view own KYC documents" ON storage.objects;
CREATE POLICY "Merchants can view own KYC documents"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'shop-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );

DROP POLICY IF EXISTS "Admins View Shop Documents" ON storage.objects;
CREATE POLICY "Admins View Shop Documents"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'shop-documents'
    AND is_admin()
  );

-- 4. Storage Policies for shop-photos (storefront photos & UPI QR)
DROP POLICY IF EXISTS "vaangly_shop_photos_owner_insert" ON storage.objects;
CREATE POLICY "vaangly_shop_photos_owner_insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "vaangly_shop_photos_public_read" ON storage.objects;
CREATE POLICY "vaangly_shop_photos_public_read"
  ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'shop-photos'
  );

-- 5. Explicitly verify RLS on public.shop_applications
ALTER TABLE public.shop_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants can submit applications" ON public.shop_applications;
CREATE POLICY "Applicants can submit applications"
  ON public.shop_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = applicant_id
  );

DROP POLICY IF EXISTS "Applicants can read own applications" ON public.shop_applications;
CREATE POLICY "Applicants can read own applications"
  ON public.shop_applications
  FOR SELECT TO authenticated
  USING (
    auth.uid() = applicant_id
    OR is_admin()
  );

DROP POLICY IF EXISTS "Admins can view all applications" ON public.shop_applications;
CREATE POLICY "Admins can view all applications"
  ON public.shop_applications
  FOR SELECT TO authenticated
  USING (
    is_admin()
  );

DROP POLICY IF EXISTS "Admins can update applications" ON public.shop_applications;
CREATE POLICY "Admins can update applications"
  ON public.shop_applications
  FOR UPDATE TO authenticated
  USING (
    is_admin()
  )
  WITH CHECK (
    is_admin()
  );

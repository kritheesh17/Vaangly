-- ============================================================================
-- VAANGLY STORAGE SHOP PHOTOS RLS HARDENING & CAPACITY EXPANSION
-- Migration: 20260921000033_storage_photos_rls_hardening.sql
--
-- 1. Increases bucket limit to 20MB for shop-photos and shop-documents
-- 2. Creates helper function public.can_upload_shop_photo(p_name text) (SECURITY DEFINER)
-- 3. Hardens storage.objects INSERT & UPDATE policies for storefront & product photos
-- ============================================================================

-- 1. INCREASE BUCKET LIMITS TO 20MB
UPDATE storage.buckets
SET file_size_limit = 20971520, -- 20MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'shop-photos';

UPDATE storage.buckets
SET file_size_limit = 20971520 -- 20MB
WHERE id = 'shop-documents';

-- 2. SECURITY DEFINER HELPER TO CHECK UPLOAD PERMISSION ON shop-photos
CREATE OR REPLACE FUNCTION public.can_upload_shop_photo(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
    v_folders text[];
    v_first text;
    v_second text;
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Platform admins have universal upload permission
    IF public.is_admin() THEN
        RETURN true;
    END IF;

    v_folders := storage.foldername(p_name);
    v_first := v_folders[1];
    v_second := v_folders[2];

    -- Case A: First folder is applicant/owner auth UID (e.g. "<uid>/photos/...")
    IF v_first = v_user_id::text THEN
        RETURN true;
    END IF;

    -- Case B: First folder is shop ID (e.g. "<shop_id>/products/...")
    IF v_first IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.shops s 
        WHERE s.id::text = v_first AND s.owner_id = v_user_id
    ) THEN
        RETURN true;
    END IF;

    -- Case C: First folder is "shop-photos" and second folder is shop ID or UID
    -- (e.g. "shop-photos/<shop_id>/products/..." or "shop-photos/<uid>/...")
    IF v_second IS NOT NULL AND (
        v_second = v_user_id::text
        OR EXISTS (
            SELECT 1 FROM public.shops s 
            WHERE s.id::text = v_second AND s.owner_id = v_user_id
        )
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_upload_shop_photo(text) TO authenticated;

-- 3. RECREATE STORAGE POLICIES ON shop-photos
DROP POLICY IF EXISTS "vaangly_shop_photos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "vaangly_shop_photos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "vaangly_shop_photos_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "vaangly_shop_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "vaangly_shop_photos_update" ON storage.objects;

CREATE POLICY "vaangly_shop_photos_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'shop-photos'
        AND public.can_upload_shop_photo(name)
    );

CREATE POLICY "vaangly_shop_photos_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'shop-photos'
        AND public.can_upload_shop_photo(name)
    )
    WITH CHECK (
        bucket_id = 'shop-photos'
        AND public.can_upload_shop_photo(name)
    );

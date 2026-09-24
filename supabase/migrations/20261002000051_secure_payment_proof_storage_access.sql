-- ============================================================================
-- VAANGLY SECURE PAYMENT PROOF STORAGE ACCESS
-- Migration: 20261002000051_secure_payment_proof_storage_access.sql
--
-- Ensures authorized shopkeepers, customers, and admins can reliably generate
-- signed URLs and view private payment-proof objects while keeping the bucket
-- strictly private and blocking unauthorized access.
-- ============================================================================

-- Ensure payment-proofs bucket is strictly private
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 1. Helper function to check if the caller can access the payment proof
CREATE OR REPLACE FUNCTION public.can_read_payment_proof(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Platform admins have universal read access
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  -- Check if this storage object path is associated with a request owned by the shopkeeper or created by the customer
  RETURN EXISTS (
    SELECT 1
    FROM public.requests r
    JOIN public.shops s ON s.id = r.shop_id
    WHERE (
      r.payment_screenshot_url = p_name
      OR r.payment_screenshot_url = 'payment-proofs/' || p_name
      OR p_name = replace(r.payment_screenshot_url, 'payment-proofs/', '')
      OR r.payment_screenshot_url = '/' || p_name
      OR p_name = ltrim(r.payment_screenshot_url, '/')
      OR r.payment_screenshot_url LIKE '%' || p_name
    )
    AND (
      r.customer_id = v_user_id
      OR s.owner_id = v_user_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_read_payment_proof(text) TO authenticated, anon, service_role;

-- 2. Update storage policy on payment-proofs
DROP POLICY IF EXISTS "Request parties read payment proofs" ON storage.objects;

CREATE POLICY "Request parties read payment proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      -- Uploader can read their own pending upload
      (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      -- Or authorized request parties (customer, shop owner, admin) can read
      OR public.can_read_payment_proof(name)
    )
  );

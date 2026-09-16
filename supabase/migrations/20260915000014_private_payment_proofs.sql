-- Keep customer payment evidence private and expose it only through request-scoped policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Customers upload payment proofs" ON storage.objects;
CREATE POLICY "Customers upload payment proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'requests'
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Request parties read payment proofs" ON storage.objects;
CREATE POLICY "Request parties read payment proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'requests'
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      LEFT JOIN public.shops s ON s.id = r.shop_id
      WHERE r.id::text = (storage.foldername(name))[2]
        AND (r.customer_id = auth.uid() OR s.owner_id = auth.uid())
    )
  );
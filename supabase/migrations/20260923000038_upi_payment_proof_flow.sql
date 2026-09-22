-- Secure direct-UPI payment proof lifecycle.
-- Proof upload is user-scoped before request creation; the request stores the
-- exact path, so the relationship remains explicit without a public bucket.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'requests_payment_method_check'
      AND conrelid = 'public.requests'::regclass
  ) THEN
    ALTER TABLE public.requests
      ADD CONSTRAINT requests_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('cash', 'upi'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'requests_payment_status_check'
      AND conrelid = 'public.requests'::regclass
  ) THEN
    ALTER TABLE public.requests
      ADD CONSTRAINT requests_payment_status_check
      CHECK (payment_status IN ('NOT_REQUIRED', 'PAYMENT_PENDING', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_payment_status
  ON public.requests(shop_id, payment_method, payment_status, created_at DESC);

DO $$
DECLARE
  v_request RECORD;
  v_payload JSONB;
  v_method TEXT;
BEGIN
  FOR v_request IN SELECT id, notes, payment_screenshot_url FROM public.requests WHERE payment_method IS NULL LOOP
    BEGIN
      v_payload := COALESCE(v_request.notes::jsonb, '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      v_payload := '{}'::jsonb;
    END;
    v_method := lower(COALESCE(NULLIF(v_payload->>'payment_method', ''), 'cash'));
    IF v_method NOT IN ('cash', 'upi') THEN v_method := 'cash'; END IF;
    UPDATE public.requests
    SET payment_method = v_method,
        payment_status = CASE
          WHEN v_method = 'upi' THEN CASE WHEN NULLIF(trim(COALESCE(v_request.payment_screenshot_url, '')), '') IS NULL THEN 'PAYMENT_PENDING' ELSE 'PAYMENT_PROOF_SUBMITTED' END
          ELSE 'NOT_REQUIRED'
        END
    WHERE id = v_request.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.validate_request_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_payload JSONB;
  v_method TEXT;
  v_is_shopkeeper BOOLEAN;
BEGIN
  BEGIN
    v_payload := COALESCE(NEW.notes::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_payload := '{}'::jsonb;
  END;

  v_method := lower(COALESCE(NULLIF(NEW.payment_method, ''), v_payload->>'payment_method', 'cash'));
  IF v_method NOT IN ('cash', 'upi') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  NEW.payment_method := v_method;

  IF TG_OP = 'INSERT' THEN
    IF v_method = 'upi' THEN
      IF NULLIF(trim(COALESCE(NEW.payment_screenshot_url, '')), '') IS NULL THEN
        RAISE EXCEPTION 'UPI payment proof is required before submitting the request';
      END IF;
      NEW.payment_status := 'PAYMENT_PROOF_SUBMITTED';
      NEW.customer_paid := FALSE;
      IF NEW.payment_amount IS NULL OR NEW.payment_amount IS DISTINCT FROM NEW.total_estimate THEN
        RAISE EXCEPTION 'Payment amount changed. Please review your cart and QR amount';
      END IF;
    ELSE
      NEW.payment_amount := NULL;
      NEW.payment_screenshot_url := NULL;
      NEW.payment_status := 'NOT_REQUIRED';
      NEW.payment_verified_at := NULL;
      NEW.payment_verified_by := NULL;
      NEW.payment_rejection_reason := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_is_shopkeeper := public.is_admin() OR EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id = OLD.shop_id AND s.owner_id = auth.uid()
  );

  IF NOT v_is_shopkeeper AND NOT public.is_admin() THEN
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.customer_paid IS DISTINCT FROM OLD.customer_paid
       OR NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at
       OR NEW.payment_verified_by IS DISTINCT FROM OLD.payment_verified_by
       OR NEW.payment_rejection_reason IS DISTINCT FROM OLD.payment_rejection_reason THEN
      RAISE EXCEPTION 'Customers cannot change payment verification state';
    END IF;

    IF NEW.payment_screenshot_url IS DISTINCT FROM OLD.payment_screenshot_url THEN
      IF NEW.payment_method <> 'upi' OR NULLIF(trim(COALESCE(NEW.payment_screenshot_url, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A payment proof is only valid for a UPI request';
      END IF;
      IF NOT (
        NEW.payment_screenshot_url LIKE 'pending/' || auth.uid()::text || '/%'
        OR NEW.payment_screenshot_url LIKE 'requests/' || NEW.id::text || '/%'
      ) THEN
        RAISE EXCEPTION 'Payment proof path is not owned by this customer/request';
      END IF;
      NEW.payment_status := 'PAYMENT_PROOF_SUBMITTED';
      NEW.customer_paid := FALSE;
    END IF;
  ELSE
    IF NEW.payment_status = 'PAYMENT_VERIFIED' THEN
      NEW.payment_verified_at := COALESCE(NEW.payment_verified_at, now());
      NEW.payment_verified_by := COALESCE(NEW.payment_verified_by, auth.uid());
      NEW.payment_rejection_reason := NULL;
      NEW.customer_paid := TRUE;
    ELSIF NEW.payment_status = 'PAYMENT_REJECTED' THEN
      NEW.payment_verified_at := NULL;
      NEW.payment_verified_by := NULL;
      NEW.customer_paid := FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_request_payment_fields ON public.requests;
CREATE TRIGGER trg_validate_request_payment_fields
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_request_payment_fields();

-- Ensure the bucket is private even if an earlier migration created it public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Customers upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Request parties read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Customers manage pending payment proofs" ON storage.objects;

CREATE POLICY "Customers upload payment proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (
      (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR (
        (storage.foldername(name))[1] = 'requests'
        AND EXISTS (
          SELECT 1 FROM public.requests r
          WHERE r.id::text = (storage.foldername(name))[2]
            AND r.customer_id = auth.uid()
            AND r.payment_method = 'upi'
        )
      )
    )
    AND lower(COALESCE(metadata->>'mimetype', '')) IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  );

CREATE POLICY "Customers manage pending payment proofs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Request parties read payment proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1
        FROM public.requests r
        LEFT JOIN public.shops s ON s.id = r.shop_id
        WHERE r.payment_screenshot_url = name
          AND (r.customer_id = auth.uid() OR s.owner_id = auth.uid() OR public.is_admin())
      )
    )
  );

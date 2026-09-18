-- Staging functional fixes: provision legacy application media and defer subscription billing.

BEGIN;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('shop-photos', 'shop-photos', TRUE)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polname = 'vaangly_shop_photos_public_read'
        AND polrelid = 'storage.objects'::regclass
    ) THEN
      CREATE POLICY vaangly_shop_photos_public_read
        ON storage.objects FOR SELECT
        USING (bucket_id = 'shop-photos');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polname = 'vaangly_shop_photos_owner_insert'
        AND polrelid = 'storage.objects'::regclass
    ) THEN
      CREATE POLICY vaangly_shop_photos_owner_insert
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'shop-photos'
          AND auth.role() = 'authenticated'
          AND (
            (storage.foldername(name))[1] = auth.uid()::text
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
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polname = 'vaangly_shop_photos_owner_update'
        AND polrelid = 'storage.objects'::regclass
    ) THEN
      CREATE POLICY vaangly_shop_photos_owner_update
        ON storage.objects FOR UPDATE
        USING (
          bucket_id = 'shop-photos'
          AND (
            (storage.foldername(name))[1] = auth.uid()::text
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
        )
        WITH CHECK (
          bucket_id = 'shop-photos'
          AND (
            (storage.foldername(name))[1] = auth.uid()::text
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
    END IF;
  END IF;
END $$;

UPDATE public.shop_subscriptions
SET
  status = 'TRIAL',
  amount_due = 0,
  go_live_date = NULL,
  trial_start_date = NOW(),
  trial_end_date = NOW() + INTERVAL '60 days',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '60 days',
  updated_at = NOW()
WHERE status = 'OVERDUE' OR amount_due > 0;

COMMIT;

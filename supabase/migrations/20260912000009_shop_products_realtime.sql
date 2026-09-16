-- Enable Supabase Realtime for customer catalogue updates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shop_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_products;
  END IF;
END;
$$;

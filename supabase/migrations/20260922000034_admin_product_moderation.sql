-- ============================================================================
-- VAANGLY ADMIN PRODUCT MODERATION
-- Migration: 20260922000034_admin_product_moderation.sql
--
-- 1. Adds moderation columns to public.shop_products:
--    - is_banned (boolean)
--    - moderation_reason (text)
--    - moderated_at (timestamptz)
--    - moderated_by (uuid)
-- 2. Creates trigger to prevent non-admins from altering moderation fields
--    or making banned products available.
-- 3. Updates public read RLS policy on public.shop_products to ensure
--    banned products are never visible to public customers.
-- ============================================================================

-- 1. ADD MODERATION COLUMNS TO shop_products
ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.profiles(id) NULL;

-- Index for fast customer discovery and admin moderation filtering
CREATE INDEX IF NOT EXISTS idx_shop_products_moderation
  ON public.shop_products(shop_id, is_banned, is_available);

-- 2. SERVER-SIDE TRIGGER TO ENFORCE MODERATION RULES
CREATE OR REPLACE FUNCTION public.vaangly_enforce_product_moderation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Check if moderation fields are being altered by a non-admin
  IF (OLD.is_banned IS DISTINCT FROM NEW.is_banned
      OR OLD.moderation_reason IS DISTINCT FROM NEW.moderation_reason
      OR OLD.moderated_at IS DISTINCT FROM NEW.moderated_at
      OR OLD.moderated_by IS DISTINCT FROM NEW.moderated_by)
  THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only platform administrators can modify product moderation status.';
    END IF;
  END IF;

  -- Prevent non-admins from toggling is_available to TRUE on a banned product
  IF OLD.is_banned = TRUE AND NEW.is_available = TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cannot mark a banned or prohibited product as available.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vaangly_enforce_product_moderation ON public.shop_products;
CREATE TRIGGER trg_vaangly_enforce_product_moderation
  BEFORE UPDATE ON public.shop_products
  FOR EACH ROW
  EXECUTE FUNCTION public.vaangly_enforce_product_moderation_rules();

-- 3. HARDEN PUBLIC READ RLS POLICY ON shop_products
DROP POLICY IF EXISTS "Public read shop products" ON public.shop_products;

CREATE POLICY "Public read shop products" ON public.shop_products
  FOR SELECT
  USING (
    is_banned = FALSE
    AND is_available = TRUE
    AND EXISTS (
      SELECT 1 FROM public.shops
      WHERE id = shop_products.shop_id
        AND status = 'active'
        AND is_live = TRUE
    )
  );

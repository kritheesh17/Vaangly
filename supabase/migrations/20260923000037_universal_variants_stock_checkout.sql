-- Universal product variants, variant-level inventory, and atomic order validation.
-- The active storefront uses shop_products.variants JSON, so this migration
-- hardens that existing contract instead of switching the application to a
-- second, unused catalogue model.

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(12,3);

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS inventory_released BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_products_stock_quantity_check'
      AND conrelid = 'public.shop_products'::regclass
  ) THEN
    ALTER TABLE public.shop_products
      ADD CONSTRAINT shop_products_stock_quantity_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.shop_product_has_available_variant(p_variants JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_variants) = 'array' THEN p_variants ELSE '[]'::jsonb END) AS item
    WHERE COALESCE(item->>'is_available', 'true') <> 'false'
      AND COALESCE(item->>'in_stock', 'true') <> 'false'
      AND (
        NOT (item ? 'stock_quantity')
        OR ((item->>'stock_quantity') ~ '^([0-9]+(\.[0-9]+)?|\.[0-9]+)$' AND (item->>'stock_quantity')::numeric > 0)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.shop_product_is_purchasable(
  p_product public.shop_products,
  p_variant_id TEXT,
  p_quantity NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_variant JSONB;
BEGIN
  IF p_product.is_banned OR NOT p_product.is_available OR p_quantity <= 0 THEN
    RETURN FALSE;
  END IF;

  IF p_variant_id IS NULL OR p_variant_id = '' THEN
    RETURN NOT p_product.has_variants
      AND (NOT p_product.track_inventory OR COALESCE(p_product.stock_quantity, 0) >= p_quantity);
  END IF;

  SELECT item INTO v_variant
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_product.variants) = 'array' THEN p_product.variants ELSE '[]'::jsonb END) AS item
  WHERE item->>'id' = p_variant_id;

  RETURN v_variant IS NOT NULL
    AND COALESCE(v_variant->>'is_available', 'true') <> 'false'
    AND COALESCE(v_variant->>'in_stock', 'true') <> 'false'
    AND (NOT (v_variant ? 'stock_quantity') OR ((v_variant->>'stock_quantity') ~ '^([0-9]+(\.[0-9]+)?|\.[0-9]+)$' AND (v_variant->>'stock_quantity')::numeric >= p_quantity));
END;
$$;

-- Public catalogue reads now hide products whose concrete variants are all unavailable.
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
    AND (
      has_variants = FALSE
      OR public.shop_product_has_available_variant(variants)
    )
  );

-- Replaces the earlier price-only request trigger. Each item is checked while
-- its product row is locked, then inventory is decremented in the same transaction.
CREATE OR REPLACE FUNCTION public.validate_request_creation_and_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload JSONB;
  v_item JSONB;
  v_items JSONB := '[]'::jsonb;
  v_product public.shop_products%ROWTYPE;
  v_variant JSONB;
  v_variant_id TEXT;
  v_price NUMERIC(12,2);
  v_quantity NUMERIC(12,3);
  v_effective_quantity NUMERIC(12,3);
  v_total NUMERIC(12,2) := 0;
  v_index INTEGER := 0;
BEGIN
  IF NOT public.is_admin() AND auth.uid() IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'A request must belong to the authenticated customer';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = NEW.shop_id AND s.status = 'active' AND s.is_live
    ) THEN
      RAISE EXCEPTION 'Requests can only be created for active live shops';
    END IF;

    NEW.request_kind := COALESCE(NEW.request_kind, NEW.workflow_group_code);

    IF NEW.workflow_group_code = 'ORDER' THEN
      BEGIN
        v_payload := NEW.notes::jsonb;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Order payload must be valid JSON';
      END;

      IF jsonb_typeof(v_payload->'items') <> 'array' OR jsonb_array_length(v_payload->'items') = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item';
      END IF;

      FOR v_item IN SELECT value FROM jsonb_array_elements(v_payload->'items') LOOP
        IF NULLIF(v_item->>'product_id', '') IS NULL THEN
          RAISE EXCEPTION 'Order item is missing product_id';
        END IF;

        BEGIN
          SELECT * INTO v_product
          FROM public.shop_products
          WHERE id = (v_item->>'product_id')::uuid
            AND shop_id = NEW.shop_id
          FOR UPDATE;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'Order item has an invalid product_id';
        END;

        IF NOT FOUND OR v_product.is_banned OR NOT v_product.is_available THEN
          RAISE EXCEPTION 'Selected product is unavailable or does not belong to this shop';
        END IF;

        v_variant_id := NULLIF(v_item->>'variant_id', '');
        v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0);
        v_effective_quantity := COALESCE(NULLIF(v_item->>'effective_quantity', '')::numeric, v_quantity);
        IF v_quantity <= 0 OR v_effective_quantity <= 0 OR v_quantity <> trunc(v_quantity) THEN
          RAISE EXCEPTION 'Order item quantity must be a positive integer';
        END IF;

        IF v_variant_id IS NOT NULL THEN
          IF NOT v_product.has_variants THEN
            RAISE EXCEPTION 'A variant was supplied for a product without variants';
          END IF;

          SELECT item INTO v_variant
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_product.variants) = 'array' THEN v_product.variants ELSE '[]'::jsonb END) AS item
          WHERE item->>'id' = v_variant_id;

          IF v_variant IS NULL THEN
            RAISE EXCEPTION 'Selected variant no longer exists';
          END IF;
          IF NOT COALESCE((v_variant->>'is_available')::boolean, (v_variant->>'in_stock')::boolean, TRUE)
             OR ((v_variant ? 'stock_quantity') AND COALESCE(NULLIF(v_variant->>'stock_quantity', '')::numeric, 0) < v_effective_quantity) THEN
            RAISE EXCEPTION 'Selected variant is out of stock or unavailable';
          END IF;

          v_price := NULLIF(v_variant->>'price', '')::numeric;
          IF v_price IS NULL OR v_price < 0 THEN
            RAISE EXCEPTION 'Selected variant has an invalid price';
          END IF;

          IF v_variant ? 'stock_quantity' THEN
            v_product.variants := (
              SELECT jsonb_agg(
                CASE WHEN item->>'id' = v_variant_id
                  THEN jsonb_set(item, '{stock_quantity}', to_jsonb(COALESCE(NULLIF(item->>'stock_quantity', '')::numeric, 0) - v_effective_quantity))
                  ELSE item
                END
              )
              FROM jsonb_array_elements(v_product.variants) AS item
            );
            UPDATE public.shop_products SET variants = v_product.variants WHERE id = v_product.id;
          END IF;
        ELSE
          IF v_product.has_variants THEN
            RAISE EXCEPTION 'A concrete variant must be selected';
          END IF;
          IF v_product.track_inventory AND COALESCE(v_product.stock_quantity, 0) < v_effective_quantity THEN
            RAISE EXCEPTION 'Selected product is out of stock';
          END IF;
          v_price := v_product.price;
          IF v_product.track_inventory THEN
            UPDATE public.shop_products
            SET stock_quantity = stock_quantity - v_effective_quantity
            WHERE id = v_product.id AND stock_quantity >= v_effective_quantity;
            IF NOT FOUND THEN
              RAISE EXCEPTION 'Selected product is out of stock';
            END IF;
          END IF;
        END IF;

        v_item := v_item || jsonb_build_object(
          'name', v_product.name,
          'price', v_price,
          'unit', COALESCE(v_item->>'unit', v_product.unit),
          'variant_price', CASE WHEN v_variant_id IS NULL THEN NULL ELSE v_price END,
          'variant_label', CASE WHEN v_variant_id IS NULL THEN NULL ELSE COALESCE(v_variant->>'label', v_variant_id) END,
          'variant_attributes', CASE WHEN v_variant_id IS NULL THEN '{}'::jsonb ELSE COALESCE(v_variant->'attributes', '{}'::jsonb) END,
          'subtotal', v_price * v_quantity
        );
        v_items := v_items || jsonb_build_array(v_item);
        v_total := v_total + (v_price * v_quantity);
        v_index := v_index + 1;
      END LOOP;

      NEW.notes := jsonb_set(v_payload, '{items}', v_items)::text;
      NEW.subtotal := v_total;
      NEW.total_estimate := v_total;
      NEW.total_amount := v_total;
    END IF;
  ELSE
    IF NOT public.is_admin() THEN
      IF OLD.customer_id IS DISTINCT FROM NEW.customer_id
         OR OLD.shop_id IS DISTINCT FROM NEW.shop_id
         OR OLD.workflow_group_code IS DISTINCT FROM NEW.workflow_group_code
         OR OLD.request_kind IS DISTINCT FROM NEW.request_kind
         OR OLD.reference_code IS DISTINCT FROM NEW.reference_code
         OR OLD.total_estimate IS DISTINCT FROM NEW.total_estimate
         OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
         OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
         OR OLD.discount_total IS DISTINCT FROM NEW.discount_total
         OR OLD.delivery_fee IS DISTINCT FROM NEW.delivery_fee THEN
        RAISE EXCEPTION 'Request identity and financial fields are database-controlled';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Existing legacy variants remain readable; new writes must provide stable ids,
-- non-negative prices, and non-negative stock in the JSON contract.
CREATE OR REPLACE FUNCTION public.validate_shop_product_variant_payload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
  v_id TEXT;
BEGIN
  IF NEW.has_variants THEN
    IF jsonb_typeof(NEW.variants) <> 'array' OR jsonb_array_length(NEW.variants) = 0 THEN
      RAISE EXCEPTION 'A product marked with variants must define at least one variant';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.variants) LOOP
      v_id := NULLIF(v_item->>'id', '');
      IF v_id IS NULL OR NULLIF(v_item->>'price', '')::numeric < 0 THEN
        RAISE EXCEPTION 'Each variant requires a stable id and non-negative price';
      END IF;
      IF v_item ? 'stock_quantity' AND NULLIF(v_item->>'stock_quantity', '')::numeric < 0 THEN
        RAISE EXCEPTION 'Variant stock cannot be negative';
      END IF;
    END LOOP;
  ELSIF NEW.track_inventory AND (NEW.stock_quantity IS NULL OR NEW.stock_quantity < 0) THEN
    RAISE EXCEPTION 'Tracked simple products require non-negative stock';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_shop_product_variant_payload ON public.shop_products;
CREATE TRIGGER trg_validate_shop_product_variant_payload
  BEFORE INSERT OR UPDATE ON public.shop_products
  FOR EACH ROW EXECUTE FUNCTION public.validate_shop_product_variant_payload();

CREATE OR REPLACE FUNCTION public.release_request_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_product public.shop_products%ROWTYPE;
  v_variant_id TEXT;
  v_quantity NUMERIC(12,3);
BEGIN
  IF OLD.current_state IS DISTINCT FROM NEW.current_state
     AND NEW.current_state IN ('CANCELLED', 'REJECTED')
     AND NOT OLD.inventory_released THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements((NEW.notes::jsonb)->'items') LOOP
      v_quantity := COALESCE(NULLIF(v_item->>'effective_quantity', '')::numeric, NULLIF(v_item->>'quantity', '')::numeric, 0);
      v_variant_id := NULLIF(v_item->>'variant_id', '');

      SELECT * INTO v_product
      FROM public.shop_products
      WHERE id = (v_item->>'product_id')::uuid
      FOR UPDATE;

      IF FOUND AND v_quantity > 0 THEN
        IF v_variant_id IS NULL AND v_product.track_inventory THEN
          UPDATE public.shop_products
          SET stock_quantity = COALESCE(stock_quantity, 0) + v_quantity
          WHERE id = v_product.id;
        ELSIF v_variant_id IS NOT NULL THEN
          UPDATE public.shop_products
          SET variants = (
            SELECT jsonb_agg(
              CASE WHEN item->>'id' = v_variant_id
                THEN jsonb_set(item, '{stock_quantity}', to_jsonb(COALESCE(NULLIF(item->>'stock_quantity', '')::numeric, 0) + v_quantity))
                ELSE item
              END
            )
            FROM jsonb_array_elements(v_product.variants) AS item
          )
          WHERE id = v_product.id;
        END IF;
      END IF;
    END LOOP;
    NEW.inventory_released := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_request_inventory ON public.requests;
CREATE TRIGGER trg_release_request_inventory
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.release_request_inventory();

REVOKE ALL ON FUNCTION public.shop_product_is_purchasable(public.shop_products, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_product_is_purchasable(public.shop_products, TEXT, NUMERIC) TO authenticated, service_role;

-- Migration: 20260930000048_fix_request_update_guard.sql
-- Description:
-- 1. Updates validate_request_creation_and_mutation() so that customer authorization is only enforced on INSERT.
-- 2. Corrects the order item jsonb reconstruction so that 'quantity', 'billed_quantity', 'effective_quantity', and 'variant_id' are retained.
-- 3. Enables shopkeepers, customers, and admins to safely transition and update request statuses.
-- 4. Cleans up redundant trigger definitions.

DROP TRIGGER IF EXISTS trg_validate_request_order_items ON public.requests;
DROP FUNCTION IF EXISTS public.validate_request_order_items();

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
  v_billed_quantity NUMERIC(12,3);
  v_total NUMERIC(12,2) := 0;
  v_index INTEGER := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Customer authorization only on request creation
    IF NOT public.is_admin() AND auth.uid() IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'A request must belong to the authenticated customer';
    END IF;

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
        v_billed_quantity := COALESCE(NULLIF(v_item->>'billed_quantity', '')::numeric, v_quantity);

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

        -- Reconstruct item retaining quantity, effective_quantity, and variant details
        v_item := jsonb_build_object(
          'product_id', v_product.id,
          'name', v_product.name,
          'price', v_price,
          'unit', COALESCE(v_item->>'unit', v_product.unit),
          'quantity', v_quantity,
          'billed_quantity', v_billed_quantity,
          'effective_quantity', v_effective_quantity,
          'variant_id', v_variant_id,
          'variant_price', CASE WHEN v_variant_id IS NULL THEN NULL ELSE v_price END,
          'variant_label', CASE WHEN v_variant_id IS NULL THEN NULL ELSE COALESCE(v_variant->>'label', v_variant_id) END,
          'variant_attributes', CASE WHEN v_variant_id IS NULL THEN '{}'::jsonb ELSE COALESCE(v_variant->'attributes', '{}'::jsonb) END,
          'offer_type', v_item->>'offer_type',
          'subtotal', v_price * v_billed_quantity
        );
        v_items := v_items || jsonb_build_array(v_item);
        v_total := v_total + (v_price * v_billed_quantity);
        v_index := v_index + 1;
      END LOOP;

      NEW.notes := jsonb_set(v_payload, '{items}', v_items)::text;
      NEW.subtotal := v_total;
      NEW.total_estimate := v_total;
      NEW.total_amount := v_total;
    END IF;
  ELSE
    -- UPDATE validations
    IF NOT public.is_admin() THEN
      -- Ensure caller is either the customer or the shop owner
      IF auth.uid() IS DISTINCT FROM OLD.customer_id
         AND NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = OLD.shop_id AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Access Denied: You are not a party to this request';
      END IF;

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

DROP TRIGGER IF EXISTS vaangly_validate_request_creation_and_mutation ON public.requests;
CREATE TRIGGER vaangly_validate_request_creation_and_mutation
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_request_creation_and_mutation();

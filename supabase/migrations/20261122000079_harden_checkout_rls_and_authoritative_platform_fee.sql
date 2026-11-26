-- ============================================================================
-- Migration: 20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql
-- Description:
-- Final Financial Integrity & Security Hardening:
-- 1. Replaces unsafe INTEGER paise arithmetic with 64-bit BIGINT across all accumulators,
--    intermediate calculations, and aggregations, eliminating integer overflow vulnerabilities
--    while preserving integer-paise precision. Adds explicit bounds checking compatible with database column types.
-- 2. Enforces strict customer ownership RLS policy on public.requests (auth.uid() IS NOT NULL AND auth.uid() = customer_id).
-- 3. Introduces public.admin_financial_correction_authorizations table:
--    A protected, transaction-scoped authorization record with REVOKED table privileges,
--    tied to auth.uid(), request_id, and txid_current().
-- 4. Updates platform_fee_ledger constraints:
--    Relaxes idx_ledger_unique_order_entry to apply strictly to ('fee_assessed', 'fee_reversed'),
--    allowing append-only 'adjustment' entries for audited financial corrections with unique idempotency_key.
-- 5. Updates validate_request_creation_and_mutation() trigger:
--    - Enforces auth.uid() IS NOT NULL and binds NEW.customer_id := auth.uid() on INSERT.
--    - Validates item quantities without silent rounding (continuous up to 3 decimals, discrete whole integer).
--    - Authoritatively calculates billed_quantity, effective_quantity, promotions (bogo, percent_off, flat_off),
--      delivery fee, and platform fee (0 when dormant). Non-orders strictly fee = 0, delivery = 0, discount = 0.
--    - Protects order contents after checkout on UPDATE:
--      * Direct UPDATE cannot modify identity, financial fields, or 'notes' (which holds order items, quantities,
--        variants, and prices). Customers and merchants are strictly blocked from rewriting order contents.
--      * Legitimate workflow updates (current_state, payment_*, pickup_*, cancellation_*, etc.) are fully preserved.
-- 6. Implements public.admin_correct_request_financials() with comprehensive hardening:
--    - Defines eligible request states: positive fee corrections are strictly restricted to COMPLETED orders.
--    - Guarantees that positive fee corrections always create corresponding ledger entries (initial assessment
--      or compensating adjustment), eliminating any risk of request fields and ledger liabilities silently diverging.
--    - Prevents reversed-fee resurrection: strictly rejects platform fee assessment on cancelled orders,
--      refunded orders, or orders with existing fee_reversed ledger entries.
--    - Rejects platform fees on non-order workflows (APPOINTMENT, SERVICE, BOOKING).
--    - Validates against NULL, negative, and excessively large financial values.
--    - Reconciles append-only platform_fee_ledger via compensating 'adjustment' entries without modifying historical rows.
-- 7. Reconciles settlement allocations and identifiable advance credits:
--    - Historical settlement allocations remain completely immutable (never updated or deleted).
--    - Excess settlement funds resulting from negative fee corrections become identifiable advance credits (advance_credit_paise).
--    - Subsequent order assessments absorb available credits, preserving a net balance of ₹0.
-- 8. Hardens all SECURITY DEFINER functions with search_path = pg_catalog, public, pg_temp; schema qualification;
--    explicit REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon; and explicit role-based GRANTs.
-- 9. Eliminates predictable and hardcoded pickup code salts. Generates CSPRNG codes with zero modulo bias
--    via rejection sampling, stores only salted SHA-256 hashes, locks verification permanently after 5 attempts
--    without reset on retrieval/regeneration, enforces 30s rate limiting, and restricts code viewing to owning customer/admin.
-- 10. Fixes authoritative platform fee fallback calculation in complete_order_and_assess_fee() to strictly use net
--     merchandise value (subtotal - discount_total), strictly excluding delivery charges and the platform fee itself.
-- 11. Hardens service-role actor attribution across financial RPCs, recording a defined system actor
--     (actor_id = NULL, actor_role = 'system') without human impersonation, and rejecting mismatched client actor IDs.
-- ============================================================================

BEGIN;

SET LOCAL search_path = pg_catalog, public, pg_temp;

-- 1. Restrict schema CREATE privileges: untrusted roles cannot create objects in public
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- Helper function to verify schema privileges deterministically
CREATE OR REPLACE FUNCTION public.check_schema_privileges()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_anon_create BOOLEAN;
    v_auth_create BOOLEAN;
    v_public_create BOOLEAN;
    v_service_role_create BOOLEAN;
BEGIN
    v_anon_create := pg_catalog.has_schema_privilege('anon', 'public', 'CREATE');
    v_auth_create := pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE');
    v_service_role_create := pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE');

    SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace n,
             pg_catalog.aclexplode(COALESCE(n.nspacl, ARRAY[]::aclitem[])) acl
        WHERE n.nspname = 'public'
          AND acl.grantee = 0
          AND acl.privilege_type = 'CREATE'
    ) INTO v_public_create;

    RETURN jsonb_build_object(
        'anon_has_create', v_anon_create,
        'authenticated_has_create', v_auth_create,
        'service_role_has_create', v_service_role_create,
        'public_has_create', v_public_create
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_schema_privileges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_schema_privileges() TO authenticated, service_role;

-- 1b. Add payment_preference column to public.shops with check constraint
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS payment_preference TEXT DEFAULT 'both';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'shops_payment_preference_check'
    ) THEN
        ALTER TABLE public.shops ADD CONSTRAINT shops_payment_preference_check
        CHECK (payment_preference IN ('both', 'upi_only', 'pay_at_shop_only'));
    END IF;
END $$;

-- 2. Enforce strict customer ownership RLS policy on public.requests
DROP POLICY IF EXISTS "Customers can create requests" ON public.requests;
CREATE POLICY "Customers can create requests" ON public.requests
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid() = customer_id
    );

-- 3. Create protected transaction-scoped authorization table for admin financial corrections
CREATE TABLE IF NOT EXISTS public.admin_financial_correction_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL,
    txid BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_fin_correction_auth_lookup
  ON public.admin_financial_correction_authorizations (request_id, admin_id, txid);

-- Strictly restrict table privileges: ordinary authenticated and anonymous users have zero permissions
ALTER TABLE public.admin_financial_correction_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_financial_correction_authorizations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_financial_correction_authorizations TO service_role;

-- 4. Relax ledger unique index to permit multiple audited 'adjustment' entries per request
DROP INDEX IF EXISTS public.idx_ledger_unique_order_entry;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_unique_order_assessment
    ON public.platform_fee_ledger (shop_id, request_id, entry_type)
    WHERE request_id IS NOT NULL AND entry_type IN ('fee_assessed', 'fee_reversed');

-- 4b. Schema additions for cryptographically secure, non-predictable pickup codes and service-role audit events
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS pickup_code_nonce TEXT,
    ADD COLUMN IF NOT EXISTS pickup_code_total_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pickup_code_regenerated_at TIMESTAMPTZ;

-- Allow system/service events to record actor_id = NULL without foreign key violation
ALTER TABLE public.request_events ALTER COLUMN actor_id DROP NOT NULL;

-- Protected platform secrets table for CSPRNG master keys
CREATE TABLE IF NOT EXISTS public.platform_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.platform_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_secrets TO service_role;

-- Seed master secret for pickup code derivation and server pepper for keyed HMAC if not already present
INSERT INTO public.platform_secrets (key, value, description)
VALUES
    (
        'pickup_code_master_secret',
        encode(extensions.gen_random_bytes(32), 'hex'),
        'CSPRNG master key for deriving zero-modulo-bias order pickup codes'
    ),
    (
        'pickup_code_pepper',
        encode(extensions.gen_random_bytes(32), 'hex'),
        'Server-side HMAC pepper to protect pickup code hashes against offline brute-force dictionary attacks'
    )
ON CONFLICT (key) DO NOTHING;

-- Derive pickup code with zero modulo bias via rejection sampling
CREATE OR REPLACE FUNCTION public.derive_pickup_code(
    p_request_id UUID,
    p_nonce TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_master_secret TEXT;
    v_hmac_bytes BYTEA;
    v_counter INTEGER := 0;
    v_slice BYTEA;
    v_val BIGINT;
    v_code INTEGER;
BEGIN
    SELECT value INTO v_master_secret
    FROM public.platform_secrets
    WHERE key = 'pickup_code_master_secret';

    IF v_master_secret IS NULL THEN
        RAISE EXCEPTION 'Platform secret pickup_code_master_secret is not configured.';
    END IF;

    -- Zero modulo bias via rejection sampling over 32-bit unsigned integers
    -- Range [0, 4294967295]. Multiple of 900,000 below 2^32 is 4294800000.
    -- Any value < 4294800000 is accepted: (val % 900000) + 100000 yields exact uniform 100000-999999.
    -- Strict zero-bias: exhaustion of attempts raises an exception instead of falling back to biased modulo reduction.
    LOOP
        v_hmac_bytes := extensions.hmac(p_request_id::TEXT || ':' || p_nonce || ':' || v_counter::TEXT, v_master_secret, 'sha256');

        -- Each 32-byte HMAC provides 8 candidate 4-byte slices
        FOR i IN 0..7 LOOP
            v_slice := pg_catalog.substr(v_hmac_bytes, (i * 4) + 1, 4);
            -- Read 4 bytes as big-endian unsigned 32-bit integer
            v_val := (pg_catalog.get_byte(v_slice, 0)::BIGINT << 24)
                   | (pg_catalog.get_byte(v_slice, 1)::BIGINT << 16)
                   | (pg_catalog.get_byte(v_slice, 2)::BIGINT << 8)
                   | (pg_catalog.get_byte(v_slice, 3)::BIGINT);

            IF v_val < 4294800000 THEN
                v_code := ((v_val % 900000) + 100000)::INTEGER;
                RETURN lpad(v_code::TEXT, 6, '0');
            END IF;
        END LOOP;

        v_counter := v_counter + 1;
        IF v_counter > 20 THEN
            RAISE EXCEPTION 'Cryptographic rejection sampling exhausted without acceptable slice for order %', p_request_id;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.derive_pickup_code(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_pickup_code(UUID, TEXT) TO service_role;

-- 5. Harden request creation and mutation trigger with 64-bit BIGINT paise arithmetic
CREATE OR REPLACE FUNCTION public.validate_request_creation_and_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_payload JSONB;
  v_item JSONB;
  v_items JSONB := '[]'::jsonb;
  v_shop public.shops%ROWTYPE;
  v_product public.shop_products%ROWTYPE;
  v_variant JSONB;
  v_variant_id TEXT;
  v_unit TEXT;
  v_is_fractional_unit BOOLEAN;
  v_price NUMERIC(12,2);
  v_raw_quantity NUMERIC;
  v_quantity NUMERIC(12,3);
  v_effective_quantity NUMERIC(12,3);
  v_billed_quantity NUMERIC(12,3);
  v_remaining_stock NUMERIC(12,3);
  v_item_gross_paise BIGINT := 0;
  v_item_discount_paise BIGINT := 0;
  v_item_net_paise BIGINT := 0;
  v_subtotal_paise BIGINT := 0;
  v_discount_paise BIGINT := 0;
  v_delivery_fee_paise BIGINT := 0;
  v_fee_basis_paise BIGINT := 0;
  v_calculated_fee_paise BIGINT := 0;
  v_total_paise BIGINT := 0;
  v_index INTEGER := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Strict customer authorization on request creation
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'A request must belong to an authenticated customer';
    END IF;

    -- Authoritatively bind customer_id to auth.uid() for all callers (never trust client-supplied ID)
    NEW.customer_id := auth.uid();

    -- Authoritatively verify shop status
    SELECT * INTO v_shop
    FROM public.shops
    WHERE id = NEW.shop_id;

    IF NOT FOUND OR v_shop.status <> 'active' OR NOT v_shop.is_live THEN
      RAISE EXCEPTION 'Requests can only be created for active live shops';
    END IF;

    NEW.request_kind := COALESCE(NEW.request_kind, NEW.workflow_group_code);

    IF COALESCE(NEW.workflow_group_code, '') = 'ORDER' THEN
      BEGIN
        v_payload := NEW.notes::jsonb;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Order payload must be valid JSON';
      END;

      IF jsonb_typeof(v_payload->'items') <> 'array' OR jsonb_array_length(v_payload->'items') = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item';
      END IF;

      -- Safety: Acquire exclusive row locks on all referenced products in sorted order (ORDER BY id)
      -- Eliminates deadlock risks across concurrent multi-item checkouts.
      PERFORM 1
      FROM public.shop_products
      WHERE id IN (
        SELECT DISTINCT (item->>'product_id')::uuid
        FROM jsonb_array_elements(v_payload->'items') AS item
        WHERE NULLIF(item->>'product_id', '') IS NOT NULL
      )
      AND shop_id = NEW.shop_id
      ORDER BY id
      FOR UPDATE;

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

        -- Parse raw quantity into unconstrained numeric to prevent silent rounding
        BEGIN
          v_raw_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0);
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Order item quantity must be a valid number';
        END;

        IF v_raw_quantity <= 0 THEN
          RAISE EXCEPTION 'Order item quantity must be positive';
        END IF;

        -- Determine whether unit permits fractional quantities (weight/volume/measurement)
        v_unit := pg_catalog.lower(trim(COALESCE(v_product.unit, 'item')));
        v_is_fractional_unit := v_unit IN (
          'kg', 'g', 'gram', 'grams', 'l', 'litre', 'liter', 'ml', 'm', 'meter', 'metre'
        ) OR (
          v_unit NOT IN ('500g', '250g') AND (
            v_unit LIKE '%kg%' OR v_unit LIKE '%gram%' OR v_unit LIKE '%litre%' OR v_unit LIKE '%liter%' OR v_unit LIKE '%ml%' OR v_unit LIKE '%meter%'
          )
        );

        -- Validate quantity based on unit and variant selection without silent rounding
        IF v_variant_id IS NOT NULL OR NOT v_is_fractional_unit THEN
          -- Discrete items (item, piece, plate, cup, bottle, pack, box, per dozen) and variant options:
          -- Must be whole positive integers (no decimals)
          IF v_raw_quantity <> trunc(v_raw_quantity) THEN
            IF v_variant_id IS NOT NULL THEN
              RAISE EXCEPTION 'Order item quantity for variant must be a positive integer';
            ELSE
              RAISE EXCEPTION 'Order item quantity for % must be a positive integer', v_product.name;
            END IF;
          END IF;
        ELSE
          -- Fractional items (weight/volume/measurement):
          -- Supported precision: up to 3 decimal places (numeric(12,3)), minimum 0.001
          IF v_raw_quantity < 0.001 OR v_raw_quantity <> ROUND(v_raw_quantity, 3) THEN
            RAISE EXCEPTION 'Order item quantity for % has unsupported precision (maximum 3 decimal places, minimum 0.001)', v_product.name;
          END IF;
        END IF;

        v_quantity := v_raw_quantity;

        -- Authoritative quantity calculations:
        -- Client cannot manipulate billed_quantity or effective_quantity
        v_billed_quantity := v_quantity;
        IF v_product.offer_type = 'bogo' THEN
          v_effective_quantity := v_quantity * 2;
        ELSE
          v_effective_quantity := v_quantity;
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

          IF v_variant ? 'stock_quantity' AND v_variant->>'stock_quantity' IS NOT NULL THEN
            v_remaining_stock := COALESCE(NULLIF(v_variant->>'stock_quantity', '')::numeric, 0) - v_effective_quantity;
            IF v_remaining_stock < 0 THEN
              RAISE EXCEPTION 'Selected variant is out of stock or unavailable';
            END IF;

            v_product.variants := (
              SELECT jsonb_agg(
                CASE WHEN item->>'id' = v_variant_id
                  THEN
                    CASE
                      WHEN v_remaining_stock <= 0 THEN
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(item, '{stock_quantity}', to_jsonb(0)),
                            '{in_stock}', to_jsonb(FALSE)
                          ),
                          '{is_available}', to_jsonb(FALSE)
                        )
                      ELSE
                        jsonb_set(item, '{stock_quantity}', to_jsonb(v_remaining_stock))
                    END
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

        -- Authoritative line gross calculation using 64-bit BIGINT paise arithmetic
        v_item_gross_paise := pg_catalog.round(pg_catalog.round(v_price * 100)::NUMERIC * v_billed_quantity)::BIGINT;

        -- Authoritative promotion calculation from database configuration
        v_item_discount_paise := 0;
        IF v_product.offer_type = 'percent_off' AND v_product.offer_value IS NOT NULL AND v_product.offer_value > 0 THEN
          -- Percent off: offer_value is percentage (0 to 100)
          v_item_discount_paise := pg_catalog.round(v_item_gross_paise::NUMERIC * (LEAST(100.0, GREATEST(0.0, v_product.offer_value)) / 100.0))::BIGINT;
        ELSIF v_product.offer_type = 'flat_off' AND v_product.offer_value IS NOT NULL AND v_product.offer_value > 0 THEN
          -- Flat off: offer_value is rupees off per unit
          v_item_discount_paise := LEAST(v_item_gross_paise, pg_catalog.round(pg_catalog.round(v_product.offer_value * 100)::NUMERIC * v_billed_quantity)::BIGINT);
        END IF;

        v_item_net_paise := v_item_gross_paise - v_item_discount_paise;
        v_subtotal_paise := v_subtotal_paise + v_item_gross_paise;
        v_discount_paise := v_discount_paise + v_item_discount_paise;

        -- Reconstruct item retaining authoritative pricing, verified quantities, and promotion metadata
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
          'offer_type', v_product.offer_type,
          'offer_value', v_product.offer_value,
          'discount', (v_item_discount_paise::NUMERIC / 100.0),
          'subtotal', (v_item_net_paise::NUMERIC / 100.0)
        );
        v_items := v_items || jsonb_build_array(v_item);
        v_index := v_index + 1;
      END LOOP;

      -- Authoritative delivery fee calculation from shop configuration
      IF pg_catalog.lower(COALESCE(NEW.fulfillment_type, '')) = 'delivery' THEN
        IF NOT COALESCE(v_shop.delivery_available, FALSE) THEN
          RAISE EXCEPTION 'Delivery is not available for this shop';
        END IF;

        IF v_shop.free_delivery_above IS NOT NULL
           AND v_shop.free_delivery_above > 0
           AND ((v_subtotal_paise - v_discount_paise)::NUMERIC / 100.0) >= v_shop.free_delivery_above THEN
          v_delivery_fee_paise := 0;
        ELSE
          v_delivery_fee_paise := pg_catalog.round(COALESCE(v_shop.delivery_fee, 0) * 100)::BIGINT;
        END IF;
      ELSE
        -- Takeaway, Dine-in, Pickup: delivery fee is strictly zero
        v_delivery_fee_paise := 0;
      END IF;

      -- Authoritative platform fee calculation via master switch logic in calculate_platform_fee()
      -- Fee basis is net merchandise amount (subtotal - discount)
      -- When dormant, evaluates strictly to 0 paise regardless of client input
      v_fee_basis_paise := GREATEST(0::BIGINT, v_subtotal_paise - v_discount_paise);
      IF v_fee_basis_paise > 2147483647 THEN
        RAISE EXCEPTION 'Fee basis exceeds maximum integer limit';
      END IF;
      v_calculated_fee_paise := public.calculate_platform_fee(v_fee_basis_paise::INTEGER)::BIGINT;

      -- Final total in 64-bit BIGINT paise
      v_total_paise := (v_subtotal_paise - v_discount_paise) + v_delivery_fee_paise + v_calculated_fee_paise;

      IF v_subtotal_paise > 100000000000 OR v_total_paise > 100000000000 THEN
        RAISE EXCEPTION 'Order financial values exceed maximum permitted bounds';
      END IF;

      NEW.notes := jsonb_set(v_payload, '{items}', v_items)::text;
      NEW.subtotal := v_subtotal_paise::NUMERIC / 100.0;
      NEW.discount_total := v_discount_paise::NUMERIC / 100.0;
      NEW.delivery_fee := v_delivery_fee_paise::NUMERIC / 100.0;
      NEW.platform_fee_paise := v_calculated_fee_paise::INTEGER;
      NEW.total_estimate := v_total_paise::NUMERIC / 100.0;
      NEW.total_amount := NEW.total_estimate;
    ELSE
      -- Non-order workflows (e.g. APPOINTMENT, SERVICE, BOOKING, CUSTOM)
      -- Platform fee, delivery fee, and discount are strictly zero
      NEW.platform_fee_paise := 0;
      NEW.delivery_fee := 0;
      NEW.discount_total := 0;
      NEW.subtotal := COALESCE(NEW.total_estimate, NEW.total_amount, 0);
      NEW.total_estimate := NEW.subtotal;
      NEW.total_amount := NEW.subtotal;
    END IF;
  ELSE
    -- UPDATE validations
    -- 1. Authorization check: caller must be a party (customer, shop owner) or an administrator
    IF NOT public.is_admin() AND current_user NOT IN ('postgres', 'service_role') THEN
      IF auth.uid() IS DISTINCT FROM OLD.customer_id
         AND NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = OLD.shop_id AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Access Denied: You are not a party to this request';
      END IF;
    END IF;

    -- 2. Immutable Identity, Order Content, and Financial Fields:
    -- Applies to ALL callers (customers, merchants, and administrators on direct UPDATE).
    -- Customers and merchants are strictly prevented from rewriting order items, quantities, prices,
    -- variants, or promotion metadata (stored in 'notes') after checkout.
    -- Legitimate workflow updates (current_state, payment_*, pickup_*, cancellation_*, etc.) are permitted.
    -- Exceptional corrections MUST use audited administrative RPCs (such as admin_correct_request_financials)
    -- which verify transactions via public.admin_financial_correction_authorizations.
    IF OLD.customer_id IS DISTINCT FROM NEW.customer_id
       OR OLD.shop_id IS DISTINCT FROM NEW.shop_id
       OR OLD.workflow_group_code IS DISTINCT FROM NEW.workflow_group_code
       OR OLD.request_kind IS DISTINCT FROM NEW.request_kind
       OR OLD.reference_code IS DISTINCT FROM NEW.reference_code
       OR OLD.total_estimate IS DISTINCT FROM NEW.total_estimate
       OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
       OR OLD.discount_total IS DISTINCT FROM NEW.discount_total
       OR OLD.delivery_fee IS DISTINCT FROM NEW.delivery_fee
       OR OLD.platform_fee_paise IS DISTINCT FROM NEW.platform_fee_paise
       OR OLD.notes IS DISTINCT FROM NEW.notes THEN

      IF NOT EXISTS (
        SELECT 1 FROM public.admin_financial_correction_authorizations
        WHERE request_id = OLD.id
          AND admin_id = auth.uid()
          AND txid = txid_current()
          AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '10 seconds')
      ) THEN
        RAISE EXCEPTION 'Request identity, order contents, and financial fields are database-controlled and immutable on direct update';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_request_creation_and_mutation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_request_creation_and_mutation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS vaangly_validate_request_creation_and_mutation ON public.requests;
CREATE TRIGGER vaangly_validate_request_creation_and_mutation
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_request_creation_and_mutation();

-- 6. Dedicated SECURITY DEFINER RPC for exceptional, audited administrator financial corrections
-- Reconciles requests, platform_fee_ledger, and audit logs atomically with 64-bit BIGINT precision.
DROP FUNCTION IF EXISTS public.admin_correct_request_financials(UUID, NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.admin_correct_request_financials(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.admin_correct_request_financials(
  p_request_id UUID,
  p_new_subtotal NUMERIC,
  p_new_discount_total NUMERIC,
  p_new_delivery_fee NUMERIC,
  p_new_platform_fee_paise NUMERIC,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_old_req public.requests%ROWTYPE;
  v_new_total NUMERIC(12,2);
  v_subtotal_paise BIGINT;
  v_discount_paise BIGINT;
  v_delivery_fee_paise BIGINT;
  v_platform_fee_paise BIGINT;
  v_total_paise BIGINT;
  v_log_id UUID;
  v_auth_id UUID;
  v_current_ledger_fee_paise BIGINT := 0;
  v_delta_paise BIGINT := 0;
  v_adj_ledger_id UUID := NULL;
  v_has_assessed_entry BOOLEAN := FALSE;
  v_has_reversed_entry BOOLEAN := FALSE;
  v_idempotency_key TEXT;
  v_net_shop_fees_paise BIGINT := 0;
  v_verified_settled_paise BIGINT := 0;
  v_excess_credit_paise BIGINT := 0;
  v_fee_system_enabled BOOLEAN := FALSE;
  v_activation_time TIMESTAMPTZ := NULL;
BEGIN
  -- 1. Strictly verify caller is an authenticated administrator via auth.uid()
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only platform administrators can perform financial corrections';
  END IF;

  -- 2. Validate non-null inputs
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Request ID is required';
  END IF;

  IF p_new_subtotal IS NULL OR p_new_discount_total IS NULL OR p_new_delivery_fee IS NULL OR p_new_platform_fee_paise IS NULL THEN
    RAISE EXCEPTION 'Financial parameters cannot be NULL';
  END IF;

  -- 3. Mandatory reason verification (minimum 10 characters)
  IF pg_catalog.length(trim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Financial correction requires a detailed audit reason (at least 10 characters)';
  END IF;

  -- 4. Lock target request row and associated shop row to serialize concurrent corrections and settlements
  SELECT * INTO v_old_req
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found', p_request_id;
  END IF;

  PERFORM 1 FROM public.shops WHERE id = v_old_req.shop_id FOR UPDATE;

  -- 5. Validate input ranges and 32-bit column compatibility limits
  IF p_new_subtotal < 0 OR p_new_discount_total < 0 OR p_new_delivery_fee < 0 OR p_new_platform_fee_paise < 0 THEN
    RAISE EXCEPTION 'Financial values must be non-negative';
  END IF;

  IF p_new_platform_fee_paise <> pg_catalog.trunc(p_new_platform_fee_paise) THEN
    RAISE EXCEPTION 'Platform fee must be an integer paise amount';
  END IF;

  IF p_new_platform_fee_paise > 2147483647 THEN
    RAISE EXCEPTION 'Platform fee exceeds 32-bit integer limits (% paise)', p_new_platform_fee_paise;
  END IF;

  IF p_new_subtotal > 100000000.00 OR p_new_discount_total > 100000000.00 OR p_new_delivery_fee > 1000000.00 THEN
    RAISE EXCEPTION 'Financial values exceed maximum permitted limits';
  END IF;

  IF p_new_discount_total > p_new_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;

  -- 6. Eligible Request State Enforcement:
  -- A positive platform fee can ONLY be assessed on COMPLETED orders.
  IF p_new_platform_fee_paise > 0 AND v_old_req.current_state <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Platform fees can only be assessed on COMPLETED orders (current state is %)', v_old_req.current_state;
  END IF;

  -- 7. Enforce Non-Order Fee Restrictions:
  -- Appointments, services, bookings, NULL workflows, and other non-order workflows can NEVER acquire platform fee liabilities.
  IF COALESCE(v_old_req.workflow_group_code, '') <> 'ORDER' AND p_new_platform_fee_paise > 0 THEN
    RAISE EXCEPTION 'Platform fees cannot be assessed on non-order workflows (%)', COALESCE(v_old_req.workflow_group_code, 'NULL');
  END IF;

  -- 8. Prevent Reversed-Fee Resurrection & Ineligible Liabilities:
  -- A. Cancelled requests can never acquire platform fee liabilities
  IF v_old_req.current_state = 'CANCELLED' AND p_new_platform_fee_paise > 0 THEN
    RAISE EXCEPTION 'Cannot assess platform fees on a cancelled request';
  END IF;

  -- B. Fully refunded requests can never acquire platform fee liabilities
  IF v_old_req.refund_status IN ('completed', 'full') AND p_new_platform_fee_paise > 0 THEN
    RAISE EXCEPTION 'Cannot assess platform fees on a refunded request';
  END IF;

  -- C. Orders with an existing fee_reversed ledger entry can never have fees resurrected or increased
  SELECT EXISTS (
    SELECT 1 FROM public.platform_fee_ledger
    WHERE request_id = p_request_id AND entry_type = 'fee_reversed'
  ) INTO v_has_reversed_entry;

  IF v_has_reversed_entry AND p_new_platform_fee_paise > 0 THEN
    RAISE EXCEPTION 'Cannot assess or increase platform fee liability for an order with reversed fees';
  END IF;

  -- 9. Platform Fee System Activation & Cutoff Timestamp Enforcement:
  -- EVERY positive platform fee assessment (initial fee_assessed or adjustment) MUST enforce:
  -- A. Fee system is currently enabled in public.platform_settings
  -- B. activated_at is NOT NULL
  -- C. The order's authoritative creation timestamp (created_at) is on or after activated_at
  -- Pre-activation orders are PERMANENTLY exempt from platform fees.
  IF p_new_platform_fee_paise > 0 THEN
    SELECT
      COALESCE((value->>'is_enabled')::BOOLEAN, FALSE),
      (value->>'activated_at')::TIMESTAMPTZ
    INTO v_fee_system_enabled, v_activation_time
    FROM public.platform_settings
    WHERE key = 'platform_fee_system';

    IF v_fee_system_enabled IS NOT TRUE OR v_activation_time IS NULL THEN
      RAISE EXCEPTION 'Platform fee system is dormant or not activated. Positive platform fees cannot be assessed';
    END IF;

    IF v_old_req.created_at < v_activation_time THEN
      RAISE EXCEPTION 'Cannot assess platform fee: Order was created at % prior to platform fee system activation at % (pre-activation orders are permanently exempt)', v_old_req.created_at, v_activation_time;
    END IF;
  END IF;

  -- 9. Calculate new authoritative totals in 64-bit BIGINT paise
  v_subtotal_paise := pg_catalog.round(p_new_subtotal * 100)::BIGINT;
  v_discount_paise := pg_catalog.round(p_new_discount_total * 100)::BIGINT;
  v_delivery_fee_paise := pg_catalog.round(p_new_delivery_fee * 100)::BIGINT;
  v_platform_fee_paise := CASE WHEN COALESCE(v_old_req.workflow_group_code, '') = 'ORDER' THEN p_new_platform_fee_paise::BIGINT ELSE 0::BIGINT END;

  v_total_paise := (v_subtotal_paise - v_discount_paise) + v_delivery_fee_paise + v_platform_fee_paise;
  v_new_total := v_total_paise::NUMERIC / 100.0;

  -- 10. Log immutable financial audit record
  INSERT INTO public.financial_audit_logs (
    admin_id, action, target_entity, target_id, previous_state, new_state, reason
  ) VALUES (
    v_admin_id,
    'FINANCIAL_CORRECTION',
    'requests',
    p_request_id,
    jsonb_build_object(
      'subtotal', v_old_req.subtotal,
      'discount_total', v_old_req.discount_total,
      'delivery_fee', v_old_req.delivery_fee,
      'platform_fee_paise', v_old_req.platform_fee_paise,
      'total_estimate', v_old_req.total_estimate,
      'total_amount', v_old_req.total_amount
    ),
    jsonb_build_object(
      'subtotal', v_subtotal_paise::NUMERIC / 100.0,
      'discount_total', v_discount_paise::NUMERIC / 100.0,
      'delivery_fee', v_delivery_fee_paise::NUMERIC / 100.0,
      'platform_fee_paise', v_platform_fee_paise,
      'total_estimate', v_new_total,
      'total_amount', v_new_total
    ),
    trim(p_reason)
  ) RETURNING id INTO v_log_id;

  -- Also write to admin_audit_logs for universal admin timeline
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    reason,
    details
  ) VALUES (
    v_admin_id,
    'FINANCIAL_CORRECTION',
    'requests',
    p_request_id::text,
    jsonb_build_object('total_amount', v_old_req.total_amount, 'platform_fee_paise', v_old_req.platform_fee_paise),
    jsonb_build_object('total_amount', v_new_total, 'platform_fee_paise', v_platform_fee_paise),
    trim(p_reason),
    jsonb_build_object('reference_code', v_old_req.reference_code, 'correction_timestamp', CURRENT_TIMESTAMP)
  );

  -- 11. Insert protected transaction-scoped authorization record
  INSERT INTO public.admin_financial_correction_authorizations (
    request_id,
    admin_id,
    txid
  ) VALUES (
    p_request_id,
    v_admin_id,
    txid_current()
  ) RETURNING id INTO v_auth_id;

  -- 12. Execute update on public.requests under verified transaction authorization
  UPDATE public.requests
  SET subtotal = v_subtotal_paise::NUMERIC / 100.0,
      discount_total = v_discount_paise::NUMERIC / 100.0,
      delivery_fee = v_delivery_fee_paise::NUMERIC / 100.0,
      platform_fee_paise = v_platform_fee_paise::INTEGER,
      total_estimate = v_new_total,
      total_amount = v_new_total
  WHERE id = p_request_id;

  -- 13. Clean up authorization record within same atomic transaction
  DELETE FROM public.admin_financial_correction_authorizations
  WHERE id = v_auth_id;

  -- 14. Reconcile Append-Only Platform Fee Ledger:
  -- Guarantees that request fields and ledger liability NEVER silently diverge.
  SELECT EXISTS (
    SELECT 1 FROM public.platform_fee_ledger
    WHERE request_id = p_request_id AND entry_type = 'fee_assessed'
  ) INTO v_has_assessed_entry;

  IF v_old_req.current_state = 'COMPLETED' AND COALESCE(v_old_req.workflow_group_code, '') = 'ORDER' THEN
    IF NOT v_has_assessed_entry AND v_platform_fee_paise > 0 THEN
      -- Handle orders without an existing fee_assessed entry explicitly:
      -- Creates initial fee_assessed entry matching the corrected fee
      v_idempotency_key := 'fee_assessed_' || p_request_id::TEXT;

      INSERT INTO public.platform_fee_ledger (
        shop_id,
        request_id,
        entry_type,
        amount_paise,
        currency,
        idempotency_key,
        notes,
        actor_id,
        actor_role
      ) VALUES (
        v_old_req.shop_id,
        p_request_id,
        'fee_assessed',
        v_platform_fee_paise::INTEGER,
        'INR',
        v_idempotency_key,
        'Admin financial assessment: ' || trim(p_reason),
        v_admin_id,
        'admin'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_adj_ledger_id;

      v_delta_paise := v_platform_fee_paise;
    ELSIF v_has_assessed_entry THEN
      -- Reconcile via compensating append-only adjustment
      SELECT COALESCE(SUM(amount_paise), 0) INTO v_current_ledger_fee_paise
      FROM public.platform_fee_ledger
      WHERE request_id = p_request_id;

      v_delta_paise := v_platform_fee_paise - v_current_ledger_fee_paise;

      IF v_delta_paise <> 0 THEN
        IF v_delta_paise > 2147483647 OR v_delta_paise < -2147483648 THEN
          RAISE EXCEPTION 'Compensating ledger adjustment exceeds integer limits (% paise)', v_delta_paise;
        END IF;

        v_idempotency_key := 'fee_adj_' || p_request_id::TEXT || '_' || v_log_id::TEXT;

        INSERT INTO public.platform_fee_ledger (
          shop_id,
          request_id,
          entry_type,
          amount_paise,
          currency,
          idempotency_key,
          notes,
          actor_id,
          actor_role
        ) VALUES (
          v_old_req.shop_id,
          p_request_id,
          'adjustment',
          v_delta_paise::INTEGER,
          'INR',
          v_idempotency_key,
          'Admin financial correction: ' || trim(p_reason),
          v_admin_id,
          'admin'
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_adj_ledger_id;
      END IF;
    END IF;
  END IF;

  -- 15. Calculate identifiable credit post-correction
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_net_shop_fees_paise
  FROM public.platform_fee_ledger
  WHERE shop_id = v_old_req.shop_id;

  SELECT COALESCE(SUM(verified_amount_paise), 0) INTO v_verified_settled_paise
  FROM public.merchant_settlements
  WHERE shop_id = v_old_req.shop_id AND verification_status = 'verified';

  v_excess_credit_paise := GREATEST(0::BIGINT, v_verified_settled_paise - v_net_shop_fees_paise);

  RETURN jsonb_build_object(
    'success', true,
    'audit_log_id', v_log_id,
    'request_id', p_request_id,
    'old_total', v_old_req.total_amount,
    'new_total', v_new_total,
    'platform_fee_paise', v_platform_fee_paise,
    'ledger_adjustment_paise', v_delta_paise,
    'ledger_adjustment_id', v_adj_ledger_id,
    'excess_advance_credit_paise', v_excess_credit_paise
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_correct_request_financials(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_request_financials(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

-- 7. Update get_admin_financial_kpis() with hardened search_path, 64-bit BIGINT arithmetic,
-- explicit revokes, and consistent overdue calculation accounting for adjustments, reversals, and settlements.
CREATE OR REPLACE FUNCTION public.get_admin_financial_kpis(
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_total_merchants BIGINT := 0;
    v_merchants_with_orders BIGINT := 0;
    v_merchants_with_outstanding BIGINT := 0;
    v_fully_settled_merchants BIGINT := 0;
    v_overdue_merchants BIGINT := 0;
    v_total_completed_orders BIGINT := 0;
    v_total_gmv_paise BIGINT := 0;
    v_total_fees_assessed_paise BIGINT := 0;
    v_total_fees_reversed_paise BIGINT := 0;
    v_total_adjustments_paise BIGINT := 0;
    v_net_fees_owed_paise BIGINT := 0;
    v_verified_fees_collected_paise BIGINT := 0;
    v_total_outstanding_paise BIGINT := 0;
    v_total_advance_credit_paise BIGINT := 0;
    v_pending_settlement_count BIGINT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT COUNT(*) INTO v_total_merchants FROM public.shops;

    -- Completed orders & GMV within filter range
    SELECT
        COUNT(*),
        COUNT(DISTINCT shop_id),
        COALESCE(pg_catalog.round(SUM(COALESCE(total_estimate, 0) * 100)), 0)::BIGINT
    INTO v_total_completed_orders, v_merchants_with_orders, v_total_gmv_paise
    FROM public.requests
    WHERE current_state = 'COMPLETED'
      AND (p_start_date IS NULL OR updated_at >= p_start_date)
      AND (p_end_date IS NULL OR updated_at <= p_end_date);

    -- Ledger totals including adjustments in 64-bit BIGINT
    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'fee_assessed' THEN amount_paise::BIGINT ELSE 0::BIGINT END), 0::BIGINT),
        COALESCE(SUM(CASE WHEN entry_type = 'fee_reversed' THEN pg_catalog.abs(amount_paise::BIGINT) ELSE 0::BIGINT END), 0::BIGINT),
        COALESCE(SUM(CASE WHEN entry_type = 'adjustment' THEN amount_paise::BIGINT ELSE 0::BIGINT END), 0::BIGINT)
    INTO v_total_fees_assessed_paise, v_total_fees_reversed_paise, v_total_adjustments_paise
    FROM public.platform_fee_ledger
    WHERE (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    v_net_fees_owed_paise := v_total_fees_assessed_paise - v_total_fees_reversed_paise + v_total_adjustments_paise;

    -- Verified collections by Vaangly
    SELECT
        COALESCE(SUM(verified_amount_paise::BIGINT), 0::BIGINT)
    INTO v_verified_fees_collected_paise
    FROM public.merchant_settlements
    WHERE verification_status = 'verified'
      AND (p_start_date IS NULL OR verified_at >= p_start_date)
      AND (p_end_date IS NULL OR verified_at <= p_end_date);

    -- Cumulative outstanding balances across all merchants
    WITH merchant_ledger_totals AS (
        SELECT
            shop_id,
            COALESCE(SUM(amount_paise::BIGINT), 0::BIGINT) AS net_ledger_paise
        FROM public.platform_fee_ledger
        GROUP BY shop_id
    ),
    merchant_settled_totals AS (
        SELECT
            shop_id,
            COALESCE(SUM(verified_amount_paise::BIGINT), 0::BIGINT) AS net_settled_paise
        FROM public.merchant_settlements
        WHERE verification_status = 'verified'
        GROUP BY shop_id
    ),
    merchant_balances AS (
        SELECT
            s.id AS shop_id,
            GREATEST(0::BIGINT, COALESCE(l.net_ledger_paise, 0::BIGINT) - COALESCE(st.net_settled_paise, 0::BIGINT)) AS balance_paise,
            GREATEST(0::BIGINT, COALESCE(st.net_settled_paise, 0::BIGINT) - COALESCE(l.net_ledger_paise, 0::BIGINT)) AS credit_paise
        FROM public.shops s
        LEFT JOIN merchant_ledger_totals l ON l.shop_id = s.id
        LEFT JOIN merchant_settled_totals st ON st.shop_id = s.id
    )
    SELECT
        COALESCE(SUM(balance_paise), 0::BIGINT),
        COALESCE(SUM(credit_paise), 0::BIGINT),
        COUNT(*) FILTER (WHERE balance_paise > 0),
        COUNT(*) FILTER (WHERE balance_paise = 0 AND s.id IN (SELECT shop_id FROM merchant_ledger_totals WHERE net_ledger_paise > 0))
    INTO v_total_outstanding_paise, v_total_advance_credit_paise, v_merchants_with_outstanding, v_fully_settled_merchants
    FROM merchant_balances mb
    JOIN public.shops s ON s.id = mb.shop_id;

    -- Count pending settlements
    SELECT COUNT(*) INTO v_pending_settlement_count
    FROM public.merchant_settlements
    WHERE verification_status IN ('submitted', 'under_review');

    -- Count overdue merchants:
    -- A merchant is overdue ONLY IF:
    -- 1. They have an actual positive balance_paise > 0
    -- 2. Their oldest unpaid net order liability was created > 7 days ago
    WITH merchant_ledger_totals AS (
        SELECT
            shop_id,
            COALESCE(SUM(amount_paise::BIGINT), 0::BIGINT) AS net_ledger_paise
        FROM public.platform_fee_ledger
        GROUP BY shop_id
    ),
    merchant_settled_totals AS (
        SELECT
            shop_id,
            COALESCE(SUM(verified_amount_paise::BIGINT), 0::BIGINT) AS net_settled_paise
        FROM public.merchant_settlements
        WHERE verification_status = 'verified'
        GROUP BY shop_id
    ),
    overdue_candidates AS (
        SELECT
            s.id AS shop_id,
            COALESCE(st.net_settled_paise, 0::BIGINT) AS settled_paise
        FROM public.shops s
        JOIN merchant_ledger_totals l ON l.shop_id = s.id
        LEFT JOIN merchant_settled_totals st ON st.shop_id = s.id
        WHERE GREATEST(0::BIGINT, l.net_ledger_paise - COALESCE(st.net_settled_paise, 0::BIGINT)) > 0
    ),
    merchant_order_nets AS (
        SELECT
            l.shop_id,
            l.request_id,
            MIN(l.created_at) AS order_created_at,
            SUM(l.amount_paise::BIGINT) AS net_order_fee_paise
        FROM public.platform_fee_ledger l
        JOIN overdue_candidates oc ON oc.shop_id = l.shop_id
        WHERE l.request_id IS NOT NULL
        GROUP BY l.shop_id, l.request_id
        HAVING SUM(l.amount_paise::BIGINT) > 0
    ),
    merchant_cumulative AS (
        SELECT
            mon.shop_id,
            mon.order_created_at,
            SUM(mon.net_order_fee_paise) OVER (PARTITION BY mon.shop_id ORDER BY mon.order_created_at ASC) AS running_total_paise,
            oc.settled_paise
        FROM merchant_order_nets mon
        JOIN overdue_candidates oc ON oc.shop_id = mon.shop_id
    )
    SELECT COUNT(DISTINCT shop_id) INTO v_overdue_merchants
    FROM merchant_cumulative
    WHERE running_total_paise > settled_paise
      AND order_created_at < (NOW() - INTERVAL '7 days');

    RETURN jsonb_build_object(
        'success', true,
        'total_merchants', v_total_merchants,
        'merchants_with_orders', v_merchants_with_orders,
        'merchants_with_outstanding', v_merchants_with_outstanding,
        'fully_settled_merchants', v_fully_settled_merchants,
        'overdue_merchants', v_overdue_merchants,
        'total_completed_orders', v_total_completed_orders,
        'total_gmv_paise', v_total_gmv_paise,
        'total_fees_assessed_paise', v_total_fees_assessed_paise,
        'total_fees_reversed_paise', v_total_fees_reversed_paise,
        'total_adjustments_paise', v_total_adjustments_paise,
        'net_fees_owed_paise', v_net_fees_owed_paise,
        'verified_fees_collected_paise', v_verified_fees_collected_paise,
        'total_outstanding_paise', v_total_outstanding_paise,
        'total_advance_credit_paise', v_total_advance_credit_paise,
        'pending_settlement_count', v_pending_settlement_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_financial_kpis(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_financial_kpis(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- 8. Update get_merchant_financial_summary() with hardened search_path, 64-bit BIGINT precision,
-- explicit revokes, identifiable advance credits, and FIFO cumulative overdue tracking.
CREATE OR REPLACE FUNCTION public.get_merchant_financial_summary(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_shop RECORD;
    v_is_admin BOOLEAN;
    v_is_owner BOOLEAN;
    v_completed_count BIGINT := 0;
    v_gmv_paise BIGINT := 0;
    v_assessed_paise BIGINT := 0;
    v_reversed_paise BIGINT := 0;
    v_adjustments_paise BIGINT := 0;
    v_net_fees_paise BIGINT := 0;
    v_verified_settled_paise BIGINT := 0;
    v_pending_settlement_paise BIGINT := 0;
    v_outstanding_paise BIGINT := 0;
    v_advance_credit_paise BIGINT := 0;
    v_oldest_unpaid_at TIMESTAMPTZ := NULL;
    v_days_overdue INTEGER := 0;
BEGIN
    SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shop not found.');
    END IF;

    v_is_admin := public.is_admin();
    v_is_owner := (v_shop.owner_id = auth.uid());
    IF NOT (v_is_admin OR v_is_owner) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Aggregate completed orders & GMV
    SELECT
        COUNT(*),
        COALESCE(pg_catalog.round(SUM(COALESCE(total_estimate, 0) * 100)), 0)::BIGINT
    INTO v_completed_count, v_gmv_paise
    FROM public.requests
    WHERE shop_id = p_shop_id AND current_state = 'COMPLETED';

    -- Aggregate ledger liabilities including adjustments in 64-bit BIGINT
    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'fee_assessed' THEN amount_paise::BIGINT ELSE 0::BIGINT END), 0::BIGINT),
        COALESCE(SUM(CASE WHEN entry_type = 'fee_reversed' THEN pg_catalog.abs(amount_paise::BIGINT) ELSE 0::BIGINT END), 0::BIGINT),
        COALESCE(SUM(CASE WHEN entry_type = 'adjustment' THEN amount_paise::BIGINT ELSE 0::BIGINT END), 0::BIGINT)
    INTO v_assessed_paise, v_reversed_paise, v_adjustments_paise
    FROM public.platform_fee_ledger
    WHERE shop_id = p_shop_id;

    v_net_fees_paise := v_assessed_paise - v_reversed_paise + v_adjustments_paise;

    -- Aggregate verified settlement payments
    SELECT
        COALESCE(SUM(verified_amount_paise::BIGINT), 0::BIGINT)
    INTO v_verified_settled_paise
    FROM public.merchant_settlements
    WHERE shop_id = p_shop_id AND verification_status = 'verified';

    -- Aggregate pending settlement submissions
    SELECT
        COALESCE(SUM(amount_paise::BIGINT), 0::BIGINT)
    INTO v_pending_settlement_paise
    FROM public.merchant_settlements
    WHERE shop_id = p_shop_id AND verification_status IN ('submitted', 'under_review');

    -- Derive outstanding liability balance and identifiable advance credit
    v_outstanding_paise := GREATEST(0::BIGINT, v_net_fees_paise - v_verified_settled_paise);
    v_advance_credit_paise := GREATEST(0::BIGINT, v_verified_settled_paise - v_net_fees_paise);

    -- Oldest unpaid liability calculation:
    -- Only active if there is an actual positive outstanding balance.
    -- If balance is 0 or covered by advance credit, oldest_unpaid_at is NULL and days_overdue is 0.
    IF v_outstanding_paise > 0 THEN
        WITH order_net_liabilities AS (
            SELECT
                request_id,
                MIN(created_at) AS order_created_at,
                SUM(amount_paise::BIGINT) AS net_order_fee_paise
            FROM public.platform_fee_ledger
            WHERE shop_id = p_shop_id AND request_id IS NOT NULL
            GROUP BY request_id
            HAVING SUM(amount_paise::BIGINT) > 0
        ),
        cumulative_orders AS (
            SELECT
                request_id,
                order_created_at,
                net_order_fee_paise,
                SUM(net_order_fee_paise) OVER (ORDER BY order_created_at ASC) AS running_total_paise
            FROM order_net_liabilities
        )
        SELECT MIN(order_created_at)
        INTO v_oldest_unpaid_at
        FROM cumulative_orders
        WHERE running_total_paise > v_verified_settled_paise;

        IF v_oldest_unpaid_at IS NOT NULL THEN
            v_days_overdue := GREATEST(0, EXTRACT(DAY FROM (NOW() - v_oldest_unpaid_at))::INTEGER);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', p_shop_id,
        'shop_name', v_shop.name,
        'financial_status', v_shop.financial_status,
        'total_completed_orders', v_completed_count,
        'gmv_paise', v_gmv_paise,
        'total_fees_assessed_paise', v_assessed_paise,
        'total_fees_reversed_paise', v_reversed_paise,
        'total_adjustments_paise', v_adjustments_paise,
        'net_fees_owed_paise', v_net_fees_paise,
        'total_verified_settled_paise', v_verified_settled_paise,
        'pending_settlement_paise', v_pending_settlement_paise,
        'outstanding_balance_paise', v_outstanding_paise,
        'advance_credit_paise', v_advance_credit_paise,
        'excess_settlement_credit_paise', v_advance_credit_paise,
        'oldest_unpaid_at', v_oldest_unpaid_at,
        'days_overdue', v_days_overdue
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_merchant_financial_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_merchant_financial_summary(UUID) TO authenticated, service_role;

-- 9. Update verify_merchant_settlement() with hardened search_path, explicit revokes,
-- and allocation against effective net liabilities (accounting for order adjustments).
CREATE OR REPLACE FUNCTION public.verify_merchant_settlement(
    p_settlement_id UUID,
    p_action TEXT, -- 'verify' or 'reject'
    p_verified_amount_paise INTEGER DEFAULT 0,
    p_rejection_reason TEXT DEFAULT NULL,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_st RECORD;
    v_unallocated_amount BIGINT := 0;
    v_entry RECORD;
    v_allocate_chunk BIGINT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    p_admin_id := COALESCE(auth.uid(), p_admin_id);

    SELECT * INTO v_st FROM public.merchant_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Settlement record not found.');
    END IF;

    IF v_st.verification_status NOT IN ('submitted', 'under_review') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Settlement is already verified or rejected.');
    END IF;

    IF p_action = 'reject' THEN
        UPDATE public.merchant_settlements
        SET
            verification_status = 'rejected',
            rejection_reason = COALESCE(p_rejection_reason, 'Settlement verification rejected by admin.'),
            verified_by = p_admin_id,
            verified_at = NOW(),
            updated_at = NOW()
        WHERE id = p_settlement_id;

        INSERT INTO public.financial_audit_logs (
            admin_id, action, target_entity, target_id, previous_state, new_state, reason
        )
        VALUES (
            p_admin_id, 'REJECT_SETTLEMENT', 'merchant_settlements', p_settlement_id,
            to_jsonb(v_st), jsonb_build_object('status', 'rejected', 'reason', p_rejection_reason),
            COALESCE(p_rejection_reason, 'Admin rejected settlement submission.')
        );

        RETURN jsonb_build_object('success', true, 'status', 'rejected');
    ELSIF p_action = 'verify' THEN
        IF p_verified_amount_paise IS NULL OR p_verified_amount_paise <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'A positive verified amount in paise is required.');
        END IF;

        IF p_verified_amount_paise > v_st.amount_paise THEN
            -- Administrator is verifying an amount exceeding merchant's submitted amount.
            -- Explicit documentation required to prevent accidental typos or unintended over-allocation.
            IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) < 5 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Verified amount (' || p_verified_amount_paise || ' paise) exceeds submitted settlement amount (' || v_st.amount_paise || ' paise). An explicit explanation in p_rejection_reason is required for upward adjustment.'
                );
            END IF;
        END IF;

        UPDATE public.merchant_settlements
        SET
            verification_status = 'verified',
            verified_amount_paise = p_verified_amount_paise,
            verified_by = p_admin_id,
            verified_at = NOW(),
            updated_at = NOW()
        WHERE id = p_settlement_id;

        -- Lock shop row to serialize concurrent settlement allocations for this shop
        PERFORM 1 FROM public.shops WHERE id = v_st.shop_id FOR UPDATE;

        -- Allocate against unallocated net liabilities FIFO (excluding reversed orders and factoring in adjustments)
        v_unallocated_amount := p_verified_amount_paise::BIGINT;

        FOR v_entry IN
            WITH order_adjustments AS (
                SELECT request_id, COALESCE(SUM(amount_paise::BIGINT), 0::BIGINT) AS total_adj
                FROM public.platform_fee_ledger
                WHERE shop_id = v_st.shop_id AND entry_type = 'adjustment' AND request_id IS NOT NULL
                GROUP BY request_id
            )
            SELECT
                l.id,
                GREATEST(0::BIGINT, l.amount_paise::BIGINT + COALESCE(oa.total_adj, 0::BIGINT)) AS effective_liability_paise,
                COALESCE(SUM(sa.allocated_amount_paise::BIGINT), 0::BIGINT) AS total_allocated
            FROM public.platform_fee_ledger l
            LEFT JOIN order_adjustments oa ON oa.request_id = l.request_id
            LEFT JOIN public.settlement_allocations sa ON sa.ledger_entry_id = l.id
            WHERE l.shop_id = v_st.shop_id
              AND l.entry_type = 'fee_assessed'
              AND NOT EXISTS (
                  SELECT 1 FROM public.platform_fee_ledger rev
                  WHERE rev.shop_id = l.shop_id
                    AND rev.request_id = l.request_id
                    AND rev.entry_type = 'fee_reversed'
              )
            GROUP BY l.id, l.amount_paise, oa.total_adj, l.created_at
            HAVING GREATEST(0::BIGINT, l.amount_paise::BIGINT + COALESCE(oa.total_adj, 0::BIGINT)) > COALESCE(SUM(sa.allocated_amount_paise::BIGINT), 0::BIGINT)
            ORDER BY l.created_at ASC
        LOOP
            EXIT WHEN v_unallocated_amount <= 0;
            v_allocate_chunk := LEAST(v_unallocated_amount, v_entry.effective_liability_paise - v_entry.total_allocated);

            IF v_allocate_chunk > 0 THEN
                INSERT INTO public.settlement_allocations (
                    settlement_id, shop_id, ledger_entry_id, allocated_amount_paise, allocated_by
                )
                VALUES (
                    p_settlement_id, v_st.shop_id, v_entry.id, v_allocate_chunk::INTEGER, p_admin_id
                )
                ON CONFLICT (settlement_id, ledger_entry_id) DO NOTHING;

                v_unallocated_amount := v_unallocated_amount - v_allocate_chunk;
            END IF;
        END LOOP;

        INSERT INTO public.financial_audit_logs (
            admin_id, action, target_entity, target_id, previous_state, new_state, reason
        )
        VALUES (
            p_admin_id, 'VERIFY_SETTLEMENT', 'merchant_settlements', p_settlement_id,
            to_jsonb(v_st), jsonb_build_object('status', 'verified', 'verified_amount_paise', p_verified_amount_paise),
            'Admin verified merchant settlement remittance.'
        );

        RETURN jsonb_build_object('success', true, 'status', 'verified', 'unallocated_advance_paise', v_unallocated_amount);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be verify or reject.');
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_merchant_settlement(UUID, TEXT, INTEGER, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_merchant_settlement(UUID, TEXT, INTEGER, TEXT, UUID) TO authenticated, service_role;

-- 10. Update complete_order_and_assess_fee to use idempotency_key for safe append-only ledger conflict handling,
-- hardened search_path = pg_catalog, public, extensions, pg_temp, authoritative actor verification,
-- durable attempt tracking, and authoritative fallback fee basis strictly on net merchandise (subtotal - discounts).
CREATE OR REPLACE FUNCTION public.complete_order_and_assess_fee(
    p_request_id UUID,
    p_pickup_code TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_actor_id UUID DEFAULT NULL,
    p_override_without_code BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_shop RECORD;
    v_input_hash TEXT;
    v_expected_hash TEXT;
    v_pepper TEXT;
    v_fee_basis_paise BIGINT;
    v_fee_paise BIGINT;
    v_ledger_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_is_owner BOOLEAN := FALSE;
    v_verified_actor_id UUID;
    v_actor_role TEXT;
    v_fee_system_enabled BOOLEAN := FALSE;
    v_activation_time TIMESTAMPTZ;
BEGIN
    -- 1. Fetch request and associated shop
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
    END IF;

    SELECT * INTO v_shop FROM public.shops WHERE id = v_req.shop_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shop not found.');
    END IF;

    -- 2. Determine authoritative actor identity and permissions
    IF auth.uid() IS NOT NULL THEN
        -- Strictly derive actor from authenticated session (caller-supplied p_actor_id is ignored to prevent spoofing)
        v_verified_actor_id := auth.uid();
        v_is_admin := public.is_admin();
        v_is_owner := (v_shop.owner_id = auth.uid());
        IF NOT (v_is_admin OR v_is_owner) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You cannot complete orders for this shop.');
        END IF;
        v_actor_role := CASE WHEN v_is_admin THEN 'admin' ELSE 'shopkeeper' END;
    ELSE
        -- Service-role or internal backend execution
        IF current_user IN ('service_role', 'postgres') THEN
            -- Strictly record a defined system/service actor without impersonating an arbitrary human user
            v_verified_actor_id := NULL;
            v_is_admin := TRUE;
            v_actor_role := 'system';
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Missing authenticated session.');
        END IF;
    END IF;

    -- 3. State check: order must not already be COMPLETED, CANCELLED, or REJECTED
    IF v_req.current_state = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', true, 'already_completed', true, 'message', 'Order is already marked completed.');
    END IF;

    IF v_req.current_state IN ('CANCELLED', 'REJECTED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a cancelled or rejected order.');
    END IF;

    -- 4. Pickup code verification (unless explicitly overridden by admin or legacy orders without code)
    IF v_req.pickup_code_hash IS NOT NULL AND NOT (p_override_without_code AND v_is_admin) THEN
        IF v_req.pickup_code_hash = 'USED' THEN
            RETURN jsonb_build_object('success', false, 'error', 'This pickup code has already been used.');
        END IF;

        IF v_req.pickup_code_attempts >= 5 OR v_req.pickup_code_total_attempts >= 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Maximum pickup code attempts exceeded. Verification is permanently locked.');
        END IF;

        IF v_req.pickup_code_expires_at IS NOT NULL AND pg_catalog.clock_timestamp() > v_req.pickup_code_expires_at THEN
            RETURN jsonb_build_object('success', false, 'error', 'Pickup verification code has expired.');
        END IF;

        IF p_pickup_code IS NULL OR trim(p_pickup_code) = '' THEN
            RETURN jsonb_build_object('success', false, 'error', '6-digit customer pickup verification code is required.');
        END IF;

        -- Versioned hash verification:
        -- v2$: Keyed HMAC-SHA256 using server pepper (immune to offline brute-force dictionary attacks)
        -- legacy: Salted SHA-256 for backward compatibility with pre-existing uncompleted orders
        IF v_req.pickup_code_hash LIKE 'v2$%' THEN
            SELECT value INTO v_pepper
            FROM public.platform_secrets
            WHERE key = 'pickup_code_pepper';

            IF v_pepper IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Platform secret pickup_code_pepper is not configured.');
            END IF;

            v_input_hash := 'v2$' || encode(extensions.hmac(trim(p_pickup_code) || ':' || v_req.pickup_code_salt, v_pepper, 'sha256'), 'hex');
        ELSE
            v_input_hash := encode(extensions.digest(trim(p_pickup_code) || v_req.pickup_code_salt, 'sha256'), 'hex');
        END IF;

        -- Constant-time comparison using fixed-length digest comparison to prevent timing side-channels
        IF extensions.digest(v_input_hash, 'sha256') <> extensions.digest(v_req.pickup_code_hash, 'sha256') THEN
            UPDATE public.requests
            SET
                pickup_code_attempts = pickup_code_attempts + 1,
                pickup_code_total_attempts = pickup_code_total_attempts + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = p_request_id;
            RETURN jsonb_build_object('success', false, 'error', 'Invalid pickup verification code. Please check with customer.');
        END IF;
    END IF;

    -- 5. Calculate customer-paid platform fee
    -- Explicitly restrict platform fee calculation to ORDER workflows only.
    -- Appointments, service requests, bookings, and other non-order workflows are permanently fee-free (0 paise).
    IF v_req.workflow_group_code = 'ORDER' THEN
        SELECT
            COALESCE((value->>'is_enabled')::BOOLEAN, FALSE),
            (value->>'activated_at')::TIMESTAMPTZ
        INTO v_fee_system_enabled, v_activation_time
        FROM public.platform_settings
        WHERE key = 'platform_fee_system';

        -- If fee system is active AND order was created on or after exact activation timestamp, assess fee.
        -- All orders created prior to activation time are permanently fee-free (0 paise).
        IF v_fee_system_enabled IS TRUE AND v_activation_time IS NOT NULL AND v_req.created_at >= v_activation_time THEN
            v_fee_paise := COALESCE(v_req.platform_fee_paise, 0)::BIGINT;
            IF v_fee_paise <= 0 THEN
                -- Authoritative fallback fee basis: fee_basis_paise = subtotal_paise - discount_total_paise
                -- Delivery fees and the platform fee itself are strictly excluded from the fee basis.
                IF v_req.subtotal IS NULL OR v_req.subtotal < 0 THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Invalid or missing subtotal for platform fee calculation.');
                END IF;
                v_fee_basis_paise := GREATEST(0::BIGINT, pg_catalog.round(v_req.subtotal * 100)::BIGINT - pg_catalog.round(COALESCE(v_req.discount_total, 0) * 100)::BIGINT);
                IF v_fee_basis_paise > 2147483647 THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Order fee basis exceeds integer limit.');
                END IF;
                -- Calculate platform fee (force_calculation = true because system is enabled and created_at >= activation_time)
                v_fee_paise := public.calculate_platform_fee(v_fee_basis_paise::INTEGER, TRUE)::BIGINT;
            END IF;
        ELSE
            v_fee_paise := 0;
        END IF;
    ELSE
        v_fee_paise := 0;
    END IF;

    -- 6. Transition order to COMPLETED and update pickup/payment verification metadata
    UPDATE public.requests
    SET
        current_state = 'COMPLETED',
        customer_paid = TRUE,
        payment_status = 'paid',
        pickup_code_hash = 'USED',
        pickup_code_nonce = NULL,
        pickup_verified_at = CURRENT_TIMESTAMP,
        pickup_verified_by = v_verified_actor_id,
        merchant_payment_confirmed_at = CURRENT_TIMESTAMP,
        merchant_payment_confirmed_by = v_verified_actor_id,
        merchant_payment_reported_method = COALESCE(p_payment_method, v_req.payment_method, 'cash'),
        platform_fee_paise = v_fee_paise::INTEGER,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_request_id;

    -- 7. Insert append-only fee assessment into platform_fee_ledger
    IF v_fee_paise > 0 THEN
        INSERT INTO public.platform_fee_ledger (
            shop_id,
            request_id,
            entry_type,
            amount_paise,
            currency,
            idempotency_key,
            notes,
            actor_id,
            actor_role
        )
        VALUES (
            v_req.shop_id,
            p_request_id,
            'fee_assessed',
            v_fee_paise::INTEGER,
            'INR',
            'fee_assessed_' || p_request_id::TEXT,
            'Platform fee assessed upon counter completion of order #' || v_req.reference_code,
            v_verified_actor_id,
            v_actor_role
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_ledger_id;
    END IF;

    -- 8. Audit event in request_events
    INSERT INTO public.request_events (
        request_id,
        from_state,
        to_state,
        actor_id,
        actor_role,
        notes
    )
    VALUES (
        p_request_id,
        v_req.current_state,
        'COMPLETED',
        v_verified_actor_id,
        v_actor_role,
        'Order collected and payment confirmed (' || COALESCE(p_payment_method, 'counter') || '). Platform fee assessed: ₹' || (v_fee_paise::NUMERIC / 100.0)::TEXT
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'completed_at', CURRENT_TIMESTAMP,
        'total_amount', v_req.total_amount,
        'platform_fee_paise', v_fee_paise
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_order_and_assess_fee(UUID, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_order_and_assess_fee(UUID, TEXT, TEXT, UUID, BOOLEAN) TO authenticated, service_role;

-- 11. Update record_order_fee_reversal to use idempotency_key for safe append-only ledger conflict handling,
-- hardened search_path = pg_catalog, public, pg_temp, and authoritative actor identity.
CREATE OR REPLACE FUNCTION public.record_order_fee_reversal(
    p_request_id UUID,
    p_reason TEXT,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_net_liability_paise BIGINT := 0;
    v_reversal_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_verified_actor_id UUID;
    v_actor_role TEXT;
BEGIN
    -- 1. Lock target request row and associated shop row to serialize concurrent reversals, corrections, and settlements
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
    END IF;

    PERFORM 1 FROM public.shops WHERE id = v_req.shop_id FOR UPDATE;

    -- Determine authoritative actor identity
    IF auth.uid() IS NOT NULL THEN
        -- Strictly derive actor from authenticated session (caller-supplied p_actor_id is ignored to prevent spoofing)
        v_verified_actor_id := auth.uid();
        v_is_admin := public.is_admin();
        IF v_is_admin THEN
            v_actor_role := 'admin';
        ELSIF EXISTS (SELECT 1 FROM public.shops WHERE id = v_req.shop_id AND owner_id = auth.uid()) THEN
            v_actor_role := 'shopkeeper';
        ELSIF v_req.customer_id = auth.uid() AND v_req.current_state IN ('CANCELLED', 'REJECTED') THEN
            v_actor_role := 'customer';
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You cannot reverse fees for this order.');
        END IF;
    ELSE
        -- Service-role or internal backend execution
        IF current_user IN ('service_role', 'postgres') THEN
            -- Strictly record a defined system/service actor without impersonating an arbitrary human user
            v_verified_actor_id := NULL;
            v_is_admin := TRUE;
            v_actor_role := 'system';
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Missing authenticated session.');
        END IF;
    END IF;

    -- Guard against duplicate fee reversals
    IF EXISTS (
        SELECT 1 FROM public.platform_fee_ledger
        WHERE request_id = p_request_id AND entry_type = 'fee_reversed'
    ) THEN
        RETURN jsonb_build_object('success', true, 'already_reversed', true, 'message', 'Fee reversal has already been recorded for this order.');
    END IF;

    -- Calculate current net fee liability on this request from append-only ledger (accounting for initial fee and any adjustments)
    SELECT COALESCE(SUM(amount_paise::BIGINT), 0::BIGINT) INTO v_net_liability_paise
    FROM public.platform_fee_ledger
    WHERE request_id = p_request_id;

    IF v_net_liability_paise <= 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'No positive fee liability exists for this order; reversal not needed.');
    END IF;

    IF v_net_liability_paise > 2147483647 THEN
        RAISE EXCEPTION 'Net fee liability exceeds maximum integer limit for ledger recording (% paise)', v_net_liability_paise;
    END IF;

    -- Insert compensating negative entry matching exact outstanding net liability
    INSERT INTO public.platform_fee_ledger (
        shop_id,
        request_id,
        entry_type,
        amount_paise,
        currency,
        idempotency_key,
        notes,
        actor_id,
        actor_role
    )
    VALUES (
        v_req.shop_id,
        p_request_id,
        'fee_reversed',
        (-v_net_liability_paise)::INTEGER,
        'INR',
        'fee_reversed_' || p_request_id::TEXT,
        COALESCE(p_reason, 'Order refund fee reversal'),
        v_verified_actor_id,
        v_actor_role
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_reversal_id;

    RETURN jsonb_build_object('success', true, 'reversal_id', v_reversal_id, 'reversed_paise', v_net_liability_paise);
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_fee_reversal(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_order_fee_reversal(UUID, TEXT, UUID) TO authenticated, service_role;

-- 12. Harden activate_platform_fee_system with search_path = pg_catalog, public, pg_temp,
-- authoritative auth.uid(), and explicit revokes/grants.
CREATE OR REPLACE FUNCTION public.activate_platform_fee_system()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_admin UUID;
    v_prev_config JSONB;
BEGIN
    v_admin := auth.uid();
    IF v_admin IS NULL OR NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only platform admin can activate fee system.');
    END IF;

    -- Fetch current state
    SELECT value INTO v_prev_config FROM public.platform_settings WHERE key = 'platform_fee_system';

    -- Guard against silent rewriting if already active
    IF COALESCE((v_prev_config->>'is_enabled')::BOOLEAN, FALSE) IS TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_enabled', true,
            'already_active', true,
            'activated_at', (v_prev_config->>'activated_at')::TIMESTAMPTZ,
            'message', 'Platform fee system is already active. Original activation timestamp preserved.'
        );
    END IF;

    -- 1. Update platform_settings with exact activation timestamp
    INSERT INTO public.platform_settings (key, value, description, updated_by, updated_at)
    VALUES (
        'platform_fee_system',
        jsonb_build_object(
            'is_enabled', true,
            'activated_at', v_now,
            'activated_by', v_admin,
            'version', 'v1.0'
        ),
        'Master activation switch and timestamp for customer platform fee assessment',
        v_admin,
        v_now
    )
    ON CONFLICT (key) DO UPDATE
    SET
        value = jsonb_build_object(
            'is_enabled', true,
            'activated_at', COALESCE((public.platform_settings.value->>'activated_at')::TIMESTAMPTZ, v_now),
            'activated_by', v_admin,
            'version', 'v1.0'
        ),
        updated_by = v_admin,
        updated_at = v_now;

    -- 2. Activate fee rules in platform_fee_rules
    UPDATE public.platform_fee_rules
    SET is_active = TRUE, effective_from = v_now
    WHERE rule_version = 'v1.0';

    -- 3. Record in financial_audit_logs
    INSERT INTO public.financial_audit_logs (
        admin_id, action, target_entity, target_id, previous_state, new_state, reason
    )
    VALUES (
        v_admin, 'ACTIVATE_PLATFORM_FEE_SYSTEM', 'platform_settings', gen_random_uuid(),
        COALESCE(v_prev_config, jsonb_build_object('is_enabled', false)),
        jsonb_build_object('is_enabled', true, 'activated_at', v_now),
        'Admin activated customer-paid platform fee engine after post-deployment smoke tests.'
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_enabled', true,
        'activated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_platform_fee_system() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_platform_fee_system() TO authenticated, service_role;

-- 13. Harden generate_order_pickup_code with CSPRNG nonce, zero modulo bias,
-- server-side keyed HMAC (v2$) resistant to offline dictionary brute force,
-- 30s rate limiting, and attempt-locking preservation.
CREATE OR REPLACE FUNCTION public.generate_order_pickup_code(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_nonce TEXT;
    v_salt TEXT;
    v_code TEXT;
    v_hash TEXT;
    v_pepper TEXT;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- Authorization: only owning customer or admin
    IF NOT (v_req.customer_id = auth.uid() OR public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Only the customer who placed this order can generate the pickup code.';
    END IF;

    -- Only orders (not appointments, bookings, NULL workflows, etc.)
    IF COALESCE(v_req.workflow_group_code, '') <> 'ORDER' THEN
        RAISE EXCEPTION 'Pickup codes are only applicable to retail orders.';
    END IF;

    -- Inactive state rejection
    IF v_req.current_state IN ('COMPLETED', 'CANCELLED', 'REJECTED') THEN
        RAISE EXCEPTION 'Cannot generate pickup code for an inactive or completed order.';
    END IF;

    -- Locked if 5 failed attempts reached
    IF v_req.pickup_code_attempts >= 5 OR v_req.pickup_code_total_attempts >= 5 THEN
        RAISE EXCEPTION 'Pickup code verification is permanently locked after maximum failed attempts.';
    END IF;

    -- 30-second cooldown on regeneration
    IF v_req.pickup_code_regenerated_at IS NOT NULL AND v_now < (v_req.pickup_code_regenerated_at + INTERVAL '30 seconds') THEN
        RAISE EXCEPTION 'Rate limit exceeded: Please wait at least 30 seconds before regenerating pickup code.';
    END IF;

    SELECT value INTO v_pepper
    FROM public.platform_secrets
    WHERE key = 'pickup_code_pepper';

    IF v_pepper IS NULL THEN
        RAISE EXCEPTION 'Platform secret pickup_code_pepper is not configured.';
    END IF;

    -- Generate cryptographically random nonce and salt (16 bytes = 32 hex chars)
    v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
    v_salt := encode(extensions.gen_random_bytes(16), 'hex');

    -- Derive 6-digit uniform code with zero modulo bias via CSPRNG PRF
    v_code := public.derive_pickup_code(p_request_id, v_nonce);

    -- Store ONLY the keyed HMAC hash (v2$) using server pepper. Plaintext code is NEVER written to the database!
    v_hash := 'v2$' || encode(extensions.hmac(v_code || ':' || v_salt, v_pepper, 'sha256'), 'hex');

    UPDATE public.requests
    SET
        pickup_code_nonce = v_nonce,
        pickup_code_salt = v_salt,
        pickup_code_hash = v_hash,
        pickup_code_generated_at = v_now,
        pickup_code_regenerated_at = v_now,
        pickup_code_expires_at = v_now + INTERVAL '72 hours',
        -- CRITICAL: Repeated regeneration must NEVER reset pickup_code_attempts or pickup_code_total_attempts!
        updated_at = v_now
    WHERE id = p_request_id;

    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_order_pickup_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_order_pickup_code(UUID) TO authenticated, service_role;

-- 14. Harden get_order_pickup_code with non-resetting retrieval, CSPRNG derivation, attempt protection,
-- and dual-format integrity verification (v2$ keyed HMAC with fallback to v1 SHA-256).
CREATE OR REPLACE FUNCTION public.get_order_pickup_code(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_code TEXT;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_nonce TEXT;
    v_salt TEXT;
    v_hash TEXT;
    v_pepper TEXT;
    v_expected_hash TEXT;
BEGIN
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Strict customer/admin authorization: merchants can NEVER retrieve pickup code!
    IF NOT (v_req.customer_id = auth.uid() OR public.is_admin()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only the customer who placed this order can view the pickup code.');
    END IF;

    IF v_req.current_state IN ('COMPLETED', 'CANCELLED', 'REJECTED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is no longer active.');
    END IF;

    -- Locked if 5 failed attempts reached
    IF v_req.pickup_code_attempts >= 5 OR v_req.pickup_code_total_attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maximum pickup code attempts exceeded. Code is locked.');
    END IF;

    -- Expired check
    IF v_req.pickup_code_expires_at IS NOT NULL AND v_now > v_req.pickup_code_expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pickup verification code has expired.');
    END IF;

    SELECT value INTO v_pepper
    FROM public.platform_secrets
    WHERE key = 'pickup_code_pepper';

    IF v_pepper IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Platform secret pickup_code_pepper is not configured.');
    END IF;

    -- If no code exists yet, generate on the fly with v2$ keyed HMAC
    IF v_req.pickup_code_hash IS NULL OR v_req.pickup_code_nonce IS NULL THEN
        v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
        v_salt := encode(extensions.gen_random_bytes(16), 'hex');
        v_code := public.derive_pickup_code(p_request_id, v_nonce);
        v_hash := 'v2$' || encode(extensions.hmac(v_code || ':' || v_salt, v_pepper, 'sha256'), 'hex');

        UPDATE public.requests
        SET
            pickup_code_nonce = v_nonce,
            pickup_code_salt = v_salt,
            pickup_code_hash = v_hash,
            pickup_code_generated_at = v_now,
            pickup_code_expires_at = v_now + INTERVAL '72 hours',
            updated_at = v_now
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'pickup_code', v_code,
            'expires_at', v_now + INTERVAL '72 hours'
        );
    END IF;

    -- Re-derive code from nonce (never stored in plaintext)
    v_code := public.derive_pickup_code(p_request_id, v_req.pickup_code_nonce);

    -- Verify integrity against stored hash (supporting both v2$ HMAC and legacy v1 SHA-256)
    IF v_req.pickup_code_hash LIKE 'v2$%' THEN
        v_expected_hash := 'v2$' || encode(extensions.hmac(v_code || ':' || v_req.pickup_code_salt, v_pepper, 'sha256'), 'hex');
    ELSE
        v_expected_hash := encode(extensions.digest(v_code || v_req.pickup_code_salt, 'sha256'), 'hex');
    END IF;

    -- Constant-time comparison using fixed-length digest comparison
    IF extensions.digest(v_expected_hash, 'sha256') <> extensions.digest(v_req.pickup_code_hash, 'sha256') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pickup code integrity mismatch.');
    END IF;

    -- CRITICAL: Repeated retrieval MUST NEVER reset pickup_code_attempts or pickup_code_total_attempts!
    RETURN jsonb_build_object(
        'success', true,
        'pickup_code', v_code,
        'expires_at', v_req.pickup_code_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_pickup_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_pickup_code(UUID) TO authenticated, service_role;

-- 15. Safe migration of active customer pickup codes from legacy v1 SHA-256 to v2 keyed HMAC
DO $$
DECLARE
    v_pepper TEXT;
    v_rec RECORD;
    v_code TEXT;
BEGIN
    SELECT value INTO v_pepper FROM public.platform_secrets WHERE key = 'pickup_code_pepper';
    IF v_pepper IS NOT NULL THEN
        FOR v_rec IN
            SELECT id, pickup_code_nonce, pickup_code_salt
            FROM public.requests
            WHERE pickup_code_hash IS NOT NULL
              AND pickup_code_hash <> 'USED'
              AND NOT (pickup_code_hash LIKE 'v2$%')
              AND pickup_code_nonce IS NOT NULL
              AND pickup_code_salt IS NOT NULL
        LOOP
            BEGIN
                v_code := public.derive_pickup_code(v_rec.id, v_rec.pickup_code_nonce);
                IF v_code IS NOT NULL THEN
                    UPDATE public.requests
                    SET pickup_code_hash = 'v2$' || encode(extensions.hmac(v_code || ':' || v_rec.pickup_code_salt, v_pepper, 'sha256'), 'hex')
                    WHERE id = v_rec.id;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- If derivation fails on an orphaned legacy record, keep legacy hash for dual-mode verification fallback
                NULL;
            END;
        END LOOP;
    END IF;
END $$;

-- 15. Harden calculate_platform_fee with search_path = pg_catalog, public, pg_temp,
-- and prevent untrusted clients from invoking forced calculation while master switch is dormant.
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(
    p_amount_paise INTEGER,
    p_force_calculation BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_is_enabled BOOLEAN := FALSE;
BEGIN
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RETURN 0;
    END IF;

    -- If force_calculation is requested, only trusted backend actors (postgres, service_role, supabase_admin)
    -- are permitted to bypass the master switch. For all untrusted callers (anon, authenticated),
    -- forced calculation is strictly ignored and the authoritative master switch is enforced.
    IF p_force_calculation IS TRUE THEN
        IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
           AND COALESCE(auth.role(), '') NOT IN ('service_role') THEN
            SELECT COALESCE((value->>'is_enabled')::BOOLEAN, FALSE)
            INTO v_is_enabled
            FROM public.platform_settings
            WHERE key = 'platform_fee_system';

            IF v_is_enabled IS NOT TRUE THEN
                RETURN 0;
            END IF;
        END IF;
    ELSE
        SELECT COALESCE((value->>'is_enabled')::BOOLEAN, FALSE)
        INTO v_is_enabled
        FROM public.platform_settings
        WHERE key = 'platform_fee_system';

        IF v_is_enabled IS NOT TRUE THEN
            RETURN 0;
        END IF;
    END IF;

    RETURN (CEIL(p_amount_paise::NUMERIC / 10000.0) * 100)::INTEGER;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_platform_fee(INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_platform_fee(INTEGER, BOOLEAN) TO anon, authenticated, service_role;

COMMIT;

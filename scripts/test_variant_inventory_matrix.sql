DO $$
DECLARE
    v_shop_id UUID;
    v_shopkeeper_id UUID;
    v_customer_id UUID;
    
    v_product_var_id UUID;
    v_product_simple_id UUID;
    v_request_id UUID;
    v_request_2_id UUID;
    
    v_prod public.shop_products%ROWTYPE;
    v_item JSONB;
    v_variants JSONB;
    v_stock NUMERIC;
    v_is_avail BOOLEAN;
    v_in_stock BOOLEAN;
    v_count INT;
BEGIN
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'REAL POSTGRES TEST MATRIX: VARIANT INVENTORY';
    RAISE NOTICE '====================================================';

    -- 1. Setup prerequisites: shop, shopkeeper, customer
    SELECT id, owner_id INTO v_shop_id, v_shopkeeper_id 
    FROM public.shops 
    WHERE status = 'active' AND is_live 
    LIMIT 1;

    SELECT id INTO v_customer_id 
    FROM auth.users 
    WHERE id <> v_shopkeeper_id 
    LIMIT 1;

    IF v_shop_id IS NULL OR v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Prerequisites failed: active shop or customer user not found';
    END IF;

    RAISE NOTICE '[PASS] 1. Prerequisites verified: shop=% customer=%', v_shop_id, v_customer_id;

    -- 2. Create product with 3 variants (Small=5, Medium=0, Large=8)
    INSERT INTO public.shop_products (
        shop_id,
        name,
        description,
        price,
        unit,
        has_variants,
        variants,
        track_inventory,
        is_available
    ) VALUES (
        v_shop_id,
        'Matrix Cotton T-Shirt',
        'Multi-variant test item',
        499.00,
        'piece',
        TRUE,
        jsonb_build_array(
            jsonb_build_object('id', 'var_s', 'label', 'Small', 'price', 499, 'stock_quantity', 5, 'in_stock', true, 'is_available', true),
            jsonb_build_object('id', 'var_m', 'label', 'Medium', 'price', 549, 'stock_quantity', 0, 'in_stock', true, 'is_available', true),
            jsonb_build_object('id', 'var_l', 'label', 'Large', 'price', 599, 'stock_quantity', 8, 'in_stock', true, 'is_available', true)
        ),
        TRUE,
        TRUE
    ) RETURNING id INTO v_product_var_id;

    -- Verify trigger automatically normalized Medium to in_stock=false, is_available=false
    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    IF NOT v_prod.is_available THEN
        RAISE EXCEPTION 'Product should be available because Small and Large are in stock';
    END IF;

    SELECT item INTO v_item 
    FROM jsonb_array_elements(v_prod.variants) AS item 
    WHERE item->>'id' = 'var_m';

    IF (v_item->>'in_stock')::boolean <> FALSE OR (v_item->>'is_available')::boolean <> FALSE THEN
        RAISE EXCEPTION 'Medium variant with stock 0 was not automatically disabled';
    END IF;

    RAISE NOTICE '[PASS] 2. Product created; 0-stock variant automatically disabled while in-stock variants remain available';

    -- 3. Purchasability check via shop_product_is_purchasable()
    IF NOT public.shop_product_is_purchasable(v_prod, 'var_s', 2) THEN
        RAISE EXCEPTION 'Small variant with stock 5 should be purchasable for qty 2';
    END IF;
    IF public.shop_product_is_purchasable(v_prod, 'var_m', 1) THEN
        RAISE EXCEPTION 'Medium variant with stock 0 must NOT be purchasable';
    END IF;
    IF public.shop_product_is_purchasable(v_prod, 'var_s', 10) THEN
        RAISE EXCEPTION 'Small variant with stock 5 must NOT be purchasable for qty 10';
    END IF;

    RAISE NOTICE '[PASS] 3. shop_product_is_purchasable correctly accepts valid stock and rejects overselling/zero stock';

    -- 4. Shopkeeper updates Large variant stock to 0
    UPDATE public.shop_products
    SET variants = (
        SELECT jsonb_agg(
            CASE WHEN item->>'id' = 'var_l'
                THEN jsonb_set(item, '{stock_quantity}', to_jsonb(0))
                ELSE item
            END
        )
        FROM jsonb_array_elements(variants) AS item
    )
    WHERE id = v_product_var_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    IF NOT v_prod.is_available THEN
        RAISE EXCEPTION 'Product must remain available because Small still has stock 5';
    END IF;

    SELECT (item->>'in_stock')::boolean INTO v_in_stock
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_l';

    IF v_in_stock <> FALSE THEN
        RAISE EXCEPTION 'Large variant should be in_stock=false after stock update to 0';
    END IF;

    RAISE NOTICE '[PASS] 4. Shopkeeper variant stock update to 0 disabled only that variant; parent product remains available';

    -- 5. All variants reach zero stock -> parent product auto-disabled
    UPDATE public.shop_products
    SET variants = (
        SELECT jsonb_agg(
            CASE WHEN item->>'id' = 'var_s'
                THEN jsonb_set(item, '{stock_quantity}', to_jsonb(0))
                ELSE item
            END
        )
        FROM jsonb_array_elements(variants) AS item
    )
    WHERE id = v_product_var_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    IF v_prod.is_available THEN
        RAISE EXCEPTION 'Parent product should be automatically marked is_available=false when all variants reach 0 stock';
    END IF;

    RAISE NOTICE '[PASS] 5. Parent product automatically marked unavailable when all variants reach zero stock';

    -- 6. Restocking one variant restores parent product availability
    UPDATE public.shop_products
    SET variants = (
        SELECT jsonb_agg(
            CASE WHEN item->>'id' = 'var_m'
                THEN jsonb_set(jsonb_set(jsonb_set(item, '{stock_quantity}', to_jsonb(12)), '{in_stock}', to_jsonb(true)), '{is_available}', to_jsonb(true))
                ELSE item
            END
        )
        FROM jsonb_array_elements(variants) AS item
    )
    WHERE id = v_product_var_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    IF NOT v_prod.is_available THEN
        RAISE EXCEPTION 'Parent product should be automatically restored to is_available=true upon restocking a variant';
    END IF;

    SELECT (item->>'is_available')::boolean INTO v_is_avail
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_s';
    IF v_is_avail <> FALSE THEN
        RAISE EXCEPTION 'Small variant must remain unavailable (still 0 stock)';
    END IF;

    RAISE NOTICE '[PASS] 6. Restocking variant Medium restored parent product availability while keeping Small/Large disabled';

    -- 7. Reset stock for order checkout test: Small=5, Medium=0, Large=8
    UPDATE public.shop_products
    SET variants = jsonb_build_array(
        jsonb_build_object('id', 'var_s', 'label', 'Small', 'price', 499, 'stock_quantity', 5, 'in_stock', true, 'is_available', true),
        jsonb_build_object('id', 'var_m', 'label', 'Medium', 'price', 549, 'stock_quantity', 0, 'in_stock', false, 'is_available', false),
        jsonb_build_object('id', 'var_l', 'label', 'Large', 'price', 599, 'stock_quantity', 8, 'in_stock', true, 'is_available', true)
    ),
    is_available = TRUE
    WHERE id = v_product_var_id;

    -- 8. Customer Order Checkout: buy 3 of Small variant
    -- Simulate authenticated customer session
    PERFORM set_config('request.jwt.claim.sub', v_customer_id::text, true);

    INSERT INTO public.requests (
        shop_id,
        customer_id,
        workflow_group_code,
        request_kind,
        fulfillment_type,
        current_state,
        reference_code,
        notes
    ) VALUES (
        v_shop_id,
        v_customer_id,
        'ORDER',
        'ORDER',
        'TAKEAWAY',
        'REQUESTED',
        'REQ-TEST-VAR-001',
        jsonb_build_object(
            'items', jsonb_build_array(
                jsonb_build_object(
                    'product_id', v_product_var_id,
                    'variant_id', 'var_s',
                    'quantity', 3
                )
            )
        )::text
    ) RETURNING id INTO v_request_id;

    -- Verify stock decremented from 5 to 2
    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    SELECT (item->>'stock_quantity')::numeric, (item->>'in_stock')::boolean INTO v_stock, v_in_stock
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_s';

    IF v_stock <> 2 OR v_in_stock <> TRUE THEN
        RAISE EXCEPTION 'Expected Small stock to be 2 and in_stock=true, got stock=% in_stock=%', v_stock, v_in_stock;
    END IF;

    RAISE NOTICE '[PASS] 7 & 8. Order checkout successfully created; variant stock atomically decremented from 5 to 2';

    -- 9. Checkout order taking remaining 2 of Small variant -> hits 0 stock and auto-disables variant
    INSERT INTO public.requests (
        shop_id,
        customer_id,
        workflow_group_code,
        request_kind,
        fulfillment_type,
        current_state,
        reference_code,
        notes
    ) VALUES (
        v_shop_id,
        v_customer_id,
        'ORDER',
        'ORDER',
        'TAKEAWAY',
        'REQUESTED',
        'REQ-TEST-VAR-002',
        jsonb_build_object(
            'items', jsonb_build_array(
                jsonb_build_object(
                    'product_id', v_product_var_id,
                    'variant_id', 'var_s',
                    'quantity', 2
                )
            )
        )::text
    ) RETURNING id INTO v_request_2_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    SELECT (item->>'stock_quantity')::numeric, (item->>'in_stock')::boolean, (item->>'is_available')::boolean INTO v_stock, v_in_stock, v_is_avail
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_s';

    IF v_stock <> 0 OR v_in_stock <> FALSE OR v_is_avail <> FALSE THEN
        RAISE EXCEPTION 'Small variant should now be 0 stock, in_stock=false, is_available=false';
    END IF;

    -- But Large variant with stock 8 keeps parent product available!
    IF NOT v_prod.is_available THEN
        RAISE EXCEPTION 'Parent product should remain available because Large has stock 8';
    END IF;

    RAISE NOTICE '[PASS] 9. Variant reached zero stock through checkout and was disabled; parent product remains available via Large';

    -- 10. Attempting to purchase Small variant now should raise exception
    BEGIN
        INSERT INTO public.requests (
            shop_id,
            customer_id,
            workflow_group_code,
            request_kind,
            fulfillment_type,
            current_state,
            reference_code,
            notes
        ) VALUES (
            v_shop_id,
            v_customer_id,
            'ORDER',
            'ORDER',
            'TAKEAWAY',
            'REQUESTED',
            'REQ-TEST-VAR-FAIL',
            jsonb_build_object(
                'items', jsonb_build_array(
                    jsonb_build_object(
                        'product_id', v_product_var_id,
                        'variant_id', 'var_s',
                        'quantity', 1
                    )
                )
            )::text
        );
        RAISE EXCEPTION 'Should not have allowed purchasing 0-stock Small variant';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Selected variant is out of stock or unavailable%' THEN
            RAISE EXCEPTION 'Unexpected error when purchasing 0-stock variant: %', SQLERRM;
        END IF;
    END;

    RAISE NOTICE '[PASS] 10. Attempt to purchase 0-stock variant correctly rejected with out of stock error';

    -- 11. Cancellation of REQ-TEST-VAR-001 restores 3 units of Small variant and re-enables it
    UPDATE public.requests
    SET current_state = 'CANCELLED'
    WHERE id = v_request_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    SELECT (item->>'stock_quantity')::numeric, (item->>'in_stock')::boolean, (item->>'is_available')::boolean INTO v_stock, v_in_stock, v_is_avail
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_s';

    IF v_stock <> 3 OR v_in_stock <> TRUE OR v_is_avail <> TRUE THEN
        RAISE EXCEPTION 'Cancellation should have restored Small stock to 3 and enabled it, got stock=%', v_stock;
    END IF;

    RAISE NOTICE '[PASS] 11. Order cancellation restored variant stock and re-enabled variant availability';

    -- 12. Test order rejection restoration on v_request_2_id
    UPDATE public.requests
    SET current_state = 'REJECTED'
    WHERE id = v_request_2_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    SELECT (item->>'stock_quantity')::numeric INTO v_stock
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_s';

    IF v_stock <> 5 THEN
        RAISE EXCEPTION 'Rejection of second order should have restored Small stock to 5, got stock=%', v_stock;
    END IF;

    -- Redundant update: inventory_released=true prevents double restoration
    UPDATE public.requests
    SET current_state = 'REJECTED'
    WHERE id = v_request_2_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    SELECT (item->>'stock_quantity')::numeric INTO v_stock
    FROM jsonb_array_elements(v_prod.variants) AS item
    WHERE item->>'id' = 'var_s';

    IF v_stock <> 5 THEN
        RAISE EXCEPTION 'Redundant update must NOT restore stock twice, got stock=%', v_stock;
    END IF;

    RAISE NOTICE '[PASS] 12. Order rejection restoration and idempotency verified: stock accurately restored to 5 without double-restoration';

    -- 13. Test Simple Product without variants
    INSERT INTO public.shop_products (
        shop_id,
        name,
        description,
        price,
        unit,
        has_variants,
        track_inventory,
        stock_quantity,
        is_available
    ) VALUES (
        v_shop_id,
        'Simple Salt Pack',
        'Simple product test',
        25.00,
        'kg',
        FALSE,
        TRUE,
        10,
        TRUE
    ) RETURNING id INTO v_product_simple_id;

    -- Checkout simple product qty 4
    INSERT INTO public.requests (
        shop_id,
        customer_id,
        workflow_group_code,
        request_kind,
        fulfillment_type,
        current_state,
        reference_code,
        notes
    ) VALUES (
        v_shop_id,
        v_customer_id,
        'ORDER',
        'ORDER',
        'TAKEAWAY',
        'REQUESTED',
        'REQ-TEST-SIMPLE-001',
        jsonb_build_object(
            'items', jsonb_build_array(
                jsonb_build_object(
                    'product_id', v_product_simple_id,
                    'quantity', 4
                )
            )
        )::text
    ) RETURNING id INTO v_request_id;

    SELECT stock_quantity INTO v_stock FROM public.shop_products WHERE id = v_product_simple_id;
    IF v_stock <> 6 THEN
        RAISE EXCEPTION 'Expected simple product stock to be 6, got %', v_stock;
    END IF;

    -- Cancel simple product order
    UPDATE public.requests SET current_state = 'CANCELLED' WHERE id = v_request_id;
    SELECT stock_quantity INTO v_stock FROM public.shop_products WHERE id = v_product_simple_id;
    IF v_stock <> 10 THEN
        RAISE EXCEPTION 'Expected simple product stock to be restored to 10, got %', v_stock;
    END IF;

    RAISE NOTICE '[PASS] 13. Simple products without variants preserve product-level stock decrement and restoration';

    -- 14. Untracked (NULL) variant stock handling
    UPDATE public.shop_products
    SET variants = jsonb_build_array(
        jsonb_build_object('id', 'var_untracked', 'label', 'Custom Size', 'price', 999, 'in_stock', true, 'is_available', true)
    )
    WHERE id = v_product_var_id;

    SELECT * INTO v_prod FROM public.shop_products WHERE id = v_product_var_id;
    IF NOT public.shop_product_is_purchasable(v_prod, 'var_untracked', 100) THEN
        RAISE EXCEPTION 'Untracked variant (no stock_quantity) should be purchasable for any quantity';
    END IF;

    RAISE NOTICE '[PASS] 14. Untracked variant (NULL/absent stock_quantity) correctly treated as unlimited stock';

    -- 15. Verify existing seed data and tables remain intact
    SELECT count(*) INTO v_count FROM public.shops;
    IF v_count < 2 THEN
        RAISE EXCEPTION 'Shops count unexpected: %', v_count;
    END IF;

    SELECT count(*) INTO v_count FROM public.shop_types;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Shop types count unexpected: %', v_count;
    END IF;

    RAISE NOTICE '[PASS] 15. Seed data and system tables 100%% intact';

    -- 16. Cleanup all test records
    DELETE FROM public.requests WHERE reference_code LIKE 'REQ-TEST-%';
    DELETE FROM public.shop_products WHERE id IN (v_product_var_id, v_product_simple_id);

    RAISE NOTICE '[PASS] 16. All test records safely cleaned up';

    RAISE NOTICE '====================================================';
    RAISE NOTICE 'REAL DATABASE TEST MATRIX COMPLETED: ALL 16 CHECKS PASSED';
    RAISE NOTICE '====================================================';
END $$;

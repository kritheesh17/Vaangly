-- ============================================================================
-- Migration 78: Vaangly Financial Ledger, Platform Fee, Settlement Management
-- and Admin Financial Control System
-- ============================================================================

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Extend existing requests table for Platform Fee and Pickup Verification
-- ----------------------------------------------------------------------------
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS platform_fee_paise INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS platform_fee_rule_id UUID,
    ADD COLUMN IF NOT EXISTS pickup_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS pickup_code_salt TEXT,
    ADD COLUMN IF NOT EXISTS pickup_code_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pickup_code_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pickup_code_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pickup_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pickup_verified_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS merchant_payment_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS merchant_payment_confirmed_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS merchant_payment_reported_method VARCHAR(30);

-- ----------------------------------------------------------------------------
-- 2. Extend existing shops table for Merchant Financial Status and Controls
-- ----------------------------------------------------------------------------
ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS financial_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (financial_status IN ('ACTIVE', 'WARNING', 'RESTRICTED', 'SUSPENDED')),
    ADD COLUMN IF NOT EXISTS financial_restriction_reason TEXT,
    ADD COLUMN IF NOT EXISTS financial_restricted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS financial_restricted_by UUID REFERENCES public.profiles(id);

-- ----------------------------------------------------------------------------
-- 3. Table: platform_fee_rules
-- Configurable versioned pricing configuration for ₹100 slabs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fee_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_version VARCHAR(30) NOT NULL,
    min_amount_paise INTEGER NOT NULL CHECK (min_amount_paise >= 0),
    max_amount_paise INTEGER NOT NULL CHECK (max_amount_paise > min_amount_paise),
    fee_amount_paise INTEGER NOT NULL CHECK (fee_amount_paise >= 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_fee_rules_active ON public.platform_fee_rules (is_active, min_amount_paise, max_amount_paise);

-- Initialize Controlled Server-Side Master Fee Activation Switch in platform_settings
-- Initialized as inactive (is_enabled = FALSE) to guarantee that applying Migration 78
-- causes ZERO platform fee assessments until explicitly activated after deployment and smoke tests.
INSERT INTO public.platform_settings (key, value, description)
VALUES (
    'platform_fee_system',
    jsonb_build_object(
        'is_enabled', false,
        'activated_at', null,
        'activated_by', null,
        'version', 'v1.0'
    ),
    'Master activation switch and timestamp for customer platform fee assessment'
)
ON CONFLICT (key) DO NOTHING;

-- Seed Initial Slabs (Version 1 - Upper Bound Inclusive: ₹0.01-₹100 = ₹1, ₹100.01-₹200 = ₹2, etc.)
-- Slabs start dormant (is_active = FALSE) and are activated atomically by activate_platform_fee_system RPC.
INSERT INTO public.platform_fee_rules (rule_version, min_amount_paise, max_amount_paise, fee_amount_paise, is_active)
VALUES
    ('v1.0', 1, 10000, 100, FALSE),        -- ₹0.01 to ₹100.00 -> ₹1
    ('v1.0', 10001, 20000, 200, FALSE),    -- ₹100.01 to ₹200.00 -> ₹2
    ('v1.0', 20001, 30000, 300, FALSE),    -- ₹200.01 to ₹300.00 -> ₹3
    ('v1.0', 30001, 40000, 400, FALSE),    -- ₹300.01 to ₹400.00 -> ₹4
    ('v1.0', 40001, 50000, 500, FALSE),    -- ₹400.01 to ₹500.00 -> ₹5
    ('v1.0', 50001, 60000, 600, FALSE),    -- ₹500.01 to ₹600.00 -> ₹6
    ('v1.0', 60001, 70000, 700, FALSE),    -- ₹600.01 to ₹700.00 -> ₹7
    ('v1.0', 70001, 80000, 800, FALSE),    -- ₹700.01 to ₹800.00 -> ₹8
    ('v1.0', 80001, 90000, 900, FALSE),    -- ₹800.01 to ₹900.00 -> ₹9
    ('v1.0', 90001, 100000, 1000, FALSE)   -- ₹900.01 to ₹1000.00 -> ₹10
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Table: platform_fee_ledger
-- Append-only financial source of truth for merchant platform fee liabilities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fee_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
    request_id UUID REFERENCES public.requests(id) ON DELETE RESTRICT,
    entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('fee_assessed', 'fee_reversed', 'adjustment')),
    amount_paise INTEGER NOT NULL, -- Signed: positive = merchant liability to platform, negative = credit/reduction
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID REFERENCES public.profiles(id),
    actor_role VARCHAR(30) NOT NULL DEFAULT 'system'
);

-- Enforce strict unique assessment per order per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_unique_order_entry 
    ON public.platform_fee_ledger (shop_id, request_id, entry_type) 
    WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_shop_created ON public.platform_fee_ledger (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.platform_fee_ledger (created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. Table: merchant_settlements
-- Tracks remittances from merchants to Vaangly
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'upi' CHECK (payment_method IN ('upi', 'bank_transfer', 'cash', 'other')),
    transaction_reference VARCHAR(100) NOT NULL,
    proof_document_url TEXT,
    notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by UUID NOT NULL REFERENCES public.profiles(id),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'submitted' 
        CHECK (verification_status IN ('submitted', 'under_review', 'verified', 'partially_verified', 'rejected', 'reversed')),
    verified_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (verified_amount_paise >= 0),
    verified_by UUID REFERENCES public.profiles(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_shop ON public.merchant_settlements (shop_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.merchant_settlements (verification_status, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_unique_utr 
    ON public.merchant_settlements (transaction_reference)
    WHERE payment_method IN ('upi', 'bank_transfer') AND verification_status <> 'rejected';

-- ----------------------------------------------------------------------------
-- 6. Table: settlement_allocations
-- Allocation of verified settlements to outstanding ledger liabilities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.merchant_settlements(id) ON DELETE RESTRICT,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
    ledger_entry_id UUID NOT NULL REFERENCES public.platform_fee_ledger(id) ON DELETE RESTRICT,
    allocated_amount_paise INTEGER NOT NULL CHECK (allocated_amount_paise > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    allocated_by UUID NOT NULL REFERENCES public.profiles(id),
    CONSTRAINT unique_settlement_ledger_allocation UNIQUE (settlement_id, ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_ledger ON public.settlement_allocations (ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_allocations_shop ON public.settlement_allocations (shop_id);

-- ----------------------------------------------------------------------------
-- 7. Table: financial_audit_logs
-- Immutable audit log for financial administration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id),
    action VARCHAR(50) NOT NULL,
    target_entity VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    reason TEXT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_target ON public.financial_audit_logs (target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_created ON public.financial_audit_logs (created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. Core Financial Calculation Functions
-- ----------------------------------------------------------------------------

-- A. Deterministic Platform Fee Calculation (Integer Paise)
-- Uses Option A: Upper-bound inclusive ₹100 slabs
-- ₹0.01 to ₹100.00 -> ₹1 (100 paise)
-- ₹100.01 to ₹200.00 -> ₹2 (200 paise)
-- Formula: CEIL(amount_paise / 10000.0) * 100
-- Respects the controlled master switch in platform_settings unless p_force_calculation is TRUE
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(
    p_amount_paise INTEGER,
    p_force_calculation BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_is_enabled BOOLEAN := FALSE;
BEGIN
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RETURN 0;
    END IF;

    IF p_force_calculation IS NOT TRUE THEN
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

-- B. Generate Pickup Verification Code
-- Generates a deterministic 6-digit numeric code, hashes it with SHA-256 and server secret salt,
-- stores the hash and salt, and returns the plaintext code to the customer.
CREATE OR REPLACE FUNCTION public.generate_order_pickup_code(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_code TEXT;
    v_secret TEXT := 'vaangly_secure_pickup_salt_2026';
BEGIN
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF NOT (v_req.customer_id = auth.uid() OR public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Only the customer who placed this order can generate the pickup code.';
    END IF;

    -- Deterministic derivation matching get_order_pickup_code
    v_code := lpad(
        (abs(('x' || substr(md5(v_req.id::text || v_req.created_at::text || v_secret), 1, 8))::bit(32)::integer) % 900000 + 100000)::text,
        6, '0'
    );

    UPDATE public.requests
    SET
        pickup_code_hash = encode(digest(v_code || v_secret, 'sha256'), 'hex'),
        pickup_code_salt = v_secret,
        pickup_code_generated_at = NOW(),
        pickup_code_expires_at = NOW() + INTERVAL '72 hours',
        pickup_code_attempts = 0,
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN v_code;
END;
$$;

-- B2. Retrieve Active Order Pickup Code for the Customer
-- Computes the deterministic 6-digit code on the fly without storing plaintext in the DB.
-- Only the customer who placed the order or an authorized admin can view this code.
CREATE OR REPLACE FUNCTION public.get_order_pickup_code(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_code TEXT;
    v_secret TEXT := 'vaangly_secure_pickup_salt_2026';
BEGIN
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF NOT (v_req.customer_id = auth.uid() OR public.is_admin()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only the customer who placed this order can view the pickup code.');
    END IF;

    IF v_req.current_state IN ('COMPLETED', 'CANCELLED', 'REJECTED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is no longer active.');
    END IF;

    v_code := lpad(
        (abs(('x' || substr(md5(v_req.id::text || v_req.created_at::text || v_secret), 1, 8))::bit(32)::integer) % 900000 + 100000)::text,
        6, '0'
    );

    IF v_req.pickup_code_hash IS NULL THEN
        UPDATE public.requests
        SET
            pickup_code_hash = encode(digest(v_code || v_secret, 'sha256'), 'hex'),
            pickup_code_salt = v_secret,
            pickup_code_generated_at = NOW(),
            pickup_code_expires_at = NOW() + INTERVAL '72 hours',
            pickup_code_attempts = 0
        WHERE id = p_request_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'pickup_code', v_code,
        'expires_at', COALESCE(v_req.pickup_code_expires_at, NOW() + INTERVAL '72 hours')
    );
END;
$$;

-- C. Complete Order, Verify Pickup Code, and Assess Platform Fee Atomically
CREATE OR REPLACE FUNCTION public.complete_order_and_assess_fee(
    p_request_id UUID,
    p_pickup_code TEXT,
    p_payment_method TEXT,
    p_actor_id UUID,
    p_override_without_code BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_shop RECORD;
    v_input_hash TEXT;
    v_amount_paise INTEGER;
    v_fee_paise INTEGER;
    v_ledger_id UUID;
    v_is_admin BOOLEAN;
    v_is_owner BOOLEAN;
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

    -- 2. Authorization check
    v_is_admin := public.is_admin();
    v_is_owner := (auth.uid() IS NOT NULL AND v_shop.owner_id = auth.uid()) OR (v_shop.owner_id = p_actor_id AND auth.uid() IS NULL);
    IF NOT (v_is_admin OR v_is_owner) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You cannot complete orders for this shop.');
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

        IF v_req.pickup_code_attempts >= 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Maximum pickup code attempts exceeded. Please contact support or admin.');
        END IF;

        IF v_req.pickup_code_expires_at IS NOT NULL AND NOW() > v_req.pickup_code_expires_at THEN
            RETURN jsonb_build_object('success', false, 'error', 'Pickup verification code has expired.');
        END IF;

        IF p_pickup_code IS NULL OR trim(p_pickup_code) = '' THEN
            RETURN jsonb_build_object('success', false, 'error', '6-digit customer pickup verification code is required.');
        END IF;

        v_input_hash := encode(digest(trim(p_pickup_code) || v_req.pickup_code_salt, 'sha256'), 'hex');
        IF v_input_hash <> v_req.pickup_code_hash THEN
            UPDATE public.requests
            SET pickup_code_attempts = pickup_code_attempts + 1, updated_at = NOW()
            WHERE id = p_request_id;
            RETURN jsonb_build_object('success', false, 'error', 'Invalid pickup verification code. Please check with customer.');
        END IF;
    END IF;

    -- 5. Calculate customer-paid platform fee
    -- Check master fee system status & exact activation timestamp from platform_settings
    SELECT
        COALESCE((value->>'is_enabled')::BOOLEAN, FALSE),
        (value->>'activated_at')::TIMESTAMPTZ
    INTO v_fee_system_enabled, v_activation_time
    FROM public.platform_settings
    WHERE key = 'platform_fee_system';

    -- If fee system is active AND order was created on or after exact activation timestamp, assess fee.
    -- All orders created prior to activation time are permanently fee-free (0 paise).
    IF v_fee_system_enabled IS TRUE AND v_activation_time IS NOT NULL AND v_req.created_at >= v_activation_time THEN
        v_fee_paise := COALESCE(v_req.platform_fee_paise, 0);
        IF v_fee_paise <= 0 THEN
            v_amount_paise := ROUND(COALESCE(v_req.total_estimate, 0) * 100)::INTEGER;
            v_fee_paise := (CEIL(v_amount_paise::NUMERIC / 10000.0) * 100)::INTEGER;
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
        pickup_verified_at = NOW(),
        pickup_verified_by = p_actor_id,
        merchant_payment_confirmed_at = NOW(),
        merchant_payment_confirmed_by = p_actor_id,
        merchant_payment_reported_method = COALESCE(p_payment_method, v_req.payment_method, 'cash'),
        platform_fee_paise = v_fee_paise,
        updated_at = NOW()
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
            v_fee_paise,
            'INR',
            'fee_assessed_' || p_request_id::TEXT,
            'Platform fee assessed upon counter completion of order #' || v_req.reference_code,
            p_actor_id,
            CASE WHEN v_is_admin THEN 'admin' ELSE 'shopkeeper' END
        )
        ON CONFLICT (shop_id, request_id, entry_type) WHERE request_id IS NOT NULL
        DO NOTHING
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
        p_actor_id,
        CASE WHEN v_is_admin THEN 'admin' ELSE 'shopkeeper' END,
        'Order collected and payment confirmed (' || COALESCE(p_payment_method, 'counter') || '). Platform fee assessed: ₹' || (v_fee_paise / 100.0)::TEXT
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'platform_fee_paise', v_fee_paise,
        'total_amount', v_req.total_estimate,
        'completed_at', NOW()
    );
END;
$$;

-- D. Reverse Platform Fee on Order Refund / Cancellation
CREATE OR REPLACE FUNCTION public.record_order_fee_reversal(
    p_request_id UUID,
    p_reason TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_assessed RECORD;
    v_reversal_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    SELECT * INTO v_req FROM public.requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
    END IF;

    v_is_admin := public.is_admin();
    IF NOT (
        v_is_admin 
        OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.shops WHERE id = v_req.shop_id AND owner_id = auth.uid()))
        OR (auth.uid() IS NOT NULL AND v_req.customer_id = auth.uid() AND v_req.current_state IN ('CANCELLED', 'REJECTED'))
        OR (auth.uid() IS NULL AND p_actor_id IS NOT NULL)
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You cannot reverse fees for this order.');
    END IF;

    -- Find fee_assessed ledger entry
    SELECT * INTO v_assessed
    FROM public.platform_fee_ledger
    WHERE request_id = p_request_id AND entry_type = 'fee_assessed';

    IF NOT FOUND OR v_assessed.amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'No fee was assessed for this order; reversal not needed.');
    END IF;

    -- Insert compensating negative entry
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
        -v_assessed.amount_paise,
        'INR',
        'fee_reversed_' || p_request_id::TEXT,
        COALESCE(p_reason, 'Order refund fee reversal'),
        p_actor_id,
        CASE WHEN v_is_admin THEN 'admin' ELSE 'shopkeeper' END
    )
    ON CONFLICT (shop_id, request_id, entry_type) WHERE request_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_reversal_id;

    RETURN jsonb_build_object('success', true, 'reversal_id', v_reversal_id, 'reversed_paise', v_assessed.amount_paise);
END;
$$;

-- E. Merchant Financial Summary Derivation Function
CREATE OR REPLACE FUNCTION public.get_merchant_financial_summary(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_shop RECORD;
    v_is_admin BOOLEAN;
    v_is_owner BOOLEAN;
    v_completed_count INTEGER := 0;
    v_gmv_paise BIGINT := 0;
    v_assessed_paise BIGINT := 0;
    v_reversed_paise BIGINT := 0;
    v_adjustments_paise BIGINT := 0;
    v_net_fees_paise BIGINT := 0;
    v_verified_settled_paise BIGINT := 0;
    v_pending_settlement_paise BIGINT := 0;
    v_outstanding_paise BIGINT := 0;
    v_oldest_unpaid_at TIMESTAMPTZ;
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
        COALESCE(ROUND(SUM(COALESCE(total_estimate, 0) * 100)), 0)::BIGINT
    INTO v_completed_count, v_gmv_paise
    FROM public.requests
    WHERE shop_id = p_shop_id AND current_state = 'COMPLETED';

    -- Aggregate ledger liabilities
    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'fee_assessed' THEN amount_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'fee_reversed' THEN ABS(amount_paise) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'adjustment' THEN amount_paise ELSE 0 END), 0)
    INTO v_assessed_paise, v_reversed_paise, v_adjustments_paise
    FROM public.platform_fee_ledger
    WHERE shop_id = p_shop_id;

    v_net_fees_paise := v_assessed_paise - v_reversed_paise + v_adjustments_paise;

    -- Aggregate verified settlement payments
    SELECT
        COALESCE(SUM(verified_amount_paise), 0)
    INTO v_verified_settled_paise
    FROM public.merchant_settlements
    WHERE shop_id = p_shop_id AND verification_status = 'verified';

    -- Aggregate pending settlement submissions
    SELECT
        COALESCE(SUM(amount_paise), 0)
    INTO v_pending_settlement_paise
    FROM public.merchant_settlements
    WHERE shop_id = p_shop_id AND verification_status IN ('submitted', 'under_review');

    -- Derive outstanding liability balance
    v_outstanding_paise := GREATEST(0, v_net_fees_paise - v_verified_settled_paise);

    -- Check oldest unsettled liability
    IF v_outstanding_paise > 0 THEN
        SELECT MIN(l.created_at)
        INTO v_oldest_unpaid_at
        FROM public.platform_fee_ledger l
        LEFT JOIN (
            SELECT ledger_entry_id, COALESCE(SUM(allocated_amount_paise), 0) AS total_allocated
            FROM public.settlement_allocations
            GROUP BY ledger_entry_id
        ) a ON a.ledger_entry_id = l.id
        WHERE l.shop_id = p_shop_id
          AND l.entry_type = 'fee_assessed'
          AND l.amount_paise > COALESCE(a.total_allocated, 0)
          AND NOT EXISTS (
              SELECT 1 FROM public.platform_fee_ledger rev
              WHERE rev.shop_id = l.shop_id AND rev.request_id = l.request_id AND rev.entry_type = 'fee_reversed'
          );

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
        'net_fees_owed_paise', v_net_fees_paise,
        'total_verified_settled_paise', v_verified_settled_paise,
        'pending_settlement_paise', v_pending_settlement_paise,
        'outstanding_balance_paise', v_outstanding_paise,
        'oldest_unpaid_at', v_oldest_unpaid_at,
        'days_overdue', v_days_overdue
    );
END;
$$;

-- F. Admin Financial Dashboard Overall KPIs
CREATE OR REPLACE FUNCTION public.get_admin_financial_kpis(
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_total_merchants INTEGER := 0;
    v_merchants_with_orders INTEGER := 0;
    v_merchants_with_outstanding INTEGER := 0;
    v_fully_settled_merchants INTEGER := 0;
    v_overdue_merchants INTEGER := 0;
    v_total_completed_orders INTEGER := 0;
    v_total_gmv_paise BIGINT := 0;
    v_total_fees_assessed_paise BIGINT := 0;
    v_total_fees_reversed_paise BIGINT := 0;
    v_net_fees_owed_paise BIGINT := 0;
    v_verified_fees_collected_paise BIGINT := 0;
    v_total_outstanding_paise BIGINT := 0;
    v_pending_settlement_count INTEGER := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT COUNT(*) INTO v_total_merchants FROM public.shops;

    -- Completed orders & GMV within filter range
    SELECT
        COUNT(*),
        COUNT(DISTINCT shop_id),
        COALESCE(ROUND(SUM(COALESCE(total_estimate, 0) * 100)), 0)::BIGINT
    INTO v_total_completed_orders, v_merchants_with_orders, v_total_gmv_paise
    FROM public.requests
    WHERE current_state = 'COMPLETED'
      AND (p_start_date IS NULL OR updated_at >= p_start_date)
      AND (p_end_date IS NULL OR updated_at <= p_end_date);

    -- Ledger totals
    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'fee_assessed' THEN amount_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'fee_reversed' THEN ABS(amount_paise) ELSE 0 END), 0)
    INTO v_total_fees_assessed_paise, v_total_fees_reversed_paise
    FROM public.platform_fee_ledger
    WHERE (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    v_net_fees_owed_paise := v_total_fees_assessed_paise - v_total_fees_reversed_paise;

    -- Verified collections by Vaangly
    SELECT
        COALESCE(SUM(verified_amount_paise), 0)
    INTO v_verified_fees_collected_paise
    FROM public.merchant_settlements
    WHERE verification_status = 'verified'
      AND (p_start_date IS NULL OR verified_at >= p_start_date)
      AND (p_end_date IS NULL OR verified_at <= p_end_date);

    -- Cumulative outstanding balances across all merchants
    WITH merchant_ledger_totals AS (
        SELECT
            shop_id,
            COALESCE(SUM(amount_paise), 0) AS net_ledger_paise
        FROM public.platform_fee_ledger
        GROUP BY shop_id
    ),
    merchant_settled_totals AS (
        SELECT
            shop_id,
            COALESCE(SUM(verified_amount_paise), 0) AS net_settled_paise
        FROM public.merchant_settlements
        WHERE verification_status = 'verified'
        GROUP BY shop_id
    ),
    merchant_balances AS (
        SELECT
            s.id AS shop_id,
            GREATEST(0, COALESCE(l.net_ledger_paise, 0) - COALESCE(st.net_settled_paise, 0)) AS balance_paise
        FROM public.shops s
        LEFT JOIN merchant_ledger_totals l ON l.shop_id = s.id
        LEFT JOIN merchant_settled_totals st ON st.shop_id = s.id
    )
    SELECT
        COALESCE(SUM(balance_paise), 0),
        COUNT(*) FILTER (WHERE balance_paise > 0),
        COUNT(*) FILTER (WHERE balance_paise = 0)
    INTO v_total_outstanding_paise, v_merchants_with_outstanding, v_fully_settled_merchants
    FROM merchant_balances;

    -- Pending settlements count
    SELECT COUNT(*)
    INTO v_pending_settlement_count
    FROM public.merchant_settlements
    WHERE verification_status IN ('submitted', 'under_review');

    RETURN jsonb_build_object(
        'success', true,
        'total_registered_merchants', v_total_merchants,
        'merchants_with_completed_orders', v_merchants_with_orders,
        'merchants_with_outstanding_fees', v_merchants_with_outstanding,
        'fully_settled_merchants', v_fully_settled_merchants,
        'total_completed_orders', v_total_completed_orders,
        'total_gmv_paise', v_total_gmv_paise,
        'total_platform_fees_assessed_paise', v_total_fees_assessed_paise,
        'total_platform_fees_reversed_paise', v_total_fees_reversed_paise,
        'net_platform_fees_owed_paise', v_net_fees_owed_paise,
        'verified_fees_collected_paise', v_verified_fees_collected_paise,
        'total_outstanding_paise', v_total_outstanding_paise,
        'pending_settlement_requests_count', v_pending_settlement_count
    );
END;
$$;

-- G. Verify Merchant Settlement and Allocate to Ledger Atomically
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
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_st RECORD;
    v_unallocated_amount INTEGER;
    v_entry RECORD;
    v_allocate_chunk INTEGER;
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

        -- Allocate against unallocated fee_assessed ledger entries FIFO (excluding reversed orders)
        v_unallocated_amount := p_verified_amount_paise;

        FOR v_entry IN
            SELECT l.id, l.amount_paise, COALESCE(SUM(sa.allocated_amount_paise), 0) AS total_allocated
            FROM public.platform_fee_ledger l
            LEFT JOIN public.settlement_allocations sa ON sa.ledger_entry_id = l.id
            WHERE l.shop_id = v_st.shop_id 
              AND l.entry_type = 'fee_assessed'
              AND NOT EXISTS (
                  SELECT 1 FROM public.platform_fee_ledger rev
                  WHERE rev.shop_id = l.shop_id 
                    AND rev.request_id = l.request_id 
                    AND rev.entry_type = 'fee_reversed'
              )
            GROUP BY l.id, l.amount_paise, l.created_at
            HAVING l.amount_paise > COALESCE(SUM(sa.allocated_amount_paise), 0)
            ORDER BY l.created_at ASC
        LOOP
            EXIT WHEN v_unallocated_amount <= 0;
            v_allocate_chunk := LEAST(v_unallocated_amount, v_entry.amount_paise - v_entry.total_allocated);

            IF v_allocate_chunk > 0 THEN
                INSERT INTO public.settlement_allocations (
                    settlement_id, shop_id, ledger_entry_id, allocated_amount_paise, allocated_by
                )
                VALUES (
                    p_settlement_id, v_st.shop_id, v_entry.id, v_allocate_chunk, p_admin_id
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
            'Admin verified funds received and allocated to merchant ledger.'
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'verified',
            'verified_amount_paise', p_verified_amount_paise,
            'remaining_unallocated_paise', v_unallocated_amount
        );
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be "verify" or "reject".');
    END IF;
END;
$$;

-- H. Activate Platform Fee System Atomically (Admin Only)
-- Enables the fee system in platform_settings, stamps exact activated_at,
-- activates rules in platform_fee_rules, and records an immutable audit log.
CREATE OR REPLACE FUNCTION public.activate_platform_fee_system(
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_admin UUID;
    v_prev_config JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only platform admin can activate fee system.');
    END IF;

    v_admin := COALESCE(auth.uid(), p_admin_id);

    -- Fetch current state
    SELECT value INTO v_prev_config FROM public.platform_settings WHERE key = 'platform_fee_system';

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

-- ----------------------------------------------------------------------------
-- 9. Row Level Security Policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.platform_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

-- platform_fee_rules
DROP POLICY IF EXISTS "Anyone can read active platform fee rules" ON public.platform_fee_rules;
CREATE POLICY "Anyone can read active platform fee rules"
    ON public.platform_fee_rules FOR SELECT
    USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can manage platform fee rules" ON public.platform_fee_rules;
CREATE POLICY "Only admin can manage platform fee rules"
    ON public.platform_fee_rules FOR ALL
    USING (public.is_admin());

-- platform_fee_ledger
DROP POLICY IF EXISTS "Merchants can read their own ledger; admins read all" ON public.platform_fee_ledger;
CREATE POLICY "Merchants can read their own ledger; admins read all"
    ON public.platform_fee_ledger FOR SELECT
    USING (
        public.is_admin()
        OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    );

-- merchant_settlements
DROP POLICY IF EXISTS "Merchants and admins can read settlements" ON public.merchant_settlements;
CREATE POLICY "Merchants and admins can read settlements"
    ON public.merchant_settlements FOR SELECT
    USING (
        public.is_admin()
        OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Merchants can submit settlements for their own shop" ON public.merchant_settlements;
CREATE POLICY "Merchants can submit settlements for their own shop"
    ON public.merchant_settlements FOR INSERT
    WITH CHECK (
        shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Only admins can update settlements" ON public.merchant_settlements;
CREATE POLICY "Only admins can update settlements"
    ON public.merchant_settlements FOR UPDATE
    USING (public.is_admin());

-- settlement_allocations
DROP POLICY IF EXISTS "Merchants and admins can view allocations" ON public.settlement_allocations;
CREATE POLICY "Merchants and admins can view allocations"
    ON public.settlement_allocations FOR SELECT
    USING (
        public.is_admin()
        OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    );

-- financial_audit_logs
DROP POLICY IF EXISTS "Only admins can access financial audit logs" ON public.financial_audit_logs;
CREATE POLICY "Only admins can access financial audit logs"
    ON public.financial_audit_logs FOR ALL
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. Table and Function Permissions
-- ----------------------------------------------------------------------------

GRANT SELECT ON public.platform_fee_rules TO anon, authenticated;
GRANT ALL ON public.platform_fee_rules TO service_role;

GRANT SELECT ON public.platform_fee_ledger TO authenticated;
GRANT ALL ON public.platform_fee_ledger TO service_role;

GRANT SELECT, INSERT ON public.merchant_settlements TO authenticated;
GRANT ALL ON public.merchant_settlements TO service_role;

GRANT SELECT ON public.settlement_allocations TO authenticated;
GRANT ALL ON public.settlement_allocations TO service_role;

GRANT SELECT ON public.financial_audit_logs TO authenticated;
GRANT ALL ON public.financial_audit_logs TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_platform_fee(INTEGER, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_pickup_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_pickup_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_and_assess_fee(UUID, TEXT, TEXT, UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_order_fee_reversal(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_merchant_financial_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_financial_kpis(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_merchant_settlement(UUID, TEXT, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_platform_fee_system(UUID) TO authenticated, service_role;


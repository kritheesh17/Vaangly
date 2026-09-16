-- VAANGO PHASE 5: ADMIN & BUSINESS OPERATIONS MIGRATION
-- Supports PostgreSQL / Supabase with Row Level Security (RLS)

-- 1. SECURITY DEFINER HELPER FUNCTION TO CHECK ADMIN ROLE
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. SHOP SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.shop_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'TRIAL' CHECK (status IN ('TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED')),
    trial_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_end_date TIMESTAMPTZ NOT NULL,
    go_live_date TIMESTAMPTZ,
    daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 10.00 CHECK (daily_rate >= 0 AND daily_rate <= 20.00),
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('WEEKLY', 'MONTHLY')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (amount_due >= 0),
    last_payment_date TIMESTAMPTZ,
    grace_period_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_shop_subscription UNIQUE (shop_id)
);

-- 3. SUBSCRIPTION PAYMENTS (Manual UPI Recording by Platform Admin)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES public.shop_subscriptions(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    amount_paid NUMERIC(10, 2) NOT NULL CHECK (amount_paid > 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('WEEKLY', 'MONTHLY')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    payment_reference VARCHAR(140) NOT NULL,
    recorded_by_admin_id UUID NOT NULL REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ADMIN AUDIT LOGS TABLE (Operational Transparency)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id),
    action_type VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_shop ON public.shop_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_status ON public.shop_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_shop ON public.subscription_payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_sub ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON public.admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_logs(created_at DESC);

-- 6. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE public.shop_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- (A) LOCATIONS: Admins can view inactive locations, insert, and update
CREATE POLICY "Admins can view all locations" ON public.locations
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can insert locations" ON public.locations
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update locations" ON public.locations
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- (B) PROFILES: Admins can view all profiles
CREATE POLICY "Admins can read all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin());

-- (C) SHOPS: Admins can view all shops (pending, active, suspended) and update
CREATE POLICY "Admins can view all shops" ON public.shops
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can update all shops" ON public.shops
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- (D) SHOP APPLICATIONS: Admins can view and update applications
CREATE POLICY "Admins can view all applications" ON public.shop_applications
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can update applications" ON public.shop_applications
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- (E) REQUESTS & EVENTS: Admins have read-only inspection
CREATE POLICY "Admins can inspect all requests" ON public.requests
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can inspect all request events" ON public.request_events
    FOR SELECT USING (public.is_admin());

-- (F) SUBSCRIPTIONS: Admins manage all; Shopkeepers read own
CREATE POLICY "Admins manage all subscriptions" ON public.shop_subscriptions
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Shopkeepers view own subscription" ON public.shop_subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = shop_subscriptions.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- (G) SUBSCRIPTION PAYMENTS: Admins manage all; Shopkeepers read own
CREATE POLICY "Admins manage all subscription payments" ON public.subscription_payments
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Shopkeepers view own subscription payments" ON public.subscription_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = subscription_payments.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- (H) ADMIN AUDIT LOGS: Admins view and insert
CREATE POLICY "Admins manage audit logs" ON public.admin_audit_logs
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- (I) STORAGE BUCKET: Private KYC / ID Proofs for shop applications
-- Allow admins to read shopkeeper documents; customers and other shopkeepers are denied
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects'
    ) THEN
        DROP POLICY IF EXISTS "Admins View Shop Documents" ON storage.objects;
        CREATE POLICY "Admins View Shop Documents" ON storage.objects
            FOR SELECT USING (
                bucket_id = 'shop-documents' 
                AND public.is_admin()
            );
    END IF;
END $$;

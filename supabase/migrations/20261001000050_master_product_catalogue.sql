-- ==============================================================================
-- Migration: 20261001000050_master_product_catalogue.sql
-- Description: Global Master Product Catalogue Architecture
-- 1. Creates public.master_products table with lifecycle status and normalization.
-- 2. Links public.shop_products to master_products via nullable master_product_id.
-- 3. Implements strict RLS:
--    - Public/authenticated read: approved master products only.
--    - Creators can view their own pending/rejected submissions.
--    - Admins can view, edit, approve, reject, archive all master products.
--    - Contributors can propose products (strictly enforced status='pending').
-- 4. Triggers to enforce non-admin proposals and auto-set approval metadata.
-- 5. RPCs for duplicate prevention and audited admin moderation.
-- ==============================================================================

-- 1. CREATE MASTER PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.master_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT GENERATED ALWAYS AS (lower(trim(name))) STORED,
    description TEXT,
    image_url TEXT,
    shop_type_id UUID REFERENCES public.shop_types(id) ON DELETE SET NULL,
    brand TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    moderation_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. EXTEND SHOP_PRODUCTS WITH NULLABLE master_product_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shop_products'
          AND column_name = 'master_product_id'
    ) THEN
        ALTER TABLE public.shop_products
        ADD COLUMN master_product_id UUID NULL REFERENCES public.master_products(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. INDEXES FOR HIGH-PERFORMANCE SEARCH & INTEGRITY
CREATE INDEX IF NOT EXISTS idx_master_products_status_shop_type 
    ON public.master_products(status, shop_type_id);

CREATE INDEX IF NOT EXISTS idx_master_products_norm_name 
    ON public.master_products(normalized_name);

CREATE INDEX IF NOT EXISTS idx_master_products_created_by 
    ON public.master_products(created_by);

CREATE INDEX IF NOT EXISTS idx_shop_products_master_product_id 
    ON public.shop_products(master_product_id);

-- 4. UPDATED_AT TRIGGER
DROP TRIGGER IF EXISTS trg_master_products_updated_at ON public.master_products;
CREATE TRIGGER trg_master_products_updated_at
    BEFORE UPDATE ON public.master_products
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 5. TRIGGER GUARDS FOR INSERT & UPDATE
CREATE OR REPLACE FUNCTION public.guard_master_product_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR current_user IN ('postgres', 'service_role') OR auth.role() = 'service_role') THEN
        -- Force safe defaults for non-admin shopkeeper proposals
        NEW.status := 'pending';
        NEW.created_by := auth.uid();
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
    ELSE
        -- Admin / Superuser insert defaults
        IF NEW.created_by IS NULL THEN
            NEW.created_by := COALESCE(auth.uid(), NEW.approved_by);
        END IF;
        IF NEW.status IS NULL THEN
            NEW.status := 'approved';
        END IF;
        IF NEW.status = 'approved' AND NEW.approved_by IS NULL THEN
            NEW.approved_by := COALESCE(auth.uid(), NEW.created_by);
            NEW.approved_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_master_product_insert ON public.master_products;
CREATE TRIGGER trg_guard_master_product_insert
    BEFORE INSERT ON public.master_products
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_master_product_insert();

CREATE OR REPLACE FUNCTION public.guard_master_product_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR current_user IN ('postgres', 'service_role') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Only administrators can modify master catalogue products';
    END IF;
    
    -- If status transitioned to approved, record approval metadata
    IF NEW.status = 'approved' AND (OLD.status <> 'approved' OR OLD.status IS NULL) THEN
        IF NEW.approved_by IS NULL THEN
            NEW.approved_by := COALESCE(auth.uid(), NEW.created_by);
        END IF;
        IF NEW.approved_at IS NULL THEN
            NEW.approved_at := now();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_master_product_update ON public.master_products;
CREATE TRIGGER trg_guard_master_product_update
    BEFORE UPDATE ON public.master_products
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_master_product_update();

-- 6. DUPLICATE PREVENTION & SEARCH HELPER RPC
CREATE OR REPLACE FUNCTION public.check_master_product_duplicates(
    p_name TEXT,
    p_shop_type_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    image_url TEXT,
    shop_type_id UUID,
    brand TEXT,
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        mp.id,
        mp.name,
        mp.description,
        mp.image_url,
        mp.shop_type_id,
        mp.brand,
        mp.status
    FROM public.master_products mp
    WHERE mp.status IN ('approved', 'pending')
      AND (
          mp.normalized_name = lower(trim(p_name))
          OR mp.normalized_name ILIKE '%' || lower(trim(p_name)) || '%'
          OR lower(trim(p_name)) ILIKE '%' || mp.normalized_name || '%'
      )
      AND (p_shop_type_id IS NULL OR mp.shop_type_id IS NULL OR mp.shop_type_id = p_shop_type_id)
    ORDER BY 
      CASE WHEN mp.normalized_name = lower(trim(p_name)) THEN 0 ELSE 1 END,
      mp.name ASC
    LIMIT 10;
$$;

-- 7. AUDITED ADMIN MODERATION RPC
CREATE OR REPLACE FUNCTION public.admin_moderate_master_product(
    p_master_product_id UUID,
    p_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1));
    v_product public.master_products%ROWTYPE;
    v_before JSONB;
BEGIN
    IF NOT (public.is_admin() OR current_user IN ('postgres', 'service_role') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can moderate master catalogue products';
    END IF;

    IF p_status NOT IN ('approved', 'rejected', 'archived') THEN
        RAISE EXCEPTION 'Invalid status. Must be approved, rejected, or archived';
    END IF;

    SELECT * INTO v_product
    FROM public.master_products
    WHERE id = p_master_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Master product not found';
    END IF;

    v_before := jsonb_build_object(
        'id', v_product.id,
        'name', v_product.name,
        'status', v_product.status,
        'moderation_reason', v_product.moderation_reason
    );

    UPDATE public.master_products
    SET status = p_status,
        moderation_reason = p_reason,
        approved_by = CASE WHEN p_status = 'approved' THEN v_admin_id ELSE approved_by END,
        approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
        updated_at = now()
    WHERE id = p_master_product_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action_type,
        entity_type,
        entity_id,
        details,
        created_at
    ) VALUES (
        v_admin_id,
        'master_product_moderated',
        'master_product',
        p_master_product_id::text,
        jsonb_build_object(
            'before', v_before,
            'after_status', p_status,
            'reason', p_reason
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'master_product_id', p_master_product_id,
        'status', p_status
    );
END;
$$;

-- 8. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.master_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read approved master products" ON public.master_products;
CREATE POLICY "Public read approved master products"
    ON public.master_products
    FOR SELECT
    USING (
        status = 'approved'
        OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Admins insert master products" ON public.master_products;
CREATE POLICY "Admins insert master products"
    ON public.master_products
    FOR INSERT
    WITH CHECK (
        public.is_admin()
    );

DROP POLICY IF EXISTS "Shopkeepers propose master products" ON public.master_products;
CREATE POLICY "Shopkeepers propose master products"
    ON public.master_products
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by = auth.uid()
        AND status = 'pending'
    );

DROP POLICY IF EXISTS "Admins update master products" ON public.master_products;
CREATE POLICY "Admins update master products"
    ON public.master_products
    FOR UPDATE
    USING (
        public.is_admin()
    )
    WITH CHECK (
        public.is_admin()
    );

DROP POLICY IF EXISTS "Admins delete master products" ON public.master_products;
CREATE POLICY "Admins delete master products"
    ON public.master_products
    FOR DELETE
    USING (
        public.is_admin()
    );

-- Grant appropriate permissions
GRANT SELECT ON public.master_products TO anon, authenticated, service_role;
GRANT INSERT ON public.master_products TO authenticated, service_role;
GRANT UPDATE, DELETE ON public.master_products TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_master_product_duplicates(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_master_product(UUID, TEXT, TEXT) TO authenticated, service_role;

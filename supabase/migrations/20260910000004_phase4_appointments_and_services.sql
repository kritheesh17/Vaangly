-- VAANGO PHASE 4: APPOINTMENTS & SERVICES DATABASE MIGRATION

-- 1. EXTEND SHOP_SERVICES TABLE WITH RANGE PRICING & PROVIDER METADATA
ALTER TABLE public.shop_services
    ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'range')),
    ADD COLUMN IF NOT EXISTS min_price NUMERIC(10, 2) CHECK (min_price IS NULL OR min_price >= 0),
    ADD COLUMN IF NOT EXISTS max_price NUMERIC(10, 2) CHECK (max_price IS NULL OR max_price >= 0),
    ADD COLUMN IF NOT EXISTS provider_name VARCHAR(140),
    ADD COLUMN IF NOT EXISTS specialization VARCHAR(140),
    ADD COLUMN IF NOT EXISTS service_category VARCHAR(60);

-- 2. CREATE APPOINTMENT_SLOTS TABLE WITH CONCURRENCY CONSTRAINT
CREATE TABLE IF NOT EXISTS public.appointment_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.shop_services(id) ON DELETE SET NULL,
    slot_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    booked_by_request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enforce uniqueness of slot per shop, date, and start time to prevent double booking
    CONSTRAINT unique_shop_slot UNIQUE(shop_id, slot_date, start_time)
);

-- 3. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_slots_shop_date ON public.appointment_slots(shop_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_availability ON public.appointment_slots(is_available);
CREATE INDEX IF NOT EXISTS idx_services_shop ON public.shop_services(shop_id);

-- 4. ATOMIC SLOT BOOKING FUNCTION (Guarantees double-booking prevention)
CREATE OR REPLACE FUNCTION public.book_appointment_slot(
    p_slot_id UUID,
    p_request_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_available BOOLEAN;
BEGIN
    -- Row-level lock to prevent race condition
    SELECT is_available INTO v_available
    FROM public.appointment_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF v_available IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    UPDATE public.appointment_slots
    SET is_available = FALSE,
        booked_by_request_id = p_request_id
    WHERE id = p_slot_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS POLICIES FOR APPOINTMENT SLOTS
ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;

-- Public can view open slots of active & live shops
CREATE POLICY "Public read available appointment slots" ON public.appointment_slots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = appointment_slots.shop_id 
              AND status = 'active' 
              AND is_live = TRUE
        )
    );

-- Shop owners can manage their appointment slots
CREATE POLICY "Shop owners manage slots" ON public.appointment_slots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = appointment_slots.shop_id 
              AND owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.shops 
            WHERE id = appointment_slots.shop_id 
              AND owner_id = auth.uid()
        )
    );

-- Enable Realtime publication on appointment_slots
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_slots;

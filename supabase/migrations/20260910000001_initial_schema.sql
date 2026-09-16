-- VAANGO PHASE 1: FOUNDATIONAL DATABASE SCHEMA & MIGRATION
-- Supports PostgreSQL / Supabase with Row Level Security (RLS)

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROFILES TABLE (Linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'shopkeeper', 'admin')),
    full_name VARCHAR(120) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    avatar_url TEXT,
    preferred_location_id UUID,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. LOCATIONS TABLE (Hyperlocal hometowns & zones)
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_launch_town BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link profile preferred location to locations
ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_location 
    FOREIGN KEY (preferred_location_id) 
    REFERENCES public.locations(id) 
    ON DELETE SET NULL;

-- 4. WORKFLOW GROUPS (Order, Appointment, Service)
CREATE TABLE IF NOT EXISTS public.workflow_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30) UNIQUE NOT NULL CHECK (code IN ('ORDER', 'APPOINTMENT', 'SERVICE')),
    name VARCHAR(80) NOT NULL,
    description TEXT,
    icon VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WORKFLOW STATES
CREATE TABLE IF NOT EXISTS public.workflow_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.workflow_groups(id) ON DELETE CASCADE,
    code VARCHAR(40) NOT NULL,
    label VARCHAR(60) NOT NULL,
    is_initial BOOLEAN NOT NULL DEFAULT FALSE,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    color_badge VARCHAR(30) DEFAULT 'neutral',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, code)
);

-- 6. WORKFLOW TRANSITIONS (State Machine Rules)
CREATE TABLE IF NOT EXISTS public.workflow_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.workflow_groups(id) ON DELETE CASCADE,
    from_state_id UUID NOT NULL REFERENCES public.workflow_states(id) ON DELETE CASCADE,
    to_state_id UUID NOT NULL REFERENCES public.workflow_states(id) ON DELETE CASCADE,
    allowed_actor_roles TEXT[] NOT NULL DEFAULT ARRAY['shopkeeper']::TEXT[],
    action_label VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, from_state_id, to_state_id)
);

-- 7. SHOP TYPES (Mapped to Workflow Groups)
CREATE TABLE IF NOT EXISTS public.shop_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(80) NOT NULL,
    workflow_group_code VARCHAR(30) NOT NULL REFERENCES public.workflow_groups(code),
    icon VARCHAR(40) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. SHOPS TABLE
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    shop_type_id UUID NOT NULL REFERENCES public.shop_types(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    name VARCHAR(140) NOT NULL,
    tagline VARCHAR(200),
    address_line TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'active', 'suspended')),
    photo_url TEXT,
    opening_time TIME,
    closing_time TIME,
    is_open_today BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. SHOP PRODUCTS (Catalogue Foundation for Order Workflow)
CREATE TABLE IF NOT EXISTS public.shop_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    unit VARCHAR(30) NOT NULL DEFAULT 'item',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. SHOP SERVICES (Catalogue Foundation for Appointment & Service Workflows)
CREATE TABLE IF NOT EXISTS public.shop_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) CHECK (base_price IS NULL OR base_price >= 0),
    duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. REQUESTS (Central Entity for Orders, Appointments, and Services)
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_code VARCHAR(30) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
    workflow_group_code VARCHAR(30) NOT NULL REFERENCES public.workflow_groups(code),
    current_state VARCHAR(40) NOT NULL,
    total_estimate NUMERIC(10, 2),
    notes TEXT,
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. REQUEST EVENTS (Audit trail of state transitions)
CREATE TABLE IF NOT EXISTS public.request_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    from_state VARCHAR(40),
    to_state VARCHAR(40) NOT NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id),
    actor_role VARCHAR(20) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. SHOP ONBOARDING APPLICATIONS
CREATE TABLE IF NOT EXISTS public.shop_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shop_name VARCHAR(140) NOT NULL,
    shop_type_id UUID NOT NULL REFERENCES public.shop_types(id),
    location_id UUID NOT NULL REFERENCES public.locations(id),
    contact_phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
    id_proof_url TEXT,
    review_notes TEXT,
    reviewed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_shops_location ON public.shops(location_id);
CREATE INDEX IF NOT EXISTS idx_shops_type ON public.shops(shop_type_id);
CREATE INDEX IF NOT EXISTS idx_shops_status ON public.shops(status);
CREATE INDEX IF NOT EXISTS idx_requests_customer ON public.requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_shop ON public.requests(shop_id);
CREATE INDEX IF NOT EXISTS idx_requests_state ON public.requests(current_state);
CREATE INDEX IF NOT EXISTS idx_request_events_request ON public.request_events(request_id);

-- 15. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_applications ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view and update their own profile; Admins can view all
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Locations: Public read access for active locations; Admins manage
CREATE POLICY "Public read active locations" ON public.locations
    FOR SELECT USING (is_active = TRUE);

-- Workflow Groups & States: Public read access
CREATE POLICY "Public read workflow groups" ON public.workflow_groups
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read workflow states" ON public.workflow_states
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read workflow transitions" ON public.workflow_transitions
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read shop types" ON public.shop_types
    FOR SELECT USING (is_active = TRUE);

-- Shops: Public can read active/verified shops; Owners can manage their shop
CREATE POLICY "Public read active shops" ON public.shops
    FOR SELECT USING (status IN ('active', 'verified'));

CREATE POLICY "Owners can read their shop" ON public.shops
    FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Owners can update their shop" ON public.shops
    FOR UPDATE USING (auth.uid() = owner_id);

-- Products & Services: Public read for available items of active shops
CREATE POLICY "Public read shop products" ON public.shop_products
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.shops WHERE id = shop_products.shop_id AND status IN ('active', 'verified'))
    );

CREATE POLICY "Public read shop services" ON public.shop_services
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.shops WHERE id = shop_services.shop_id AND status IN ('active', 'verified'))
    );

-- Requests: Customers can view their own; Shopkeepers can view requests for their shops
CREATE POLICY "Customers can view own requests" ON public.requests
    FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Shop owners can view shop requests" ON public.requests
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.shops WHERE id = requests.shop_id AND owner_id = auth.uid())
    );

CREATE POLICY "Customers can create requests" ON public.requests
    FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- Request Events: Parties involved can view history
CREATE POLICY "Parties can view request events" ON public.request_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.requests r
            JOIN public.shops s ON s.id = r.shop_id
            WHERE r.id = request_events.request_id 
              AND (r.customer_id = auth.uid() OR s.owner_id = auth.uid())
        )
    );

-- 16. SEED DATA (Launch Town, Workflow Groups, Core Shop Types)
INSERT INTO public.locations (id, name, state, pincode, is_active, is_launch_town)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Town Center / Hometown', 'Tamil Nadu', '638452', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_groups (id, code, name, description, icon)
VALUES 
    ('22222222-2222-2222-2222-222222222221', 'ORDER', 'Order-Based', 'Pre-order daily essentials without standing in long queues', 'ShoppingBag'),
    ('22222222-2222-2222-2222-222222222222', 'APPOINTMENT', 'Appointment-Based', 'Reserve designated time slots for dedicated personal care', 'Calendar'),
    ('22222222-2222-2222-2222-222222222223', 'SERVICE', 'Service-Based', 'Request skilled repairs, tailoring, and maintenance', 'Wrench')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.shop_types (code, name, workflow_group_code, icon, display_order)
VALUES
    -- Group A: Order
    ('grocery', 'Grocery & Provision', 'ORDER', 'ShoppingCart', 10),
    ('bakery', 'Bakery & Sweets', 'ORDER', 'Cake', 20),
    ('restaurant', 'Restaurant & Eatery', 'ORDER', 'Utensils', 30),
    ('pharmacy', 'Pharmacy & Medicals', 'ORDER', 'Pill', 40),
    ('stationery', 'Stationery & Books', 'ORDER', 'BookOpen', 50),
    -- Group B: Appointment
    ('salon', 'Salon & Parlour', 'APPOINTMENT', 'Scissors', 60),
    ('clinic', 'Clinic & Healthcare', 'APPOINTMENT', 'HeartPulse', 70),
    -- Group C: Service
    ('tailor', 'Tailor & Stitching', 'SERVICE', 'Shirt', 80),
    ('mechanic', 'Auto Mechanic & Two-Wheeler', 'SERVICE', 'Tool', 90),
    ('repair', 'Mobile & Electronics Repair', 'SERVICE', 'Smartphone', 100),
    ('laundry', 'Laundry & Dry Cleaners', 'SERVICE', 'Sparkles', 110)
ON CONFLICT (code) DO NOTHING;

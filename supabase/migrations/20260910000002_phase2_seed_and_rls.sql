-- VAANGO PHASE 2: CUSTOMER MVP DATABASE SEEDS & RLS POLICIES

-- 1. SUPPORTED LOCATIONS (Sorted in ascending alphabetical order)
INSERT INTO public.locations (id, name, state, pincode, is_active, is_launch_town)
VALUES 
    ('10000000-0000-0000-0000-000000000001', 'Chennai', 'Tamil Nadu', '600001', TRUE, FALSE),
    ('10000000-0000-0000-0000-000000000002', 'Coimbatore', 'Tamil Nadu', '641001', TRUE, FALSE),
    ('11111111-1111-1111-1111-111111111111', 'Gobichettipalayam', 'Tamil Nadu', '638452', TRUE, TRUE),
    ('10000000-0000-0000-0000-000000000003', 'Madurai', 'Tamil Nadu', '625001', TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

-- 2. VERIFIED GROUP A DEMO SHOPS (For Launch Town: Gobichettipalayam)
-- Demo rows require an existing Auth-linked owner profile. They are skipped on
-- a clean install until that profile exists; no invalid orphan rows are made.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '20000000-0000-0000-0000-000000000001') THEN
INSERT INTO public.shops (id, owner_id, shop_type_id, location_id, name, tagline, address_line, phone, status, opening_time, closing_time, is_open_today)
VALUES
    (
                '30000000-0000-0000-0000-000000000001',
                '20000000-0000-0000-0000-000000000001',
        (SELECT id FROM public.shop_types WHERE code = 'grocery'),
        '11111111-1111-1111-1111-111111111111',
        'Murugan Supermarket & Spices',
        'Farm-fresh daily groceries, country pulses & pure spices',
        '14 Cutcherry Street, Town Center',
        '+91 98765 12345',
        'active',
        '07:30',
        '21:30',
        TRUE
    ),
    (
        '30000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001',
        (SELECT id FROM public.shop_types WHERE code = 'bakery'),
        '11111111-1111-1111-1111-111111111111',
        'Annapoorna Hot Bakery & Sweets',
        'Woodfire oven breads, fresh puffs, hot samosas & pure ghee sweets',
        '88 Kutchery Road, Near Bus Stand',
        '+91 98765 23456',
        'active',
        '08:00',
        '22:00',
        TRUE
    ),
    (
        '30000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000001',
        (SELECT id FROM public.shop_types WHERE code = 'restaurant'),
        '11111111-1111-1111-1111-111111111111',
        'Sri Krishna Bhavan Pure Veg',
        'Authentic Kongu tiffin, filter coffee & meals ready for counter pickup',
        '5 Sathy Main Road, Opp. Taluk Office',
        '+91 98765 34567',
        'active',
        '06:30',
        '22:30',
        TRUE
    ),
    (
        '30000000-0000-0000-0000-000000000004',
        '20000000-0000-0000-0000-000000000001',
        (SELECT id FROM public.shop_types WHERE code = 'pharmacy'),
        '11111111-1111-1111-1111-111111111111',
        'Apollo Neighborhood Medicals',
        'Registered pharmacist, daily essentials & baby care',
        '22 Hospital Road, Near GH',
        '+91 98765 45678',
        'active',
        '08:00',
        '23:00',
        TRUE
    ),
    (
        '30000000-0000-0000-0000-000000000005',
        '20000000-0000-0000-0000-000000000001',
        (SELECT id FROM public.shop_types WHERE code = 'stationery'),
        '11111111-1111-1111-1111-111111111111',
        'Scholar Book Centre & Stationery',
        'School supplies, college notebooks, printing & office paper',
        '41 High School Road',
        '+91 98765 56789',
        'active',
        '09:00',
        '20:30',
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- 3. PRODUCTS FOR GROCERY SHOP (Murugan Supermarket)
INSERT INTO public.shop_products (id, shop_id, name, description, price, unit, is_available)
VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Country Tomatoes (நாட்டு தக்காளி)', 'Fresh locally harvested country tomatoes with natural tanginess.', 32.00, 'kg', TRUE),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Small Shallots (சின்ன வெங்காயம்)', 'Hand-peeled quality Sambar small onions direct from Dharapuram.', 58.00, 'kg', TRUE),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Bhavani Ponni Boiled Rice (பொன்னி அரிசி)', '1-year naturally aged silky soft Ponni boiled rice.', 64.00, 'kg', TRUE),
    ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Toor Dal (துவரம் பருப்பு)', 'Grade-A unpolished country toor dal for aromatic sambar.', 165.00, 'kg', TRUE),
    ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'Pure Cold-Pressed Gingelly Oil (நல்லெண்ணெய்)', 'Traditional wood-pressed sesame oil prepared with palm jaggery.', 240.00, '500ml bottle', TRUE),
    ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'Fresh Farm Cow Milk (பசும்பால்)', 'Morning pasteurized fresh local dairy milk.', 28.00, '500ml pouch', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 4. PRODUCTS FOR BAKERY (Annapoorna Bakery)
INSERT INTO public.shop_products (id, shop_id, name, description, price, unit, is_available)
VALUES
    ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000002', 'Fresh Butter Milk Bread (ரொட்டி)', 'Soft sliced daily sandwich bread baked at 6:00 AM.', 45.00, 'pack (400g)', TRUE),
    ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000002', 'Crispy Veg Puff (காய்கறி பப்ஸ்)', 'Flaky golden pastry filled with spiced potato and carrots.', 20.00, 'piece', TRUE),
    ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000002', 'Honey Sponge Cake', 'Classic Kongu bakery honey drenched soft sponge cake with jam.', 35.00, 'slice', TRUE),
    ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000002', 'Salt & Butter Tea Biscuits', 'Crunchy traditional butter cookies ideal with evening filter tea.', 70.00, 'box (250g)', TRUE),
    ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000002', 'Eggless Black Forest Pastry', 'Fresh cream pastry topped with dark chocolate flakes and cherries.', 75.00, 'slice', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 5. PRODUCTS FOR RESTAURANT (Sri Krishna Bhavan)
INSERT INTO public.shop_products (id, shop_id, name, description, price, unit, is_available)
VALUES
    ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000003', 'Special Ghee Roast Dosa (நெய் ரோஸ்ட்)', 'Crisp golden crepe made with pure butter ghee, served with 3 chutneys & sambar.', 85.00, 'plate', TRUE),
    ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000003', 'Hot Sambar Idli (2 pcs) (சாம்பார் இட்லி)', 'Steaming soft mallipoo idlis dunked in piping hot drumstick sambar.', 50.00, 'plate', TRUE),
    ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000003', 'Crispy Medu Vada (மெது வடை)', 'Crunchy golden urad dal donut fritter with coconut chutney.', 25.00, 'piece', TRUE),
    ('40000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000003', 'Kumbakonam Degree Filter Coffee (காபி)', 'Strong freshly brewed chicory blend filter coffee in brass tumbler.', 30.00, 'cup', TRUE)
ON CONFLICT (id) DO NOTHING;

    END IF;
END $$;

-- 6. RLS SECURITY POLICY EXTENSIONS FOR REQUESTS
-- Ensure customers can insert their own request events
CREATE POLICY "Customers can insert request events" ON public.request_events
    FOR INSERT WITH CHECK (
        auth.uid() = actor_id
    );

-- Enable Realtime publication on requests table
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;

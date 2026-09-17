-- Vaangly core schema bridge and integrity migration.
-- Additive only: preserves the existing legacy schema and application contracts.
-- This migration is additive and preserves the existing legacy application schema.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Existing-schema compatibility additions
-- ---------------------------------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

WITH location_bases AS (
  SELECT id,
    NULLIF(trim(both '-' FROM lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))), '') AS base_slug
  FROM public.locations
), ranked_locations AS (
  SELECT id,
    COALESCE(base_slug, 'location') AS base_slug,
    row_number() OVER (PARTITION BY COALESCE(base_slug, 'location') ORDER BY id) AS slug_rank
  FROM location_bases
)
UPDATE public.locations l
SET slug = CASE
  WHEN r.slug_rank = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.slug_rank::text
END
FROM ranked_locations r
WHERE l.id = r.id AND (l.slug IS NULL OR l.slug = '');

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_slug
  ON public.locations(slug)
  WHERE slug IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_media_id uuid;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS request_kind text,
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS customer_notes text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.requests
SET request_kind = workflow_group_code
WHERE request_kind IS NULL;

UPDATE public.requests
SET total_amount = total_estimate
WHERE total_amount IS NULL;

ALTER TABLE public.requests
  ALTER COLUMN request_kind SET DEFAULT 'ORDER';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.requests'::regclass
      AND conname = 'vaangly_requests_fulfillment_type_check'
  ) THEN
    ALTER TABLE public.requests
      ADD CONSTRAINT vaangly_requests_fulfillment_type_check
      CHECK (fulfillment_type IS NULL OR fulfillment_type IN ('parcel', 'dine_in', 'pickup', 'delivery'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_request_kind_created
  ON public.requests(request_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_total_amount
  ON public.requests(shop_id, total_amount, created_at DESC);

ALTER TABLE public.appointment_slots
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confirmed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.appointment_slots
SET capacity = COALESCE(concurrent_capacity, 1)
WHERE capacity IS NULL OR capacity = 1;

CREATE INDEX IF NOT EXISTS idx_appointment_slots_capacity_lookup
  ON public.appointment_slots(shop_id, slot_date, start_time, capacity, confirmed_count);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role),
  CONSTRAINT user_roles_role_check CHECK (role IN ('customer', 'shopkeeper', 'admin', 'hospital_staff'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_user
  ON public.user_roles(role, user_id);

-- ---------------------------------------------------------------------------
-- Helper functions. These are created before policies and triggers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = p_role
  )
  OR (p_role = 'admin' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Roles and catalogue taxonomy
-- ---------------------------------------------------------------------------

INSERT INTO public.user_roles(user_id, role)
SELECT p.id, p.role
FROM public.profiles p
WHERE p.role IN ('customer', 'shopkeeper', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.business_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_categories_code_check CHECK (length(trim(code)) > 0),
  CONSTRAINT business_categories_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT business_categories_order_check CHECK (display_order >= 0)
);

INSERT INTO public.business_categories(code, name, display_order)
VALUES ('general', 'General', 0)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.business_types (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.business_categories(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  workflow_group_code text REFERENCES public.workflow_groups(code) ON DELETE RESTRICT,
  icon text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_types_code_check CHECK (length(trim(code)) > 0),
  CONSTRAINT business_types_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT business_types_order_check CHECK (display_order >= 0)
);

INSERT INTO public.business_types(
  id, category_id, code, name, workflow_group_code, icon, display_order, is_active
)
SELECT st.id,
       (SELECT id FROM public.business_categories WHERE code = 'general'),
       st.code,
       st.name,
       st.workflow_group_code,
       st.icon,
       st.display_order,
       st.is_active
FROM public.shop_types st
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_business_types_category_active
  ON public.business_types(category_id, is_active, display_order);

-- ---------------------------------------------------------------------------
-- Canonical business model, deterministically mapped from existing shops.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  business_type_id uuid NOT NULL REFERENCES public.business_types(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  tagline text,
  description text,
  address_line text NOT NULL,
  phone text NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  google_maps_url text,
  google_business_profile_url text,
  approval_status text NOT NULL DEFAULT 'pending',
  is_live boolean NOT NULL DEFAULT false,
  delivery_available boolean NOT NULL DEFAULT false,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  subscription_tier text NOT NULL DEFAULT 'FREE',
  suspended_at timestamptz,
  suspended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  suspension_reason text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_location_slug_unique UNIQUE (location_id, slug),
  CONSTRAINT businesses_approval_check CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT businesses_tier_check CHECK (subscription_tier IN ('FREE', 'PRO')),
  CONSTRAINT businesses_delivery_fee_check CHECK (delivery_fee >= 0),
  CONSTRAINT businesses_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT businesses_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT businesses_suspension_fields_check CHECK (
    suspended_at IS NULL OR (suspension_reason IS NOT NULL AND length(trim(suspension_reason)) > 0)
  )
);

INSERT INTO public.businesses(
  id, owner_profile_id, location_id, business_type_id, name, slug, tagline,
  address_line, phone, latitude, longitude, google_maps_url, approval_status,
  is_live, delivery_available, delivery_fee, subscription_tier, suspended_at,
  suspension_reason, created_at, updated_at
)
SELECT s.id,
       s.owner_id,
       s.location_id,
       s.shop_type_id,
       s.name,
       lower(regexp_replace(trim(s.name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(s.id::text, 1, 8),
       s.tagline,
       s.address_line,
       s.phone,
       s.gps_lat,
       s.gps_lng,
       s.google_maps_url,
      CASE WHEN s.status IN ('active', 'verified', 'suspended') THEN 'approved' ELSE s.status END,
       s.is_live,
       s.delivery_available,
       s.delivery_fee,
       COALESCE(s.subscription_tier, 'FREE'),
       CASE WHEN s.status = 'suspended' THEN COALESCE(s.updated_at, now()) ELSE NULL END,
       CASE WHEN s.status = 'suspended' THEN 'Migrated from legacy suspended shop status' ELSE NULL END,
       s.created_at,
       s.updated_at
FROM public.shops s
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_businesses_location_visibility
  ON public.businesses(location_id, approval_status, is_live)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_owner
  ON public.businesses(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_businesses_type
  ON public.businesses(business_type_id);
CREATE INDEX IF NOT EXISTS idx_businesses_name
  ON public.businesses(name);

CREATE TABLE IF NOT EXISTS public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'staff',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id),
  CONSTRAINT business_members_role_check CHECK (member_role IN ('owner', 'manager', 'staff'))
);

INSERT INTO public.business_members(business_id, user_id, member_role)
SELECT id, owner_profile_id, 'owner'
FROM public.businesses
ON CONFLICT (business_id, user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_business_members_user_active
  ON public.business_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_business_members_business_role
  ON public.business_members(business_id, member_role, is_active);

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = auth.uid()
      AND bm.is_active
  )
  OR EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_profile_id = auth.uid()
  );
$$;

CREATE TABLE IF NOT EXISTS public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  opens_at time,
  closes_at time,
  is_closed boolean NOT NULL DEFAULT false,
  is_24_hours boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_hours_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT business_hours_times_check CHECK (
    (is_24_hours AND NOT is_closed AND opens_at IS NULL AND closes_at IS NULL)
    OR (is_closed AND NOT is_24_hours AND opens_at IS NULL AND closes_at IS NULL)
    OR (NOT is_closed AND NOT is_24_hours AND opens_at IS NOT NULL AND closes_at IS NOT NULL)
  ),
  UNIQUE (business_id, weekday, opens_at)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_business_weekday
  ON public.business_hours(business_id, weekday);

CREATE TABLE IF NOT EXISTS public.business_hour_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT true,
  opens_at time,
  closes_at time,
  is_24_hours boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, exception_date, opens_at),
  CONSTRAINT business_hour_exceptions_times_check CHECK (
    (is_24_hours AND NOT is_closed AND opens_at IS NULL AND closes_at IS NULL)
    OR (is_closed AND NOT is_24_hours AND opens_at IS NULL AND closes_at IS NULL)
    OR (NOT is_closed AND NOT is_24_hours AND opens_at IS NOT NULL AND closes_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_business_hour_exceptions_date
  ON public.business_hour_exceptions(business_id, exception_date);

CREATE TABLE IF NOT EXISTS public.business_status (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  shopkeeper_status text NOT NULL DEFAULT 'not_accepting',
  admin_suspended boolean NOT NULL DEFAULT false,
  status_message text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_status_value_check CHECK (shopkeeper_status IN ('accepting', 'not_accepting', 'busy', 'delayed'))
);

INSERT INTO public.business_status(business_id, shopkeeper_status, admin_suspended)
SELECT b.id,
       CASE WHEN b.is_live THEN 'accepting' ELSE 'not_accepting' END,
       b.approval_status = 'approved' AND EXISTS (
         SELECT 1 FROM public.shops s WHERE s.id = b.id AND s.status = 'suspended'
       )
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_business_status_shopkeeper_status
  ON public.business_status(shopkeeper_status);

CREATE OR REPLACE FUNCTION public.is_business_publicly_visible(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    JOIN public.locations l ON l.id = b.location_id AND l.is_active
    WHERE b.id = p_business_id
      AND b.archived_at IS NULL
      AND b.approval_status = 'approved'
      AND b.is_live
      AND b.suspended_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.business_status bs
        WHERE bs.business_id = b.id AND bs.admin_suspended
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = b.id AND s.status = 'suspended'
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Storage references and canonical media associations.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_name text NOT NULL,
  storage_path text NOT NULL,
  media_kind text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint,
  visibility text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (bucket_name, storage_path),
  CONSTRAINT media_assets_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT media_assets_size_check CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)
);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_media_fk
  FOREIGN KEY (avatar_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_kind_visibility
  ON public.media_assets(media_kind, visibility);
CREATE INDEX IF NOT EXISTS idx_media_assets_uploader_created
  ON public.media_assets(uploaded_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.business_media (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, media_asset_id),
  CONSTRAINT business_media_sort_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_media_primary
  ON public.business_media(business_id)
  WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_business_media_order
  ON public.business_media(business_id, sort_order);

CREATE TABLE IF NOT EXISTS public.business_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  method text NOT NULL,
  upi_id text,
  qr_media_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  account_label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_payment_method_check CHECK (method IN ('upi', 'cash', 'other')),
  CONSTRAINT business_payment_upi_check CHECK (
    method <> 'upi' OR (length(trim(COALESCE(upi_id, ''))) > 0 OR qr_media_asset_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_active_upi
  ON public.business_payment_accounts(business_id, lower(upi_id))
  WHERE is_active AND upi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_payment_accounts_business
  ON public.business_payment_accounts(business_id, is_active);

-- ---------------------------------------------------------------------------
-- Applications and application evidence.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  business_type_id uuid NOT NULL REFERENCES public.business_types(id) ON DELETE RESTRICT,
  business_name text NOT NULL,
  owner_name text NOT NULL,
  description text,
  contact_phone text NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  google_maps_url text,
  upi_id text,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_applications_status_check CHECK (status IN ('submitted', 'under_review', 'correction_requested', 'approved', 'rejected')),
  CONSTRAINT business_applications_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT business_applications_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_applications_active
  ON public.business_applications(applicant_id, location_id, business_type_id)
  WHERE status IN ('submitted', 'under_review', 'correction_requested');
CREATE INDEX IF NOT EXISTS idx_business_applications_applicant_created
  ON public.business_applications(applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_applications_status_created
  ON public.business_applications(status, created_at);

CREATE TABLE IF NOT EXISTS public.business_application_media (
  application_id uuid NOT NULL REFERENCES public.business_applications(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  media_role text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, media_asset_id),
  UNIQUE (application_id, media_role, sort_order),
  CONSTRAINT business_application_media_role_check CHECK (
    media_role IN ('identity_document', 'storefront_photo', 'upi_qr', 'business_evidence')
  ),
  CONSTRAINT business_application_media_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_business_application_media_role
  ON public.business_application_media(application_id, media_role);

-- ---------------------------------------------------------------------------
-- Normalized service and product catalogue, backfilled from legacy rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  service_category text,
  price_type text NOT NULL DEFAULT 'fixed',
  base_price numeric(12,2),
  min_price numeric(12,2),
  max_price numeric(12,2),
  duration_minutes integer,
  provider_id uuid,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_price_type_check CHECK (price_type IN ('fixed', 'range', 'quote')),
  CONSTRAINT services_price_values_check CHECK (
    COALESCE(base_price, 0) >= 0 AND COALESCE(min_price, 0) >= 0 AND COALESCE(max_price, 0) >= 0
  ),
  CONSTRAINT services_price_model_check CHECK (
    (price_type = 'fixed' AND base_price IS NOT NULL)
    OR (price_type = 'range' AND min_price IS NOT NULL AND max_price IS NOT NULL AND min_price <= max_price)
    OR price_type = 'quote'
  ),
  CONSTRAINT services_duration_check CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

INSERT INTO public.services(
  id, business_id, name, description, service_category, price_type,
  base_price, min_price, max_price, duration_minutes, is_available,
  created_at, updated_at
)
SELECT ss.id,
       ss.shop_id,
       ss.name,
       ss.description,
       ss.service_category,
       ss.price_type,
       ss.base_price,
       ss.min_price,
       ss.max_price,
       ss.duration_minutes,
       ss.is_available,
       ss.created_at,
       ss.created_at
FROM public.shop_services ss
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_services_business_available
  ON public.services(business_id, is_available, created_at);
CREATE INDEX IF NOT EXISTS idx_services_provider_available
  ON public.services(provider_id, is_available)
  WHERE provider_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  description text,
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_unit text NOT NULL DEFAULT 'item',
  is_available boolean NOT NULL DEFAULT true,
  track_inventory boolean NOT NULL DEFAULT false,
  stock_quantity numeric(12,3),
  offer_label text,
  offer_type text,
  offer_value numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_price_check CHECK (base_price >= 0),
  CONSTRAINT products_stock_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  CONSTRAINT products_offer_type_check CHECK (offer_type IS NULL OR offer_type IN ('bogo', 'percent_off', 'flat_off')),
  CONSTRAINT products_offer_value_check CHECK (offer_value IS NULL OR offer_value >= 0),
  CONSTRAINT products_inventory_check CHECK (NOT track_inventory OR stock_quantity IS NOT NULL)
);

INSERT INTO public.products(
  id, business_id, name, description, base_price, selling_unit, is_available,
  offer_label, offer_type, offer_value, created_at, updated_at
)
SELECT sp.id,
       sp.shop_id,
       sp.name,
       sp.description,
       sp.price,
       sp.unit,
       sp.is_available,
       sp.offer_label,
       sp.offer_type,
       sp.offer_value,
       sp.created_at,
       sp.created_at
FROM public.shop_products sp
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_business_sku
  ON public.products(business_id, sku)
  WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_business_available_created
  ON public.products(business_id, is_available, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_business_sku
  ON public.products(business_id, sku)
  WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_translations (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  display_name text NOT NULL,
  search_text text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, language_code, display_name),
  CONSTRAINT product_translations_language_check CHECK (language_code IN ('en', 'ta', 'ta-Latn'))
);

INSERT INTO public.product_translations(product_id, language_code, display_name, search_text, is_primary)
SELECT p.id, 'en', p.name, lower(p.name || ' ' || COALESCE(p.description, '')), true
FROM public.products p
ON CONFLICT (product_id, language_code, display_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_product_translations_language_search
  ON public.product_translations(language_code, search_text);

CREATE TABLE IF NOT EXISTS public.search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_term text NOT NULL,
  synonym text NOT NULL,
  language_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_synonyms_terms_check CHECK (
    length(trim(canonical_term)) > 0 AND length(trim(synonym)) > 0
  ),
  CONSTRAINT search_synonyms_not_equal_check CHECK (lower(trim(canonical_term)) <> lower(trim(synonym)))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_search_synonyms_normalized
  ON public.search_synonyms(lower(canonical_term), lower(synonym), COALESCE(language_code, ''));
CREATE INDEX IF NOT EXISTS idx_search_synonyms_synonym_active
  ON public.search_synonyms(synonym, is_active);
CREATE INDEX IF NOT EXISTS idx_search_synonyms_canonical_active
  ON public.search_synonyms(canonical_term, is_active);

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, media_asset_id),
  CONSTRAINT product_images_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_images_primary
  ON public.product_images(product_id)
  WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_product_images_product_order
  ON public.product_images(product_id, sort_order);

CREATE TABLE IF NOT EXISTS public.product_attribute_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  value_type text NOT NULL DEFAULT 'text',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, normalized_name),
  CONSTRAINT product_attribute_value_type_check CHECK (value_type IN ('text', 'integer', 'decimal', 'boolean')),
  CONSTRAINT product_attribute_order_check CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_definitions_order
  ON public.product_attribute_definitions(product_id, display_order);

CREATE TABLE IF NOT EXISTS public.product_attribute_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_definition_id uuid NOT NULL REFERENCES public.product_attribute_definitions(id) ON DELETE CASCADE,
  display_value text NOT NULL,
  normalized_value text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE (attribute_definition_id, normalized_value),
  CONSTRAINT product_attribute_options_order_check CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_options_order
  ON public.product_attribute_options(attribute_definition_id, display_order);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text,
  label text,
  price numeric(12,2) NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  track_inventory boolean NOT NULL DEFAULT false,
  stock_quantity numeric(12,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_price_check CHECK (price >= 0),
  CONSTRAINT product_variants_stock_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  CONSTRAINT product_variants_inventory_check CHECK (NOT track_inventory OR stock_quantity IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_variants_product_sku
  ON public.product_variants(product_id, sku)
  WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_product_available
  ON public.product_variants(product_id, is_available);

CREATE TABLE IF NOT EXISTS public.product_variant_values (
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  attribute_definition_id uuid NOT NULL REFERENCES public.product_attribute_definitions(id) ON DELETE RESTRICT,
  attribute_option_id uuid NOT NULL REFERENCES public.product_attribute_options(id) ON DELETE RESTRICT,
  PRIMARY KEY (variant_id, attribute_definition_id),
  UNIQUE (variant_id, attribute_option_id)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_values_option
  ON public.product_variant_values(attribute_option_id);

-- ---------------------------------------------------------------------------
-- Normalized order items, appointment records, and payments.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  variant_label_snapshot text,
  unit_snapshot text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  effective_quantity numeric(12,3) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL,
  delivered_quantity numeric(12,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_items_quantity_check CHECK (quantity > 0 AND effective_quantity > 0),
  CONSTRAINT request_items_delivered_check CHECK (delivered_quantity IS NULL OR delivered_quantity >= 0),
  CONSTRAINT request_items_money_check CHECK (unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_request_items_request
  ON public.request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_request_items_product_created
  ON public.request_items(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_request_items_variant_created
  ON public.request_items(variant_id, created_at);

CREATE TABLE IF NOT EXISTS public.request_item_options (
  request_item_id uuid NOT NULL REFERENCES public.request_items(id) ON DELETE CASCADE,
  attribute_name_snapshot text NOT NULL,
  option_value_snapshot text NOT NULL,
  PRIMARY KEY (request_item_id, attribute_name_snapshot),
  CONSTRAINT request_item_options_text_check CHECK (
    length(trim(attribute_name_snapshot)) > 0 AND length(trim(option_value_snapshot)) > 0
  )
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.appointment_slots(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested',
  rescheduled_from_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  customer_name_snapshot text,
  customer_phone_snapshot text,
  customer_notes text,
  delay_minutes integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_status_check CHECK (
    status IN ('requested', 'confirmed', 'in_progress', 'completed', 'rejected', 'cancelled', 'expired', 'delayed', 'no_show', 'rescheduled')
  ),
  CONSTRAINT appointments_delay_check CHECK (delay_minutes >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_active_customer_slot
  ON public.appointments(slot_id, customer_id)
  WHERE status IN ('requested', 'confirmed', 'in_progress', 'delayed');
CREATE INDEX IF NOT EXISTS idx_appointments_slot_status
  ON public.appointments(slot_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_created
  ON public.appointments(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_service_status
  ON public.appointments(service_id, status);

-- Reconcile legacy reservations before capacity enforcement. Existing appointment
-- rows are counted once; legacy requests without appointment rows are counted by
-- their slot payload and booked_by_request_id is deduplicated by request id.
WITH reservations AS (
  SELECT s.id AS slot_id, r.id AS reservation_id
  FROM public.appointment_slots s
  JOIN public.requests r ON r.id = s.booked_by_request_id
  WHERE r.workflow_group_code = 'APPOINTMENT'
    AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED')
  UNION
  SELECT s.id, r.id
  FROM public.appointment_slots s
  JOIN public.requests r ON r.shop_id = s.shop_id
  WHERE r.workflow_group_code = 'APPOINTMENT'
    AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED')
    AND COALESCE(r.notes, '') ~ ('"slot_id"[[:space:]]*:[[:space:]]*"' || s.id::text || '"')
    AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.request_id = r.id)
  UNION
  SELECT a.slot_id, a.id
  FROM public.appointments a
  WHERE a.status NOT IN ('cancelled', 'rejected', 'expired', 'no_show')
), counts AS (
  SELECT slot_id, count(*)::integer AS active_count
  FROM reservations
  GROUP BY slot_id
)
UPDATE public.appointment_slots s
SET confirmed_count = LEAST(s.capacity, COALESCE(c.active_count, 0)),
    is_available = COALESCE(c.active_count, 0) < s.capacity,
    updated_at = now()
FROM counts c
WHERE s.id = c.slot_id;

UPDATE public.appointment_slots
SET confirmed_count = 0,
    is_available = true,
    updated_at = now()
WHERE confirmed_count IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_hours_closed_or_24h
  ON public.business_hours(business_id, weekday)
  WHERE is_closed OR is_24_hours;
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_hours_open_range
  ON public.business_hours(business_id, weekday, opens_at, closes_at)
  WHERE NOT is_closed AND NOT is_24_hours;

CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_method text NOT NULL,
  amount_claimed numeric(12,2) NOT NULL,
  payment_reference text,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_records_method_check CHECK (payment_method IN ('upi', 'cash', 'other')),
  CONSTRAINT payment_records_amount_check CHECK (amount_claimed > 0),
  CONSTRAINT payment_records_status_check CHECK (status IN ('pending', 'verified', 'rejected')),
  CONSTRAINT payment_records_verification_check CHECK (
    (status = 'pending' AND verified_by IS NULL AND verified_at IS NULL)
    OR (status IN ('verified', 'rejected') AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_records_business_reference
  ON public.payment_records(business_id, payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_records_request_status
  ON public.payment_records(request_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_records_business_status_created
  ON public.payment_records(business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_records_customer_created
  ON public.payment_records(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id uuid NOT NULL REFERENCES public.payment_records(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_record_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_evidence_payment
  ON public.payment_evidence(payment_record_id);

CREATE TABLE IF NOT EXISTS public.request_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  allowed_roles text[] NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  action_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_kind, from_state, to_state),
  CONSTRAINT request_transitions_kind_check CHECK (request_kind IN ('ORDER', 'APPOINTMENT', 'SERVICE')),
  CONSTRAINT request_transitions_roles_check CHECK (
    allowed_roles <@ ARRAY['customer', 'shopkeeper', 'admin', 'hospital_staff']::text[]
    AND cardinality(allowed_roles) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_request_transitions_lookup
  ON public.request_status_transitions(request_kind, from_state, is_enabled);

-- ---------------------------------------------------------------------------
-- Hospital operational tables. No clinical decisions are stored here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  registration_name text,
  emergency_enabled boolean NOT NULL DEFAULT false,
  queue_enabled boolean NOT NULL DEFAULT false,
  management_contact_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hospital_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, code),
  CONSTRAINT hospital_departments_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT hospital_departments_code_check CHECK (length(trim(code)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hospital_departments_name
  ON public.hospital_departments(hospital_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_hospital_departments_active
  ON public.hospital_departments(hospital_id, is_active);

CREATE TABLE IF NOT EXISTS public.healthcare_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  specialization text,
  license_reference text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT healthcare_providers_name_check CHECK (length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_healthcare_provider_name
  ON public.healthcare_providers(hospital_id, lower(display_name));
CREATE UNIQUE INDEX IF NOT EXISTS ux_healthcare_provider_license
  ON public.healthcare_providers(hospital_id, license_reference)
  WHERE license_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_healthcare_providers_active
  ON public.healthcare_providers(hospital_id, is_active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.services'::regclass AND conname = 'services_provider_fk'
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_provider_fk
      FOREIGN KEY (provider_id) REFERENCES public.healthcare_providers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.provider_departments (
  provider_id uuid NOT NULL REFERENCES public.healthcare_providers(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_departments_department
  ON public.provider_departments(department_id, provider_id);

CREATE TABLE IF NOT EXISTS public.provider_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.healthcare_providers(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  availability_date date,
  weekday smallint,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL DEFAULT 1,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_availability_day_check CHECK (
    (availability_date IS NOT NULL AND weekday IS NULL)
    OR (availability_date IS NULL AND weekday IS NOT NULL)
  ),
  CONSTRAINT provider_availability_weekday_check CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  CONSTRAINT provider_availability_time_check CHECK (ends_at > starts_at),
  CONSTRAINT provider_availability_capacity_check CHECK (capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_provider_availability_date
  ON public.provider_availability(provider_id, availability_date, starts_at);
CREATE INDEX IF NOT EXISTS idx_provider_availability_weekday
  ON public.provider_availability(provider_id, weekday, starts_at);

CREATE TABLE IF NOT EXISTS public.hospital_staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  staff_role text NOT NULL DEFAULT 'staff',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_staff_role_check CHECK (staff_role IN ('administrator', 'receptionist', 'queue_manager', 'doctor', 'nurse', 'staff'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hospital_staff_membership
  ON public.hospital_staff_members(hospital_id, user_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_hospital_staff_user_active
  ON public.hospital_staff_members(user_id, is_active);

CREATE OR REPLACE FUNCTION public.is_hospital_staff(p_hospital_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.hospital_staff_members hsm
    WHERE hsm.hospital_id = p_hospital_id
      AND hsm.user_id = auth.uid()
      AND hsm.is_active
  );
$$;

CREATE TABLE IF NOT EXISTS public.hospital_queue_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  queue_date date NOT NULL,
  token_number integer NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  position integer,
  called_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, department_id, queue_date, token_number),
  CONSTRAINT hospital_queue_token_number_check CHECK (token_number > 0),
  CONSTRAINT hospital_queue_status_check CHECK (status IN ('waiting', 'called', 'in_service', 'completed', 'cancelled', 'no_show')),
  CONSTRAINT hospital_queue_position_check CHECK (position IS NULL OR position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_hospital_queue_active
  ON public.hospital_queue_tokens(hospital_id, department_id, queue_date, status, position);
CREATE INDEX IF NOT EXISTS idx_hospital_queue_patient
  ON public.hospital_queue_tokens(patient_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hospital_queue_active_appointment
  ON public.hospital_queue_tokens(appointment_id)
  WHERE appointment_id IS NOT NULL AND status IN ('waiting', 'called', 'in_service');

CREATE TABLE IF NOT EXISTS public.patient_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  arrived_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'arrived',
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_arrivals_status_check CHECK (status IN ('arrived', 'checked_in', 'left', 'no_show'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_patient_arrivals_active
  ON public.patient_arrivals(appointment_id)
  WHERE status IN ('arrived', 'checked_in');
CREATE INDEX IF NOT EXISTS idx_patient_arrivals_patient
  ON public.patient_arrivals(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.emergency_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_patient_reference text,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  assigned_staff_id uuid REFERENCES public.hospital_staff_members(id) ON DELETE SET NULL,
  arrived_at timestamptz NOT NULL DEFAULT now(),
  priority_category text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_case_status_check CHECK (status IN ('open', 'queued', 'assigned', 'in_progress', 'resolved', 'cancelled')),
  CONSTRAINT emergency_case_reference_check CHECK (patient_id IS NOT NULL OR external_patient_reference IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_emergency_external_reference
  ON public.emergency_cases(hospital_id, external_patient_reference)
  WHERE external_patient_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emergency_cases_active
  ON public.emergency_cases(hospital_id, status, arrived_at);

-- ---------------------------------------------------------------------------
-- Notifications, subscriptions, ratings, audit, and analytics.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0,
  UNIQUE (idempotency_key),
  CONSTRAINT notification_events_attempts_check CHECK (delivery_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_notification_events_processing
  ON public.notification_events(processed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_events_aggregate
  ON public.notification_events(aggregate_type, aggregate_id, created_at);

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      shop_id uuid,
      business_id uuid,
      event_id uuid,
      type varchar(50) NOT NULL,
      notification_type text,
      title varchar(255) NOT NULL,
      message text NOT NULL,
      reference_id varchar(100),
      reference_code varchar(50),
      is_read boolean NOT NULL DEFAULT false,
      read_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS business_id uuid,
      ADD COLUMN IF NOT EXISTS event_id uuid,
      ADD COLUMN IF NOT EXISTS notification_type text,
      ADD COLUMN IF NOT EXISTS read_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    UPDATE public.notifications
    SET notification_type = COALESCE(notification_type, type)
    WHERE notification_type IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created
  ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_business_created
  ON public.notifications(business_id, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NULL THEN
    CREATE TABLE public.push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      endpoint text,
      subscription jsonb NOT NULL,
      platform text,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE public.push_subscriptions
      ADD COLUMN IF NOT EXISTS endpoint text,
      ADD COLUMN IF NOT EXISTS platform text,
      ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_last_seen
  ON public.push_subscriptions(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'TRIAL',
  trial_start_at timestamptz NOT NULL DEFAULT now(),
  trial_end_at timestamptz NOT NULL,
  go_live_at timestamptz,
  daily_rate numeric(12,2) NOT NULL DEFAULT 10,
  billing_cycle text NOT NULL DEFAULT 'MONTHLY',
  current_period_start timestamptz,
  current_period_end timestamptz,
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  grace_period_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_subscriptions_status_check CHECK (status IN ('TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED')),
  CONSTRAINT business_subscriptions_cycle_check CHECK (billing_cycle IN ('WEEKLY', 'MONTHLY')),
  CONSTRAINT business_subscriptions_rate_check CHECK (daily_rate BETWEEN 0 AND 20),
  CONSTRAINT business_subscriptions_amount_check CHECK (amount_due >= 0),
  CONSTRAINT business_subscriptions_grace_check CHECK (grace_period_days >= 0),
  CONSTRAINT business_subscriptions_period_check CHECK (trial_end_at > trial_start_at)
);

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status
  ON public.business_subscriptions(status);

DO $$
BEGIN
  IF to_regclass('public.subscription_payments') IS NULL THEN
    CREATE TABLE public.subscription_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id uuid,
      shop_id uuid,
      business_id uuid,
      amount_paid numeric(12,2) NOT NULL,
      payment_date timestamptz NOT NULL DEFAULT now(),
      billing_cycle text NOT NULL,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      payment_reference text NOT NULL,
      recorded_by_admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT vaangly_subscription_payment_amount_check CHECK (amount_paid > 0),
      CONSTRAINT vaangly_subscription_payment_cycle_check CHECK (billing_cycle IN ('WEEKLY', 'MONTHLY')),
      CONSTRAINT vaangly_subscription_payment_period_check CHECK (period_end > period_start)
    );
  ELSE
    ALTER TABLE public.subscription_payments
      ADD COLUMN IF NOT EXISTS business_id uuid;
    UPDATE public.subscription_payments
    SET business_id = shop_id
    WHERE business_id IS NULL AND shop_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_business_date
  ON public.subscription_payments(business_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription_date
  ON public.subscription_payments(subscription_id, payment_date DESC);

CREATE TABLE IF NOT EXISTS public.business_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,
  rating smallint NOT NULL,
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_ratings_value_check CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_business_ratings_business_created
  ON public.business_ratings(business_id, created_at DESC);

ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS idx_admin_audit_entity_created
  ON public.admin_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created
  ON public.admin_audit_logs(admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_key_check CHECK (length(trim(key)) > 0)
);

CREATE TABLE IF NOT EXISTS public.business_daily_metrics (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  gross_order_value numeric(14,2) NOT NULL DEFAULT 0,
  completed_sales numeric(14,2) NOT NULL DEFAULT 0,
  cancelled_amount numeric(14,2) NOT NULL DEFAULT 0,
  verified_payment_amount numeric(14,2) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  completed_order_count integer NOT NULL DEFAULT 0,
  cancelled_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  appointment_count integer NOT NULL DEFAULT 0,
  completed_appointment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, metric_date),
  CONSTRAINT business_metrics_values_check CHECK (
    gross_order_value >= 0 AND completed_sales >= 0 AND cancelled_amount >= 0
    AND verified_payment_amount >= 0 AND order_count >= 0 AND completed_order_count >= 0
    AND cancelled_count >= 0 AND rejected_count >= 0 AND appointment_count >= 0
    AND completed_appointment_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_business_daily_metrics_date
  ON public.business_daily_metrics(business_id, metric_date DESC);

-- ---------------------------------------------------------------------------
-- Updated-at triggers.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'locations', 'business_categories', 'business_types', 'businesses',
    'business_members', 'business_hours', 'business_status',
    'business_applications', 'services', 'products', 'product_variants',
    'appointments', 'payment_records', 'business_subscriptions',
    'hospitals', 'hospital_departments', 'healthcare_providers',
    'hospital_staff_members', 'emergency_cases', 'notifications',
    'platform_settings', 'business_daily_metrics'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgname = format('trg_%s_updated_at', v_table)
        AND c.relname = v_table AND n.nspname = 'public' AND NOT t.tgisinternal
    ) THEN
      EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', v_table, v_table);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Integrity triggers and RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_request_creation_and_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_price numeric(12,2);
  v_quantity numeric(12,3);
  v_total numeric(12,2) := 0;
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

    IF NEW.workflow_group_code = 'ORDER'
       AND NEW.notes IS NOT NULL
       AND jsonb_typeof(NEW.notes::jsonb -> 'items') = 'array' THEN
      v_payload := NEW.notes::jsonb;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_payload -> 'items') LOOP
        v_product_id := NULLIF(v_item ->> 'product_id', '')::uuid;
        SELECT sp.price INTO v_price
        FROM public.shop_products sp
        WHERE sp.id = v_product_id
          AND sp.shop_id = NEW.shop_id
          AND sp.is_available;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Product is unavailable or does not belong to this shop';
        END IF;
        v_quantity := COALESCE(
          NULLIF(v_item ->> 'billed_quantity', '')::numeric,
          NULLIF(v_item ->> 'quantity', '')::numeric,
          0
        );
        IF v_quantity <= 0 THEN
          RAISE EXCEPTION 'Order item quantity must be positive';
        END IF;
        v_total := v_total + (v_price * v_quantity);
      END LOOP;
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_validate_request_creation_and_mutation') THEN
    CREATE TRIGGER vaangly_validate_request_creation_and_mutation
    BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.validate_request_creation_and_mutation();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_shopkeeper_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'suspended' AND NEW.status <> 'suspended' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can reactivate a suspended shop';
  END IF;
  IF OLD.status = 'suspended' AND NEW.is_live AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'A suspended shop cannot be made live';
  END IF;
  IF NOT public.is_admin() AND auth.uid() = OLD.owner_id THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_guard_shopkeeper_suspension') THEN
    CREATE TRIGGER vaangly_guard_shopkeeper_suspension
    BEFORE UPDATE ON public.shops
    FOR EACH ROW EXECUTE FUNCTION public.guard_shopkeeper_suspension();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_business_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF OLD.approval_status IS DISTINCT FROM NEW.approval_status
       OR OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id
       OR OLD.suspended_at IS DISTINCT FROM NEW.suspended_at
       OR OLD.suspended_by IS DISTINCT FROM NEW.suspended_by
       OR OLD.suspension_reason IS DISTINCT FROM NEW.suspension_reason
       OR OLD.archived_at IS DISTINCT FROM NEW.archived_at THEN
      RAISE EXCEPTION 'Only an administrator can change business approval, ownership, suspension, or archive state';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_guard_business_admin_fields') THEN
    CREATE TRIGGER vaangly_guard_business_admin_fields
    BEFORE UPDATE ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION public.guard_business_admin_fields();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_business_status_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() AND OLD.admin_suspended IS DISTINCT FROM NEW.admin_suspended THEN
    RAISE EXCEPTION 'Only an administrator can change business suspension state';
  END IF;
  IF NOT public.is_admin() THEN
    NEW.admin_suspended := OLD.admin_suspended;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_guard_business_status_suspension') THEN
    CREATE TRIGGER vaangly_guard_business_status_suspension
    BEFORE UPDATE ON public.business_status
    FOR EACH ROW EXECUTE FUNCTION public.guard_business_status_suspension();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_slot_capacity_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.capacity IS DISTINCT FROM OLD.capacity
     AND NEW.concurrent_capacity IS NOT DISTINCT FROM OLD.concurrent_capacity THEN
    NEW.concurrent_capacity := NEW.capacity;
  ELSIF NEW.concurrent_capacity IS DISTINCT FROM OLD.concurrent_capacity
     AND NEW.capacity IS NOT DISTINCT FROM OLD.capacity THEN
    NEW.capacity := NEW.concurrent_capacity;
  END IF;
  IF NEW.capacity < 1 OR NEW.capacity > 100 THEN
    RAISE EXCEPTION 'Appointment capacity must be between 1 and 100';
  END IF;
  IF NEW.confirmed_count < 0 OR NEW.confirmed_count > NEW.capacity THEN
    RAISE EXCEPTION 'Confirmed appointments cannot exceed slot capacity';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_sync_slot_capacity_fields') THEN
    CREATE TRIGGER vaangly_sync_slot_capacity_fields
    BEFORE INSERT OR UPDATE ON public.appointment_slots
    FOR EACH ROW EXECUTE FUNCTION public.sync_slot_capacity_fields();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assert_product_variant_value_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_option_definition uuid;
  v_variant_product uuid;
  v_definition_product uuid;
BEGIN
  SELECT attribute_definition_id INTO v_option_definition
  FROM public.product_attribute_options
  WHERE id = NEW.attribute_option_id;
  IF v_option_definition IS NULL OR v_option_definition <> NEW.attribute_definition_id THEN
    RAISE EXCEPTION 'Product option does not belong to the selected attribute definition';
  END IF;

  SELECT product_id INTO v_variant_product
  FROM public.product_variants
  WHERE id = NEW.variant_id;
  SELECT product_id INTO v_definition_product
  FROM public.product_attribute_definitions
  WHERE id = NEW.attribute_definition_id;
  IF v_variant_product IS NULL OR v_definition_product IS NULL OR v_variant_product <> v_definition_product THEN
    RAISE EXCEPTION 'Variant and attribute definition must belong to the same product';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_product_variant_value_integrity') THEN
    CREATE TRIGGER vaangly_product_variant_value_integrity
    BEFORE INSERT OR UPDATE ON public.product_variant_values
    FOR EACH ROW EXECUTE FUNCTION public.assert_product_variant_value_integrity();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.book_appointment_slot(
  p_slot_id uuid,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.appointment_slots%ROWTYPE;
  v_request public.requests%ROWTYPE;
  v_booked integer;
BEGIN
  SELECT * INTO v_slot
  FROM public.appointment_slots
  WHERE id = p_slot_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_request FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND OR v_request.workflow_group_code <> 'APPOINTMENT' THEN RETURN false; END IF;
  IF v_request.shop_id <> v_slot.shop_id THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id = v_slot.shop_id AND s.status = 'active' AND s.is_live = true
  ) THEN RETURN false; END IF;

  SELECT COUNT(*)::integer INTO v_booked
  FROM (
    SELECT r.id
    FROM public.requests r
    WHERE r.id <> p_request_id
      AND r.shop_id = v_slot.shop_id
      AND r.workflow_group_code = 'APPOINTMENT'
      AND r.current_state NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED')
      AND COALESCE(r.notes, '') ~ ('"slot_id"[[:space:]]*:[[:space:]]*"' || p_slot_id::text || '"')
      AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.request_id = r.id)
    UNION ALL
    SELECT a.id
    FROM public.appointments a
    WHERE a.slot_id = p_slot_id
      AND a.request_id <> p_request_id
      AND a.status NOT IN ('cancelled', 'rejected', 'expired', 'no_show')
  ) booked;

  IF v_booked >= COALESCE(v_slot.capacity, v_slot.concurrent_capacity, 1) THEN
    RETURN false;
  END IF;

  UPDATE public.appointment_slots
  SET confirmed_count = v_booked + 1,
      capacity = COALESCE(capacity, concurrent_capacity, 1),
      concurrent_capacity = COALESCE(capacity, concurrent_capacity, 1),
      is_available = (v_booked + 1 < COALESCE(capacity, concurrent_capacity, 1)),
      booked_by_request_id = CASE WHEN v_booked = 0 THEN p_request_id ELSE booked_by_request_id END,
      updated_at = now()
  WHERE id = p_slot_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.vaangly_release_slot_on_request_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_id uuid;
BEGIN
  IF NEW.workflow_group_code = 'APPOINTMENT'
     AND NEW.current_state IN ('CANCELLED', 'REJECTED', 'EXPIRED')
     AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.request_id = NEW.id) THEN
    BEGIN
      v_slot_id := (NEW.notes::jsonb->>'slot_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_slot_id := NULL;
    END;
    IF v_slot_id IS NOT NULL THEN
      UPDATE public.appointment_slots
      SET confirmed_count = GREATEST(confirmed_count - 1, 0),
          is_available = true,
          booked_by_request_id = CASE WHEN booked_by_request_id = NEW.id THEN NULL ELSE booked_by_request_id END,
          updated_at = now()
      WHERE id = v_slot_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vaangly_release_slot_on_request_terminal') THEN
    CREATE TRIGGER trg_vaangly_release_slot_on_request_terminal
    AFTER UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.vaangly_release_slot_on_request_terminal();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.release_slot_on_appointment_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'rejected', 'expired', 'no_show')
     AND OLD.status NOT IN ('cancelled', 'rejected', 'expired', 'no_show') THEN
    UPDATE public.appointment_slots
    SET confirmed_count = GREATEST(confirmed_count - 1, 0),
        is_available = true,
        updated_at = now()
    WHERE id = NEW.slot_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vaangly_release_slot_on_appointment_terminal') THEN
    CREATE TRIGGER vaangly_release_slot_on_appointment_terminal
    AFTER UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.release_slot_on_appointment_terminal();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_payment(
  p_payment_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS public.payment_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payment_records;
BEGIN
  IF p_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Payment status must be verified or rejected';
  END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.businesses b
    JOIN public.payment_records pr ON pr.business_id = b.id
    WHERE pr.id = p_payment_id
      AND (b.owner_profile_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.business_id = b.id AND bm.user_id = auth.uid() AND bm.is_active
      ))
  ) THEN
    RAISE EXCEPTION 'Only the business or an administrator can verify payment';
  END IF;
  UPDATE public.payment_records
  SET status = p_status,
      verified_by = auth.uid(),
      verified_at = now(),
      verification_notes = p_notes,
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment record not found'; END IF;
  RETURN v_payment;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security for all newly introduced tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hour_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_application_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healthcare_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_queue_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Role and metadata policies.
CREATE POLICY user_roles_select_own_or_admin ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY user_roles_admin_manage ON public.user_roles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY business_categories_public_read ON public.business_categories
  FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY business_categories_admin_manage ON public.business_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY business_types_public_read ON public.business_types
  FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY business_types_admin_manage ON public.business_types
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY businesses_public_read_visible ON public.businesses
  FOR SELECT USING (public.is_business_publicly_visible(id));
CREATE POLICY businesses_member_read_own ON public.businesses
  FOR SELECT USING (owner_profile_id = auth.uid() OR public.is_business_member(id));
CREATE POLICY businesses_admin_manage ON public.businesses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY businesses_member_update_profile ON public.businesses
  FOR UPDATE USING (public.is_business_member(id))
  WITH CHECK (public.is_business_member(id));

CREATE POLICY business_members_read_own_business ON public.business_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_business_member(business_id));
CREATE POLICY business_members_owner_manage ON public.business_members
  FOR ALL USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = business_members.business_id
        AND bm.user_id = auth.uid() AND bm.member_role = 'owner' AND bm.is_active
    )
  ) WITH CHECK (public.is_admin() OR public.is_business_member(business_id));

CREATE POLICY business_hours_public_read ON public.business_hours
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY business_hours_member_manage ON public.business_hours
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY business_hour_exceptions_public_read ON public.business_hour_exceptions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY business_hour_exceptions_member_manage ON public.business_hour_exceptions
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY business_status_public_read ON public.business_status
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY business_status_member_read ON public.business_status
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY business_status_member_update ON public.business_status
  FOR UPDATE USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY business_status_admin_manage ON public.business_status
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Public catalogue policies are always gated by visible business state.
CREATE POLICY services_public_read ON public.services
  FOR SELECT USING (is_available AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY services_member_manage ON public.services
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY products_public_read ON public.products
  FOR SELECT USING (is_available AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY products_member_manage ON public.products
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY product_translations_public_read ON public.product_translations
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.products p JOIN public.businesses b ON b.id = p.business_id WHERE p.id = product_id AND p.is_available AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY product_translations_member_manage ON public.product_translations
  FOR ALL USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)));
CREATE POLICY search_synonyms_public_read ON public.search_synonyms
  FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY search_synonyms_admin_manage ON public.search_synonyms
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY product_images_public_read ON public.product_images
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.products p JOIN public.businesses b ON b.id = p.business_id WHERE p.id = product_id AND p.is_available AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY product_images_member_manage ON public.product_images
  FOR ALL USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)));

CREATE POLICY product_attributes_public_read ON public.product_attribute_definitions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.products p JOIN public.businesses b ON b.id = p.business_id WHERE p.id = product_id AND p.is_available AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY product_attributes_member_manage ON public.product_attribute_definitions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)));
CREATE POLICY product_options_public_read ON public.product_attribute_options
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.product_attribute_definitions d JOIN public.products p ON p.id = d.product_id JOIN public.businesses b ON b.id = p.business_id WHERE d.id = attribute_definition_id AND p.is_available AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY product_options_member_manage ON public.product_attribute_options
  FOR ALL USING (EXISTS (SELECT 1 FROM public.product_attribute_definitions d JOIN public.products p ON p.id = d.product_id WHERE d.id = attribute_definition_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_attribute_definitions d JOIN public.products p ON p.id = d.product_id WHERE d.id = attribute_definition_id AND public.is_business_member(p.business_id)));
CREATE POLICY product_variants_public_read ON public.product_variants
  FOR SELECT USING (is_available AND EXISTS (SELECT 1 FROM public.products p JOIN public.businesses b ON b.id = p.business_id WHERE p.id = product_id AND p.is_available AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY product_variants_member_manage ON public.product_variants
  FOR ALL USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_business_member(p.business_id)));
CREATE POLICY product_variant_values_public_read ON public.product_variant_values
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.product_variants v JOIN public.products p ON p.id = v.product_id JOIN public.businesses b ON b.id = p.business_id WHERE v.id = variant_id AND v.is_available AND p.is_available AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY product_variant_values_member_manage ON public.product_variant_values
  FOR ALL USING (EXISTS (SELECT 1 FROM public.product_variants v JOIN public.products p ON p.id = v.product_id WHERE v.id = variant_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants v JOIN public.products p ON p.id = v.product_id WHERE v.id = variant_id AND public.is_business_member(p.business_id)));

CREATE POLICY business_payment_accounts_public_read ON public.business_payment_accounts
  FOR SELECT USING (is_active AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY business_payment_accounts_member_manage ON public.business_payment_accounts
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY business_applications_applicant_read ON public.business_applications
  FOR SELECT USING (applicant_id = auth.uid() OR public.is_admin());
CREATE POLICY business_applications_applicant_insert ON public.business_applications
  FOR INSERT WITH CHECK (applicant_id = auth.uid());
CREATE POLICY business_applications_applicant_update ON public.business_applications
  FOR UPDATE USING (applicant_id = auth.uid() AND status IN ('submitted', 'correction_requested'))
  WITH CHECK (applicant_id = auth.uid() AND status IN ('submitted', 'correction_requested'));
CREATE POLICY business_applications_admin_manage ON public.business_applications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY business_application_media_applicant_read ON public.business_application_media
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.business_applications a WHERE a.id = application_id AND (a.applicant_id = auth.uid() OR public.is_admin())));
CREATE POLICY business_application_media_applicant_insert ON public.business_application_media
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.business_applications a WHERE a.id = application_id AND a.applicant_id = auth.uid() AND a.status IN ('submitted', 'correction_requested')));
CREATE POLICY business_application_media_admin_manage ON public.business_application_media
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY media_assets_admin_or_owner_read ON public.media_assets
  FOR SELECT USING (
    public.is_admin() OR uploaded_by = auth.uid()
    OR (
      visibility = 'public'
      AND (
        EXISTS (
          SELECT 1 FROM public.business_media bm
          JOIN public.businesses b ON b.id = bm.business_id
          WHERE bm.media_asset_id = media_assets.id
            AND b.approval_status = 'approved' AND b.is_live
            AND b.archived_at IS NULL AND b.suspended_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.product_images pi
          JOIN public.products p ON p.id = pi.product_id
          JOIN public.businesses b ON b.id = p.business_id
          WHERE pi.media_asset_id = media_assets.id
            AND p.is_available AND b.approval_status = 'approved'
            AND b.is_live AND b.archived_at IS NULL AND b.suspended_at IS NULL
        )
      )
    )
  );
CREATE POLICY media_assets_scoped_insert ON public.media_assets
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by AND visibility IN ('public', 'private'));
CREATE POLICY media_assets_owner_update ON public.media_assets
  FOR UPDATE USING (uploaded_by = auth.uid() OR public.is_admin()) WITH CHECK (uploaded_by = auth.uid() OR public.is_admin());
CREATE POLICY media_assets_admin_delete ON public.media_assets
  FOR DELETE USING (public.is_admin());

CREATE POLICY business_media_public_read ON public.business_media
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY business_media_member_manage ON public.business_media
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

-- Request and appointment policies.
CREATE POLICY request_items_party_read ON public.request_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_id AND (r.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = r.shop_id AND public.is_business_member(b.id)) OR public.is_admin())));
CREATE POLICY request_item_options_party_read ON public.request_item_options
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.request_items ri JOIN public.requests r ON r.id = ri.request_id WHERE ri.id = request_item_id AND (r.customer_id = auth.uid() OR public.is_admin())));

CREATE POLICY appointments_customer_read ON public.appointments
  FOR SELECT USING (customer_id = auth.uid() OR public.is_admin());
CREATE POLICY appointments_business_read ON public.appointments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_id AND public.is_business_member(r.shop_id)));
CREATE POLICY appointments_rpc_update ON public.appointments
  FOR UPDATE USING (customer_id = auth.uid() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_id AND public.is_business_member(r.shop_id)))
  WITH CHECK (customer_id = auth.uid() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_id AND public.is_business_member(r.shop_id)));

CREATE POLICY payment_records_customer_read ON public.payment_records
  FOR SELECT USING (customer_id = auth.uid() OR public.is_admin());
CREATE POLICY payment_records_business_read ON public.payment_records
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY payment_records_customer_insert ON public.payment_records
  FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY payment_records_business_update ON public.payment_records
  FOR UPDATE USING (public.is_business_member(business_id) OR public.is_admin())
  WITH CHECK (public.is_business_member(business_id) OR public.is_admin());
CREATE POLICY payment_evidence_party_read ON public.payment_evidence
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.payment_records pr WHERE pr.id = payment_record_id AND (pr.customer_id = auth.uid() OR public.is_business_member(pr.business_id) OR public.is_admin())));
CREATE POLICY payment_evidence_customer_insert ON public.payment_evidence
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.payment_records pr WHERE pr.id = payment_record_id AND pr.customer_id = auth.uid()));

CREATE POLICY request_status_public_read ON public.request_status_transitions
  FOR SELECT USING (is_enabled OR public.is_admin());
CREATE POLICY request_status_admin_manage ON public.request_status_transitions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Hospital policies.
CREATE POLICY hospitals_public_read ON public.hospitals
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.approval_status = 'approved' AND b.is_live AND b.archived_at IS NULL));
CREATE POLICY hospitals_staff_manage ON public.hospitals
  FOR ALL USING (public.is_admin() OR public.is_business_member(business_id)) WITH CHECK (public.is_admin() OR public.is_business_member(business_id));
CREATE POLICY hospital_departments_public_read ON public.hospital_departments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.hospitals h JOIN public.businesses b ON b.id = h.business_id WHERE h.id = hospital_id AND b.approval_status = 'approved' AND b.is_live));
CREATE POLICY hospital_departments_staff_manage ON public.hospital_departments
  FOR ALL USING (public.is_hospital_staff(hospital_id)) WITH CHECK (public.is_hospital_staff(hospital_id));
CREATE POLICY healthcare_providers_public_read ON public.healthcare_providers
  FOR SELECT USING (is_active AND EXISTS (SELECT 1 FROM public.hospitals h JOIN public.businesses b ON b.id = h.business_id WHERE h.id = hospital_id AND b.approval_status = 'approved' AND b.is_live));
CREATE POLICY healthcare_providers_staff_manage ON public.healthcare_providers
  FOR ALL USING (public.is_hospital_staff(hospital_id)) WITH CHECK (public.is_hospital_staff(hospital_id));
CREATE POLICY provider_departments_staff_manage ON public.provider_departments
  FOR ALL USING (EXISTS (SELECT 1 FROM public.healthcare_providers hp WHERE hp.id = provider_id AND public.is_hospital_staff(hp.hospital_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.healthcare_providers hp WHERE hp.id = provider_id AND public.is_hospital_staff(hp.hospital_id)));
CREATE POLICY provider_availability_staff_manage ON public.provider_availability
  FOR ALL USING (EXISTS (SELECT 1 FROM public.healthcare_providers hp WHERE hp.id = provider_id AND public.is_hospital_staff(hp.hospital_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.healthcare_providers hp WHERE hp.id = provider_id AND public.is_hospital_staff(hp.hospital_id)));
CREATE POLICY hospital_staff_members_staff_read ON public.hospital_staff_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_hospital_staff(hospital_id));
CREATE POLICY hospital_staff_members_admin_manage ON public.hospital_staff_members
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY hospital_queue_patient_read ON public.hospital_queue_tokens
  FOR SELECT USING (patient_id = auth.uid() OR public.is_hospital_staff(hospital_id) OR public.is_admin());
CREATE POLICY hospital_queue_staff_update ON public.hospital_queue_tokens
  FOR UPDATE USING (public.is_hospital_staff(hospital_id) OR public.is_admin())
  WITH CHECK (public.is_hospital_staff(hospital_id) OR public.is_admin());
CREATE POLICY patient_arrivals_patient_read ON public.patient_arrivals
  FOR SELECT USING (patient_id = auth.uid() OR public.is_admin());
CREATE POLICY patient_arrivals_staff_manage ON public.patient_arrivals
  FOR ALL USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.appointments a JOIN public.requests r ON r.id = a.request_id JOIN public.hospitals h ON h.business_id = r.shop_id WHERE a.id = appointment_id AND public.is_hospital_staff(h.id)))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.appointments a JOIN public.requests r ON r.id = a.request_id JOIN public.hospitals h ON h.business_id = r.shop_id WHERE a.id = appointment_id AND public.is_hospital_staff(h.id)));
CREATE POLICY emergency_cases_staff_manage ON public.emergency_cases
  FOR ALL USING (public.is_hospital_staff(hospital_id) OR public.is_admin()) WITH CHECK (public.is_hospital_staff(hospital_id) OR public.is_admin());

-- Notifications, subscriptions, ratings, audit, metrics.
DROP POLICY IF EXISTS "Users can create operational notifications" ON public.notifications;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'vaangly_notifications_service_insert'
      AND c.relname = 'notifications' AND n.nspname = 'public'
  ) THEN
    CREATE POLICY vaangly_notifications_service_insert ON public.notifications
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;
END $$;

CREATE POLICY notification_events_admin_read ON public.notification_events
  FOR SELECT USING (public.is_admin());
CREATE POLICY notification_events_service_insert ON public.notification_events
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY notifications_recipient_read ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid() OR public.is_admin());
CREATE POLICY notifications_recipient_mark_read ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
CREATE POLICY push_subscriptions_self_manage ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY business_subscriptions_member_read ON public.business_subscriptions
  FOR SELECT USING (public.is_business_member(business_id) OR public.is_admin());
CREATE POLICY business_subscriptions_admin_manage ON public.business_subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY subscription_payments_member_read ON public.subscription_payments
  FOR SELECT USING (public.is_business_member(business_id) OR public.is_admin());
CREATE POLICY subscription_payments_admin_manage ON public.subscription_payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY business_ratings_public_read ON public.business_ratings
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id
      AND b.approval_status = 'approved'
      AND b.is_live
      AND b.archived_at IS NULL
  ));
CREATE POLICY business_ratings_customer_insert ON public.business_ratings
  FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY vaangly_admin_audit_read ON public.admin_audit_logs
  FOR SELECT USING (public.is_admin());
CREATE POLICY vaangly_admin_audit_insert ON public.admin_audit_logs
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY platform_settings_public_read ON public.platform_settings
  FOR SELECT USING (public.is_admin() OR key LIKE 'public.%');
CREATE POLICY platform_settings_admin_manage ON public.platform_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY business_metrics_member_read ON public.business_daily_metrics
  FOR SELECT USING (public.is_business_member(business_id) OR public.is_admin());
CREATE POLICY business_metrics_admin_manage ON public.business_daily_metrics
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- New private/public Storage buckets and scoped policies.
-- Existing buckets and policies are preserved; no public payment-proof policy
-- is created here.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets(id, name, public)
    VALUES
      ('business-media', 'business-media', true),
      ('product-media', 'product-media', true),
      ('public-assets', 'public-assets', true),
      ('identity-documents', 'identity-documents', false),
      ('payment-evidence', 'payment-evidence', false),
      ('hospital-private', 'hospital-private', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_public_business_media_read' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_public_business_media_read ON storage.objects FOR SELECT USING (bucket_id = 'business-media');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_public_product_media_read' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_public_product_media_read ON storage.objects FOR SELECT USING (bucket_id = 'product-media');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_public_assets_read' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_public_assets_read ON storage.objects FOR SELECT USING (bucket_id = 'public-assets');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_identity_document_insert' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_identity_document_insert ON storage.objects FOR INSERT WITH CHECK (
        bucket_id = 'identity-documents' AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_identity_document_read' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_identity_document_read ON storage.objects FOR SELECT USING (
        bucket_id = 'identity-documents' AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_payment_evidence_insert' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_payment_evidence_insert ON storage.objects FOR INSERT WITH CHECK (
        bucket_id = 'payment-evidence' AND auth.role() = 'authenticated'
        AND EXISTS (SELECT 1 FROM public.payment_records pr
          WHERE pr.id::text = (storage.foldername(name))[2] AND pr.customer_id = auth.uid())
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_payment_evidence_read' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_payment_evidence_read ON storage.objects FOR SELECT USING (
        bucket_id = 'payment-evidence' AND EXISTS (SELECT 1 FROM public.payment_records pr
          WHERE pr.id::text = (storage.foldername(name))[2]
            AND (pr.customer_id = auth.uid() OR public.is_business_member(pr.business_id) OR public.is_admin()))
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_hospital_private_read' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_hospital_private_read ON storage.objects FOR SELECT USING (bucket_id = 'hospital-private' AND public.is_admin());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vaangly_hospital_private_insert' AND polrelid = 'storage.objects'::regclass) THEN
      CREATE POLICY vaangly_hospital_private_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'hospital-private' AND public.is_admin());
    END IF;
  END IF;
END $$;

COMMIT;

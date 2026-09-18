# Vaangly Final PostgreSQL/Supabase Schema

## Status and Scope

This is the final proposed database design after comparing `DATABASE_DESIGN_REVIEW.md` with the current Vaangly frontend, TypeScript models, Supabase calls, and existing migrations.

This document is design-only. It does not create tables, execute SQL, modify application code, commit changes, or push to GitHub.

## Validation Decisions

The current frontend directly queries or updates `shops`, `shop_products`, `shop_services`, `appointment_slots`, `requests`, `request_events`, `shop_applications`, `notifications`, `shop_subscriptions`, `subscription_payments`, `admin_audit_logs`, and `push_subscriptions`. The final design therefore uses:

- Normalized canonical tables for new development.
- Compatibility views and controlled RPCs for existing legacy names where needed.
- A single transactional appointment-booking RPC instead of the current two-step client flow.
- Relational order items and appointment records instead of authoritative JSON in `requests.notes`.
- Trusted database functions for totals, state transitions, suspension, payment verification, capacity, and notification events.

Any item labeled **ASSUMPTION** cannot be confirmed from the current codebase.

---

# 1. Global Conventions

- Database: PostgreSQL through Supabase.
- IDs: `uuid` generated with `gen_random_uuid()` unless noted.
- Currency: `numeric(12,2)` in Indian rupees; no floating-point money columns.
- Timestamps: `timestamptz`.
- Local business time zone: stored per business; **ASSUMPTION:** default `Asia/Kolkata`.
- Soft deletion: use `archived_at` rather than deleting historical business data.
- Public catalogue visibility: approved, live, non-suspended business in active location.
- Private data: protected by both table RLS and Storage object policies.
- Browser payloads are input only; database values are authoritative.

---

# 2. Identity, Roles, and Authorization

## 2.1 `profiles`

**Purpose:** Application profile linked one-to-one with Supabase Auth.

**Columns:**

| Column | Type | Nullability | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | none |
| `full_name` | `text` | NOT NULL | none |
| `phone` | `text` | NULL | `NULL` |
| `email` | `text` | NULL | `NULL` |
| `avatar_media_id` | `uuid` | NULL | `NULL` |
| `preferred_location_id` | `uuid` | NULL | `NULL` |
| `is_verified` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**Primary key:** `id`.

**Foreign keys:**

- `id -> auth.users(id) ON DELETE CASCADE`.
- `avatar_media_id -> media_assets(id) ON DELETE SET NULL`.
- `preferred_location_id -> locations(id) ON DELETE SET NULL`.

**Unique constraints:** email may be unique only when present if product policy requires it; do not assume phone uniqueness from current code.

**Checks:** `length(trim(full_name)) > 0`.

**Indexes:** `profiles(preferred_location_id)`, `profiles(email)`, `profiles(phone)`.

**Relationships:** one Auth user to one profile; one profile to many roles, requests, applications, and notifications.

**RLS:** users may select/update safe fields on their own profile; admins may select all and update administrative fields. A trigger must reject self-updates to roles or verification status. No direct client delete.

## 2.2 `user_roles`

**Purpose:** Authoritative role assignments; replaces trusting `user_metadata.role`.

**Columns:**

| Column | Type | Nullability | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL | none |
| `role` | `text` | NOT NULL | `'customer'` |
| `granted_by` | `uuid` | NULL | `NULL` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Primary key:** `(user_id, role)`.

**Foreign keys:** `user_id -> profiles(id) ON DELETE CASCADE`; `granted_by -> profiles(id) ON DELETE SET NULL`.

**Unique constraints:** composite primary key.

**Checks:** role in `customer`, `shopkeeper`, `admin`, `hospital_staff`.

**Indexes:** `user_roles(user_id, role)`, `user_roles(role, user_id)`.

**Relationships:** one profile to many roles.

**RLS:** users may read their own roles; admins may manage all roles. Inserts/updates/deletes require admin or trusted role-management RPC. A customer cannot grant any role to itself.

## 2.3 `hospital_staff_members`

**Purpose:** Authorizes a user for a particular hospital and optionally department.

**Columns:**

| Column | Type | Nullability | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `hospital_id` | `uuid` | NOT NULL | none |
| `user_id` | `uuid` | NOT NULL | none |
| `department_id` | `uuid` | NULL | `NULL` |
| `staff_role` | `text` | NOT NULL | `'staff'` |
| `is_active` | `boolean` | NOT NULL | `true` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**Primary key:** `id`.

**Foreign keys:** `hospital_id -> hospitals(id)`, `user_id -> profiles(id)`, `department_id -> hospital_departments(id) ON DELETE SET NULL`.

**Unique constraints:** `(hospital_id, user_id, department_id)` where active, or an equivalent partial unique index.

**Checks:** role in `administrator`, `receptionist`, `queue_manager`, `doctor`, `nurse`, `staff`.

**Indexes:** `(hospital_id, is_active)`, `(user_id, is_active)`, `(department_id, is_active)`.

**Relationships:** hospital has many staff; user may work at many hospitals.

**RLS:** only authorized hospital staff for the same hospital and admins may read; hospital managers/admins may manage memberships. Staff cannot grant themselves access.

---

# 3. Locations and Categories

## 3.1 `locations`

**Purpose:** Admin-managed towns/cities and future service areas.

**Columns:**

| Column | Type | Nullability | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `name` | `text` | NOT NULL | none |
| `slug` | `text` | NOT NULL | none |
| `state` | `text` | NOT NULL | none |
| `country_code` | `text` | NOT NULL | `'IN'` |
| `postal_code` | `text` | NULL | `NULL` |
| `latitude` | `numeric(9,6)` | NULL | `NULL` |
| `longitude` | `numeric(9,6)` | NULL | `NULL` |
| `is_active` | `boolean` | NOT NULL | `true` |
| `is_launch_town` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**Primary key:** `id`.

**Foreign keys:** none.

**Unique constraints:** `slug`; optionally `(name, state, country_code)`.

**Checks:** non-empty name and slug; latitude between -90 and 90; longitude between -180 and 180.

**Indexes:** `(is_active, name)`, `slug`, optional trigram index on `name`.

**Relationships:** one location to many businesses and user preferences.

**RLS:** public may select active locations; admins may select, insert, update, and archive all locations. Direct public writes are forbidden.

## 3.2 `business_categories`

**Purpose:** Admin-managed broad categories such as retail, food, healthcare, salon, and repair.

**Columns:** `id uuid NOT NULL DEFAULT gen_random_uuid()`, `code text NOT NULL`, `name text NOT NULL`, `display_order integer NOT NULL DEFAULT 0`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

**Primary key:** `id`.

**Foreign keys:** none.

**Unique constraints:** `code`.

**Checks:** `display_order >= 0`; non-empty code and name.

**Indexes:** `(is_active, display_order)`.

**Relationships:** one category to many business types.

**RLS:** public may read active categories; admins may manage all. Shopkeepers cannot create categories.

## 3.3 `business_types`

**Purpose:** Specific business types such as grocery, restaurant, hotel, salon, clinic, hospital, pharmacy, tailor, mechanic, and repair.

**Columns:** `id uuid NOT NULL DEFAULT gen_random_uuid()`, `category_id uuid NOT NULL`, `code text NOT NULL`, `name text NOT NULL`, `icon text NULL`, `display_order integer NOT NULL DEFAULT 0`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

**Primary key:** `id`.

**Foreign keys:** `category_id -> business_categories(id) ON DELETE RESTRICT`.

**Unique constraints:** `code`.

**Checks:** non-empty code/name; `display_order >= 0`.

**Indexes:** `(category_id, is_active, display_order)`, `code`.

**Relationships:** category has many types; type has many businesses and applications.

**RLS:** public may read active types; admins may manage all.

## 3.4 Workflow compatibility tables

These preserve the existing `src/types/workflow.ts` and migration contracts.

### `workflow_groups`

Purpose: reusable `ORDER`, `APPOINTMENT`, and `SERVICE` workflow families.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `code text NOT NULL UNIQUE`, `name text NOT NULL`, `description text NULL`, `icon text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

Checks: code in `ORDER`, `APPOINTMENT`, `SERVICE`.

Indexes: unique code.

Relationships: one group to many states, transitions, and business-type capabilities.

RLS: public read; admins manage.

### `workflow_states`

Purpose: named states and terminal/initial metadata.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `group_id uuid NOT NULL`, `code text NOT NULL`, `label text NOT NULL`, `is_initial boolean NOT NULL DEFAULT false`, `is_terminal boolean NOT NULL DEFAULT false`, `color_badge text NOT NULL DEFAULT 'neutral'`, `created_at timestamptz NOT NULL DEFAULT now()`.

FK: `group_id -> workflow_groups(id) ON DELETE CASCADE`.

Unique: `(group_id, code)`.

Checks: non-empty code/label.

Indexes: `(group_id, code)`.

Relationships: group has many states.

RLS: public read; admins manage.

### `workflow_transitions`

Purpose: allowed state changes and actor roles.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `group_id uuid NOT NULL`, `from_state_id uuid NULL`, `to_state_id uuid NOT NULL`, `allowed_actor_roles text[] NOT NULL DEFAULT ARRAY['shopkeeper']::text[]`, `action_label text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: group, from state, and to state reference workflow tables.

Unique: `(group_id, from_state_id, to_state_id)`.

Checks: roles limited to valid roles; `from_state_id` may be NULL only for initial transition.

Indexes: `(group_id, from_state_id)`.

Relationships: states have many transitions.

RLS: public read; admins manage. Actual enforcement must be in a transition RPC/trigger.

---

# 4. Businesses, Hours, Status, and Applications

## 4.1 `businesses`

**Purpose:** Canonical replacement for the current `shops` entity while retaining all current shop capabilities.

**Columns:**

| Column | Type | Nullability | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `owner_profile_id` | `uuid` | NOT NULL | none |
| `location_id` | `uuid` | NOT NULL | none |
| `business_type_id` | `uuid` | NOT NULL | none |
| `name` | `text` | NOT NULL | none |
| `slug` | `text` | NOT NULL | none |
| `tagline` | `text` | NULL | `NULL` |
| `description` | `text` | NULL | `NULL` |
| `address_line` | `text` | NOT NULL | none |
| `phone` | `text` | NOT NULL | none |
| `latitude` | `numeric(9,6)` | NULL | `NULL` |
| `longitude` | `numeric(9,6)` | NULL | `NULL` |
| `google_maps_url` | `text` | NULL | `NULL` |
| `google_business_profile_url` | `text` | NULL | `NULL` |
| `approval_status` | `text` | NOT NULL | `'pending'` |
| `is_live` | `boolean` | NOT NULL | `false` |
| `delivery_available` | `boolean` | NOT NULL | `false` |
| `delivery_fee` | `numeric(12,2)` | NOT NULL | `0` |
| `subscription_tier` | `text` | NOT NULL | `'FREE'` |
| `suspended_at` | `timestamptz` | NULL | `NULL` |
| `suspended_by` | `uuid` | NULL | `NULL` |
| `suspension_reason` | `text` | NULL | `NULL` |
| `archived_at` | `timestamptz` | NULL | `NULL` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**Primary key:** `id`.

**Foreign keys:** owner/location/type to their tables; `suspended_by -> profiles(id) ON DELETE SET NULL`.

**Unique constraints:** `(location_id, slug)`; optionally a case-insensitive name uniqueness policy per location.

**Checks:** approval status in `pending`, `approved`, `rejected`; delivery fee >= 0; subscription tier in `FREE`, `PRO`; coordinates valid; `suspended_at` and `suspension_reason` required when suspended by the suspension function.

**Indexes:** `(location_id, approval_status, is_live)`, `(owner_profile_id)`, `(business_type_id)`, `(name)`, partial public index for approved/live/non-archived businesses.

**Relationships:** location/type/owner each have many businesses; business has many members, hours, products, services, requests, appointments, media, payment accounts, applications, subscriptions, and metrics.

**RLS:** public may select only approved, live, non-archived, non-suspended businesses in active locations. Owner/member may select their own business regardless of live state. Members may update only explicitly allowed profile/operational fields. Only admins or admin RPCs may change approval, suspension, owner, or archive fields. A shopkeeper update must use `WITH CHECK` and a trigger that prevents clearing or bypassing suspension.

**Compatibility:** existing `shops` calls require an updatable compatibility view plus `INSTEAD OF` triggers or a staged frontend migration. The canonical authority remains `businesses`.

## 4.2 `business_members`

**Purpose:** Business ownership and staff boundary.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `user_id uuid NOT NULL`, `member_role text NOT NULL DEFAULT 'staff'`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: business and profile.

Unique: `(business_id, user_id)`.

Checks: member role in `owner`, `manager`, `staff`.

Indexes: `(user_id, is_active)`, `(business_id, member_role, is_active)`.

Relationships: business has many members; user may belong to many businesses.

RLS: active members read their business membership; owner/admin manage memberships. A user cannot add itself as owner.

## 4.3 `business_hours`

**Purpose:** Weekly business hours, 24-hour operation, and overnight support.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `weekday smallint NOT NULL`, `opens_at time NULL`, `closes_at time NULL`, `is_closed boolean NOT NULL DEFAULT false`, `is_24_hours boolean NOT NULL DEFAULT false`, `timezone text NOT NULL DEFAULT 'Asia/Kolkata'`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FK: `business_id -> businesses(id) ON DELETE CASCADE`.

Unique: `(business_id, weekday, opens_at)`.

Checks: weekday 0-6; 24-hour rows cannot be closed; closed rows have no times; non-24-hour rows have both times; overnight close may be earlier than open and must be interpreted as next day.

Indexes: `(business_id, weekday)`.

Relationships: business has many weekly hour ranges.

RLS: public reads hours for visible businesses; members manage their own business hours; admins manage all.

## 4.4 `business_hour_exceptions`

**Purpose:** Holidays and date-specific opening overrides.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `exception_date date NOT NULL`, `is_closed boolean NOT NULL DEFAULT true`, `opens_at time NULL`, `closes_at time NULL`, `is_24_hours boolean NOT NULL DEFAULT false`, `reason text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FK: business.

Unique: `(business_id, exception_date, opens_at)`.

Checks: same time/closed rules as weekly hours.

Indexes: `(business_id, exception_date)`.

Relationships: business has many exceptions.

RLS: visible public read; members/admin manage.

## 4.5 `business_status`

**Purpose:** Shopkeeper operational status and server-owned admin suspension.

Columns: `business_id uuid PK`, `shopkeeper_status text NOT NULL DEFAULT 'not_accepting'`, `admin_suspended boolean NOT NULL DEFAULT false`, `status_message text NULL`, `updated_by uuid NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: business; `updated_by -> profiles(id) ON DELETE SET NULL`.

Unique: primary key business.

Checks: status in `accepting`, `not_accepting`, `busy`, `delayed`.

Indexes: `(shopkeeper_status)`, partial index for accepting businesses.

Relationships: one status row per business.

RLS: public may read effective status for visible businesses; members may update only `shopkeeper_status` and `status_message`; only admins/admin RPCs may change `admin_suspended`. A trigger rejects any non-admin attempt to alter suspension fields. Public effective status must always include business approval/live/suspension checks.

## 4.6 `business_applications`

**Purpose:** Shopkeeper onboarding, correction requests, admin review, approval, and rejection.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `applicant_id uuid NOT NULL`, `requested_business_id uuid NULL`, `location_id uuid NOT NULL`, `business_type_id uuid NOT NULL`, `business_name text NOT NULL`, `owner_name text NOT NULL`, `description text NULL`, `contact_phone text NOT NULL`, `latitude numeric(9,6) NULL`, `longitude numeric(9,6) NULL`, `google_maps_url text NULL`, `upi_id text NULL`, `status text NOT NULL DEFAULT 'submitted'`, `reviewed_by uuid NULL`, `review_notes text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: applicant/profile, requested business, location, type, reviewer/profile.

Unique: optional one active application per applicant/business/location using a partial unique index.

Checks: status in `submitted`, `under_review`, `correction_requested`, `approved`, `rejected`; coordinates valid.

Indexes: `(applicant_id, created_at DESC)`, `(status, created_at)`, `(location_id, business_type_id)`.

Relationships: applicant has many applications; approved application may create one business; application has many media records.

RLS: applicant can insert/read own application and submit corrections; applicant cannot approve/reject or modify review fields. Admins can read/update all and approve/reject. Government ID columns are not stored here; they are private media records.

## 4.7 `business_application_media`

**Purpose:** Application evidence references, including 4-10 storefront photos and private government ID.

Columns: `application_id uuid NOT NULL`, `media_asset_id uuid NOT NULL`, `media_role text NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`.

Primary key: `(application_id, media_asset_id)`.

FKs: application and media asset.

Unique: `(application_id, media_role, sort_order)`.

Checks: role in `identity_document`, `storefront_photo`, `upi_qr`, `business_evidence`; sort order >= 0.

Indexes: `(application_id, media_role)`, `(media_asset_id)`.

Relationships: application has many media assets; media asset may be linked to one application role.

RLS: applicant may manage only own application uploads; admins may read all; other users cannot read identity documents. Storage policies must independently enforce the same boundary.

---

# 5. Storage References and Media

## 5.1 `media_assets`

**Purpose:** Database metadata for Supabase Storage objects; binaries remain in Storage.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `bucket_name text NOT NULL`, `storage_path text NOT NULL`, `media_kind text NOT NULL`, `mime_type text NOT NULL`, `file_size_bytes bigint NULL`, `visibility text NOT NULL`, `uploaded_by uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz NULL`.

FK: `uploaded_by -> profiles(id) ON DELETE RESTRICT`.

Unique: `(bucket_name, storage_path)`.

Checks: visibility in `public`, `private`; file size >= 0; media kind is approved by application policy.

Indexes: `(media_kind, visibility)`, `(uploaded_by, created_at DESC)`.

Relationships: linked from businesses, products, profiles, applications, payment evidence, and hospitals.

RLS: visibility is never sufficient by itself; parent-object authorization is required. Users may create only scoped uploads; admins may inspect all; private media is never publicly selectable.

## 5.2 `business_media`

**Purpose:** Storefront and business profile image associations.

Columns: `business_id uuid NOT NULL`, `media_asset_id uuid NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `is_primary boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`.

Primary key: `(business_id, media_asset_id)`.

FKs: business and media asset.

Unique: at most one primary image per business via partial unique index.

Checks: sort order >= 0; linked asset must be public business media.

Indexes: `(business_id, sort_order)`, partial primary index.

Relationships: business has many media assets.

RLS: public reads media of visible businesses; members/admin manage.

## 5.3 `product_images`

**Purpose:** Multiple product image references.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `product_id uuid NOT NULL`, `media_asset_id uuid NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `is_primary boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: product and media asset.

Unique: `(product_id, media_asset_id)`; partial unique primary image.

Checks: sort order >= 0; linked asset must be public product media.

Indexes: `(product_id, sort_order)`.

Relationships: product has many images.

RLS: public reads images for visible products; business members manage own product images; admins manage all.

---

# 6. Products, Attributes, Variants, and Search

## 6.1 `products`

**Purpose:** Base catalogue product, replacing the current `shop_products` JSON-heavy record.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `sku text NULL`, `name text NOT NULL`, `description text NULL`, `base_price numeric(12,2) NOT NULL DEFAULT 0`, `selling_unit text NOT NULL DEFAULT 'item'`, `is_available boolean NOT NULL DEFAULT true`, `track_inventory boolean NOT NULL DEFAULT false`, `stock_quantity numeric(12,3) NULL`, `offer_label text NULL`, `offer_type text NULL`, `offer_value numeric(12,2) NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FK: business.

Unique: `(business_id, sku)` when SKU is not null.

Checks: prices/stock/offer values non-negative; offer type in `bogo`, `percent_off`, `flat_off`; percent offer bounded by 0-100; stock required when inventory tracking is enabled.

Indexes: `(business_id, is_available, created_at DESC)`, `(business_id, sku)`, optional trigram/name search index.

Relationships: business has many products; product has translations, images, attributes, variants, and order items.

RLS: public reads available products only through visible businesses; members manage products only for their business; admins manage all. Inserts/updates must verify business ownership and suspension rules.

**Compatibility:** `shop_products` may be an updatable compatibility view exposing `price = base_price`, `unit = selling_unit`, and legacy JSON only for transitional reads. New writes should use RPCs or normalized tables.

## 6.2 `product_translations`

**Purpose:** English, Tamil, Tanglish, and common/local search names.

Columns: `product_id uuid NOT NULL`, `language_code text NOT NULL`, `display_name text NOT NULL`, `search_text text NOT NULL`, `is_primary boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`.

Primary key: `(product_id, language_code, display_name)`.

FK: product.

Unique: one primary translation per product/language through partial unique index.

Checks: language code in `en`, `ta`, `ta-Latn`, or another admin-approved code; non-empty display/search text.

Indexes: `(language_code, search_text)`, optional GIN `tsvector`, optional trigram index.

Relationships: product has many translations.

RLS: public reads translations for visible products; members manage own products; admins manage all.

## 6.3 `search_synonyms`

**Purpose:** Admin-managed aliases such as `thakkali <-> tomato`, `arisi <-> rice`, and Tamil equivalents.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `canonical_term text NOT NULL`, `synonym text NOT NULL`, `language_code text NULL`, `is_active boolean NOT NULL DEFAULT true`, `created_by uuid NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FK: creator profile.

Unique: case-insensitive `(canonical_term, synonym, language_code)`.

Checks: terms non-empty; canonical and synonym may not be identical after normalization.

Indexes: `(synonym, is_active)`, `(canonical_term, is_active)`, language index.

Relationships: independent search dictionary used by products/services/business names.

RLS: public may read active synonyms; admins manage; shopkeepers cannot change global aliases. **ASSUMPTION:** business-specific private synonyms may be added later.

## 6.4 `product_attribute_definitions`

**Purpose:** Product-specific attributes such as RAM, storage, size, color, weight, or quantity.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `product_id uuid NOT NULL`, `name text NOT NULL`, `normalized_name text NOT NULL`, `value_type text NOT NULL DEFAULT 'text'`, `display_order integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`.

FK: product.

Unique: `(product_id, normalized_name)`.

Checks: value type in `text`, `integer`, `decimal`, `boolean`; display order >= 0.

Indexes: `(product_id, display_order)`.

Relationships: product has many definitions; each definition has many options.

RLS: same as products.

## 6.5 `product_attribute_options`

**Purpose:** Allowed values such as `4 GB`, `8 GB`, `Red`, `Blue`, `128 GB`, or `1 kg`.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `attribute_definition_id uuid NOT NULL`, `display_value text NOT NULL`, `normalized_value text NOT NULL`, `display_order integer NOT NULL DEFAULT 0`.

FK: attribute definition.

Unique: `(attribute_definition_id, normalized_value)`.

Checks: non-empty value; display order >= 0.

Indexes: `(attribute_definition_id, display_order)`.

Relationships: definition has many options; option may belong to many variants.

RLS: same as products.

## 6.6 `product_variants`

**Purpose:** Sellable product-specific combinations with variant SKU, price, availability, and stock.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `product_id uuid NOT NULL`, `sku text NULL`, `label text NULL`, `price numeric(12,2) NOT NULL`, `is_available boolean NOT NULL DEFAULT true`, `track_inventory boolean NOT NULL DEFAULT false`, `stock_quantity numeric(12,3) NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FK: product.

Unique: `(product_id, sku)` when SKU is not null.

Checks: price and stock non-negative; stock required when tracking enabled.

Indexes: `(product_id, is_available)`, `(sku)`.

Relationships: product has many variants; variant has many values and order-item references.

RLS: public reads available variants of visible products; business members manage own variants; admins manage all.

## 6.7 `product_variant_values`

**Purpose:** Defines the attribute-option combination for each variant.

Columns: `variant_id uuid NOT NULL`, `attribute_definition_id uuid NOT NULL`, `attribute_option_id uuid NOT NULL`.

Primary key: `(variant_id, attribute_definition_id)`.

FKs: variant, definition, option.

Unique: `(variant_id, attribute_option_id)`.

Checks: the option must belong to the referenced definition and the definition must belong to the variant's product, enforced by trigger/function.

Indexes: `(attribute_option_id)`, `(variant_id)`.

Relationships: variant has at most one option per attribute definition; product-specific arbitrary combinations are supported.

RLS: same as variants.

## 6.8 Compatibility product/catalogue views

The existing code expects `shop_products`, `variants`, `attribute_groups`, `image_url`, `image_urls`, `offer_type`, and `offer_value`. These should be compatibility views or transitional projections, not the normalized source of truth. Writes that would affect multiple normalized rows must go through a transaction RPC.

---

# 7. Services and Appointments

## 7.1 `services`

**Purpose:** Salon, clinic, hospital, repair, tailoring, and other service catalogue entries.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `name text NOT NULL`, `description text NULL`, `service_category text NULL`, `price_type text NOT NULL DEFAULT 'fixed'`, `base_price numeric(12,2) NULL`, `min_price numeric(12,2) NULL`, `max_price numeric(12,2) NULL`, `duration_minutes integer NULL`, `provider_id uuid NULL`, `is_available boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: business; provider when applicable.

Unique: optional `(business_id, lower(name))`.

Checks: price type in `fixed`, `range`, `quote`; non-negative prices; fixed requires base price; range requires min/max and min <= max; duration positive when present.

Indexes: `(business_id, is_available, created_at)`, `(provider_id, is_available)`, optional search index.

Relationships: business has many services; provider may offer many services; service has many slots and appointments.

RLS: public reads available services for visible businesses; business members manage own services; admins manage all.

**Compatibility:** expose `shop_services` view with `shop_id`, `provider_name`, `specialization`, and existing price columns.

## 7.2 `appointment_slots`

**Purpose:** Concrete date/time capacity bucket.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `service_id uuid NOT NULL`, `provider_id uuid NULL`, `slot_date date NOT NULL`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NOT NULL`, `capacity integer NOT NULL DEFAULT 1`, `confirmed_count integer NOT NULL DEFAULT 0`, `is_open boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: business, service, optional provider.

Unique: `(business_id, service_id, provider_id, starts_at)`; provider null handling must use an appropriate expression/index.

Checks: capacity between 1 and an admin-configured maximum; confirmed count >= 0 and <= capacity; ends_at > starts_at; slot date matches local business date by policy.

Indexes: `(business_id, slot_date, starts_at)`, `(service_id, slot_date, starts_at)`, partial open-slot index.

Relationships: service/business have many slots; one slot has many appointments up to capacity.

RLS: public reads slots only for visible businesses and preferably only open slots; members manage slots for their business; booking and count changes happen only through trusted RPC. Direct public updates are forbidden.

## 7.3 `appointments`

**Purpose:** Appointment booking attached to a generic request.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `request_id uuid NOT NULL`, `slot_id uuid NOT NULL`, `customer_id uuid NOT NULL`, `service_id uuid NOT NULL`, `status text NOT NULL DEFAULT 'requested'`, `rescheduled_from_id uuid NULL`, `customer_name_snapshot text NULL`, `customer_phone_snapshot text NULL`, `customer_notes text NULL`, `delay_minutes integer NOT NULL DEFAULT 0`, `confirmed_at timestamptz NULL`, `cancelled_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: request unique, slot, customer profile, service, optional self-reference.

Unique: `request_id`; partial unique active `(slot_id, customer_id)` if duplicate customer bookings are disallowed.

Checks: status in `requested`, `confirmed`, `in_progress`, `completed`, `rejected`, `cancelled`, `expired`, `delayed`, `no_show`, `rescheduled`; delay >= 0.

Indexes: `(slot_id, status)`, `(customer_id, created_at DESC)`, `(service_id, status)`, `(status, created_at)`.

Relationships: request has one appointment; slot has many active appointments up to capacity; customer has many appointments.

RLS: customer reads only own appointments; authorized business members read/update appointments for their business; hospital staff require hospital authorization; admins read/manage all. Booking, cancellation, and rescheduling use RPCs.

## 7.4 Appointment concurrency invariant

The authoritative booking function must lock the slot row with `FOR UPDATE`, validate business visibility/suspension, validate service and slot state, verify `confirmed_count < capacity`, insert the request and appointment, increment the count, write request/notification events, and commit as one transaction. A trigger or equivalent function must reject `confirmed_count > capacity` and reject direct client count changes.

Cancellation locks the appointment and slot, applies policy, changes status, decrements count, and emits events. Rescheduling locks old and new slots in deterministic UUID order, releases the old reservation, reserves the new slot, and commits atomically.

---

# 8. Requests, Orders, Items, and Fulfillment

## 8.1 `requests`

**Purpose:** Reusable root for order, appointment, and service workflows.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `reference_code text NOT NULL`, `customer_id uuid NOT NULL`, `business_id uuid NOT NULL`, `request_kind text NOT NULL`, `current_state text NOT NULL`, `fulfillment_type text NULL`, `subtotal numeric(12,2) NULL`, `discount_total numeric(12,2) NOT NULL DEFAULT 0`, `delivery_fee numeric(12,2) NOT NULL DEFAULT 0`, `total_amount numeric(12,2) NULL`, `customer_notes text NULL`, `scheduled_for timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `completed_at timestamptz NULL`, `cancelled_at timestamptz NULL`.

FKs: customer profile; business.

Unique: `reference_code`.

Checks: request kind in `ORDER`, `APPOINTMENT`, `SERVICE`; fulfillment type in `parcel`, `dine_in`, `pickup`, `delivery`; monetary values non-negative; `total_amount = subtotal - discount_total + delivery_fee` enforced by creation/update RPC, not browser.

Indexes: `(customer_id, created_at DESC)`, `(business_id, current_state, created_at DESC)`, `(request_kind, scheduled_for)`, `(business_id, created_at DESC)`.

Relationships: customer/business have many requests; request has items, events, optional appointment, and payments.

RLS: customer reads/inserts only own requests through controlled creation RPC; business members read requests for their business and update only authorized states through transition RPC; admins read all. Direct delete is forbidden. Customer cancellation uses a dedicated policy/RPC limited to eligible states.

**Compatibility:** current `requests` table can remain the canonical name during migration, with new columns and child tables added. Existing `workflow_group_code` may be retained as a compatibility column mapped to `request_kind`; `notes` may remain only as a non-authoritative legacy/display field.

## 8.2 `request_items`

**Purpose:** Immutable order lines with authoritative price and product snapshots.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `request_id uuid NOT NULL`, `product_id uuid NULL`, `variant_id uuid NULL`, `product_name_snapshot text NOT NULL`, `variant_label_snapshot text NULL`, `unit_snapshot text NOT NULL`, `quantity numeric(12,3) NOT NULL`, `effective_quantity numeric(12,3) NOT NULL`, `unit_price numeric(12,2) NOT NULL`, `discount_amount numeric(12,2) NOT NULL DEFAULT 0`, `line_total numeric(12,2) NOT NULL`, `delivered_quantity numeric(12,3) NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: request; optional product and variant with historical rows retained if product is archived.

Unique: optional `(request_id, product_id, variant_id)` if duplicate lines are merged by creation RPC.

Checks: quantities > 0; prices/discounts/line totals non-negative; line total server-calculated.

Indexes: `(request_id)`, `(product_id, created_at)`, `(variant_id, created_at)`.

Relationships: request has many items; product/variant have many historical item references.

RLS: request parties may read; insert only through request-creation RPC; updates/deletes forbidden after request creation except controlled amendment workflow.

## 8.3 `request_item_options`

**Purpose:** Immutable selected attribute snapshots for order lines.

Columns: `request_item_id uuid NOT NULL`, `attribute_name_snapshot text NOT NULL`, `option_value_snapshot text NOT NULL`.

Primary key: `(request_item_id, attribute_name_snapshot)`.

FK: request item.

Unique: primary key.

Checks: non-empty snapshots.

Indexes: `(request_item_id)`.

Relationships: item has many selected option snapshots.

RLS: same as request items; insert only through request RPC.

## 8.4 `request_events`

**Purpose:** Append-only request state/audit history.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `request_id uuid NOT NULL`, `from_state text NULL`, `to_state text NOT NULL`, `actor_id uuid NULL`, `actor_role text NOT NULL`, `notes text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: request; actor profile nullable for system actions.

Unique: no duplicate requirement; event ordering uses timestamp/id.

Checks: actor role valid; from/to states valid for request kind; initial event may have null from state.

Indexes: `(request_id, created_at)`, `(actor_id, created_at)`.

Relationships: request has many events.

RLS: request parties may select; insert only through transition/system RPC; updates/deletes forbidden.

## 8.5 `request_status_transitions`

**Purpose:** Data-driven allowed transitions replacing frontend-only validation.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `request_kind text NOT NULL`, `from_state text NULL`, `to_state text NOT NULL`, `allowed_roles text[] NOT NULL`, `is_enabled boolean NOT NULL DEFAULT true`, `action_label text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: optional workflow group/state references if implementation uses normalized state IDs.

Unique: `(request_kind, from_state, to_state)`.

Checks: request kind and states valid; roles approved; at least one allowed role.

Indexes: `(request_kind, from_state, is_enabled)`.

Relationships: transition rules apply to many requests.

RLS: public read if UI requires; admin-only write. Transition RPC must re-check actor role and ownership.

## 8.6 Hotel/restaurant fulfillment

`requests.fulfillment_type` supports `parcel` and `dine_in`. For a restaurant/hotel business, the business type and request-creation RPC must require a valid fulfillment choice. **ASSUMPTION:** delivery addresses and table numbers are future requirements; add dedicated tables/columns when confirmed rather than placing them in JSON notes.

## 8.7 Legacy request compatibility

The existing frontend submits item and appointment payloads in `notes` and uses `total_estimate`, `customer_paid`, and `payment_screenshot_url`. These fields may remain temporarily as compatibility/read-only projections, but the authoritative source must be request items, appointments, and payment records. A migration adapter must parse legacy rows before analytics uses them.

---

# 9. Payments and Verification

## 9.1 `business_payment_accounts`

**Purpose:** Public payment destinations owned by the business; Vaangly does not receive customer funds.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `method text NOT NULL`, `upi_id text NULL`, `qr_media_asset_id uuid NULL`, `account_label text NULL`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: business; QR media asset.

Unique: optional active UPI ID per business; `(business_id, method, account_label)`.

Checks: method in `upi`, `cash`, `other`; UPI method requires valid non-empty UPI ID or QR reference.

Indexes: `(business_id, is_active)`.

Relationships: business has many payment destinations.

RLS: public may read safe active destination fields for visible businesses; business members manage own accounts; admins manage all. QR image is not evidence.

## 9.2 `payment_records`

**Purpose:** Customer claim that direct payment was made to a business.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `request_id uuid NOT NULL`, `business_id uuid NOT NULL`, `customer_id uuid NOT NULL`, `payment_method text NOT NULL`, `amount_claimed numeric(12,2) NOT NULL`, `payment_reference text NULL`, `status text NOT NULL DEFAULT 'pending'`, `paid_at timestamptz NULL`, `verified_by uuid NULL`, `verified_at timestamptz NULL`, `verification_notes text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: request, business, customer, verifier profile.

Unique: payment reference should be unique per business when non-null, subject to business policy.

Checks: amount > 0; method in `upi`, `cash`, `other`; status in `pending`, `verified`, `rejected`; verified fields required only for verified/rejected states; verifier cannot be the customer.

Indexes: `(request_id, status)`, `(business_id, status, created_at DESC)`, `(customer_id, created_at DESC)`, `(business_id, payment_reference)`.

Relationships: request may have multiple attempts; business/customer have many records.

RLS: customer may create/read own records and submit evidence; business members may read records for their business and verify/reject; admins may inspect/override with audit. Customers cannot update status or verifier fields.

## 9.3 `payment_evidence`

**Purpose:** Private screenshot or receipt reference for a payment record.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `payment_record_id uuid NOT NULL`, `media_asset_id uuid NOT NULL`, `uploaded_by uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

Primary key: `id`.

FKs: payment record, private media asset, uploader.

Unique: `(payment_record_id, media_asset_id)`.

Checks: media visibility must be private and media kind `payment_evidence`, enforced by trigger/RPC.

Indexes: `(payment_record_id)`, `(uploaded_by, created_at DESC)`.

Relationships: payment record has one or more evidence files.

RLS: customer who owns the request, authorized business members, and admins may read through request-scoped policy. Only the customer or trusted upload RPC may insert. Public access is forbidden.

## 9.4 Payment rule

A QR image identifies where money should be sent. It does not prove payment. Payment verification is separate from request completion. Only verified payments contribute to verified-payment analytics. Vaangly must not hold, settle, or transfer customer funds.

---

# 10. Hospitals, Departments, Doctors, and Queues

## 10.1 `hospitals`

**Purpose:** Hospital-specific operational configuration linked to a business.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL UNIQUE`, `registration_name text NULL`, `emergency_enabled boolean NOT NULL DEFAULT false`, `queue_enabled boolean NOT NULL DEFAULT false`, `management_contact_id uuid NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: business, management profile.

Unique: business_id.

Checks: registration name required if policy later requires registration verification.

Indexes: `(emergency_enabled)`, `(queue_enabled)`.

Relationships: one hospital configuration per business; hospital has departments, providers, staff, queues, and emergency cases.

RLS: public reads approved hospital profile fields; authorized hospital staff and admins read operational fields; managers/admins write.

## 10.2 `hospital_departments`

**Purpose:** Departments such as general medicine, pediatrics, dermatology, or emergency.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `hospital_id uuid NOT NULL`, `name text NOT NULL`, `code text NOT NULL`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FK: hospital.

Unique: `(hospital_id, code)`, `(hospital_id, lower(name))`.

Checks: non-empty name/code.

Indexes: `(hospital_id, is_active)`.

Relationships: hospital has many departments; providers/staff/queues may reference departments.

RLS: public reads active department names for approved hospitals; hospital staff/admin manage authorized departments.

## 10.3 `healthcare_providers`

**Purpose:** Doctors and other providers with availability and service links.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `hospital_id uuid NOT NULL`, `profile_id uuid NULL`, `display_name text NOT NULL`, `specialization text NULL`, `license_reference text NULL`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: hospital; optional profile.

Unique: `(hospital_id, lower(display_name))` subject to duplicate policy; license reference should be unique within hospital when present.

Checks: non-empty display name.

Indexes: `(hospital_id, is_active)`, `(specialization, is_active)`.

Relationships: hospital has many providers; provider belongs to many departments and has many availability records/services.

RLS: public reads approved display profile; hospital staff/admin read operational fields; hospital manager/admin manage.

## 10.4 `provider_departments`

**Purpose:** Many-to-many provider/department mapping.

Columns: `provider_id uuid NOT NULL`, `department_id uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

Primary key: `(provider_id, department_id)`.

FKs: provider and department; trigger verifies same hospital.

Indexes: `(department_id, provider_id)`.

Relationships: provider belongs to many departments; department has many providers.

RLS: authorized hospital staff/admin only; public may receive filtered provider information through a view.

## 10.5 `provider_availability`

**Purpose:** Recurring/date-specific provider availability and capacity.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `provider_id uuid NOT NULL`, `department_id uuid NULL`, `availability_date date NULL`, `weekday smallint NULL`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NOT NULL`, `capacity integer NOT NULL DEFAULT 1`, `is_available boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: provider and optional department.

Unique: provider/date/start or provider/weekday/start for recurring rows.

Checks: exactly one of availability_date or weekday for a recurring/date rule; weekday 0-6; ends > starts; capacity >= 1.

Indexes: `(provider_id, availability_date, starts_at)`, `(provider_id, weekday, starts_at)`.

Relationships: provider has many availability rules; rules generate appointment slots.

RLS: provider/authorized hospital staff/admin manage; public reads only generated public slots, not private scheduling notes.

## 10.6 `hospital_queue_tokens`

**Purpose:** Queue/token assignment for appointments and walk-ins.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `hospital_id uuid NOT NULL`, `department_id uuid NOT NULL`, `appointment_id uuid NULL`, `patient_id uuid NOT NULL`, `queue_date date NOT NULL`, `token_number integer NOT NULL`, `status text NOT NULL DEFAULT 'waiting'`, `position integer NULL`, `called_at timestamptz NULL`, `completed_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: hospital, department, optional appointment, patient profile.

Unique: `(hospital_id, department_id, queue_date, token_number)`; one active token per appointment.

Checks: token number > 0; status in `waiting`, `called`, `in_service`, `completed`, `cancelled`, `no_show`; position >= 0.

Indexes: `(hospital_id, department_id, queue_date, status, position)`, `(patient_id, created_at DESC)`.

Relationships: department has many tokens; appointment may have one token.

RLS: patient reads only own token; authorized hospital queue staff read/update department queue; admins read all. Token allocation must use a locking RPC.

## 10.7 `patient_arrivals`

**Purpose:** Operational patient check-in, not clinical data.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `appointment_id uuid NOT NULL`, `patient_id uuid NOT NULL`, `arrived_at timestamptz NOT NULL DEFAULT now()`, `status text NOT NULL DEFAULT 'arrived'`, `recorded_by uuid NOT NULL`, `notes text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: appointment, patient, recorder profile.

Unique: one active arrival per appointment.

Checks: status in `arrived`, `checked_in`, `left`, `no_show`.

Indexes: `(appointment_id)`, `(patient_id, created_at DESC)`.

Relationships: appointment may have one arrival; staff records many arrivals.

RLS: patient reads own arrival; authorized hospital staff manage; no public access.

## 10.8 `emergency_cases`

**Purpose:** Operational emergency queue only; does not make clinical decisions.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `hospital_id uuid NOT NULL`, `patient_id uuid NULL`, `external_patient_reference text NULL`, `department_id uuid NULL`, `assigned_staff_id uuid NULL`, `arrived_at timestamptz NOT NULL DEFAULT now()`, `priority_category text NOT NULL`, `status text NOT NULL DEFAULT 'open'`, `notes text NULL`, `created_by uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FKs: hospital, optional patient/department/staff, creator profile.

Unique: no global patient uniqueness; external reference unique only per hospital if provided.

Checks: priority is an operational category approved by hospital policy; status in `open`, `queued`, `assigned`, `in_progress`, `resolved`, `cancelled`.

Indexes: `(hospital_id, status, arrived_at)`, `(department_id, status)`.

Relationships: hospital has many emergency cases.

RLS: hospital staff authorized for that hospital and admins only. No patient/public access unless a separate privacy design is approved.

---

# 11. Notifications and Push

## 11.1 `notification_events`

**Purpose:** Trusted append-only event/outbox for reusable notification generation.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `event_type text NOT NULL`, `aggregate_type text NOT NULL`, `aggregate_id uuid NOT NULL`, `actor_id uuid NULL`, `payload jsonb NOT NULL DEFAULT '{}'::jsonb`, `created_at timestamptz NOT NULL DEFAULT now()`, `processed_at timestamptz NULL`, `delivery_attempts integer NOT NULL DEFAULT 0`.

FK: actor profile nullable.

Unique: optional idempotency key `(event_type, aggregate_type, aggregate_id, idempotency_key)`; add `idempotency_key text` if worker retries are expected.

Checks: event and aggregate types non-empty; attempts >= 0.

Indexes: `(processed_at, created_at)`, `(aggregate_type, aggregate_id, created_at)`, `(event_type, created_at)`.

Relationships: one event generates many notifications and push deliveries.

RLS: no arbitrary browser inserts; trusted RPC/Edge Function only; admins may inspect.

## 11.2 `notifications`

**Purpose:** Persistent in-app notification inbox.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `recipient_id uuid NOT NULL`, `business_id uuid NULL`, `event_id uuid NULL`, `notification_type text NOT NULL`, `title text NOT NULL`, `message text NOT NULL`, `reference_id uuid NULL`, `reference_code text NULL`, `is_read boolean NOT NULL DEFAULT false`, `read_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: recipient profile, business, notification event.

Unique: optional `(recipient_id, event_id, notification_type)` for idempotency.

Checks: non-empty type/title/message; read_at required when is_read true.

Indexes: `(recipient_id, is_read, created_at DESC)`, `(business_id, created_at DESC)`, `(event_id)`.

Relationships: recipient has many notifications; event may create many recipients.

RLS: recipient selects and updates only read fields of own notifications; event service inserts; admins inspect. Users cannot change recipient, event, or message content.

**Compatibility:** preserve current `recipient_id`, `shop_id` projection, `type`, title, message, reference fields, and read behavior.

## 11.3 `push_subscriptions`

**Purpose:** Web/Capacitor push subscriptions per user/device.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL`, `endpoint text NOT NULL`, `subscription jsonb NOT NULL`, `platform text NULL`, `last_seen_at timestamptz NOT NULL DEFAULT now()`, `created_at timestamptz NOT NULL DEFAULT now()`.

FK: user profile.

Unique: `endpoint`.

Checks: subscription object not null; platform approved when present.

Indexes: `(user_id, last_seen_at DESC)`.

Relationships: user has many devices/subscriptions.

RLS: user may insert/update/delete only its own subscriptions; service/admin may process delivery without exposing other users' subscriptions.

---

# 12. Subscriptions, Ratings, Audit, and Platform

## 12.1 `business_subscriptions`

**Purpose:** Existing FREE/PRO/trial business subscription and admin billing status.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL UNIQUE`, `status text NOT NULL DEFAULT 'TRIAL'`, `trial_start_at timestamptz NOT NULL DEFAULT now()`, `trial_end_at timestamptz NOT NULL`, `go_live_at timestamptz NULL`, `daily_rate numeric(12,2) NOT NULL DEFAULT 10`, `billing_cycle text NOT NULL DEFAULT 'MONTHLY'`, `current_period_start timestamptz NULL`, `current_period_end timestamptz NULL`, `amount_due numeric(12,2) NOT NULL DEFAULT 0`, `last_payment_at timestamptz NULL`, `grace_period_days integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FK: business.

Unique: business_id.

Checks: status in `TRIAL`, `ACTIVE`, `OVERDUE`, `SUSPENDED`; billing cycle in `WEEKLY`, `MONTHLY`; daily rate 0-20 based on current code; non-negative due/grace values; trial end after start.

Indexes: `(status)`, `(business_id)`.

Relationships: one business to one subscription.

RLS: business members read their subscription; admins manage; shopkeepers cannot change status/rate through client updates.

## 12.2 `subscription_payments`

**Purpose:** Platform subscription payments recorded by admins; separate from customer order payments.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `subscription_id uuid NOT NULL`, `business_id uuid NOT NULL`, `amount_paid numeric(12,2) NOT NULL`, `payment_date timestamptz NOT NULL DEFAULT now()`, `billing_cycle text NOT NULL`, `period_start timestamptz NOT NULL`, `period_end timestamptz NOT NULL`, `payment_reference text NOT NULL`, `recorded_by_admin_id uuid NOT NULL`, `notes text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: subscription, business, admin profile.

Unique: `(business_id, payment_reference)`.

Checks: amount > 0; cycle valid; period_end > period_start.

Indexes: `(business_id, payment_date DESC)`, `(subscription_id, payment_date DESC)`.

Relationships: subscription has many platform payments.

RLS: admins insert/manage; business members read own subscription payments; customers have no access.

## 12.3 `business_ratings`

**Purpose:** Customer rating tied to a completed request.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `business_id uuid NOT NULL`, `customer_id uuid NOT NULL`, `request_id uuid NOT NULL UNIQUE`, `rating smallint NOT NULL`, `review_text text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FKs: business, customer, request.

Unique: request_id; optionally `(business_id, customer_id, request_id)` redundant with request uniqueness.

Checks: rating 1-5; request must be completed and belong to customer/business through trigger/RPC.

Indexes: `(business_id, created_at DESC)`, `(customer_id)`.

Relationships: completed request may have one rating; business has many ratings.

RLS: public may read approved ratings; customer may insert only own eligible rating; business may read; admins manage moderation. No self-rating by business owner.

**Compatibility:** existing `shop_ratings` and `shop_avg_ratings` can be compatibility views.

## 12.4 `admin_audit_logs`

**Purpose:** Immutable platform administration audit trail.

Columns: `id uuid PK DEFAULT gen_random_uuid()`, `admin_id uuid NOT NULL`, `action_type text NOT NULL`, `entity_type text NOT NULL`, `entity_id uuid NOT NULL`, `before_data jsonb NULL`, `after_data jsonb NULL`, `reason text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

FK: admin profile.

Unique: no business uniqueness; event identity can use an idempotency key if needed.

Checks: action/entity types non-empty; admin role verified by trigger/RPC.

Indexes: `(entity_type, entity_id, created_at DESC)`, `(admin_id, created_at DESC)`, `(action_type, created_at DESC)`.

Relationships: admin has many audit events; any entity may have many events.

RLS: admins select/insert through trusted RPC; no update/delete. Non-admins have no access.

## 12.5 `platform_settings`

**Purpose:** Admin-managed settings such as upload limits, appointment maximum capacity, and enabled features.

Columns: `key text PK`, `value jsonb NOT NULL`, `description text NULL`, `updated_by uuid NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`.

FK: updated profile.

Unique: key.

Checks: key non-empty; values validated by setting-specific RPC.

Indexes: none beyond primary key.

Relationships: independent global configuration.

RLS: public reads only explicitly public-safe keys; admins manage all; clients cannot write.

## 12.6 `business_daily_metrics`

**Purpose:** Pre-aggregated daily analytics for efficient PRO and operational reporting.

Columns: `business_id uuid NOT NULL`, `metric_date date NOT NULL`, `gross_order_value numeric(14,2) NOT NULL DEFAULT 0`, `completed_sales numeric(14,2) NOT NULL DEFAULT 0`, `cancelled_amount numeric(14,2) NOT NULL DEFAULT 0`, `verified_payment_amount numeric(14,2) NOT NULL DEFAULT 0`, `order_count integer NOT NULL DEFAULT 0`, `completed_order_count integer NOT NULL DEFAULT 0`, `cancelled_count integer NOT NULL DEFAULT 0`, `rejected_count integer NOT NULL DEFAULT 0`, `appointment_count integer NOT NULL DEFAULT 0`, `completed_appointment_count integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

Primary key: `(business_id, metric_date)`.

FK: business.

Unique: composite primary key.

Checks: all monetary/count values non-negative.

Indexes: `(business_id, metric_date DESC)`.

Relationships: business has one metric row per date.

RLS: business members read only their business metrics; admins read all; inserts/updates are aggregation-service/RPC only.

Analytics must exclude rejected, cancelled, expired, and unverified transactions from completed sales and verified revenue. Gross, cancelled, and verified measures remain separate.

---

# 13. Compatibility with Existing Vaangly Code

The existing frontend currently expects these names and fields:

- `profiles.role`: retain as a compatibility projection or migrate code to `user_roles`; it must not be client-authoritative.
- `shops`: compatibility view over `businesses`, or staged rename migration.
- `shop_products`: compatibility view over `products`, with normalized child queries for variants/images.
- `shop_services`: compatibility view over `services`.
- `requests`: retain as canonical root because it is used throughout customer, shopkeeper, appointment, and analytics code.
- `workflow_group_code`: retain temporarily or expose from `request_kind`.
- `current_state`: retain while enforcing transitions through RPC.
- `notes`: retain only for legacy display/migration; not authoritative.
- `appointment_slots`: retain name but replace single-booking assumptions with capacity/count and `appointments` rows.
- `notifications`: preserve current recipient/read/reference fields.
- `shop_applications`: compatibility view over `business_applications` if required during frontend migration.
- `shop_subscriptions` and `subscription_payments`: compatibility views over canonical subscription tables.
- `admin_audit_logs`: preserve existing name and add immutable audit fields.

The frontend's current `bookAppointmentRequest` performs request insertion, then slot booking, then event insertion. This must be replaced by one booking RPC before production use. The current analytics code parses `requests.notes` and loads all requests; it must move to server-side aggregation before relying on production analytics.

---

# MVP TABLES

Required tables for the first production-ready implementation:

- `profiles`
- `user_roles`
- `locations`
- `business_categories`
- `business_types`
- `workflow_groups`
- `workflow_states`
- `workflow_transitions`
- `businesses`
- `business_members`
- `business_hours`
- `business_hour_exceptions`
- `business_status`
- `media_assets`
- `business_media`
- `business_payment_accounts`
- `business_applications`
- `business_application_media`
- `services`
- `products`
- `product_translations`
- `search_synonyms`
- `product_images`
- `product_attribute_definitions`
- `product_attribute_options`
- `product_variants`
- `product_variant_values`
- `requests`
- `request_items`
- `request_item_options`
- `request_events`
- `request_status_transitions`
- `appointment_slots`
- `appointments`
- `payment_records`
- `payment_evidence`
- `notification_events`
- `notifications`
- `push_subscriptions`
- `admin_audit_logs`
- `business_subscriptions`
- `subscription_payments`
- `business_ratings`
- `business_daily_metrics`
- `platform_settings`

Hospital-specific tables are not required for the initial non-hospital MVP, although the business/service/request architecture is hospital-ready.

# FUTURE TABLES

- `hospitals`
- `hospital_departments`
- `healthcare_providers`
- `provider_departments`
- `provider_availability`
- `hospital_queue_tokens`
- `patient_arrivals`
- `emergency_cases`
- `hospital_staff_members`
- Delivery addresses and delivery tracking tables.
- Inventory reservations and substitution tables.
- Refunds, reversals, and dispute tables.
- Notification delivery-attempt tables.
- Advanced materialized analytics dimensions.
- Business-specific holiday and recurring schedule extensions if not included in MVP.

# REQUIRED DATABASE FUNCTIONS/TRIGGERS

1. `handle_new_auth_user()`: creates a profile safely after Auth signup.
2. `current_user_has_role(role)`: secure role lookup.
3. `current_user_is_admin()`: secure admin lookup.
4. `current_user_is_business_member(business_id)`: ownership/member boundary check.
5. `current_user_is_hospital_staff(hospital_id)`: hospital authorization check.
6. `prevent_profile_role_escalation()`: blocks self-role and self-verification changes.
7. `approve_business_application()`: validates evidence, creates/updates business, grants appropriate role, and audits atomically.
8. `suspend_business()` and `reactivate_business()`: admin-only status functions that write audit events and prevent owner bypass.
9. `set_business_operational_status()`: permits only shopkeeper fields and refuses suspended/live violations.
10. `create_order_request()`: validates product/variant availability, locks inventory if used, calculates totals, inserts request/items/events atomically.
11. `transition_request_state()`: validates ownership, role, allowed transition, terminal-state rules, writes request event, and emits notification event.
12. `cancel_request()`: applies customer cancellation policy and performs required appointment/payment effects.
13. `book_appointment_transaction()`: locks slot, validates capacity and business status, creates request/appointment, increments capacity, and emits events atomically.
14. `cancel_appointment_transaction()`: locks appointment/slot, applies policy, releases capacity, and emits events.
15. `reschedule_appointment_transaction()`: locks old/new slots in deterministic order and changes reservation atomically.
16. `assert_slot_capacity()`: trigger/function preventing `confirmed_count > capacity` and invalid direct count changes.
17. `verify_payment()`: business/admin-only verification/rejection with audit and notification event.
18. `create_notification_from_event()`: trusted event-to-recipient notification generation.
19. `allocate_hospital_queue_token()`: locks the daily department sequence and allocates a unique token.
20. `refresh_business_daily_metrics()`: server-side aggregate function excluding rejected/cancelled/unverified revenue from completed metrics.
21. `set_updated_at()`: common timestamp trigger.
22. `validate_application_media_count()`: ensures approved applications have 4-10 storefront photos and required private ID evidence.

# REQUIRED RLS POLICIES

- Profiles: self-safe fields only; admins all; no self-role/verification changes.
- Roles: self-read; admin/RPC management only.
- Locations/categories/types/workflow metadata: public active read; admin writes.
- Businesses: public reads visible businesses; owners/members read their own; admins all; only admin RPC changes approval/suspension.
- Business members/hours/status/catalogue: member-scoped access using business membership functions.
- Applications: applicant own application; admins all; applicant cannot change review fields.
- Identity documents: applicant-own pending access and admins only.
- Public media: public only when associated with visible business/product.
- Products/variants/services: public visible catalogue read; business-member writes only.
- Requests/items/events: customer-own and business-own reads; writes through creation/transition RPCs; no client delete.
- Appointment slots: public read available visible slots; members manage their slots; booking mutations through RPC.
- Appointments: customer-own, business-authorized, hospital-authorized, and admin access only.
- Payment records: customer-own, business verifier, admin; customer cannot change verification status.
- Payment evidence: private request-scoped access only.
- Notifications: recipient-own read and read-state update; service/RPC insert only.
- Push subscriptions: user-own device records.
- Hospital records: authorized hospital staff and admins only; patient-own access only where explicitly appropriate.
- Audit logs and metrics: admin/service writes; business-owner scoped reads for metrics.

# REQUIRED STORAGE BUCKETS

## Public

- `business-media`
- `product-media`
- `public-assets`

## Private

- `identity-documents`
- `payment-evidence`
- `hospital-private`

Required Storage policy rules:

- Storefront/product images may be publicly readable only after parent visibility checks.
- Government IDs are private and admin/applicant scoped.
- Payment evidence is private and request-party scoped.
- Use entity-scoped paths and short-lived signed URLs.
- Do not use a public bucket for payment evidence or government IDs.

# REQUIRED INDEXES

- `profiles(preferred_location_id)`, `profiles(email)`, `profiles(phone)`.
- `user_roles(user_id, role)`, `user_roles(role, user_id)`.
- `locations(is_active, name)`, optional name trigram index.
- `businesses(location_id, approval_status, is_live)`, owner, type, name, and public partial index.
- `business_members(user_id, is_active)`, `(business_id, member_role, is_active)`.
- `business_hours(business_id, weekday)` and exceptions by business/date.
- `business_applications(applicant_id, created_at DESC)`, status, location/type.
- `products(business_id, is_available, created_at DESC)`, SKU, and search indexes.
- `product_translations(language_code, search_text)` with GIN/trigram support.
- `product_variants(product_id, is_available)` and SKU.
- `services(business_id, is_available)`, provider/service indexes.
- `requests(customer_id, created_at DESC)`, `(business_id, current_state, created_at DESC)`, kind/schedule.
- `request_items(request_id)`, product, and variant indexes.
- `request_events(request_id, created_at)`.
- `appointment_slots(business_id, slot_date, starts_at)`, service/date/start, open-slot partial index.
- `appointments(slot_id, status)`, customer/date, service/status.
- `payment_records(request_id, status)`, business/status/date, customer/date.
- `notifications(recipient_id, is_read, created_at DESC)`.
- `notification_events(processed_at, created_at)` and aggregate indexes.
- `push_subscriptions(user_id, last_seen_at)`.
- Hospital indexes on hospital/department/date/status and provider availability.
- `admin_audit_logs(entity_type, entity_id, created_at DESC)`.
- `business_daily_metrics(business_id, metric_date DESC)`.

# OPEN QUESTIONS

1. Should `shops` remain the permanent public/API table name, or should the frontend migrate to `businesses` after compatibility views are introduced?
2. Should one profile be allowed to own multiple businesses? The proposed schema supports it.
3. Should a customer be allowed to make multiple active appointments for the same slot/service?
4. What are the exact cancellation windows and capacity-release rules?
5. Are delivery addresses required for MVP, or only parcel/counter pickup and eat-here?
6. Does `dine_in` require table numbers, party size, or reservation duration?
7. Is stock reservation required during order creation, or only availability validation?
8. Are tax/GST invoices required?
9. What exact payment evidence and verification policy applies to cash payments?
10. Are UPI payment references unique enough per business for idempotency?
11. What hospital privacy, patient identity, retention, and compliance requirements apply before hospital tables are enabled?
12. Should doctors be represented as Auth users, business staff, or both?
13. What notification delivery retry and retention period is required?
14. Which languages beyond English, Tamil, and Tanglish should be supported?
15. Should business-specific synonyms be supported in addition to admin-managed global synonyms?
16. What PRO analytics limits and date-range limits should be enforced?
17. Should subscription suspension hide a business, block new requests, or both?
18. What data-retention and account-deletion policy applies to government IDs, payment evidence, and historical orders?

## Confirmed Contradictions Resolved

- Current `shops` naming is preserved through compatibility rather than forcing an immediate frontend rewrite.
- Current JSON order/appointment payloads are retained only for legacy migration, not as authoritative data.
- Current two-step appointment booking is replaced by a single transaction RPC.
- Current single `booked_by_request_id` behavior is replaced by slot capacity plus appointment rows.
- Current client-side total and state calculations become database-authoritative.
- Current broad notification insertion is replaced by trusted event generation.
- Current public payment-proof risk is resolved with private evidence storage and request-scoped access.
- Current single-role profile model remains readable for compatibility but is no longer authoritative; `user_roles` is authoritative.
- Existing order, appointment, service, admin, shopkeeper, customer, Tamil search, subscription, audit, and mobile storage workflows remain representable.

## Assumptions

- **ASSUMPTION:** `Asia/Kolkata` is the initial default timezone.
- **ASSUMPTION:** A user may own or manage multiple businesses in the future.
- **ASSUMPTION:** Vaangly does not hold customer money or process settlement.
- **ASSUMPTION:** Hospital operational records are separate from clinical records.
- **ASSUMPTION:** Delivery addresses, GST, refunds, and advanced inventory are not required for the first production MVP.
- **ASSUMPTION:** Existing demo/local-storage behavior remains outside the production database contract.

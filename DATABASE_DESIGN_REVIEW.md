# Vaangly PostgreSQL/Supabase Database Design Report

## Audit Scope

Inspected:

- `src/types/database.ts`
- `src/types/workflow.ts`
- `src/context/AuthContext.tsx`
- `src/context/CartContext.tsx`
- `src/lib/supabase.ts`
- `src/lib/shopkeeperApi.ts`
- `src/lib/adminApi.ts`
- `src/lib/appointmentServiceApi.ts`
- `src/lib/notificationApi.ts`
- `src/lib/analyticsApi.ts`
- `src/lib/search.ts`
- `src/lib/pushNotifications.ts`
- `src/data/mockData.ts`
- `src/lib/demoData.ts`
- Customer, shopkeeper, admin, onboarding, catalogue, request, appointment, and analytics pages/components
- Existing Supabase migrations under `supabase/migrations/`

No tables were created or modified. No SQL was executed against Supabase.

---

# Current Frontend Data Model

The frontend currently expects:

- `profiles`
- `locations`
- `workflow_groups`
- `workflow_states`
- `workflow_transitions`
- `shop_types`
- `shops`
- `shop_products`
- `shop_services`
- `appointment_slots`
- `requests`
- `request_events`
- `shop_applications`
- `shop_subscriptions`
- `subscription_payments`
- `admin_audit_logs`
- `notifications`
- `push_subscriptions`
- `shop_ratings`

Current data is partly relational but several important values are stored as JSON in:

- `requests.notes`
- `shop_products.variants`
- `shop_products.attribute_groups`
- `shop_products.image_urls`
- `shops.slot_config`

The frontend also contains substantial local-storage/demo fallback data.

---

# A. Entity/Table List

## Core MVP Tables

1. `profiles`
2. `user_roles`
3. `locations`
4. `business_categories`
5. `business_types`
6. `businesses`
7. `business_members`
8. `business_hours`
9. `business_status`
10. `media_assets`
11. `business_media`
12. `business_payment_accounts`
13. `business_applications`
14. `business_application_media`
15. `services`
16. `products`
17. `product_translations`
18. `product_images`
19. `product_attribute_definitions`
20. `product_attribute_options`
21. `product_variants`
22. `product_variant_values`
23. `requests`
24. `request_items`
25. `request_item_options`
26. `request_events`
27. `request_status_transitions`
28. `appointment_slots`
29. `appointments`
30. `payment_records`
31. `payment_evidence`
32. `notifications`
33. `notification_events`
34. `push_subscriptions`
35. `admin_audit_logs`

## Hospital-Ready Tables

36. `hospitals`
37. `hospital_departments`
38. `healthcare_providers`
39. `provider_departments`
40. `provider_availability`
41. `hospital_queue_tokens`
42. `patient_arrivals`
43. `emergency_cases`
44. `hospital_staff_members`

## Analytics and Platform Tables

45. `business_subscriptions`
46. `subscription_payments`
47. `business_daily_metrics`
48. `platform_settings`

---

# B. Table Purposes and C. Columns

## 1. `profiles`

Application profile linked directly to Supabase Auth.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, references `auth.users.id` |
| `full_name` | `text` | Required |
| `phone` | `text` | Optional |
| `email` | `text` | Usually synchronized from Auth |
| `avatar_url` | `text` | Public media reference |
| `preferred_location_id` | `uuid` | FK to `locations` |
| `is_verified` | `boolean` | Platform verification, not email authentication |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Do not trust frontend-provided role or verification metadata.

## 2. `user_roles`

Allows users to have controlled roles without allowing customers to promote themselves.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | FK to `profiles` |
| `role` | `text` | `customer`, `shopkeeper`, `admin`, `hospital_staff` |
| `granted_by` | `uuid` | Admin or system actor |
| `created_at` | `timestamptz` | |

Primary key: `(user_id, role)`.

## 3. `locations`

Admin-managed towns, cities, and future service areas.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `name` | `text` | |
| `slug` | `text` | Unique |
| `state` | `text` | |
| `country_code` | `text` | Default `IN` |
| `postal_code` | `text` | Optional |
| `latitude` | `numeric` | Optional |
| `longitude` | `numeric` | Optional |
| `is_active` | `boolean` | |
| `is_launch_town` | `boolean` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

A location can contain many businesses. A business belongs to one primary location.

## 4. `business_categories`

Admin-managed high-level groupings such as food, retail, healthcare, salon, and repair.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `code` | `text` | Unique |
| `name` | `text` | |
| `display_order` | `integer` | |
| `is_active` | `boolean` | |

## 5. `business_types`

Specific types such as grocery, restaurant, hotel, salon, clinic, hospital, pharmacy, tailor, and mechanic.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `category_id` | `uuid` | FK |
| `code` | `text` | Unique |
| `name` | `text` | |
| `workflow_group` | `text` | `ORDER`, `APPOINTMENT`, `SERVICE`, or multiple capabilities |
| `is_active` | `boolean` | |
| `display_order` | `integer` | |

A business type should not be limited to exactly one workflow forever. A restaurant may support ordering and reservations.

## 6. `businesses`

Replaces the current conceptual `shops` table while preserving its purpose.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `owner_profile_id` | `uuid` | FK to `profiles` |
| `location_id` | `uuid` | FK |
| `business_type_id` | `uuid` | FK |
| `name` | `text` | |
| `slug` | `text` | Unique per location |
| `tagline` | `text` | |
| `description` | `text` | |
| `address_line` | `text` | |
| `phone` | `text` | |
| `latitude` | `numeric` | |
| `longitude` | `numeric` | |
| `google_maps_url` | `text` | |
| `google_business_profile_url` | `text` | Optional |
| `approval_status` | `text` | `pending`, `approved`, `rejected` |
| `operational_status` | `text` | `offline`, `accepting`, `busy`, `delayed` |
| `is_live` | `boolean` | |
| `suspended_at` | `timestamptz` | |
| `suspended_by` | `uuid` | FK to admin profile |
| `suspension_reason` | `text` | |
| `delivery_available` | `boolean` | |
| `delivery_fee` | `numeric(12,2)` | Non-negative |
| `subscription_tier` | `text` | `FREE`, `PRO` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Critical rule: `is_live = true` must never override approval or suspension. Customer-visible views and all business-child RLS policies must require:

- approved business
- not suspended
- live business
- active location

## 7. `business_members`

Supports multiple owners, managers, staff members, and hospital staff.

| Column | Type | Notes |
|---|---|---|
| `business_id` | `uuid` | FK |
| `user_id` | `uuid` | FK |
| `member_role` | `text` | `owner`, `manager`, `staff` |
| `is_active` | `boolean` | |
| `created_at` | `timestamptz` | |

Primary key: `(business_id, user_id)`.

## 8. `business_hours`

Supports weekly hours, 24-hour businesses, overnight hours, and exceptions.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `business_id` | `uuid` | FK |
| `weekday` | `smallint` | `0` through `6` |
| `opens_at` | `time` | Nullable for closed days |
| `closes_at` | `time` | |
| `is_closed` | `boolean` | |
| `is_24_hours` | `boolean` | |
| `timezone` | `text` | Usually `Asia/Kolkata` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Add a separate `business_hour_exceptions` table later for holidays and special dates.

## 9. `business_status`

Current operational status controlled by the shopkeeper, with administrative restrictions enforced separately.

| Column | Type | Notes |
|---|---|---|
| `business_id` | `uuid` | PK/FK |
| `shopkeeper_status` | `text` | `accepting`, `not_accepting`, `busy`, `delayed` |
| `admin_suspended` | `boolean` | Server-controlled |
| `status_message` | `text` | |
| `updated_by` | `uuid` | FK |
| `updated_at` | `timestamptz` | |

The effective public status must be derived server-side. A shopkeeper must not be able to update `admin_suspended`.

## 10. `media_assets`

Central reference table for Supabase Storage files.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `bucket_name` | `text` | |
| `storage_path` | `text` | |
| `media_kind` | `text` | `storefront`, `product`, `upi_qr`, `identity_document`, `payment_evidence`, etc. |
| `mime_type` | `text` | |
| `file_size_bytes` | `bigint` | |
| `visibility` | `text` | `public`, `private` |
| `uploaded_by` | `uuid` | FK |
| `created_at` | `timestamptz` | |

Do not store binary files in PostgreSQL.

## 11. `business_media`

Associates business images with a business.

| Column | Type | Notes |
|---|---|---|
| `business_id` | `uuid` | FK |
| `media_asset_id` | `uuid` | FK |
| `sort_order` | `integer` | |
| `is_primary` | `boolean` | |

## 12. `business_payment_accounts`

Stores where customers pay the business directly.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `business_id` | `uuid` | FK |
| `method` | `text` | `upi`, `cash`, other direct methods |
| `upi_id` | `text` | VPA |
| `qr_media_asset_id` | `uuid` | FK to public UPI QR media |
| `account_label` | `text` | |
| `is_active` | `boolean` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

A QR code identifies a payment destination. It is never payment proof.

## 13. `business_applications`

Shopkeeper onboarding and review workflow.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `applicant_id` | `uuid` | FK |
| `requested_business_id` | `uuid` | Nullable |
| `location_id` | `uuid` | FK |
| `business_type_id` | `uuid` | FK |
| `business_name` | `text` | |
| `owner_name` | `text` | |
| `description` | `text` | |
| `contact_phone` | `text` | |
| `latitude` | `numeric` | |
| `longitude` | `numeric` | |
| `google_maps_url` | `text` | |
| `upi_id` | `text` | |
| `status` | `text` | `submitted`, `under_review`, `correction_requested`, `approved`, `rejected` |
| `reviewed_by` | `uuid` | FK |
| `review_notes` | `text` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

## 14. `business_application_media`

Separates identity documents from storefront evidence.

| Column | Type | Notes |
|---|---|---|
| `application_id` | `uuid` | FK |
| `media_asset_id` | `uuid` | FK |
| `media_role` | `text` | `identity_document`, `storefront_photo`, `upi_qr`, `business_evidence` |
| `sort_order` | `integer` | |

Constraint: a submitted application must contain 4 to 10 storefront photos before approval.

## 15. `services`

Services offered by businesses, including salon, repair, clinic, and hospital services.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `business_id` | `uuid` | FK |
| `name` | `text` | |
| `description` | `text` | |
| `service_category` | `text` | |
| `price_type` | `text` | `fixed`, `range`, `quote` |
| `base_price` | `numeric(12,2)` | |
| `min_price` | `numeric(12,2)` | |
| `max_price` | `numeric(12,2)` | |
| `duration_minutes` | `integer` | Positive |
| `provider_id` | `uuid` | Nullable provider FK |
| `is_available` | `boolean` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Constraint: fixed pricing requires `base_price`; range pricing requires `min_price <= max_price`.

## 16. `products`

Base catalogue products.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `business_id` | `uuid` | FK |
| `sku` | `text` | Optional, unique per business |
| `name` | `text` | |
| `description` | `text` | |
| `base_price` | `numeric(12,2)` | |
| `selling_unit` | `text` | `kg`, `piece`, `pack`, `litre`, etc. |
| `is_available` | `boolean` | |
| `track_inventory` | `boolean` | |
| `stock_quantity` | `numeric(12,3)` | Optional |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Quantity is an inventory field, not the only product attribute.

## 17. `product_translations`

English, Tamil, and common/local names.

| Column | Type | Notes |
|---|---|---|
| `product_id` | `uuid` | FK |
| `language_code` | `text` | `en`, `ta` |
| `display_name` | `text` | |
| `search_text` | `text` | Normalized searchable text |
| `is_primary` | `boolean` | |

Primary key: `(product_id, language_code)`.

## 18. `product_images`

Multiple product images without storing image binaries.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `product_id` | `uuid` | FK |
| `media_asset_id` | `uuid` | FK |
| `sort_order` | `integer` | |
| `is_primary` | `boolean` | |

## 19. `product_attribute_definitions`

Defines dimensions such as RAM, storage, size, color, weight, and quantity.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `product_id` | `uuid` | FK |
| `name` | `text` | |
| `value_type` | `text` | `text`, `number`, `decimal`, `boolean` |
| `display_order` | `integer` | |

## 20. `product_attribute_options`

Allowed values for an attribute.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `attribute_definition_id` | `uuid` | FK |
| `display_value` | `text` | `8 GB`, `Red`, `512 GB` |
| `normalized_value` | `text` | |
| `display_order` | `integer` | |

## 21. `product_variants`

Sellable combinations with their own price, availability, and SKU.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `product_id` | `uuid` | FK |
| `sku` | `text` | Unique per business where present |
| `price` | `numeric(12,2)` | |
| `stock_quantity` | `numeric(12,3)` | |
| `is_available` | `boolean` | |
| `created_at` | `timestamptz` | |

## 22. `product_variant_values`

Links a variant to its selected attributes.

| Column | Type | Notes |
|---|---|---|
| `variant_id` | `uuid` | FK |
| `attribute_definition_id` | `uuid` | FK |
| `attribute_option_id` | `uuid` | FK |

Unique constraint: one option per attribute per variant.

A combination such as Phone / 8 GB RAM / 256 GB storage is represented as one variant with two rows in `product_variant_values`.

## 23. `requests`

Generic customer request root entity for orders, appointments, and service requests.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `reference_code` | `text` | Unique |
| `customer_id` | `uuid` | FK |
| `business_id` | `uuid` | FK |
| `request_kind` | `text` | `order`, `appointment`, `service` |
| `current_state` | `text` | |
| `fulfillment_type` | `text` | `parcel`, `dine_in`, pickup, delivery |
| `subtotal` | `numeric(12,2)` | |
| `delivery_fee` | `numeric(12,2)` | |
| `total_amount` | `numeric(12,2)` | Server-calculated |
| `customer_notes` | `text` | |
| `scheduled_for` | `timestamptz` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Do not store order items or appointment slot identity only in `notes`.

## 24. `request_items`

Immutable order line snapshots.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK |
| `product_id` | `uuid` | Nullable FK |
| `variant_id` | `uuid` | Nullable FK |
| `product_name_snapshot` | `text` | |
| `variant_label_snapshot` | `text` | |
| `quantity` | `numeric(12,3)` | |
| `unit_price` | `numeric(12,2)` | |
| `discount_amount` | `numeric(12,2)` | |
| `line_total` | `numeric(12,2)` | Server-calculated |

## 25. `request_item_options`

Stores selected variant options as an immutable snapshot.

| Column | Type | Notes |
|---|---|---|
| `request_item_id` | `uuid` | FK |
| `attribute_name_snapshot` | `text` | |
| `option_value_snapshot` | `text` | |

## 26. `request_events`

Append-only request history.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK |
| `from_state` | `text` | |
| `to_state` | `text` | |
| `actor_id` | `uuid` | FK |
| `actor_role` | `text` | |
| `notes` | `text` | |
| `created_at` | `timestamptz` | |

## 27. `request_status_transitions`

Configurable state machine rules.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `request_kind` | `text` | |
| `from_state` | `text` | |
| `to_state` | `text` | |
| `allowed_roles` | `text[]` | |
| `is_enabled` | `boolean` | |

Required states:

- `created`
- `submitted`
- `accepted`
- `rejected`
- `preparing`
- `ready`
- `completed`
- `cancelled`
- `expired`
- `delayed`

Additional appointment states may include `confirmed`, `in_progress`, `no_show`, and `rescheduled`.

State transitions must be validated in a database function or trigger.

## 28. `appointment_slots`

A concrete date/time capacity bucket.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `business_id` | `uuid` | FK |
| `service_id` | `uuid` | FK |
| `provider_id` | `uuid` | Nullable |
| `slot_date` | `date` | |
| `starts_at` | `timestamptz` | |
| `ends_at` | `timestamptz` | |
| `capacity` | `integer` | Positive |
| `confirmed_count` | `integer` | Server-maintained |
| `is_open` | `boolean` | |
| `created_at` | `timestamptz` | |

Unique constraint should prevent duplicate generated slots for the same business, service, provider, and start time.

## 29. `appointments`

Appointment-specific data linked to a request.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | Unique FK |
| `slot_id` | `uuid` | FK |
| `customer_id` | `uuid` | FK |
| `service_id` | `uuid` | FK |
| `status` | `text` | |
| `rescheduled_from_id` | `uuid` | Nullable self-FK |
| `customer_notes` | `text` | |
| `delay_minutes` | `integer` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Duplicate booking protection should include a unique active booking constraint on `(slot_id, customer_id)` where applicable.

## 30. `payment_records`

Customer-to-business payment records. Vaangly does not hold customer money.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK |
| `business_id` | `uuid` | FK |
| `customer_id` | `uuid` | FK |
| `payment_method` | `text` | `upi`, `cash`, other |
| `amount_claimed` | `numeric(12,2)` | |
| `payment_reference` | `text` | UPI reference or transaction note |
| `status` | `text` | `pending`, `verified`, `rejected` |
| `paid_at` | `timestamptz` | |
| `verified_by` | `uuid` | Shopkeeper/admin |
| `verified_at` | `timestamptz` | |
| `verification_notes` | `text` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

## 31. `payment_evidence`

Private references to screenshots or documents.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `payment_record_id` | `uuid` | FK |
| `media_asset_id` | `uuid` | FK |
| `uploaded_by` | `uuid` | FK |
| `created_at` | `timestamptz` | |

A payment QR image and payment evidence must remain separate concepts.

## 32. `notifications`

Persistent recipient-specific in-app notifications.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `recipient_id` | `uuid` | FK |
| `business_id` | `uuid` | Nullable FK |
| `event_id` | `uuid` | FK |
| `title` | `text` | |
| `message` | `text` | |
| `reference_id` | `uuid` | Nullable |
| `reference_code` | `text` | |
| `is_read` | `boolean` | |
| `read_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

## 33. `notification_events`

Reusable operational event/outbox model.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `event_type` | `text` | |
| `aggregate_type` | `text` | `request`, `appointment`, `business`, etc. |
| `aggregate_id` | `uuid` | |
| `actor_id` | `uuid` | |
| `payload` | `jsonb` | Non-authoritative presentation data |
| `created_at` | `timestamptz` | |

Examples:

- request created
- business notified
- accepted
- rejected
- preparing
- ready
- clarification required
- customer no response
- pickup deadline
- appointment starting
- appointment delayed
- cancellation
- rescheduling
- doctor delay
- patient arrival

Events should be generated by trusted database functions or backend workers, not arbitrary browser inserts.

## 34. `push_subscriptions`

One user may have multiple devices.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK |
| `endpoint` | `text` | Unique |
| `subscription` | `jsonb` | Web Push payload |
| `platform` | `text` | |
| `last_seen_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

The current unique `user_id` design should be expanded to support multiple devices.

## 35. `admin_audit_logs`

Append-only administrative audit trail.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `admin_id` | `uuid` | FK |
| `action_type` | `text` | |
| `entity_type` | `text` | |
| `entity_id` | `uuid` | |
| `before_data` | `jsonb` | Optional |
| `after_data` | `jsonb` | Optional |
| `reason` | `text` | |
| `created_at` | `timestamptz` | |

---

# Hospital Extension

## `hospitals`

One hospital business may have hospital-specific configuration.

- `id`
- `business_id`
- `registration_name`
- `emergency_enabled`
- `queue_enabled`
- `management_contact_id`

## `hospital_departments`

- `id`
- `hospital_id`
- `name`
- `code`
- `is_active`

## `healthcare_providers`

- `id`
- `hospital_id`
- `profile_id`
- `display_name`
- `specialization`
- `license_reference`
- `is_active`

Do not store clinical diagnoses or treatment decisions in the operational schema.

## `provider_departments`

Many-to-many relationship between doctors and departments.

## `provider_availability`

Recurring and date-specific doctor availability.

- provider
- weekday/date
- start/end
- capacity
- status

## `hospital_queue_tokens`

- `id`
- `hospital_id`
- `department_id`
- `appointment_id`
- `token_number`
- `queue_date`
- `status`
- `position`
- `called_at`

Unique constraint: `(hospital_id, department_id, queue_date, token_number)`.

## `patient_arrivals`

- appointment
- patient
- arrival time
- check-in status
- recorded by authorized hospital staff

## `emergency_cases`

Operational queue record only.

- hospital
- patient reference
- arrival time
- priority category
- status
- assigned department
- assigned staff
- audit fields

The database must not make medical or clinical decisions.

## `hospital_staff_members`

Maps users to hospitals/departments with roles such as:

- administrator
- receptionist
- queue_manager
- doctor
- nurse
- staff

---

# D. Relationships and Cardinality

- One Auth user has one `profiles` row.
- One user may have many `user_roles`.
- One location has many businesses.
- One business has one primary owner and many optional members.
- One business has many hours, media assets, products, services, requests, appointments, and payment records.
- One product has many translations, images, attribute definitions, and variants.
- One variant has many selected attribute values.
- One request has many request items and request events.
- One appointment is associated with one request and one slot.
- One appointment slot can have many confirmed appointments up to capacity.
- One request may have multiple payment attempts, but at most one effective verified payment unless the business explicitly supports partial payments later.
- One notification event can create many recipient notifications.
- One hospital has many departments and healthcare providers.
- One provider can belong to many departments.
- One appointment may produce one queue token and one arrival record.

---

# E. Important Constraints

## Business Constraints

- Business owner must have a shopkeeper role.
- A suspended business cannot be made live by its owner.
- Only an admin can approve, reject, suspend, or reactivate a business.
- Public business visibility requires approved, active, non-suspended, live status.
- A business cannot be deleted if it has historical requests; use archival instead.

## Product Constraints

- Prices must be non-negative.
- Variant prices override base product prices.
- A variant cannot contain two options from the same attribute definition.
- SKU must be unique within a business.
- Product availability and stock must be checked server-side during order creation.
- Order totals must be calculated from authoritative database prices, not browser-submitted totals.

## Request Constraints

- Every request must belong to exactly one customer and one business.
- Request state changes must follow allowed transitions.
- Terminal states cannot transition back to active states.
- Request line items must be immutable after acceptance, or changes require an explicit amendment event.
- Rejected, cancelled, expired, and unverified requests must not be counted as completed sales.

## Payment Constraints

- Payment status changes require authorized shopkeeper/admin action.
- A customer cannot mark their own payment as verified.
- Payment evidence is private.
- A payment reference should be idempotent within a business where possible.
- Payment verification must be audited.

## Appointment Constraints

- `capacity > 0`.
- `ends_at > starts_at`.
- Confirmed appointment count cannot exceed capacity.
- Cancelled and expired appointments must release capacity.
- Rescheduled appointments must release the old slot and reserve the new slot atomically.
- The same customer cannot hold duplicate active bookings for the same slot/service unless explicitly allowed.
- Slot state must not be based on a frontend `is_available` value.

---

# F. Important Indexes

Recommended indexes:

- `profiles(id)`
- `profiles(preferred_location_id)`
- `user_roles(user_id, role)`
- `locations(is_active, name)`
- `businesses(location_id, approval_status, is_live)`
- `businesses(owner_profile_id)`
- `businesses(business_type_id)`
- `businesses(name)`
- `business_members(user_id, business_id)`
- `business_hours(business_id, weekday)`
- `products(business_id, is_available)`
- `products(business_id, sku)`
- `product_translations(language_code, search_text)`
- `product_images(product_id, sort_order)`
- `product_variants(product_id, is_available)`
- `services(business_id, is_available)`
- `requests(customer_id, created_at desc)`
- `requests(business_id, current_state, created_at desc)`
- `requests(request_kind, scheduled_for)`
- `request_items(request_id)`
- `request_events(request_id, created_at)`
- `appointment_slots(business_id, slot_date, starts_at)`
- `appointment_slots(service_id, slot_date, starts_at)`
- `appointments(slot_id, status)`
- `appointments(customer_id, created_at desc)`
- `payment_records(request_id, status)`
- `payment_records(business_id, status, created_at desc)`
- `notifications(recipient_id, is_read, created_at desc)`
- `notification_events(aggregate_type, aggregate_id, created_at)`
- `push_subscriptions(user_id)`
- `admin_audit_logs(entity_type, entity_id, created_at desc)`
- `business_daily_metrics(business_id, metric_date)`

For search, use PostgreSQL full-text search or a generated `tsvector` column instead of loading all catalogue data into the browser.

---

# G. RLS and Security Strategy

Use helper functions such as:

- `current_user_is_admin()`
- `current_user_has_role(role)`
- `current_user_is_business_member(business_id)`
- `current_user_is_business_owner(business_id)`
- `current_user_is_hospital_staff(hospital_id)`

These should be `SECURITY DEFINER`, `STABLE`, tightly permissioned, and protected against recursive RLS evaluation.

## Access Matrix

Legend:

- `Public`: unauthenticated or authenticated public catalogue access
- `Self`: owning user
- `Member`: authorized business member
- `Hospital`: authorized hospital staff
- `Admin`: platform administrator
- `RPC`: only through trusted database function

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Self, Admin | Auth trigger | Self-safe fields, Admin sensitive fields | Never directly |
| `user_roles` | Self, Admin | Admin/RPC | Admin | Admin |
| `locations` | Public active, Admin all | Admin | Admin | Admin/archive |
| `business_categories` | Public active, Admin all | Admin | Admin | Admin/archive |
| `business_types` | Public active, Admin all | Admin | Admin | Admin/archive |
| `businesses` | Public visible, Owner/Member, Admin | Admin/RPC/application approval | Owner limited fields, Admin status fields | Admin/archive |
| `business_members` | Members, Admin | Owner/Admin | Owner/Admin | Owner/Admin |
| `business_hours` | Public visible business, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `business_status` | Public effective status, Member, Admin | Member/Admin | Member limited status, Admin suspension | Admin/archive |
| `media_assets` | Based on visibility and parent authorization | Authenticated scoped upload/RPC | Owner/Admin metadata | Owner/Admin |
| `business_media` | Public for public assets, Member/Admin | Member/Admin | Member/Admin | Member/Admin |
| `business_payment_accounts` | Public active account fields, Member/Admin | Member/Admin | Member/Admin | Member/Admin |
| `business_applications` | Applicant own, Admin | Applicant | Admin; applicant correction flow | Admin/archive |
| `business_application_media` | Applicant own limited, Admin | Applicant scoped upload | Admin | Admin |
| `services` | Public visible business, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `products` | Public visible available products, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `product_translations` | Public visible products, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `product_images` | Public asset URLs, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `product_attribute_definitions` | Public visible products, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `product_attribute_options` | Public visible products, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `product_variants` | Public visible products, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `product_variant_values` | Public visible products, Member, Admin | Member/Admin | Member/Admin | Member/Admin |
| `requests` | Customer own, Business Member, Admin | Customer own or RPC | RPC/member transition, customer cancellation RPC | Never by client; Admin archive |
| `request_items` | Request parties, Admin | Customer request RPC | RPC only | Never directly |
| `request_item_options` | Request parties, Admin | Request creation RPC | Never | Never |
| `request_events` | Request parties, Admin | RPC only | Never | Never |
| `request_status_transitions` | Public read or Admin | Admin | Admin | Admin |
| `appointment_slots` | Public visible slots, Member, Admin | Member/RPC | Member/RPC | Member/Admin |
| `appointments` | Customer own, assigned business/hospital staff, Admin | Booking RPC | Booking/reschedule RPC, authorized staff | Never directly |
| `payment_records` | Customer own, Business Member, Admin | Customer submit/RPC | Business verifier/Admin | Never directly |
| `payment_evidence` | Customer own, Business verifier, Admin | Customer scoped upload | Admin metadata | Admin/archive |
| `notifications` | Recipient own | Trusted event RPC/service | Recipient read state only | Recipient/archive service |
| `notification_events` | Admin and operational service | Trusted RPC/service | Never | Never |
| `push_subscriptions` | User own | User own | User own | User own |
| `admin_audit_logs` | Admin | Admin/RPC | Never | Never |
| `hospitals` | Public approved profile, Hospital staff, Admin | Admin/authorized manager | Hospital manager/Admin | Admin/archive |
| `hospital_departments` | Public hospital profile, Hospital staff, Admin | Hospital manager/Admin | Hospital manager/Admin | Hospital manager/Admin |
| `healthcare_providers` | Public professional profile, Hospital staff, Admin | Hospital manager/Admin | Hospital manager/Admin | Hospital manager/Admin |
| `provider_availability` | Public slots, Provider, Hospital staff, Admin | Provider/staff/Admin | Provider/staff/Admin | Provider/staff/Admin |
| `hospital_queue_tokens` | Patient own token, Hospital staff, Admin | Queue RPC/staff | Queue staff/Admin | Never directly |
| `patient_arrivals` | Patient own, Hospital staff, Admin | Hospital staff/RPC | Hospital staff/Admin | Never directly |
| `emergency_cases` | Authorized Hospital staff/Admin only | Hospital staff/RPC | Hospital staff/Admin | Admin/archive |
| `hospital_staff_members` | Authorized hospital staff, Admin | Hospital manager/Admin | Hospital manager/Admin | Hospital manager/Admin |
| `business_subscriptions` | Member limited, Admin | Admin/RPC | Admin/RPC | Admin |
| `subscription_payments` | Member limited, Admin | Admin | Admin | Admin |
| `business_daily_metrics` | Business owner for own business, Admin | Aggregation service | Aggregation service | Admin |
| `platform_settings` | Public-safe settings, Admin | Admin | Admin | Admin |

RLS must be combined with database triggers/functions. RLS alone cannot validate all state transitions or calculate totals safely.

---

# H. Storage Bucket Strategy

## Public Buckets

### `business-media`

- Storefront photos
- Approved business display images
- Public business profile media

### `product-media`

- Product images
- Variant images where necessary

### `public-assets`

- Icons
- Platform assets
- Non-sensitive static media

Public bucket objects should still be referenced through `media_assets`.

## Private Buckets

### `identity-documents`

- Government ID
- Business registration proof
- Sensitive onboarding evidence

Access: applicant's own pending documents and admins only.

### `payment-evidence`

- UPI screenshots
- Payment receipts
- Transaction evidence

Access: customer who submitted the payment, authorized business members, and admins.

### `hospital-private`

- Restricted operational hospital files if required later
- No clinical records should be added without a separate privacy and compliance design

Storage paths should include entity IDs, for example:

- `businesses/{business_id}/storefront/{asset_id}`
- `products/{product_id}/{asset_id}`
- `applications/{application_id}/identity/{asset_id}`
- `requests/{request_id}/payment-evidence/{asset_id}`

Do not expose private paths as public URLs. Generate short-lived signed URLs after RLS authorization.

---

# I. Appointment Concurrency Strategy

The frontend must never decide that a slot is available authoritatively.

Use one database transaction or RPC:

1. Lock the slot row with `SELECT ... FOR UPDATE`.
2. Verify the business is approved, live, and not suspended.
3. Verify the service is available.
4. Verify the slot is open.
5. Count active appointments or use an atomically maintained `confirmed_count`.
6. Reject if `confirmed_count >= capacity`.
7. Insert the appointment and request.
8. Increment the slot count.
9. Insert the initial request event.
10. Create notification events.
11. Commit.

Cancellation:

1. Lock the appointment and slot.
2. Validate cancellation policy.
3. Mark appointment cancelled.
4. Decrement `confirmed_count`.
5. Release the slot if appropriate.
6. Create cancellation events and notifications.
7. Commit.

Rescheduling must lock both old and new slots in a deterministic order to avoid deadlocks.

A database constraint or trigger must reject any attempt to make `confirmed_count` exceed `capacity`.

The current two-step frontend flow in `src/lib/appointmentServiceApi.ts` creates a request before reserving the slot. The preferred design is a single transaction RPC. The existing JSON-based slot lookup should be replaced with a foreign key from `appointments.slot_id`.

---

# J. Notification/Event Architecture

Use an append-only event model.

When a trusted operation occurs:

- request created
- request accepted
- request rejected
- order preparing
- order ready
- appointment confirmed
- appointment delayed
- payment verified
- business suspended
- doctor delay recorded
- patient arrival recorded

The same transaction should insert a `notification_events` row.

A trusted worker or Edge Function can then:

1. Resolve affected recipients.
2. Insert `notifications` rows.
3. Deliver push notifications using `push_subscriptions`.
4. Record delivery status later if needed.

The browser may mark a notification as read, but must not freely create arbitrary operational notifications.

The current policy allowing any authenticated user to insert notifications is too permissive.

---

# K. Payment Verification Architecture

Vaangly should only record payment claims and verification status.

Flow:

1. Customer selects `cash` or `upi`.
2. Customer submits a payment claim against a request.
3. Optional screenshot is uploaded to private storage.
4. A `payment_records` row is created with `pending` status.
5. The shopkeeper reviews the reference/evidence.
6. Shopkeeper marks it `verified` or `rejected`.
7. The action is recorded in an audit/event table.
8. Notifications are generated.
9. Analytics include the payment only in verified-payment metrics.

Important distinctions:

- Business UPI QR: public destination information.
- Payment reference: customer-provided transaction identifier.
- Payment evidence: private screenshot/document.
- Verification: authorized business/admin decision.
- Order completion: separate operational state.

A verified payment must not automatically mean an order is completed.

---

# L. Analytics Architecture

The current analytics implementation in `src/lib/analyticsApi.ts` loads all requests and parses JSON notes in the browser. This will not scale and cannot reliably distinguish authoritative order lines or payment states.

## Recommended Approach

Create:

- `business_daily_metrics`
- SQL views for current operational summaries
- RPC functions for date-range analytics
- Optional materialized views for larger datasets

Useful dimensions:

- business
- date
- request kind
- request state
- product
- variant
- payment method
- payment verification state
- customer
- appointment service
- slot

## Required Metric Definitions

### Gross Order Value

Sum of submitted order totals, excluding rejected orders according to the reporting definition. Keep cancelled value separately.

### Completed Sales

Only requests with completed state.

### Verified Payments

Only `payment_records.status = 'verified'`.

### Cancelled/Rejected Value

Tracked separately and never counted as completed sales.

### Product Performance

Aggregate immutable `request_items`, not current product prices.

### Returning Customers

Customers with more than one completed request in the selected period or historical window.

### Appointment Utilization

Confirmed or completed bookings divided by published capacity.

### Cancellation and Rejection Rate

Use request events and final states, distinguishing:

- customer cancellation
- business rejection
- business cancellation
- system expiry
- no-show

Analytics RPCs should enforce business ownership and subscription tier server-side.

No browser should load the entire order history for analytics.

---

# M. Existing Frontend Data Structures That Need to Change

The current frontend can continue conceptually, but the following structures need eventual replacement.

## `Shop`

Current `Shop` should map to `businesses`, with separate related objects for:

- hours
- status
- media
- payment account
- category/type
- subscription

The current single `opening_time`, `closing_time`, and `is_open_today` fields are insufficient.

## `ShopProduct`

Current `ShopProduct` embeds:

- `variants`
- `attribute_groups`
- `image_urls`

These should become relational child records.

## `Request`

Current `Request` stores:

- product items
- appointment payload
- payment method
- slot ID
- customer snapshots

inside `notes`.

This must be replaced by:

- `request_items`
- `appointments`
- `payment_records`
- explicit customer/business snapshots where required

## `AppointmentSlot`

Current `booked_by_request_id` supports only one booking reference and cannot represent capacity five correctly. It should be replaced by:

- `capacity`
- `confirmed_count`
- `appointments.slot_id`

## `ShopApplication`

Current application shape is close to the required workflow but should move uploaded files into `business_application_media`.

## Notifications

Current notification records are adequate for a basic inbox but should be generated from trusted `notification_events`.

## Search

Current Tanglish mapping is hardcoded in `src/lib/search.ts`. It should eventually use:

- `product_translations`
- alias/synonym records
- PostgreSQL full-text search
- optional trigram indexes

## Authentication

The current fallback role derived from Auth user metadata is not authoritative. Role access must come from protected database records.

---

# N. Conflicts and Missing Requirements

## Existing Schema Conflicts

1. The existing migrations use `shops`, while the requested domain is broader and should use a generalized `businesses` model.
2. Product variants and attributes are stored as JSONB rather than normalized relations.
3. Order and appointment details are stored in `requests.notes`.
4. Appointment capacity is inferred by parsing request JSON.
5. The frontend initially creates an appointment request and then separately reserves the slot.
6. `booked_by_request_id` cannot represent multiple concurrent customers.
7. `is_available` is a cached state that can become stale.
8. A single `profile.role` is less flexible than role assignments.
9. The current notification insert policy permits arbitrary authenticated inserts.
10. The first payment-proof migration exposed proofs publicly before a later migration corrected the bucket.
11. Application UPI QR images currently use the public `shop-photos` bucket.
12. Business hours only support one opening and closing time.
13. Overnight hours are not represented safely.
14. The current analytics engine depends on browser-side JSON parsing.
15. The search system primarily operates on mock data and hardcoded aliases.
16. There is no real hospital, department, provider, queue, or emergency-case model.
17. Push subscriptions currently support only one subscription per user.
18. The frontend can attempt appointment booking with a fake guest ID, which conflicts with strict Auth foreign keys.
19. Server-side total calculation is described in the frontend but currently calculated from client-provided product prices.
20. Admin suspension requires database enforcement; a client-side status check is insufficient.

## Missing or Underspecified Requirements

- Business holiday and exceptional-hours calendar
- Multiple business owners/managers
- Inventory reservation during checkout
- Partial fulfillment and substitutions
- Delivery address model
- Refunds or payment reversals
- Tax/GST requirements
- Business verification document types
- Appointment cancellation windows and fees
- Hospital patient identity/privacy requirements
- Data retention and deletion policy
- Audit retention period
- Notification delivery retry policy
- Exact timezone behavior for multi-town expansion

---

# O. Recommended Migration Direction

Do not extend the current JSON-heavy model indefinitely.

Recommended direction:

1. Preserve the current frontend-facing concepts temporarily.
2. Introduce normalized tables behind database views or compatibility RPCs.
3. Migrate products and variants first.
4. Migrate request items and payments next.
5. Replace appointment booking with one transactional RPC.
6. Move notification creation to trusted events.
7. Replace `shops` with a compatibility view over `businesses`, or rename only during a deliberate migration.
8. Remove client-side authority over totals, status transitions, payment verification, suspension, and appointment capacity.

---

# Required for MVP

- Supabase Auth integration with protected profiles
- Protected user roles
- Locations
- Business types/categories
- Businesses with approval and suspension state
- Business ownership/member boundaries
- Weekly business hours
- Public storefront and product image storage
- Private identity document storage
- Products
- Product images
- Normalized product variants and attributes
- Services
- Generic requests
- Normalized request items
- Request events and server-side state transitions
- Parcel and eat-here fulfillment
- Appointment services and slots
- Transactional appointment booking with capacity enforcement
- Customer cancellation and slot release
- Direct business payment records
- Private payment evidence
- Shopkeeper payment verification
- Persistent notifications
- Push subscription records
- Admin audit logs
- RLS on every table
- Server-side enforcement of business suspension
- Basic indexed operational reports

# Can Be Added Later

- Hospital departments and provider schedules
- Queue tokens and patient arrival
- Emergency operational queue
- Recurring provider availability
- Holiday exceptions
- Delivery addresses and delivery tracking
- Inventory reservations
- Substitutions and partial fulfillment
- Refunds and payment reversals
- Reviews and ratings expansion
- Full-text search ranking
- Synonym management UI
- Materialized analytics views
- PRO analytics dashboards
- Multiple push devices and delivery receipts
- Subscription billing automation
- Advanced audit retention
- Regional expansion beyond Tamil Nadu
- Data warehouse export

# Existing Code That Should Not Be Broken

- Supabase Auth session handling in `src/context/AuthContext.tsx`
- Existing `profiles.id = auth.users.id` compatibility
- Customer, shopkeeper, and admin route separation
- Current `requests` concept as the generic workflow root
- Existing order, appointment, and service workflow groups
- Existing reference codes such as `ORD-####` and `APT-####`
- Customer cart behavior in `src/context/CartContext.tsx`
- Shopkeeper catalogue workflows
- Application review lifecycle
- Direct business UPI payment intent
- Public business/product media behavior
- Private access expectations for identity documents and payment evidence
- Persistent in-app notification behavior
- Tamil, English, and Tanglish search intent
- Free versus PRO analytics distinction
- Existing admin audit requirements
- Existing mobile/Capacitor-compatible storage and upload flows

---

## Final Status

This document is a design and audit report only. It does not create or modify application code, Supabase tables, migrations, or database data.

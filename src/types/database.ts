// Database Interfaces and Relational Schema Definitions for Supabase / PostgreSQL

import { WorkflowGroupCode, WorkflowStateCode } from './workflow';

export type UserRole = 'customer' | 'shopkeeper' | 'admin';

export interface Profile {
  id: string; // References auth.users.id
  role: UserRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  address?: string | null;
  preferred_location_id: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  state: string;
  pincode: string;
  is_active: boolean;
  is_launch_town: boolean;
  created_at: string;
}

export interface ShopType {
  id: string;
  code: string;
  name: string;
  workflow_group_code: WorkflowGroupCode;
  icon: string;
  is_active: boolean;
  display_order: number;
}

export type ShopStatus = 'pending' | 'verified' | 'active' | 'suspended';

export interface Shop {
  id: string;
  owner_id: string; // References profiles.id
  shop_type_id: string; // References shop_types.id
  location_id: string; // References locations.id
  name: string;
  tagline: string | null;
  address_line: string;
  area?: string | null;
  district?: string | null;
  taluk?: string | null;
  pincode?: string | null;
  phone: string;
  status: ShopStatus;
  is_live: boolean;
  delivery_available: boolean;
  delivery_fee: number;
  upi_id: string | null;
  upi_qr_url?: string | null;
  customised_cake_available?: boolean;
  gps_lat: number | null;
  gps_lng: number | null;
  photo_url: string | null;
  opening_time: string | null; // e.g. "09:00"
  closing_time: string | null; // e.g. "21:00"
  is_open_today: boolean;
  created_at: string;
  updated_at: string;
  slot_config?: SlotConfig | null;
  avg_rating?: number | null;
  total_ratings?: number;
  cancellation_rate?: number;
  google_maps_url?: string | null;
  subscription_tier?: 'FREE' | 'PRO';
}

export interface SlotConfig {
  ranges: TimeRange[];
  slotDurationMinutes: number;
  availableDays: number[];
}

export interface TimeRange {
  id: string;
  start: string;
  end: string;
  concurrent: number;
}

export interface ShopProduct {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string; // e.g. "kg", "pack", "item"
  is_available: boolean;
  image_url: string | null;
  image_urls?: string[];
  offer_label?: string | null;
  offer_type?: 'bogo' | 'percent_off' | 'flat_off' | null;
  offer_value?: number | null;
  has_variants?: boolean;
  variants?: ProductVariant[];
  attribute_groups?: ProductAttributeGroup[];
  track_inventory?: boolean;
  stock_quantity?: number | null;
  is_banned?: boolean;
  moderation_reason?: string | null;
  moderated_at?: string | null;
  moderated_by?: string | null;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  label?: string;
  price: number;
  attributes?: Record<string, string>;
  sku?: string | null;
  stock_quantity?: number | null;
  is_available?: boolean;
  in_stock?: boolean;
  image_url?: string | null;
}

export interface ProductAttributeGroup {
  name: string;
  options: string[];
}

export type PriceType = 'fixed' | 'range';

export interface ShopService {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price_type: PriceType;
  base_price: number | null;
  min_price: number | null;
  max_price: number | null;
  duration_minutes: number | null;
  provider_name: string | null; // e.g. Doctor name, Senior Stylist
  specialization: string | null; // e.g. General Medicine, Bridal
  service_category: string | null;
  is_available: boolean;
  created_at: string;
}

export interface AppointmentSlot {
  id: string;
  shop_id: string;
  service_id: string | null;
  slot_date: string; // YYYY-MM-DD
  start_time: string; // e.g. "10:00 AM"
  end_time: string; // e.g. "10:30 AM"
  is_available: boolean;
  booked_by_request_id: string | null;
  concurrent_capacity?: number;
  booked_count?: number;
  created_at: string;
}

export interface AppointmentRequestPayload {
  service_id: string;
  service_name: string;
  provider_name: string | null;
  slot_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  price: number | null;
  customer_name?: string;
  customer_phone?: string;
  notes?: string | null;
}

export interface ServiceRequestPayload {
  service_id: string;
  service_name: string;
  price_type: PriceType;
  estimated_price: number | null;
  min_price: number | null;
  max_price: number | null;
  confirmed_price?: number | null;
  duration_minutes?: number | null;
  customer_name?: string;
  customer_phone?: string;
  notes?: string | null;
}

export interface Request {
  id: string;
  customer_id: string;
  shop_id: string;
  workflow_group_code: WorkflowGroupCode;
  current_state: WorkflowStateCode;
  reference_code: string; // e.g. "ORD-9421", "APT-3312"
  total_estimate: number | null;
  customer_paid: boolean;
  payment_screenshot_url?: string | null;
  payment_method?: 'cash' | 'upi' | null;
  payment_amount?: number | null;
  payment_status?: 'NOT_REQUIRED' | 'PAYMENT_PENDING' | 'PAYMENT_PROOF_SUBMITTED' | 'PAYMENT_VERIFIED' | 'PAYMENT_REJECTED';
  payment_verified_at?: string | null;
  payment_verified_by?: string | null;
  payment_rejection_reason?: string | null;
  fulfillment_type?: 'parcel' | 'dine_in' | null;
  notes: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestEvent {
  id: string;
  request_id: string;
  from_state: WorkflowStateCode | null;
  to_state: WorkflowStateCode;
  actor_id: string;
  actor_role: UserRole;
  notes: string | null;
  created_at: string;
}

export type ApplicationStatus = 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface ShopApplication {
  id: string;
  applicant_id: string;
  shop_name: string;
  owner_name?: string;
  description?: string | null;
  shop_type_id: string;
  location_id: string;
  contact_phone: string;
  status: ApplicationStatus;
  photo_url?: string | null;
  photo_urls?: string[];
  upi_id?: string | null;
  upi_qr_url?: string | null;
  id_proof_url: string | null;
  area?: string | null;
  district?: string | null;
  taluk?: string | null;
  pincode?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  google_maps_url?: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopRating {
  id: string;
  shop_id: string;
  customer_id: string;
  request_id: string;
  rating: number;
  review?: string | null;
  created_at: string;
}

export interface ProductRating {
  id: string;
  product_id: string;
  customer_id: string;
  request_id: string;
  rating: number;
  review?: string | null;
  created_at: string;
}

// Phase 5: Subscriptions & Admin Audit Domain Models
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'OVERDUE' | 'SUSPENDED';
export type BillingCycle = 'WEEKLY' | 'MONTHLY';

export interface ShopSubscription {
  id: string;
  shop_id: string;
  status: SubscriptionStatus;
  trial_start_date: string; // ISO date string
  trial_end_date: string; // 60 days from go_live_date
  go_live_date: string | null;
  daily_rate: number; // Max ₹20/day enforced
  billing_cycle: BillingCycle;
  current_period_start: string | null;
  current_period_end: string | null;
  amount_due: number;
  last_payment_date: string | null;
  grace_period_days: number; // Configurable; default 0
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  shop_id: string;
  amount_paid: number;
  payment_date: string;
  billing_cycle: BillingCycle;
  period_start: string;
  period_end: string;
  payment_reference: string; // UPI Ref / Transaction note
  recorded_by_admin_id: string;
  notes: string | null;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string;
  admin_name?: string;
  action_type:
  | 'application_approved'
  | 'application_rejected'
  | 'shop_suspended'
  | 'shop_reactivated'
  | 'location_created'
  | 'location_updated'
  | 'location_deactivated'
  | 'payment_recorded'
  | 'subscription_status_changed'
  | 'product_warning_sent'
  | 'product_banned'
  | 'product_unbanned'
  | 'product_hidden';
  entity_type: 'shop_application' | 'shop' | 'location' | 'subscription' | 'payment' | 'shop_product';
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

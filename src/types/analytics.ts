// Business Analytics Models and Types for Shopkeeper Pro Tier

export type SubscriptionTier = 'FREE' | 'PRO';

export interface RevenueTrendPoint {
  date: string; // YYYY-MM-DD or Month/Week label
  label: string;
  gross_order_value: number;
  completed_sales: number;
  cancelled_amount: number;
  verified_payments: number;
  order_count: number;
}

export interface SalesOverview {
  total_sales: number; // Only COMPLETED orders
  completed_orders: number;
  average_order_value: number;
  gross_order_value: number; // Placed orders
  previous_period_sales: number;
  sales_growth_pct: number | null;
  previous_period_orders: number;
  orders_growth_pct: number | null;
}

export interface ProductPerformance {
  product_id: string;
  product_name: string;
  category?: string | null;
  quantity_sold: number;
  sales_generated: number;
  percentage_of_total: number;
}

export interface VariantPerformance {
  product_id: string;
  product_name: string;
  variant_id: string;
  variant_label: string;
  quantity_sold: number;
  sales_generated: number;
}

export interface SlowMovingProduct {
  product_id: string;
  product_name: string;
  in_stock: boolean;
  price: number;
  units_sold: number;
  days_listed: number;
  status: 'slow' | 'healthy' | 'no_data';
}

export interface CustomerMetrics {
  new_customers: number;
  returning_customers: number;
  total_completed_customers: number;
  repeat_order_count: number;
  returning_percentage: number;
}

export interface PeakHourPoint {
  hour: number; // 0 to 23
  formatted_hour: string; // e.g. "09:00", "2:00 PM"
  order_count: number;
  completed_count: number;
  revenue: number;
}

export interface AppointmentAnalytics {
  has_appointment_vertical: boolean;
  total_appointments: number;
  completed: number;
  cancelled: number;
  rejected: number;
  utilization_rate: number;
  most_booked_services: { name: string; count: number; revenue: number }[];
  peak_slots: { time: string; count: number }[];
}

export interface CancellationMetrics {
  customer_cancelled: number;
  shop_rejected: number;
  shop_cancelled: number;
  system_expired: number;
  total_cancellations: number;
  cancellation_rate: number; // % of total orders
  rejection_rate: number; // % of total orders
}

export interface PaymentMethodMetrics {
  method: string; // "UPI", "Cash on Pickup / Delivery", etc.
  count: number;
  total_amount: number;
  verified_count: number;
  unverified_count: number;
}

export type DateRangePreset = '7d' | '30d' | '3m' | '6m' | '1y' | 'custom';

export interface AnalyticsFilter {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface BusinessAnalyticsData {
  tier: SubscriptionTier;
  filter: AnalyticsFilter;
  overview: SalesOverview;
  revenue_trends: RevenueTrendPoint[];
  top_products: ProductPerformance[];
  variant_performance: VariantPerformance[];
  slow_moving_products: SlowMovingProduct[];
  customer_metrics: CustomerMetrics;
  peak_hours: PeakHourPoint[];
  appointments: AppointmentAnalytics;
  cancellations: CancellationMetrics;
  payment_methods: PaymentMethodMetrics[];
}

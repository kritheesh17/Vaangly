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
  total_orders: number; // All orders placed in period
  completed_orders: number;
  pending_orders: number; // Orders pending fulfillment (REQUESTED, ACCEPTED, PREPARING, CONFIRMED, IN_PROGRESS, READY)
  average_order_value: number;
  gross_order_value: number; // Placed orders
  previous_period_sales: number;
  sales_growth_pct: number | null;
  previous_period_orders: number;
  orders_growth_pct: number | null;
  product_sales: number; // Disaggregated product order revenue
  service_appointment_sales: number; // Disaggregated service & appointment revenue
  fulfillment_rate_pct?: number; // completed_orders / total_orders * 100
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
  most_booked_services: {
    name: string;
    count: number;
    revenue: number; // Strictly settled revenue from completed appointments
    booked_value?: number; // Total gross booked pipeline value across all appointments
    completed_count?: number;
  }[];
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
  method_code?: string; // 'cash' | 'upi' | 'pay_at_shop' | 'online' | 'other'
  method: string; // User-facing label: "Cash", "UPI / QR Code", "Pay at Shop", "Online Transfer", etc.
  count: number; // completed settled transactions
  total_amount: number; // settled revenue strictly from completed orders
  verified_count: number; // completed & verified payments
  unverified_count: number; // active pending payments awaiting verification / settlement
  pending_count?: number; // active pending orders
  cancelled_count?: number; // cancelled / rejected requests
}

export type DateRangePreset = 'today' | '7d' | '30d' | 'this_month' | '3m' | '6m' | '1y' | 'custom';

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

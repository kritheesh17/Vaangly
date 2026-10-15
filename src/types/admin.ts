import {
  Location,
  SubscriptionStatus,
} from './database';
import { WorkflowGroupCode } from './workflow';

export interface OperationalMetrics {
  pendingApplications: number;
  approvedShops: number;
  liveShops: number;
  suspendedShops: number;
  totalCustomers: number;
  totalShopkeepers: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  overdueSubscriptions: number;
  suspendedSubscriptions: number;
  totalRequests: number;
  cancelledRequests: number;
  cancellationRate: number; // percentage (0 - 100)
  customerCancellations: number;
  merchantRejectionsOrCancellations: number;
}

export interface AdminLocationWithStats extends Location {
  shop_count: number;
  active_shop_count: number;
}

export interface AdminShopFilterOptions {
  searchQuery?: string;
  locationId?: string;
  shopTypeId?: string;
  workflowGroup?: WorkflowGroupCode;
  status?: string; // 'all' | 'active' | 'suspended' | 'pending'
  subscriptionStatus?: SubscriptionStatus | 'all';
}

export interface AdminApplicationFilterOptions {
  status?: 'all' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  locationId?: string;
  shopTypeId?: string;
}

export interface RecordPaymentPayload {
  subscriptionId: string;
  shopId: string;
  amountPaid: number;
  paymentDate: string;
  billingCycle: 'WEEKLY' | 'MONTHLY';
  periodStart: string;
  periodEnd: string;
  paymentReference: string;
  notes?: string;
}

export interface AdminShopOrderSummary {
  id: string;
  reference_code: string;
  created_at: string;
  current_state: string;
  total_amount: number | null;
  payment_status: string;
  customer_phone?: string | null;
  request_kind?: string | null;
  payment_method?: string | null;
  fulfillment_type?: string | null;
  workflow_group_code?: string | null;
}

export interface AdminShopStatistics {
  period?: 'all' | '30d' | '7d';
  totalProducts: number;
  activeProducts: number;
  outOfStockProducts: number;
  bannedProducts: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  totalAppointments: number;
  confirmedAppointments?: number;
  completedAppointments: number;
  cancelledAppointments: number;
  pendingAppointments?: number;
  recentOrders?: AdminShopOrderSummary[];
  calculationPeriod?: 'all' | '30d' | '7d';
  periodRevenue?: number;
  periodOrdersCount?: number;
}

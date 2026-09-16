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

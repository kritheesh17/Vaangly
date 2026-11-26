// Financial Domain Interfaces and Types for Vaango Platform Fee & Ledger System

export type FinancialStatus = 'ACTIVE' | 'WARNING' | 'RESTRICTED' | 'SUSPENDED';

export type LedgerEntryType = 'fee_assessed' | 'fee_reversed' | 'adjustment';

export type SettlementVerificationStatus =
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'partially_verified'
  | 'rejected'
  | 'reversed';

export type SettlementPaymentMethod = 'upi' | 'bank_transfer' | 'cash' | 'other';

export interface PlatformFeeRule {
  id: string;
  rule_version: string;
  min_amount_paise: number;
  max_amount_paise: number;
  fee_amount_paise: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PlatformFeeLedgerEntry {
  id: string;
  shop_id: string;
  request_id?: string | null;
  entry_type: LedgerEntryType;
  amount_paise: number; // Signed: positive = owed by merchant, negative = credit/reduction
  currency: string;
  idempotency_key: string;
  notes?: string | null;
  created_at: string;
  actor_id?: string | null;
  actor_role: string;
  requests?: {
    reference_code: string;
    total_estimate: number | null;
    payment_method?: string | null;
  } | null;
}

export interface MerchantSettlement {
  id: string;
  shop_id: string;
  amount_paise: number;
  payment_method: SettlementPaymentMethod;
  transaction_reference: string;
  proof_document_url?: string | null;
  notes?: string | null;
  submitted_at: string;
  submitted_by: string;
  verification_status: SettlementVerificationStatus;
  verified_amount_paise: number;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  shops?: {
    name: string;
    phone?: string;
  } | null;
}

export interface SettlementAllocation {
  id: string;
  settlement_id: string;
  shop_id: string;
  ledger_entry_id: string;
  allocated_amount_paise: number;
  allocated_at: string;
  allocated_by: string;
}

export interface MerchantFinancialSummary {
  success: boolean;
  shop_id: string;
  shop_name: string;
  financial_status: FinancialStatus;
  total_completed_orders: number;
  gmv_paise: number;
  total_fees_assessed_paise: number;
  total_fees_reversed_paise: number;
  net_fees_owed_paise: number;
  total_verified_settled_paise: number;
  pending_settlement_paise: number;
  outstanding_balance_paise: number;
  oldest_unpaid_at?: string | null;
  days_overdue: number;
  error?: string;
}

export interface AdminFinancialKPIs {
  success: boolean;
  total_registered_merchants: number;
  merchants_with_completed_orders: number;
  merchants_with_outstanding_fees: number;
  fully_settled_merchants: number;
  total_completed_orders: number;
  total_gmv_paise: number;
  total_platform_fees_assessed_paise: number;
  total_platform_fees_reversed_paise: number;
  net_platform_fees_owed_paise: number;
  verified_fees_collected_paise: number;
  total_outstanding_paise: number;
  pending_settlement_requests_count: number;
  error?: string;
}

export interface MerchantDirectoryItem {
  shop_id: string;
  shop_name: string;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  financial_status: FinancialStatus;
  completed_orders: number;
  gmv_rupees: number;
  fees_assessed_rupees: number;
  verified_settled_rupees: number;
  outstanding_balance_rupees: number;
  last_settlement_date?: string | null;
  days_overdue: number;
}

export interface FinancialAuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_entity: string;
  target_id: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  reason: string;
  ip_address?: string | null;
  created_at: string;
  admin?: {
    full_name: string | null;
    email: string | null;
  } | null;
}

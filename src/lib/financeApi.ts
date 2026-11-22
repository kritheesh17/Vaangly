// Vaangly Financial Ledger, Platform Fee, Settlement & Reporting API Layer

import { supabase, isSupabaseConfigured } from './supabase';
import {
  PlatformFeeLedgerEntry,
  MerchantSettlement,
  MerchantFinancialSummary,
  AdminFinancialKPIs,
  MerchantDirectoryItem,
  SettlementPaymentMethod,
  FinancialStatus,
} from '../types/finance';

/**
 * Deterministic integer paise platform fee calculation
 * Uses Option A: Upper-bound inclusive ₹100 slabs
 * ₹0.01 - ₹100.00 (1 - 10,000 paise) -> ₹1 (100 paise)
 * ₹100.01 - ₹200.00 (10,001 - 20,000 paise) -> ₹2 (200 paise)
 * ₹200.01 - ₹300.00 (20,001 - 30,000 paise) -> ₹3 (300 paise)
 */
export const calculatePlatformFeePaise = (amountPaise: number): number => {
  if (!amountPaise || amountPaise <= 0 || !Number.isFinite(amountPaise)) {
    return 0;
  }
  const cleanPaise = Math.round(amountPaise);
  return Math.ceil(cleanPaise / 10000) * 100;
};

export const calculatePlatformFeeRupees = (amountRupees: number): number => {
  if (!amountRupees || amountRupees <= 0 || !Number.isFinite(amountRupees)) {
    return 0;
  }
  const amountPaise = Math.round(amountRupees * 100);
  return calculatePlatformFeePaise(amountPaise) / 100;
};

export const paiseToRupees = (paise: number): number => {
  if (!paise || !Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
};

export const rupeesToPaise = (rupees: number): number => {
  if (!rupees || !Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
};

export const formatPaiseToRupees = (paise: number): string => {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * 1. Generate or retrieve a short-lived 6-digit pickup verification code for a customer order
 */
export const generateOrderPickupCode = async (
  requestId: string
): Promise<{ success: boolean; code?: string; error?: string }> => {
  if (!requestId) return { success: false, error: 'Request ID is required' };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('generate_order_pickup_code', {
        p_request_id: requestId,
      });

      if (error) {
        console.error('Error generating pickup code via RPC:', error);
        return { success: false, error: error.message };
      }

      return { success: true, code: data as string };
    } catch (err: unknown) {
      console.error('Exception generating pickup code:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to generate pickup code' };
    }
  }

  // Demo / local fallback: 6-digit code
  const mockCode = String(Math.floor(100000 + Math.random() * 900000));
  try {
    const rawDemo = localStorage.getItem('vaango_demo_requests');
    if (rawDemo) {
      const list = JSON.parse(rawDemo);
      const idx = list.findIndex((r: any) => r.id === requestId);
      if (idx !== -1) {
        list[idx].pickup_code_hash = 'mock_hash_' + mockCode;
        list[idx].pickup_code_salt = 'mock_salt';
        list[idx].pickup_code_generated_at = new Date().toISOString();
        localStorage.setItem('vaango_demo_requests', JSON.stringify(list));
      }
    }
  } catch {}
  return { success: true, code: mockCode };
};

/**
 * 1B. Retrieve active customer pickup code for an active order
 */
export const fetchCustomerPickupCode = async (
  requestId: string
): Promise<{ success: boolean; pickupCode?: string; error?: string }> => {
  if (!requestId) return { success: false, error: 'Request ID is required' };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_order_pickup_code', {
        p_request_id: requestId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const res = data as any;
      if (!res?.success) {
        return { success: false, error: res?.error || 'Unable to retrieve pickup code' };
      }

      return { success: true, pickupCode: res.pickup_code };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Error fetching pickup code' };
    }
  }

  // Demo fallback
  try {
    const rawDemo = localStorage.getItem('vaango_demo_requests');
    if (rawDemo) {
      const list = JSON.parse(rawDemo);
      const match = list.find((r: any) => r.id === requestId);
      if (match?.pickup_code_hash) {
        const extracted = match.pickup_code_hash.replace('mock_hash_', '');
        return { success: true, pickupCode: extracted || '123456' };
      }
    }
  } catch {}
  return { success: true, pickupCode: '849201' };
};

/**
 * 2. Complete order, verify pickup code, confirm merchant payment collection,
 * and assess customer-paid platform fee atomically.
 */
export const completeOrderAndAssessFee = async (params: {
  requestId: string;
  pickupCode: string;
  paymentMethod: string;
  actorId: string;
  overrideWithoutCode?: boolean;
}): Promise<{
  success: boolean;
  platformFeePaise?: number;
  totalAmount?: number;
  alreadyCompleted?: boolean;
  error?: string;
}> => {
  const { requestId, pickupCode, paymentMethod, actorId, overrideWithoutCode = false } = params;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('complete_order_and_assess_fee', {
        p_request_id: requestId,
        p_pickup_code: pickupCode || '',
        p_payment_method: paymentMethod || 'cash',
        p_actor_id: actorId,
        p_override_without_code: overrideWithoutCode,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const res = data as any;
      if (!res?.success) {
        return { success: false, error: res?.error || 'Order completion failed.' };
      }

      return {
        success: true,
        platformFeePaise: res.platform_fee_paise,
        totalAmount: res.total_amount,
        alreadyCompleted: res.already_completed,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Error completing order.' };
    }
  }

  // Demo fallback
  return { success: true, platformFeePaise: 100, totalAmount: 100 };
};

/**
 * 3. Reverse platform fee liability on order cancellation or full refund
 */
export const recordOrderFeeReversal = async (
  requestId: string,
  reason: string,
  actorId: string
): Promise<{ success: boolean; reversedPaise?: number; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('record_order_fee_reversal', {
        p_request_id: requestId,
        p_reason: reason,
        p_actor_id: actorId,
      });

      if (error) return { success: false, error: error.message };
      const res = data as any;
      return { success: res?.success ?? true, reversedPaise: res?.reversed_paise };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to reverse fee' };
    }
  }
  return { success: true, reversedPaise: 100 };
};

/**
 * 4. Fetch individual merchant financial summary
 */
export const fetchMerchantFinancialSummary = async (
  shopId: string
): Promise<MerchantFinancialSummary> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_merchant_financial_summary', {
        p_shop_id: shopId,
      });

      if (error) {
        return {
          success: false,
          shop_id: shopId,
          shop_name: 'Merchant',
          financial_status: 'ACTIVE',
          total_completed_orders: 0,
          gmv_paise: 0,
          total_fees_assessed_paise: 0,
          total_fees_reversed_paise: 0,
          net_fees_owed_paise: 0,
          total_verified_settled_paise: 0,
          pending_settlement_paise: 0,
          outstanding_balance_paise: 0,
          days_overdue: 0,
          error: error.message,
        };
      }

      return data as MerchantFinancialSummary;
    } catch (err: unknown) {
      return {
        success: false,
        shop_id: shopId,
        shop_name: 'Merchant',
        financial_status: 'ACTIVE',
        total_completed_orders: 0,
        gmv_paise: 0,
        total_fees_assessed_paise: 0,
        total_fees_reversed_paise: 0,
        net_fees_owed_paise: 0,
        total_verified_settled_paise: 0,
        pending_settlement_paise: 0,
        outstanding_balance_paise: 0,
        days_overdue: 0,
        error: err instanceof Error ? err.message : 'Failed to fetch financial summary',
      };
    }
  }

  // Demo fallback
  return {
    success: true,
    shop_id: shopId,
    shop_name: 'Demo Merchant',
    financial_status: 'ACTIVE',
    total_completed_orders: 5,
    gmv_paise: 250000,
    total_fees_assessed_paise: 1500,
    total_fees_reversed_paise: 0,
    net_fees_owed_paise: 1500,
    total_verified_settled_paise: 500,
    pending_settlement_paise: 0,
    outstanding_balance_paise: 1000,
    days_overdue: 3,
  };
};

/**
 * 5. Fetch overall Admin Financial KPIs with optional date filter
 */
export const fetchAdminFinancialKPIs = async (
  startDate?: string,
  endDate?: string
): Promise<AdminFinancialKPIs> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_admin_financial_kpis', {
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      });

      if (error) {
        return {
          success: false,
          total_registered_merchants: 0,
          merchants_with_completed_orders: 0,
          merchants_with_outstanding_fees: 0,
          fully_settled_merchants: 0,
          total_completed_orders: 0,
          total_gmv_paise: 0,
          total_platform_fees_assessed_paise: 0,
          total_platform_fees_reversed_paise: 0,
          net_platform_fees_owed_paise: 0,
          verified_fees_collected_paise: 0,
          total_outstanding_paise: 0,
          pending_settlement_requests_count: 0,
          error: error.message,
        };
      }

      return data as AdminFinancialKPIs;
    } catch (err: unknown) {
      return {
        success: false,
        total_registered_merchants: 0,
        merchants_with_completed_orders: 0,
        merchants_with_outstanding_fees: 0,
        fully_settled_merchants: 0,
        total_completed_orders: 0,
        total_gmv_paise: 0,
        total_platform_fees_assessed_paise: 0,
        total_platform_fees_reversed_paise: 0,
        net_platform_fees_owed_paise: 0,
        verified_fees_collected_paise: 0,
        total_outstanding_paise: 0,
        pending_settlement_requests_count: 0,
        error: err instanceof Error ? err.message : 'Failed to fetch admin KPIs',
      };
    }
  }

  // Demo fallback
  return {
    success: true,
    total_registered_merchants: 12,
    merchants_with_completed_orders: 8,
    merchants_with_outstanding_fees: 5,
    fully_settled_merchants: 3,
    total_completed_orders: 45,
    total_gmv_paise: 2500000,
    total_platform_fees_assessed_paise: 12500,
    total_platform_fees_reversed_paise: 400,
    net_platform_fees_owed_paise: 12100,
    verified_fees_collected_paise: 7500,
    total_outstanding_paise: 4600,
    pending_settlement_requests_count: 2,
  };
};

/**
 * 6. Fetch merchant settlements list (with optional shop or status filter)
 */
export const fetchMerchantSettlements = async (filters?: {
  shopId?: string;
  status?: string;
}): Promise<MerchantSettlement[]> => {
  if (isSupabaseConfigured) {
    let query = supabase
      .from('merchant_settlements')
      .select('*, shops(name, phone)')
      .order('submitted_at', { ascending: false });

    if (filters?.shopId) {
      query = query.eq('shop_id', filters.shopId);
    }
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('verification_status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching settlements:', error);
      return [];
    }
    return (data || []) as MerchantSettlement[];
  }

  return [];
};

/**
 * 7. Submit a new merchant settlement remittance
 */
export const submitMerchantSettlement = async (params: {
  shopId: string;
  amountPaise: number;
  paymentMethod: SettlementPaymentMethod;
  transactionReference: string;
  proofDocumentUrl?: string | null;
  notes?: string | null;
  userId: string;
}): Promise<{ success: boolean; settlement?: MerchantSettlement; error?: string }> => {
  if (!params.shopId || !params.amountPaise || params.amountPaise <= 0) {
    return { success: false, error: 'A valid shop and positive settlement amount are required.' };
  }
  if (!params.transactionReference?.trim()) {
    return { success: false, error: 'Transaction reference or UTR is required.' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('merchant_settlements')
        .insert({
          shop_id: params.shopId,
          amount_paise: params.amountPaise,
          payment_method: params.paymentMethod,
          transaction_reference: params.transactionReference.trim(),
          proof_document_url: params.proofDocumentUrl || null,
          notes: params.notes?.trim() || null,
          submitted_by: params.userId,
          verification_status: 'submitted',
        })
        .select('*, shops(name, phone)')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, settlement: data as MerchantSettlement };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to submit settlement.' };
    }
  }

  return { success: true };
};

/**
 * 8. Admin verification or rejection of merchant settlement remittance
 */
export const verifyMerchantSettlement = async (params: {
  settlementId: string;
  action: 'verify' | 'reject';
  verifiedAmountPaise?: number;
  rejectionReason?: string;
  adminId: string;
}): Promise<{ success: boolean; error?: string }> => {
  const { settlementId, action, verifiedAmountPaise, rejectionReason, adminId } = params;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('verify_merchant_settlement', {
        p_settlement_id: settlementId,
        p_action: action,
        p_verified_amount_paise: verifiedAmountPaise || 0,
        p_rejection_reason: rejectionReason || null,
        p_admin_id: adminId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const res = data as any;
      if (!res?.success) {
        return { success: false, error: res?.error || 'Verification action failed.' };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Error executing verification.' };
    }
  }

  return { success: true };
};

/**
 * 9. Fetch merchant ledger entries for statement / drill-down
 */
export const fetchMerchantLedger = async (
  shopId: string,
  limit: number = 50
): Promise<PlatformFeeLedgerEntry[]> => {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('platform_fee_ledger')
      .select('*, requests(reference_code, total_estimate, payment_method)')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching merchant ledger:', error);
      return [];
    }
    return (data || []) as PlatformFeeLedgerEntry[];
  }

  return [];
};

/**
 * 10. Fetch Merchant Directory items for Admin Financial Directory
 */
export const fetchAdminMerchantDirectory = async (): Promise<MerchantDirectoryItem[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data: shops, error: shopsErr } = await supabase
        .from('shops')
        .select('id, name, financial_status, owner:profiles(id, full_name, email, phone)')
        .order('name');

      if (shopsErr || !shops) return [];

      const shopIds = shops.map((s) => s.id);

      // Concurrently fetch requests summary and ledger summary
      const [{ data: reqs }, { data: ledgers }, { data: settlements }] = await Promise.all([
        supabase
          .from('requests')
          .select('shop_id, total_estimate')
          .eq('current_state', 'COMPLETED')
          .in('shop_id', shopIds),
        supabase
          .from('platform_fee_ledger')
          .select('shop_id, entry_type, amount_paise, created_at')
          .in('shop_id', shopIds),
        supabase
          .from('merchant_settlements')
          .select('shop_id, verified_amount_paise, verified_at')
          .eq('verification_status', 'verified')
          .in('shop_id', shopIds),
      ]);

      return shops.map((shop: any) => {
        const shopReqs = (reqs || []).filter((r) => r.shop_id === shop.id);
        const shopLedgers = (ledgers || []).filter((l) => l.shop_id === shop.id);
        const shopSettlements = (settlements || []).filter((s) => s.shop_id === shop.id);

        const gmvPaise = shopReqs.reduce((sum, r) => sum + Math.round((r.total_estimate || 0) * 100), 0);
        const assessedPaise = shopLedgers
          .filter((l) => l.entry_type === 'fee_assessed')
          .reduce((sum, l) => sum + l.amount_paise, 0);
        const reversedPaise = shopLedgers
          .filter((l) => l.entry_type === 'fee_reversed')
          .reduce((sum, l) => sum + Math.abs(l.amount_paise), 0);
        const netPaise = assessedPaise - reversedPaise;
        const verifiedSettledPaise = shopSettlements.reduce((sum, s) => sum + (s.verified_amount_paise || 0), 0);
        const balancePaise = Math.max(0, netPaise - verifiedSettledPaise);

        const latestSettlement = shopSettlements
          .filter((s) => s.verified_at)
          .sort((a, b) => new Date(b.verified_at!).getTime() - new Date(a.verified_at!).getTime())[0];

        let daysOverdue = 0;
        if (balancePaise > 0) {
          const oldestLedger = shopLedgers
            .filter((l) => l.entry_type === 'fee_assessed')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
          if (oldestLedger) {
            daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(oldestLedger.created_at).getTime()) / (1000 * 60 * 60 * 24)));
          }
        }

        return {
          shop_id: shop.id,
          shop_name: shop.name,
          owner_name: shop.owner?.full_name || null,
          owner_email: shop.owner?.email || null,
          owner_phone: shop.owner?.phone || null,
          financial_status: (shop.financial_status || 'ACTIVE') as FinancialStatus,
          completed_orders: shopReqs.length,
          gmv_rupees: gmvPaise / 100,
          fees_assessed_rupees: netPaise / 100,
          verified_settled_rupees: verifiedSettledPaise / 100,
          outstanding_balance_rupees: balancePaise / 100,
          last_settlement_date: latestSettlement?.verified_at || null,
          days_overdue: daysOverdue,
        };
      });
    } catch (err) {
      console.error('Error fetching admin merchant directory:', err);
      return [];
    }
  }

  return [];
};

export const formatCSVCell = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Prevent CSV formula injection (OWASP CSV Injection / Excel formula injection)
  if (/^[=+@-]/i.test(str)) {
    str = "'" + str;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

/**
 * 11. Export Financial Data to CSV
 */
export const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]): void => {
  const csvContent = [
    headers.map(formatCSVCell).join(','),
    ...rows.map((row) => row.map(formatCSVCell).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

import { supabase, isSupabaseConfigured } from './supabase';
import {
  Request,
  CustomerModeration,
  CustomerCancellationEvent,
  CancellationPolicySettings,
  Shop,
} from '../types/database';
import { notifyOrderLifecycle } from './notificationApi';

export const DEMO_CANCELLATION_EVENTS_KEY = 'vaango_demo_cancellation_events';
export const DEMO_CUSTOMER_MODERATION_KEY = 'vaango_demo_customer_moderation';
export const DEMO_CANCELLATION_POLICY_KEY = 'vaango_demo_cancellation_policy';
export const DEMO_REQUESTS_KEY = 'vaango_demo_requests';
export const DEMO_SHOPS_KEY = 'vaango_demo_shops';

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicySettings = {
  id: 'default',
  window_days: 30,
  first_warning_threshold: 1, // 1st cancellation: polite reminder
  second_warning_threshold: 2, // 2nd cancellation: formal warning
  review_threshold: 3, // 3rd cancellation: flag for admin review & shopkeeper alert
  exclude_unaccepted_orders: true,
  updated_at: new Date().toISOString(),
};

/**
 * Standard suggested cancellation reasons across Vaangly
 */
export const CANCELLATION_REASONS = [
  'Ordered by mistake',
  'Selected the wrong items',
  'Delivery or pickup delay',
  'No longer needed',
  'Other',
] as const;

export type CancellationReason = typeof CANCELLATION_REASONS[number] | string;

export interface DirectCancelParams {
  requestId: string;
  customerId: string;
  reason: string;
  explanation?: string;
  actorRole?: 'customer' | 'admin';
}

export interface RequestCancelParams {
  requestId: string;
  customerId: string;
  reason: string;
  explanation?: string;
}

export interface RespondCancelParams {
  requestId: string;
  actorId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;
  actorRole?: 'shopkeeper' | 'admin';
}

export interface AdminModerateParams {
  customerId: string;
  action: 'suspend' | 'reinstate' | 'issue_warning' | 'clear_flag';
  reason: string;
  durationHours?: number;
  adminId?: string;
}

// -------------------------------------------------------------
// STORAGE HELPERS FOR MOCK / OFFLINE / TEST
// -------------------------------------------------------------

export function getStoredPolicySettings(): CancellationPolicySettings {
  try {
    const raw = localStorage.getItem(DEMO_CANCELLATION_POLICY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fallback */ }
  return DEFAULT_CANCELLATION_POLICY;
}

export function saveStoredPolicySettings(settings: CancellationPolicySettings): void {
  try {
    localStorage.setItem(DEMO_CANCELLATION_POLICY_KEY, JSON.stringify(settings));
  } catch { /* fallback */ }
}

export function getStoredCancellationEvents(): CustomerCancellationEvent[] {
  try {
    const raw = localStorage.getItem(DEMO_CANCELLATION_EVENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fallback */ }
  return [];
}

export function saveStoredCancellationEvents(events: CustomerCancellationEvent[]): void {
  try {
    localStorage.setItem(DEMO_CANCELLATION_EVENTS_KEY, JSON.stringify(events));
  } catch { /* fallback */ }
}

export function getStoredModerationRecords(): Record<string, CustomerModeration> {
  try {
    const raw = localStorage.getItem(DEMO_CUSTOMER_MODERATION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fallback */ }
  return {};
}

export function saveStoredModerationRecords(records: Record<string, CustomerModeration>): void {
  try {
    localStorage.setItem(DEMO_CUSTOMER_MODERATION_KEY, JSON.stringify(records));
  } catch { /* fallback */ }
}

// -------------------------------------------------------------
// CORE CLIENT APIS
// -------------------------------------------------------------

/**
 * 1. Cancel an order directly when in eligible pre-fulfillment state (REQUESTED)
 */
export async function cancelOrderDirectly(
  params: DirectCancelParams
): Promise<{ success: boolean; request?: Request; error?: string }> {
  const { requestId, customerId, reason, explanation, actorRole = 'customer' } = params;

  if (isSupabaseConfigured) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_order_directly', {
        p_request_id: requestId,
        p_reason: reason,
        p_explanation: explanation?.trim() || null,
      });

      if (rpcErr || !rpcRes?.success) {
        return {
          success: false,
          error: rpcRes?.error || rpcErr?.message || 'Failed to cancel order.',
        };
      }

      // Reload updated request
      const { data: updatedReq, error: fetchErr } = await supabase
        .from('requests')
        .select('*, shops(name, owner_id)')
        .eq('id', requestId)
        .single();

      if (fetchErr || !updatedReq) {
        return { success: false, error: 'Order was cancelled but could not be reloaded.' };
      }

      const shopOwnerId = (updatedReq as any)?.shops?.owner_id;
      const shopName = (updatedReq as any)?.shops?.name || 'the shop';

      // Dispatch notifications
      if (shopOwnerId) {
        void notifyOrderLifecycle({
          event: 'ORDER_CANCELLED',
          requestId: updatedReq.id,
          referenceCode: updatedReq.reference_code,
          recipientId: shopOwnerId,
          recipientRole: 'shopkeeper',
          shopId: updatedReq.shop_id,
          shopName,
          reason,
        });
      }

      void notifyOrderLifecycle({
        event: 'ORDER_CANCELLED',
        requestId: updatedReq.id,
        referenceCode: updatedReq.reference_code,
        recipientId: customerId,
        recipientRole: 'customer',
        shopId: updatedReq.shop_id,
        shopName,
        reason,
      });

      // Handle abuse warnings if applicable
      if (rpcRes.warning_level === 'reminder') {
        void notifyOrderLifecycle({
          event: 'CUSTOMER_WARNING',
          requestId: updatedReq.id,
          referenceCode: updatedReq.reference_code,
          recipientId: customerId,
          recipientRole: 'customer',
          reason: 'reminder',
        });
      } else if (rpcRes.warning_level === 'formal_warning' || rpcRes.warning_level === 'admin_review') {
        void notifyOrderLifecycle({
          event: 'CUSTOMER_WARNING',
          requestId: updatedReq.id,
          referenceCode: updatedReq.reference_code,
          recipientId: customerId,
          recipientRole: 'customer',
          reason: 'formal_warning',
        });
      }

      return { success: true, request: updatedReq as Request };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error cancelling order.';
      return { success: false, error: message };
    }
  }

  // Demo / Offline / Test Mode
  try {
    const rawReqs = localStorage.getItem(DEMO_REQUESTS_KEY);
    const requests: Request[] = rawReqs ? JSON.parse(rawReqs) : [];
    const index = requests.findIndex((r) => r.id === requestId);

    if (index === -1) {
      return { success: false, error: 'Order not found.' };
    }

    const currentReq = requests[index];

    if (actorRole === 'customer' && currentReq.customer_id !== customerId) {
      return { success: false, error: 'You are not authorized to cancel this order.' };
    }

    if (['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(currentReq.current_state)) {
      return {
        success: false,
        error: `This order is already in a terminal state (${currentReq.current_state}) and cannot be cancelled.`,
      };
    }

    if (actorRole === 'customer' && currentReq.current_state !== 'REQUESTED') {
      return {
        success: false,
        error: 'Orders already accepted or in preparation cannot be cancelled directly. Please contact the shop.',
      };
    }

    const nowIso = new Date().toISOString();
    const policy = getStoredPolicySettings();
    const isQualifying = actorRole === 'customer' && (currentReq.current_state !== 'REQUESTED' || !policy.exclude_unaccepted_orders);

    const paymentStatusLower = (currentReq.payment_status || '').toLowerCase();
    const requiresRefund =
      Boolean(currentReq.customer_paid || ['payment_verified', 'paid'].includes(paymentStatusLower)) &&
      currentReq.refund_status !== 'refunded';

    const updated: Request = {
      ...currentReq,
      current_state: 'CANCELLED',
      cancellation_requested: true,
      cancellation_request_status: 'approved',
      cancellation_reason: reason,
      cancellation_explanation: explanation?.trim() || null,
      cancellation_requested_at: currentReq.cancellation_requested_at || nowIso,
      cancelled_by: customerId,
      cancelled_at: nowIso,
      cancellation_actor_role: actorRole,
      ...(requiresRefund
        ? {
            refund_status: 'required' as const,
            refund_amount: currentReq.refund_amount ?? currentReq.payment_amount ?? currentReq.total_estimate ?? 0,
            refund_reason: 'Cancelled after verified payment.',
          }
        : {}),
      updated_at: nowIso,
    };

    requests[index] = updated;
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(requests));

    // Record cancellation event
    const events = getStoredCancellationEvents();
    if (!events.some((e) => e.request_id === requestId)) {
      events.push({
        id: `canc-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        customer_id: customerId,
        request_id: requestId,
        shop_id: currentReq.shop_id,
        order_reference: currentReq.reference_code,
        previous_state: currentReq.current_state,
        preparation_started: false,
        actor_id: customerId,
        actor_role: actorRole,
        reason,
        explanation: explanation?.trim() || null,
        is_qualifying: isQualifying,
        created_at: nowIso,
      });
      saveStoredCancellationEvents(events);
    }

    // Evaluate rolling abuse count
    let warningLevel: string | null = null;
    if (isQualifying) {
      const windowStart = Date.now() - policy.window_days * 24 * 60 * 60 * 1000;
      const qualifyingCount = events.filter(
        (e) => e.customer_id === customerId && e.is_qualifying && new Date(e.created_at).getTime() >= windowStart
      ).length;

      const modRecords = getStoredModerationRecords();
      const existingMod = modRecords[customerId] || {
        customer_id: customerId,
        is_suspended: false,
        flagged_for_review: false,
        warning_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
      };

      existingMod.warning_count = qualifyingCount;
      existingMod.updated_at = nowIso;

      if (qualifyingCount >= policy.review_threshold) {
        warningLevel = 'admin_review';
        existingMod.flagged_for_review = true;
        existingMod.flagged_at = nowIso;
        existingMod.flag_reason = `Customer reached ${qualifyingCount} cancellations in 30 days.`;
        existingMod.last_warning_level = 'formal_warning';
        existingMod.last_warning_at = nowIso;
      } else if (qualifyingCount >= policy.second_warning_threshold) {
        warningLevel = 'formal_warning';
        existingMod.last_warning_level = 'formal_warning';
        existingMod.last_warning_at = nowIso;
      } else if (qualifyingCount >= policy.first_warning_threshold) {
        warningLevel = 'reminder';
        existingMod.last_warning_level = 'reminder';
        existingMod.last_warning_at = nowIso;
      }

      modRecords[customerId] = existingMod;
      saveStoredModerationRecords(modRecords);
    }

    // Demo notification
    const shops: Shop[] = JSON.parse(localStorage.getItem(DEMO_SHOPS_KEY) || '[]');
    const shop = shops.find((s) => s.id === currentReq.shop_id);

    if (shop?.owner_id) {
      void notifyOrderLifecycle({
        event: 'ORDER_CANCELLED',
        requestId: updated.id,
        referenceCode: updated.reference_code,
        recipientId: shop.owner_id,
        recipientRole: 'shopkeeper',
        shopId: updated.shop_id,
        shopName: shop.name,
        reason,
      });
    }

    void notifyOrderLifecycle({
      event: 'ORDER_CANCELLED',
      requestId: updated.id,
      referenceCode: updated.reference_code,
      recipientId: customerId,
      recipientRole: 'customer',
      shopId: updated.shop_id,
      shopName: shop?.name || 'the shop',
    });

    if (warningLevel === 'reminder') {
      void notifyOrderLifecycle({
        event: 'CUSTOMER_WARNING',
        requestId: updated.id,
        referenceCode: updated.reference_code,
        recipientId: customerId,
        recipientRole: 'customer',
        reason: 'reminder',
      });
    } else if (warningLevel === 'formal_warning' || warningLevel === 'admin_review') {
      void notifyOrderLifecycle({
        event: 'CUSTOMER_WARNING',
        requestId: updated.id,
        referenceCode: updated.reference_code,
        recipientId: customerId,
        recipientRole: 'customer',
        reason: 'formal_warning',
      });
    }

    return { success: true, request: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error cancelling order.';
    return { success: false, error: message };
  }
}

/**
 * 2. Request cancellation for order that is already accepted or in preparation
 */
export async function requestOrderCancellation(
  params: RequestCancelParams
): Promise<{ success: boolean; request?: Request; error?: string }> {
  const { requestId, customerId, reason, explanation } = params;

  if (isSupabaseConfigured) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('request_order_cancellation', {
        p_request_id: requestId,
        p_reason: reason,
        p_explanation: explanation?.trim() || null,
      });

      if (rpcErr || !rpcRes?.success) {
        return {
          success: false,
          error: rpcRes?.error || rpcErr?.message || 'Failed to submit cancellation request.',
        };
      }

      const { data: updatedReq, error: fetchErr } = await supabase
        .from('requests')
        .select('*, shops(name, owner_id)')
        .eq('id', requestId)
        .single();

      if (fetchErr || !updatedReq) {
        return { success: false, error: 'Cancellation request saved but order could not be reloaded.' };
      }

      const shopOwnerId = (updatedReq as any)?.shops?.owner_id;
      if (shopOwnerId) {
        void notifyOrderLifecycle({
          event: 'CANCELLATION_REQUESTED',
          requestId: updatedReq.id,
          referenceCode: updatedReq.reference_code,
          recipientId: shopOwnerId,
          recipientRole: 'shopkeeper',
          shopId: updatedReq.shop_id,
          reason,
        });
      }

      return { success: true, request: updatedReq as Request };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error requesting cancellation.';
      return { success: false, error: message };
    }
  }

  // Demo / Offline Mode
  try {
    const rawReqs = localStorage.getItem(DEMO_REQUESTS_KEY);
    const requests: Request[] = rawReqs ? JSON.parse(rawReqs) : [];
    const index = requests.findIndex((r) => r.id === requestId);

    if (index === -1) {
      return { success: false, error: 'Order not found.' };
    }

    const currentReq = requests[index];

    if (currentReq.customer_id !== customerId) {
      return { success: false, error: 'You are not authorized to cancel this order.' };
    }

    if (['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(currentReq.current_state)) {
      return {
        success: false,
        error: `Order is already in ${currentReq.current_state} state and cannot be cancelled.`,
      };
    }

    if (currentReq.cancellation_request_status === 'pending') {
      return {
        success: false,
        error: 'A cancellation request is already pending review by the shopkeeper.',
      };
    }

    const nowIso = new Date().toISOString();
    const updated: Request = {
      ...currentReq,
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: reason,
      cancellation_explanation: explanation?.trim() || null,
      cancellation_requested_at: nowIso,
      updated_at: nowIso,
    };

    requests[index] = updated;
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(requests));

    const shops: Shop[] = JSON.parse(localStorage.getItem(DEMO_SHOPS_KEY) || '[]');
    const shop = shops.find((s) => s.id === currentReq.shop_id);

    if (shop?.owner_id) {
      void notifyOrderLifecycle({
        event: 'CANCELLATION_REQUESTED',
        requestId: updated.id,
        referenceCode: updated.reference_code,
        recipientId: shop.owner_id,
        recipientRole: 'shopkeeper',
        shopId: updated.shop_id,
        reason,
      });
    }

    return { success: true, request: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error requesting cancellation.';
    return { success: false, error: message };
  }
}

/**
 * 3. Shopkeeper responds to a cancellation request (approve or reject)
 */
export async function respondToCancellationRequest(
  params: RespondCancelParams
): Promise<{ success: boolean; request?: Request; error?: string }> {
  const { requestId, actorId, action, rejectionReason, actorRole = 'shopkeeper' } = params;

  if (isSupabaseConfigured) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('respond_to_cancellation_request', {
        p_request_id: requestId,
        p_action: action,
        p_rejection_reason: rejectionReason?.trim() || null,
      });

      if (rpcErr || !rpcRes?.success) {
        return {
          success: false,
          error: rpcRes?.error || rpcErr?.message || 'Failed to process cancellation response.',
        };
      }

      const { data: updatedReq, error: fetchErr } = await supabase
        .from('requests')
        .select('*, shops(name, owner_id)')
        .eq('id', requestId)
        .single();

      if (fetchErr || !updatedReq) {
        return { success: false, error: 'Request updated but could not be reloaded.' };
      }

      const shopName = (updatedReq as any)?.shops?.name || 'the shop';

      if (action === 'approve') {
        void notifyOrderLifecycle({
          event: 'CANCELLATION_APPROVED',
          requestId: updatedReq.id,
          referenceCode: updatedReq.reference_code,
          recipientId: updatedReq.customer_id,
          recipientRole: 'customer',
          shopId: updatedReq.shop_id,
          shopName,
        });

        // Warnings and shopkeeper alert
        if (rpcRes.warning_level === 'reminder') {
          void notifyOrderLifecycle({
            event: 'CUSTOMER_WARNING',
            requestId: updatedReq.id,
            referenceCode: updatedReq.reference_code,
            recipientId: updatedReq.customer_id,
            recipientRole: 'customer',
            reason: 'reminder',
          });
        } else if (rpcRes.warning_level === 'formal_warning' || rpcRes.warning_level === 'admin_review') {
          void notifyOrderLifecycle({
            event: 'CUSTOMER_WARNING',
            requestId: updatedReq.id,
            referenceCode: updatedReq.reference_code,
            recipientId: updatedReq.customer_id,
            recipientRole: 'customer',
            reason: 'formal_warning',
          });

          if (rpcRes.warning_level === 'admin_review') {
            void notifyOrderLifecycle({
              event: 'SHOPKEEPER_ABUSE_ALERT',
              requestId: updatedReq.id,
              referenceCode: updatedReq.reference_code,
              recipientId: actorId,
              recipientRole: 'shopkeeper',
              shopId: updatedReq.shop_id,
            });
          }
        }
      } else {
        void notifyOrderLifecycle({
          event: 'CANCELLATION_REJECTED',
          requestId: updatedReq.id,
          referenceCode: updatedReq.reference_code,
          recipientId: updatedReq.customer_id,
          recipientRole: 'customer',
          shopId: updatedReq.shop_id,
          shopName,
          reason: rejectionReason,
        });
      }

      return { success: true, request: updatedReq as Request };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error processing cancellation response.';
      return { success: false, error: message };
    }
  }

  // Demo / Offline Mode
  try {
    const rawReqs = localStorage.getItem(DEMO_REQUESTS_KEY);
    const requests: Request[] = rawReqs ? JSON.parse(rawReqs) : [];
    const index = requests.findIndex((r) => r.id === requestId);

    if (index === -1) {
      return { success: false, error: 'Order not found.' };
    }

    const currentReq = requests[index];

    if (actorRole === 'shopkeeper') {
      const shops: Shop[] = JSON.parse(localStorage.getItem(DEMO_SHOPS_KEY) || '[]');
      const shop = shops.find((s) => s.id === currentReq.shop_id);
      if (shop && shop.owner_id !== actorId) {
        return { success: false, error: 'You are not authorized to manage orders for another shop.' };
      }
    }

    if (currentReq.cancellation_request_status !== 'pending') {
      return { success: false, error: 'No pending cancellation request exists for this order.' };
    }

    if (['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(currentReq.current_state)) {
      return {
        success: false,
        error: `Order has already reached ${currentReq.current_state} state. Cannot process cancellation response.`,
      };
    }

    const nowIso = new Date().toISOString();
    let updated: Request;

    if (action === 'approve') {
      const prepStarted = ['PREPARING', 'IN_PROGRESS', 'READY'].includes(currentReq.current_state);
      const paymentStatusLower = (currentReq.payment_status || '').toLowerCase();
      const requiresRefund =
        Boolean(currentReq.customer_paid || ['payment_verified', 'paid'].includes(paymentStatusLower)) &&
        currentReq.refund_status !== 'refunded';

      updated = {
        ...currentReq,
        current_state: 'CANCELLED',
        cancellation_request_status: 'approved',
        cancelled_by: actorId,
        cancelled_at: nowIso,
        cancellation_actor_role: actorRole,
        ...(requiresRefund
          ? {
              refund_status: 'required' as const,
              refund_amount: currentReq.refund_amount ?? currentReq.payment_amount ?? currentReq.total_estimate ?? 0,
              refund_reason: 'Cancelled after verified payment.',
            }
          : {}),
        updated_at: nowIso,
      };

      // Record event in customer_cancellation_events
      const events = getStoredCancellationEvents();
      if (!events.some((e) => e.request_id === requestId)) {
        events.push({
          id: `canc-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          customer_id: currentReq.customer_id,
          request_id: requestId,
          shop_id: currentReq.shop_id,
          order_reference: currentReq.reference_code,
          previous_state: currentReq.current_state,
          preparation_started: prepStarted,
          actor_id: actorId,
          actor_role: actorRole,
          reason: currentReq.cancellation_reason || 'Customer cancellation approved',
          explanation: currentReq.cancellation_explanation,
          is_qualifying: true,
          created_at: nowIso,
        });
        saveStoredCancellationEvents(events);
      }

      // Check abuse thresholds
      const policy = getStoredPolicySettings();
      const windowStart = Date.now() - policy.window_days * 24 * 60 * 60 * 1000;
      const qualifyingCount = events.filter(
        (e) =>
          e.customer_id === currentReq.customer_id &&
          e.is_qualifying &&
          new Date(e.created_at).getTime() >= windowStart
      ).length;

      const modRecords = getStoredModerationRecords();
      const existingMod = modRecords[currentReq.customer_id] || {
        customer_id: currentReq.customer_id,
        is_suspended: false,
        flagged_for_review: false,
        warning_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
      };

      existingMod.warning_count = qualifyingCount;
      existingMod.updated_at = nowIso;

      let warningLevel: string | null = null;
      if (qualifyingCount >= policy.review_threshold) {
        warningLevel = 'admin_review';
        existingMod.flagged_for_review = true;
        existingMod.flagged_at = nowIso;
        existingMod.flag_reason = `Customer reached ${qualifyingCount} qualifying cancellations within ${policy.window_days} days.`;
        existingMod.last_warning_level = 'formal_warning';
        existingMod.last_warning_at = nowIso;
      } else if (qualifyingCount >= policy.second_warning_threshold) {
        warningLevel = 'formal_warning';
        existingMod.last_warning_level = 'formal_warning';
        existingMod.last_warning_at = nowIso;
      } else if (qualifyingCount >= policy.first_warning_threshold) {
        warningLevel = 'reminder';
        existingMod.last_warning_level = 'reminder';
        existingMod.last_warning_at = nowIso;
      }

      modRecords[currentReq.customer_id] = existingMod;
      saveStoredModerationRecords(modRecords);

      // Customer notification
      const shops: Shop[] = JSON.parse(localStorage.getItem(DEMO_SHOPS_KEY) || '[]');
      const shop = shops.find((s) => s.id === currentReq.shop_id);

      void notifyOrderLifecycle({
        event: 'CANCELLATION_APPROVED',
        requestId: updated.id,
        referenceCode: updated.reference_code,
        recipientId: updated.customer_id,
        recipientRole: 'customer',
        shopId: updated.shop_id,
        shopName: shop?.name || 'the shop',
      });

      if (warningLevel === 'reminder') {
        void notifyOrderLifecycle({
          event: 'CUSTOMER_WARNING',
          requestId: updated.id,
          referenceCode: updated.reference_code,
          recipientId: updated.customer_id,
          recipientRole: 'customer',
          reason: 'reminder',
        });
      } else if (warningLevel === 'formal_warning' || warningLevel === 'admin_review') {
        void notifyOrderLifecycle({
          event: 'CUSTOMER_WARNING',
          requestId: updated.id,
          referenceCode: updated.reference_code,
          recipientId: updated.customer_id,
          recipientRole: 'customer',
          reason: 'formal_warning',
        });

        if (warningLevel === 'admin_review') {
          void notifyOrderLifecycle({
            event: 'SHOPKEEPER_ABUSE_ALERT',
            requestId: updated.id,
            referenceCode: updated.reference_code,
            recipientId: actorId,
            recipientRole: 'shopkeeper',
            shopId: updated.shop_id,
          });
        }
      }
    } else {
      if (!rejectionReason || !rejectionReason.trim()) {
        return { success: false, error: 'A rejection reason is required when declining a cancellation request.' };
      }

      updated = {
        ...currentReq,
        cancellation_request_status: 'rejected',
        cancellation_rejected_reason: rejectionReason.trim(),
        cancellation_rejected_at: nowIso,
        updated_at: nowIso,
      };

      const shops: Shop[] = JSON.parse(localStorage.getItem(DEMO_SHOPS_KEY) || '[]');
      const shop = shops.find((s) => s.id === currentReq.shop_id);

      void notifyOrderLifecycle({
        event: 'CANCELLATION_REJECTED',
        requestId: updated.id,
        referenceCode: updated.reference_code,
        recipientId: updated.customer_id,
        recipientRole: 'customer',
        shopId: updated.shop_id,
        shopName: shop?.name || 'the shop',
        reason: rejectionReason.trim(),
      });
    }

    requests[index] = updated;
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(requests));

    return { success: true, request: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error processing cancellation response.';
    return { success: false, error: message };
  }
}

/**
 * 4. Fetch customer moderation status (checking active suspension, expiry, warnings)
 */
export async function fetchCustomerModeration(
  customerId: string
): Promise<CustomerModeration | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('customer_moderation')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();

      if (!error && data) {
        const mod = data as CustomerModeration;
        // Check auto-expiry
        if (mod.is_suspended && mod.suspension_expires_at && new Date(mod.suspension_expires_at).getTime() <= Date.now()) {
          mod.is_suspended = false;
        }
        return mod;
      }
    } catch { /* demo fallback */ }
  }

  const records = getStoredModerationRecords();
  const mod = records[customerId] || null;
  if (mod && mod.is_suspended && mod.suspension_expires_at && new Date(mod.suspension_expires_at).getTime() <= Date.now()) {
    mod.is_suspended = false;
    records[customerId] = mod;
    saveStoredModerationRecords(records);
  }
  return mod;
}

/**
 * 5. Fetch cancellation history for a customer
 */
export async function fetchCustomerCancellationHistory(
  customerId: string
): Promise<CustomerCancellationEvent[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('customer_cancellation_events')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data as CustomerCancellationEvent[];
      }
    } catch { /* demo fallback */ }
  }

  const events = getStoredCancellationEvents();
  return events
    .filter((e) => e.customer_id === customerId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * 6. Admin moderate customer (Suspend, Reinstate, Issue Warning, Clear Flag)
 */
export async function adminModerateCustomer(
  params: AdminModerateParams
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { customerId, action, reason, durationHours, adminId } = params;

  if (isSupabaseConfigured) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_moderate_customer', {
        p_customer_id: customerId,
        p_action: action,
        p_reason: reason.trim(),
        p_duration_hours: durationHours ?? null,
      });

      if (rpcErr || !rpcRes?.success) {
        return {
          success: false,
          error: rpcRes?.error || rpcErr?.message || 'Failed to apply moderation action.',
        };
      }

      if (action === 'suspend') {
        void notifyOrderLifecycle({
          event: 'CUSTOMER_SUSPENDED',
          requestId: 'admin-action',
          referenceCode: 'MODERATION',
          recipientId: customerId,
          recipientRole: 'customer',
          reason: reason.trim(),
        });
      } else if (action === 'issue_warning') {
        void notifyOrderLifecycle({
          event: 'CUSTOMER_WARNING',
          requestId: 'admin-action',
          referenceCode: 'MODERATION',
          recipientId: customerId,
          recipientRole: 'customer',
          reason: 'formal_warning',
        });
      }

      return { success: true, message: rpcRes.message };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error applying moderation action.';
      return { success: false, error: message };
    }
  }

  // Demo / Offline Mode
  try {
    const records = getStoredModerationRecords();
    const nowIso = new Date().toISOString();
    const mod = records[customerId] || {
      customer_id: customerId,
      is_suspended: false,
      flagged_for_review: false,
      warning_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (action === 'suspend') {
      const expiresAt =
        durationHours && durationHours > 0
          ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
          : null;

      mod.is_suspended = true;
      mod.suspension_reason = reason.trim();
      mod.suspended_at = nowIso;
      mod.suspension_expires_at = expiresAt;
      mod.suspended_by = adminId || 'admin-system';
      mod.updated_at = nowIso;
      records[customerId] = mod;
      saveStoredModerationRecords(records);

      void notifyOrderLifecycle({
        event: 'CUSTOMER_SUSPENDED',
        requestId: 'admin-action',
        referenceCode: 'MODERATION',
        recipientId: customerId,
        recipientRole: 'customer',
        reason: reason.trim(),
      });

      return { success: true, message: 'Customer ordering privileges suspended.' };
    }

    if (action === 'reinstate') {
      mod.is_suspended = false;
      mod.suspension_reason = null;
      mod.suspended_at = null;
      mod.suspension_expires_at = null;
      mod.suspended_by = null;
      mod.flagged_for_review = false;
      mod.admin_notes = `${mod.admin_notes ? `${mod.admin_notes}\n` : ''}[${nowIso}] Reinstated: ${reason.trim()}`;
      mod.updated_at = nowIso;
      records[customerId] = mod;
      saveStoredModerationRecords(records);

      return { success: true, message: 'Customer ordering privileges reinstated.' };
    }

    if (action === 'issue_warning') {
      mod.warning_count = (mod.warning_count || 0) + 1;
      mod.last_warning_at = nowIso;
      mod.last_warning_level = 'formal_warning';
      mod.admin_notes = `${mod.admin_notes ? `${mod.admin_notes}\n` : ''}[${nowIso}] Warning: ${reason.trim()}`;
      mod.updated_at = nowIso;
      records[customerId] = mod;
      saveStoredModerationRecords(records);

      void notifyOrderLifecycle({
        event: 'CUSTOMER_WARNING',
        requestId: 'admin-action',
        referenceCode: 'MODERATION',
        recipientId: customerId,
        recipientRole: 'customer',
        reason: 'formal_warning',
      });

      return { success: true, message: 'Formal warning issued to customer.' };
    }

    if (action === 'clear_flag') {
      mod.flagged_for_review = false;
      mod.flag_reason = null;
      mod.admin_notes = `${mod.admin_notes ? `${mod.admin_notes}\n` : ''}[${nowIso}] Flag cleared: ${reason.trim()}`;
      mod.updated_at = nowIso;
      records[customerId] = mod;
      saveStoredModerationRecords(records);

      return { success: true, message: 'Review flag cleared.' };
    }

    return { success: false, error: 'Invalid moderation action.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error executing moderation action.';
    return { success: false, error: message };
  }
}

/**
 * 7. Fetch all moderated customers for Admin Dashboard view
 */
export async function fetchAllModeratedCustomers(): Promise<CustomerModeration[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('customer_moderation')
        .select('*, profiles:customer_id(id, full_name, email, phone, role)')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return (data as any[]).map((row) => ({
          ...row,
          profile: row.profiles,
        }));
      }
    } catch { /* demo fallback */ }
  }

  const records = getStoredModerationRecords();
  return Object.values(records).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/**
 * 8. Fetch current cancellation policy settings
 */
export async function fetchCancellationPolicy(): Promise<CancellationPolicySettings> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('cancellation_policy_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        return data as CancellationPolicySettings;
      }
    } catch { /* fallback */ }
  }
  return getStoredPolicySettings();
}

/**
 * 9. Update cancellation policy settings (Admin only)
 */
export async function updateCancellationPolicy(
  settings: Partial<CancellationPolicySettings>
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const current = await fetchCancellationPolicy();
      const { error } = await supabase
        .from('cancellation_policy_settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('id', current.id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Error updating policy' };
    }
  }
  const current = getStoredPolicySettings();
  const updated = { ...current, ...settings, updated_at: new Date().toISOString() };
  saveStoredPolicySettings(updated);
  return { success: true };
}

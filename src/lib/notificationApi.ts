import { Notification, NotificationType } from '../types/notification';
import { supabase, isSupabaseConfigured } from './supabase';
import { sendBusinessPushNotification } from './pushNotifications';

export const DEMO_NOTIFICATIONS_KEY = 'vaango_demo_notifications';

/**
 * Default sample notifications for demo/offline exploration
 */
export const buildDefaultDemoNotifications = (recipientId: string, shopId?: string): Notification[] => {
  const now = Date.now();
  return [
    {
      id: `notif-${now - 1000 * 60 * 12}`,
      recipient_id: recipientId,
      shop_id: shopId,
      type: 'NEW_ORDER',
      title: 'New Pre-Order Placed',
      message: 'Customer placed an order (#ORD-9421) for 2 items. Total estimate: ₹650.',
      reference_id: 'req-order-1',
      reference_code: 'ORD-9421',
      is_read: false,
      created_at: new Date(now - 1000 * 60 * 12).toISOString(),
    },
    {
      id: `notif-${now - 1000 * 60 * 45}`,
      recipient_id: recipientId,
      shop_id: shopId,
      type: 'APPOINTMENT_REQUESTED',
      title: 'New Appointment Booking',
      message: 'New appointment requested (#APT-3312) for Hair Styling & Grooming at 2:00 PM.',
      reference_id: 'req-apt-1',
      reference_code: 'APT-3312',
      is_read: false,
      created_at: new Date(now - 1000 * 60 * 45).toISOString(),
    },
    {
      id: `notif-${now - 1000 * 60 * 60 * 3}`,
      recipient_id: recipientId,
      shop_id: shopId,
      type: 'PAYMENT_RECEIVED',
      title: 'Payment Verified',
      message: 'Payment of ₹450 verified for Order #ORD-8114.',
      reference_id: 'req-order-2',
      reference_code: 'ORD-8114',
      is_read: true,
      created_at: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    },
    {
      id: `notif-${now - 1000 * 60 * 60 * 5}`,
      recipient_id: recipientId,
      shop_id: shopId,
      type: 'STATUS_CHANGE',
      title: 'Order Completed',
      message: 'Order #ORD-7201 was marked completed and collected by customer.',
      reference_id: 'req-order-3',
      reference_code: 'ORD-7201',
      is_read: true,
      created_at: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
    },
  ];
};

/**
 * Fetch all notifications for a recipient / shop
 */
export const fetchShopNotifications = async (
  recipientId: string,
  shopId?: string
): Promise<Notification[]> => {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (shopId) {
        query = query.or(`shop_id.eq.${shopId},shop_id.is.null`);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data as Notification[];
      }
    } catch (err) {
      console.error('Error fetching notifications from Supabase:', err);
    }
  }

  // Fallback / Mock Mode
  try {
    const raw = localStorage.getItem(DEMO_NOTIFICATIONS_KEY);
    if (!raw) {
      const seeded = buildDefaultDemoNotifications(recipientId, shopId);
      localStorage.setItem(DEMO_NOTIFICATIONS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const allNotifs: Notification[] = JSON.parse(raw);
    const filtered = allNotifs.filter(
      (n) => n.recipient_id === recipientId || (shopId && n.shop_id === shopId)
    );
    return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.error('Error reading mock notifications:', err);
    return buildDefaultDemoNotifications(recipientId, shopId);
  }
};

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async (notificationId: string): Promise<boolean> => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (!error) {
        window.dispatchEvent(new CustomEvent('vaango-notifications-changed'));
        return true;
      }
    } catch (err) {
      console.error('Error marking notification read in Supabase:', err);
    }
  }

  try {
    const raw = localStorage.getItem(DEMO_NOTIFICATIONS_KEY);
    if (raw) {
      const all: Notification[] = JSON.parse(raw);
      const updated = all.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n));
      localStorage.setItem(DEMO_NOTIFICATIONS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('vaango-notifications-changed'));
      return true;
    }
  } catch (err) {
    console.error('Error marking notification read in mock storage:', err);
  }
  return false;
};

/**
 * Mark all notifications as read for a recipient
 */
export const markAllNotificationsAsRead = async (recipientId: string): Promise<boolean> => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', recipientId);
      if (!error) {
        window.dispatchEvent(new CustomEvent('vaango-notifications-changed'));
        return true;
      }
    } catch (err) {
      console.error('Error marking all notifications read in Supabase:', err);
    }
  }

  try {
    const raw = localStorage.getItem(DEMO_NOTIFICATIONS_KEY);
    if (raw) {
      const all: Notification[] = JSON.parse(raw);
      const updated = all.map((n) =>
        n.recipient_id === recipientId ? { ...n, is_read: true } : n
      );
      localStorage.setItem(DEMO_NOTIFICATIONS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('vaango-notifications-changed'));
      return true;
    }
  } catch (err) {
    console.error('Error marking all notifications read in mock storage:', err);
  }
  return false;
};

/**
 * Create a new operational notification (e.g. order placed, cancelled, appointment booked)
 * Includes deduplication protection to prevent duplicate events for the same transition.
 */
export const createNotification = async (
  payload: Omit<Notification, 'id' | 'is_read' | 'created_at'>
): Promise<Notification> => {
  // 1. Supabase deduplication check: avoid creating identical notifications for the same reference
  if (isSupabaseConfigured && payload.reference_id && payload.recipient_id) {
    try {
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', payload.recipient_id)
        .eq('reference_id', payload.reference_id)
        .eq('type', payload.type)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        return existing[0] as Notification;
      }
    } catch (dedupErr) {
      console.warn('[NotificationApi] Supabase dedup check warning:', dedupErr);
    }
  }

  // 2. Demo / mock storage deduplication check:
  try {
    const raw = localStorage.getItem(DEMO_NOTIFICATIONS_KEY);
    if (raw && payload.reference_id) {
      const existing: Notification[] = JSON.parse(raw);
      const dup = existing.find(
        (n) =>
          n.recipient_id === payload.recipient_id &&
          n.reference_id === payload.reference_id &&
          n.type === payload.type
      );
      if (dup) {
        return dup;
      }
    }
  } catch (dedupErr) {
    console.warn('[NotificationApi] Mock dedup check warning:', dedupErr);
  }

  const newNotif: Notification = {
    ...payload,
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('vaangly_create_admin_notification', {
        p_recipient_id: payload.recipient_id,
        p_shop_id: payload.shop_id || null,
        p_type: payload.type,
        p_title: payload.title,
        p_message: payload.message,
        p_reference_id: payload.reference_id || null,
        p_reference_code: payload.reference_code || null,
      });

      if (!error && data) {
        window.dispatchEvent(new CustomEvent('vaango-notifications-changed'));
        return data as Notification;
      }
    } catch (err) {
      console.error('Error creating notification in Supabase:', err);
    }
  }

  try {
    const raw = localStorage.getItem(DEMO_NOTIFICATIONS_KEY);
    const existing: Notification[] = raw ? JSON.parse(raw) : [];
    existing.unshift(newNotif);
    localStorage.setItem(DEMO_NOTIFICATIONS_KEY, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent('vaango-notifications-changed'));
  } catch (err) {
    console.error('Error saving notification in mock storage:', err);
  }

  return newNotif;
};

export interface OrderLifecycleNotificationParams {
  event:
    | 'ORDER_PLACED'
    | 'ORDER_ACCEPTED'
    | 'ORDER_REJECTED'
    | 'ORDER_PREPARING'
    | 'ORDER_DELAYED'
    | 'PAYMENT_PROOF_UPLOADED'
    | 'PAYMENT_VERIFIED'
    | 'PAYMENT_REJECTED'
    | 'ORDER_READY'
    | 'OUT_FOR_DELIVERY'
    | 'ORDER_COMPLETED'
    | 'ORDER_CANCELLED'
    | 'REFUND_COMPLETED';
  requestId: string;
  referenceCode: string;
  recipientId: string;
  recipientRole?: 'customer' | 'shopkeeper';
  shopId?: string | null;
  shopName?: string;
  customerName?: string;
  reason?: string;
  notes?: string;
  refundAmount?: number;
  refundMethod?: string;
  pickupAt?: string | null;
  fulfillmentType?: string | null;
  totalEstimate?: number | null;
  customerPaid?: boolean;
}

/**
 * Canonical helper for dispatching order lifecycle notifications.
 * Guarantees consistent copy, deduplication, in-app notification rows, and push notification attempts.
 */
export const notifyOrderLifecycle = async (
  params: OrderLifecycleNotificationParams
): Promise<Notification | null> => {
  const {
    event,
    requestId,
    referenceCode,
    recipientId,
    recipientRole = 'customer',
    shopId,
    shopName = 'the shop',
    customerName = 'Customer',
    reason,
    notes,
    refundAmount,
    refundMethod,
    pickupAt,
    fulfillmentType,
    totalEstimate,
    customerPaid,
  } = params;

  if (!recipientId) return null;

  let title = '';
  let message = '';
  let type: NotificationType = 'STATUS_CHANGE';

  const isPickup =
    fulfillmentType === 'pickup' ||
    fulfillmentType === 'TAKEAWAY' ||
    fulfillmentType === 'parcel' ||
    Boolean(pickupAt);

  switch (event) {
    case 'ORDER_PLACED':
      if (recipientRole === 'shopkeeper') {
        type = 'NEW_ORDER';
        title = pickupAt ? 'New order received (Scheduled Pickup)' : 'New order received';
        message = `New order #${referenceCode} received from ${customerName}. Open Vaangly to view the order.`;
      } else {
        type = 'ORDER_PLACED';
        title = pickupAt ? 'Order Placed (Scheduled Pickup)' : 'Order Placed';
        message = pickupAt
          ? `Your order #${referenceCode} has been placed for scheduled pickup.`
          : `Your order #${referenceCode} has been placed.`;
      }
      break;

    case 'ORDER_ACCEPTED':
      type = 'ORDER_ACCEPTED';
      title = 'Order Accepted';
      message = `Your order #${referenceCode} has been accepted by ${shopName}.`;
      break;

    case 'ORDER_REJECTED': {
      type = 'ORDER_REJECTED';
      title = 'Order Rejected';
      const reasonPart = reason ? ` Reason: ${reason}.` : '';
      const refundPart =
        refundAmount && refundAmount > 0
          ? ` Refund of ₹${refundAmount} has been marked as required.`
          : '';
      message = `Your order #${referenceCode} was rejected by ${shopName}.${reasonPart}${refundPart}`;
      break;
    }

    case 'ORDER_PREPARING':
      type = 'ORDER_PREPARING';
      title = 'Order Preparing';
      message = `Your order #${referenceCode} is being prepared.`;
      break;

    case 'ORDER_DELAYED':
      type = 'ORDER_DELAYED';
      title = 'Order Delayed';
      message = `Your order #${referenceCode} is delayed.${reason || notes ? ` ${(reason || notes)?.trim()}` : ''}`;
      break;

    case 'PAYMENT_PROOF_UPLOADED':
      type = 'PAYMENT_PROOF_UPLOADED';
      title = 'Payment Proof Uploaded';
      message = `Payment proof uploaded for order #${referenceCode}. Please verify the payment.`;
      break;

    case 'PAYMENT_VERIFIED':
      type = 'PAYMENT_RECEIVED';
      title = 'Payment Verified';
      message = `Payment for order #${referenceCode} has been verified.`;
      break;

    case 'PAYMENT_REJECTED':
      type = 'PAYMENT_REJECTED';
      title = 'Payment Rejected';
      message = `Payment verification for order #${referenceCode} was rejected: ${reason || 'Invalid screenshot'}. Please submit a replacement proof.`;
      break;

    case 'ORDER_READY':
      type = 'ORDER_READY';
      if (isPickup) {
        title = 'Order Ready for Pickup';
        message = `Your order #${referenceCode} is ready for pickup at ${shopName}.`;
      } else {
        title = 'Order Ready';
        message = `Your order #${referenceCode} is ready.`;
      }
      break;

    case 'OUT_FOR_DELIVERY':
      type = 'ORDER_DELIVERY';
      title = 'Out for Delivery';
      message = `Your order #${referenceCode} is out for delivery.`;
      break;

    case 'ORDER_COMPLETED':
      type = 'ORDER_COMPLETED';
      title = 'Order Completed';
      message =
        !customerPaid && totalEstimate && totalEstimate > 0
          ? `Your order #${referenceCode} has been completed, but payment of ₹${totalEstimate} is awaiting verification.`
          : `Your order #${referenceCode} has been completed.`;
      break;

    case 'ORDER_CANCELLED':
      type = 'CUSTOMER_CANCELLED';
      title = 'Order Cancelled';
      if (recipientRole === 'shopkeeper') {
        message = `Order #${referenceCode} was cancelled by the customer.${reason ? ` Reason: ${reason}` : ''}`;
      } else {
        message = reason
          ? `Your order #${referenceCode} was cancelled by ${shopName}. Reason: ${reason}`
          : `Your order #${referenceCode} has been cancelled.`;
      }
      break;

    case 'REFUND_COMPLETED':
      type = 'REFUND_EVENT';
      title = 'Refund Completed';
      message = `Refund of ₹${refundAmount ?? 0} for order #${referenceCode} has been completed via ${refundMethod || 'original method'}.`;
      break;

    default:
      title = `Order #${referenceCode} Updated`;
      message = `Your order #${referenceCode} has a status update.`;
      break;
  }

  // 1. Create in-app notification row (with deduplication)
  const notif = await createNotification({
    recipient_id: recipientId,
    shop_id: shopId || null,
    type,
    title,
    message,
    reference_id: requestId,
    reference_code: referenceCode,
  });

  // 2. Dispatch push notification if recipient has push active
  const targetUrl =
    recipientRole === 'shopkeeper'
      ? `/shopkeeper/requests/${requestId}`
      : `/request/${requestId}`;

  try {
    await sendBusinessPushNotification({
      userId: recipientId,
      title,
      body: message,
      url: targetUrl,
    });
  } catch (pushErr) {
    console.warn('[NotificationApi] Push notification delivery skipped/failed:', pushErr);
  }

  return notif;
};

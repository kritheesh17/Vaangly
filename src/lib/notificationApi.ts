import { Notification } from '../types/notification';
import { supabase, isSupabaseConfigured } from './supabase';

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
 */
export const createNotification = async (
  payload: Omit<Notification, 'id' | 'is_read' | 'created_at'>
): Promise<Notification> => {
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

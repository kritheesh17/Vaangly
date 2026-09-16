export type NotificationType =
  | 'NEW_ORDER'
  | 'CUSTOMER_CANCELLED'
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CANCELLED'
  | 'STATUS_CHANGE'
  | 'PAYMENT_RECEIVED'
  | 'APPLICATION_STATUS';

export interface Notification {
  id: string;
  recipient_id: string;
  shop_id?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  reference_id?: string | null;
  reference_code?: string | null;
  is_read: boolean;
  created_at: string;
}

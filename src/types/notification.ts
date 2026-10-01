export type NotificationType =
  | 'NEW_ORDER'
  | 'ORDER_PLACED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_REJECTED'
  | 'ORDER_PREPARING'
  | 'ORDER_DELAYED'
  | 'ORDER_READY'
  | 'ORDER_DELIVERY'
  | 'ORDER_COMPLETED'
  | 'CUSTOMER_CANCELLED'
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CANCELLED'
  | 'STATUS_CHANGE'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_PROOF_UPLOADED'
  | 'REFUND_EVENT'
  | 'APPLICATION_STATUS'
  | 'PRODUCT_WARNING'
  | 'PRODUCT_BANNED'
  | 'PRODUCT_UNBANNED';

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

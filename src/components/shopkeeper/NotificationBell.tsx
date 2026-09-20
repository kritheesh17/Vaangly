import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ShoppingBag,
  Calendar,
  XCircle,
  CreditCard,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Notification, NotificationType } from '../../types/notification';
import {
  fetchShopNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../lib/notificationApi';
import { useAuth } from '../../context/AuthContext';
import './NotificationBell.css';

interface NotificationBellProps {
  shopId?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ shopId }) => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifs = async () => {
    if (!user) return;
    try {
      const list = await fetchShopNotifications(user.id, shopId);
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    loadNotifs();

    const handleUpdate = () => {
      loadNotifs();
    };

    window.addEventListener('vaango-notifications-changed', handleUpdate);
    window.addEventListener('vaango-requests-changed', handleUpdate);

    // Close on outside click
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('vaango-notifications-changed', handleUpdate);
      window.removeEventListener('vaango-requests-changed', handleUpdate);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user, shopId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleNotificationClick = async (notif: Notification) => {
    try {
      if (!notif.is_read) {
        await markNotificationAsRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    } finally {
      setIsOpen(false);
      if (role === 'shopkeeper') {
        if (notif.reference_id) {
          navigate(`/shopkeeper/requests/${notif.reference_id}`);
        } else {
          navigate('/shopkeeper/requests');
        }
      } else {
        if (notif.reference_id) {
          navigate(`/request/${notif.reference_id}`);
        } else {
          navigate('/orders');
        }
      }
    }
  };

  const handleMarkAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await markAllNotificationsAsRead(user.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const renderIcon = (type: NotificationType) => {
    switch (type) {
      case 'NEW_ORDER':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--order">
            <ShoppingBag size={16} />
          </div>
        );
      case 'APPOINTMENT_REQUESTED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--appointment">
            <Calendar size={16} />
          </div>
        );
      case 'CUSTOMER_CANCELLED':
      case 'APPOINTMENT_CANCELLED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--cancel">
            <XCircle size={16} />
          </div>
        );
      case 'PAYMENT_RECEIVED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--payment">
            <CreditCard size={16} />
          </div>
        );
      default:
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--order">
            <CheckCircle2 size={16} />
          </div>
        );
    }
  };

  return (
    <div className="vaango-notif-bell-wrap" ref={containerRef}>
      <button
        type="button"
        className="vaango-notif-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
        title="Storefront Operational Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="vaango-notif-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="vaango-notif-dropdown">
          <div className="vaango-notif-dropdown__header">
            <h3 className="vaango-notif-dropdown__title">Operational Alerts</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                className="vaango-notif-dropdown__mark-all"
                onClick={handleMarkAll}
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="vaango-notif-empty">
              <AlertCircle size={24} />
              <span>No notifications yet. New orders and updates will appear here.</span>
            </div>
          ) : (
            <ul className="vaango-notif-list">
              {notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    type="button"
                    className={`vaango-notif-item ${!notif.is_read ? 'vaango-notif-item--unread' : ''}`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    {renderIcon(notif.type)}
                    <div className="vaango-notif-item__content">
                      <div className="vaango-notif-item__top">
                        <span className="vaango-notif-item__title">{notif.title}</span>
                        <span className="vaango-notif-item__time">
                          {formatTimeAgo(notif.created_at)}
                        </span>
                      </div>
                      <p className="vaango-notif-item__msg">{notif.message}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

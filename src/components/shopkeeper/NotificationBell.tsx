import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ShoppingBag,
  Calendar,
  XCircle,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Truck,
  Clock,
  X,
} from 'lucide-react';
import { Notification, NotificationType } from '../../types/notification';
import {
  fetchShopNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../lib/notificationApi';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { NotificationBadge } from '../ui/NotificationBadge';
import './NotificationBell.css';

interface NotificationBellProps {
  shopId?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ shopId }) => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userId = user?.id;

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Viewport padding: 12px margin on mobile and desktop viewport edges
    const viewportPadding = 12;
    // Standard dropdown width: 380px, clamped to viewport width minus margins
    const panelWidth = Math.min(380, Math.max(280, viewportWidth - viewportPadding * 2));

    // Vertical positioning: directly below the bell icon with an 8px gap
    const top = Math.round(buttonRect.bottom + 8);
    // Height constrained to prevent bottom screen overflow
    const maxHeight = Math.max(220, Math.min(480, viewportHeight - top - 16));

    // Horizontal positioning strategy:
    // If the bell is in the right half of the screen, align dropdown right edge with button right edge.
    // If the bell is in the left half of the screen, align dropdown left edge with button left edge.
    // Otherwise center under the bell.
    let idealLeft: number;
    if (buttonRect.left > viewportWidth / 2) {
      idealLeft = buttonRect.right - panelWidth;
    } else if (buttonRect.right < viewportWidth / 2) {
      idealLeft = buttonRect.left;
    } else {
      idealLeft = buttonRect.left + buttonRect.width / 2 - panelWidth / 2;
    }

    // Viewport containment: strictly clamp within [viewportPadding, viewportWidth - panelWidth - viewportPadding]
    const minLeft = viewportPadding;
    const maxLeft = Math.max(minLeft, viewportWidth - panelWidth - viewportPadding);
    const clampedLeft = Math.max(minLeft, Math.min(idealLeft, maxLeft));

    setDropdownStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${clampedLeft}px`,
      width: `${panelWidth}px`,
      maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
      maxHeight: `${maxHeight}px`,
    });
  }, []);

  // Update position synchronously before paint whenever dropdown opens
  React.useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Keep dropdown anchored directly below the bell during resize and scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleResizeOrScroll = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleResizeOrScroll, { passive: true });
    window.addEventListener('scroll', handleResizeOrScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll);
    };
  }, [isOpen, updatePosition]);

  const loadNotifs = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await fetchShopNotifications(userId, shopId);
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [shopId, userId]);

  useEffect(() => {
    void loadNotifs();

    const handleUpdate = () => {
      loadNotifs();
    };

    window.addEventListener('vaango-notifications-changed', handleUpdate);
    window.addEventListener('vaango-requests-changed', handleUpdate);

    // Supabase Realtime live sync
    if (isSupabaseConfigured && userId) {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current).catch((err: unknown) => {
          console.error('Failed to remove previous notification channel:', err);
        });
        channelRef.current = null;
      }

      const channel = supabase.channel(`user-notifications-${userId}`);
      try {
        channel
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `recipient_id=eq.${userId}`,
            },
            () => {
              void loadNotifs();
            }
          );

        channelRef.current = channel;
        channel.subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Notification realtime subscription failed:', error || status);
          }
        });
      } catch (err) {
        console.error('Failed to initialize notification realtime subscription:', err);
        if (channelRef.current === channel) {
          channelRef.current = null;
        }
        void supabase.removeChannel(channel).catch((removeError: unknown) => {
          console.error('Failed to clean up notification channel:', removeError);
        });
      }
    }

    // Close on outside click or Escape key
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('vaango-notifications-changed', handleUpdate);
      window.removeEventListener('vaango-requests-changed', handleUpdate);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (channelRef.current) {
        const channel = channelRef.current;
        channelRef.current = null;
        void supabase.removeChannel(channel).catch((err: unknown) => {
          console.error('Failed to remove notification channel:', err);
        });
      }
    };
  }, [loadNotifs, shopId, userId]);

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
        if (
          notif.type === 'PRODUCT_WARNING' ||
          notif.type === 'PRODUCT_BANNED' ||
          notif.type === 'PRODUCT_UNBANNED' ||
          notif.type === 'APPLICATION_STATUS'
        ) {
          navigate('/shopkeeper/catalogue');
        } else if (notif.reference_id) {
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
      case 'PRODUCT_WARNING':
        return (
          <div className="vaango-notif-item__icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
            <AlertCircle size={16} />
          </div>
        );
      case 'PRODUCT_BANNED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--cancel">
            <XCircle size={16} />
          </div>
        );
      case 'PRODUCT_UNBANNED':
        return (
          <div className="vaango-notif-item__icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <CheckCircle2 size={16} />
          </div>
        );
      case 'NEW_ORDER':
      case 'ORDER_PLACED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--order">
            <ShoppingBag size={16} />
          </div>
        );
      case 'ORDER_DELIVERY':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--delivery">
            <Truck size={16} />
          </div>
        );
      case 'ORDER_DELAYED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--delayed">
            <Clock size={16} />
          </div>
        );
      case 'APPOINTMENT_REQUESTED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--appointment">
            <Calendar size={16} />
          </div>
        );
      case 'ORDER_REJECTED':
      case 'PAYMENT_REJECTED':
      case 'CUSTOMER_CANCELLED':
      case 'APPOINTMENT_CANCELLED':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--cancel">
            <XCircle size={16} />
          </div>
        );
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_PROOF_UPLOADED':
      case 'REFUND_EVENT':
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--payment">
            <CreditCard size={16} />
          </div>
        );
      case 'ORDER_ACCEPTED':
      case 'ORDER_PREPARING':
      case 'ORDER_READY':
      case 'ORDER_COMPLETED':
      default:
        return (
          <div className="vaango-notif-item__icon vaango-notif-item__icon--ready">
            <CheckCircle2 size={16} />
          </div>
        );
    }
  };

  return (
    <div className="vaango-notif-bell-wrap" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="vaango-notif-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
        title="Storefront Operational Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        <NotificationBadge count={unreadCount} position="overlap" size="sm" />
      </button>

      {isOpen && (
        <>
          <div
            className="vaango-notif-backdrop"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={dropdownRef}
            className="vaango-notif-dropdown"
            style={dropdownStyle}
            role="region"
            aria-label="Operational Notifications"
          >
            <div className="vaango-notif-dropdown__header">
              <h3 className="vaango-notif-dropdown__title">Operational Alerts</h3>
              <div className="vaango-notif-dropdown__actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="vaango-notif-dropdown__mark-all"
                    onClick={handleMarkAll}
                  >
                    Mark all as read
                  </button>
                )}
                <button
                  type="button"
                  className="vaango-notif-dropdown__close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>
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
        </>
      )}
    </div>
  );
};

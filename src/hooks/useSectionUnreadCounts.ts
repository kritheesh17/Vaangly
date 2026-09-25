import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchAdminApplications } from '../lib/adminApi';
import { adminFetchMasterProducts } from '../lib/masterCatalogueApi';
import { getShopkeeperShop, getShopRequests } from '../lib/shopkeeperApi';
import { getStoredDemoRequests } from '../lib/demoData';
import { Request } from '../types/database';

export interface SectionUnreadCounts {
  pendingApplications: number;
  pendingCatalogue: number;
  shopkeeperNewRequests: number;
  customerActiveOrders: number;
  refresh: () => void;
}

export function useSectionUnreadCounts(): SectionUnreadCounts {
  const { user, role } = useAuth();
  const [pendingApplications, setPendingApplications] = useState<number>(0);
  const [pendingCatalogue, setPendingCatalogue] = useState<number>(0);
  const [shopkeeperNewRequests, setShopkeeperNewRequests] = useState<number>(0);
  const [customerActiveOrders, setCustomerActiveOrders] = useState<number>(0);

  const loadCounts = useCallback(async () => {
    // 1. Admin counts
    if (role === 'admin') {
      try {
        const apps = await fetchAdminApplications({ status: 'submitted' });
        setPendingApplications(apps.filter((a) => a.status === 'submitted').length);
      } catch (e) {
        console.error('Error fetching pending applications count:', e);
      }

      try {
        const prods = await adminFetchMasterProducts({ status: 'pending' });
        setPendingCatalogue(prods.filter((p) => p.status === 'pending').length);
      } catch (e) {
        console.error('Error fetching pending master catalogue count:', e);
      }
    }

    // 2. Shopkeeper counts
    if (role === 'shopkeeper' && user) {
      try {
        const shop = await getShopkeeperShop(user.id);
        if (shop) {
          const reqs = await getShopRequests(shop.id);
          const newCount = reqs.filter((r) => r.current_state === 'REQUESTED').length;
          setShopkeeperNewRequests(newCount);
        }
      } catch (e) {
        console.error('Error fetching shopkeeper new requests count:', e);
      }
    }

    // 3. Customer active orders count
    if (user && role !== 'admin') {
      try {
        if (isSupabaseConfigured) {
          const { data } = await supabase
            .from('requests')
            .select('id, current_state')
            .eq('customer_id', user.id);
          if (data) {
            const activeCount = data.filter((r: any) =>
              ['REQUESTED', 'ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY'].includes(
                r.current_state
              )
            ).length;
            setCustomerActiveOrders(activeCount);
          }
        } else {
          const stored = getStoredDemoRequests();
          const activeCount = stored.filter(
            (r: Request) =>
              r.customer_id === user.id &&
              ['REQUESTED', 'ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY'].includes(
                r.current_state
              )
          ).length;
          setCustomerActiveOrders(activeCount);
        }
      } catch (e) {
        console.error('Error fetching customer active orders count:', e);
      }
    }
  }, [user, role]);

  useEffect(() => {
    void loadCounts();

    const handleUpdate = () => {
      void loadCounts();
    };

    window.addEventListener('vaango-applications-changed', handleUpdate);
    window.addEventListener('vaango-catalogue-changed', handleUpdate);
    window.addEventListener('vaango-requests-changed', handleUpdate);
    window.addEventListener('vaango-shops-changed', handleUpdate);

    return () => {
      window.removeEventListener('vaango-applications-changed', handleUpdate);
      window.removeEventListener('vaango-catalogue-changed', handleUpdate);
      window.removeEventListener('vaango-requests-changed', handleUpdate);
      window.removeEventListener('vaango-shops-changed', handleUpdate);
    };
  }, [loadCounts]);

  return {
    pendingApplications,
    pendingCatalogue,
    shopkeeperNewRequests,
    customerActiveOrders,
    refresh: loadCounts,
  };
}

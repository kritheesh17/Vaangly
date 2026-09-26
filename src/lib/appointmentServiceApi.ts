import { AppointmentSlot, ShopService, Request, RequestEvent, PriceType, SlotConfig } from '../types/database';
import { supabase, isSupabaseConfigured } from './supabase';
import { getShopServices as getMockServices, generateDailySlots } from '../data/mockData';
import { normalizeIndianPhone } from './phoneUtils';
import {
  parseTimeToMinutes,
  minutesToFormattedTime,
  validateWorkingHoursAndBreaks,
  type WorkingPeriodInput,
  type BreakInput,
  type ValidationResult,
} from './appointmentValidation';

export {
  parseTimeToMinutes,
  minutesToFormattedTime,
  validateWorkingHoursAndBreaks,
  type WorkingPeriodInput,
  type BreakInput,
  type ValidationResult,
};

const DEMO_REQUESTS_KEY = 'vaango_demo_requests';
const DEMO_REQUEST_EVENTS_KEY = 'vaango_demo_request_events';
const DEMO_SERVICES_KEY = 'vaango_demo_services';
const DEMO_SLOTS_KEY = 'vaango_demo_slots';

/**
 * 1. Fetch Services for a Shop
 */
export const fetchShopServices = async (shopId: string): Promise<ShopService[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('shop_services')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as ShopService[];
      }
    } catch (err) {
      console.error('Error fetching services from Supabase:', err);
    }
  }

  // Fallback / Mock Mode
  try {
    const raw = localStorage.getItem(DEMO_SERVICES_KEY);
    if (raw) {
      const allServices: Record<string, ShopService[]> = JSON.parse(raw);
      if (allServices[shopId]) {
        return allServices[shopId];
      }
    }
  } catch (err) {
    console.error('Error reading mock services:', err);
  }

  return getMockServices(shopId);
};

/**
 * 2. Fetch Available Appointment Slots for a Shop on a specific date
 */
export const fetchAppointmentSlots = async (shopId: string, dateStr: string): Promise<AppointmentSlot[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('appointment_slots')
        .select('*')
        .eq('shop_id', shopId)
        .eq('slot_date', dateStr)
        .order('start_time', { ascending: true });

      if (!error && data && data.length > 0) {
        const nextDate = new Date(`${dateStr}T00:00:00`);
        nextDate.setDate(nextDate.getDate() + 1);
        const { data: requests } = await supabase
          .from('requests')
          .select('notes, current_state, scheduled_for')
          .eq('shop_id', shopId)
          .eq('workflow_group_code', 'APPOINTMENT')
          .in('current_state', ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS'])
          .gte('scheduled_for', `${dateStr} 00:00:00`)
          .lt('scheduled_for', `${nextDate.toISOString().slice(0, 10)} 00:00:00`);
        const bookedBySlot = new Map<string, number>();
        (requests || []).forEach((request) => {
          try {
            const slotId = JSON.parse(request.notes || '{}').slot_id;
            if (slotId) bookedBySlot.set(slotId, (bookedBySlot.get(slotId) || 0) + 1);
          } catch {
            // Ignore malformed legacy notes.
          }
        });
        return (data as AppointmentSlot[]).map((slot) => {
          const bookedCount = bookedBySlot.get(slot.id) || 0;
          const capacity = slot.concurrent_capacity || 1;
          return { ...slot, booked_count: bookedCount, is_available: bookedCount < capacity };
        });
      }
    } catch (err) {
      console.error('Error fetching appointment slots from Supabase:', err);
    }
  }

  // Fallback / Mock Mode with persistent local storage
  try {
    const raw = localStorage.getItem(DEMO_SLOTS_KEY);
    let allSlots: Record<string, AppointmentSlot[]> = raw ? JSON.parse(raw) : {};
    const key = `${shopId}_${dateStr}`;

    if (!allSlots[key]) {
      allSlots[key] = generateDailySlots(shopId, dateStr);
      localStorage.setItem(DEMO_SLOTS_KEY, JSON.stringify(allSlots));
    }
    return allSlots[key];
  } catch (err) {
    console.error('Error reading mock slots:', err);
    return generateDailySlots(shopId, dateStr);
  }
};

/**
 * 3. Book Appointment Request (with concurrency double-booking prevention)
 */
export interface BookAppointmentParams {
  shopId: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  service: ShopService;
  slot: AppointmentSlot;
  customerId: string;
  customerName: string;
  customerPhone: string;
  notes?: string;
}

export const bookAppointmentRequest = async (
  params: BookAppointmentParams
): Promise<{ success: boolean; request?: Request; error?: string }> => {
  const {
    shopId,
    shopName,
    shopAddress,
    shopPhone,
    service,
    slot,
    customerId,
    customerName,
    customerPhone,
    notes,
  } = params;

  const referenceCode = `APT-${Math.floor(1000 + Math.random() * 9000)}`;

  const appointmentPayload = {
    service_id: service.id,
    service_name: service.name,
    provider_name: service.provider_name,
    specialization: service.specialization,
    slot_id: slot.id,
    slot_date: slot.slot_date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    duration_minutes: service.duration_minutes,
    price: service.base_price || service.min_price || 0,
    customer_name: customerName,
    customer_phone: customerPhone,
    notes: notes?.trim() || null,
    shop_name: shopName,
    shop_address: shopAddress,
    shop_phone: shopPhone,
  };

  if (isSupabaseConfigured) {
    try {
      const normalizedCustomerPhone = customerPhone ? (normalizeIndianPhone(customerPhone) || customerPhone) : null;
      // Step 1: Create request record
      const { data: reqData, error: reqErr } = await supabase
        .from('requests')
        .insert({
          reference_code: referenceCode,
          customer_id: customerId,
          customer_phone: normalizedCustomerPhone,
          shop_id: shopId,
          workflow_group_code: 'APPOINTMENT',
          current_state: 'REQUESTED',
          total_estimate: service.base_price || service.min_price || 0,
          scheduled_for: `${slot.slot_date} ${slot.start_time}`,
          notes: JSON.stringify(appointmentPayload),
        })
        .select()
        .single();

      if (reqErr || !reqData) {
        throw new Error(reqErr?.message || 'Failed to create appointment request.');
      }

      // Step 2: Atomically lock and reserve the slot using database function
      const { data: slotBooked, error: slotErr } = await supabase.rpc('book_appointment_slot', {
        p_slot_id: slot.id,
        p_request_id: reqData.id,
      });

      if (slotErr || !slotBooked) {
        // Rollback request if slot already taken
        await supabase.from('requests').delete().eq('id', reqData.id);
        return {
          success: false,
          error: 'That appointment slot was just booked by someone else. Please choose another time.',
        };
      }

      // Step 3: Insert initial request event
      await supabase.from('request_events').insert({
        request_id: reqData.id,
        from_state: null,
        to_state: 'REQUESTED',
        actor_id: customerId,
        actor_role: 'customer',
        notes: `Customer requested appointment for ${service.name} at ${slot.start_time}`,
      });

      return { success: true, request: reqData as Request };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error booking appointment.';
      return { success: false, error: msg };
    }
  }

  // Mock / Demo Mode with atomic double-booking check
  try {
    const rawSlots = localStorage.getItem(DEMO_SLOTS_KEY);
    const allSlots: Record<string, AppointmentSlot[]> = rawSlots ? JSON.parse(rawSlots) : {};
    const key = `${shopId}_${slot.slot_date}`;
    const slotsForDay = allSlots[key] || generateDailySlots(shopId, slot.slot_date);

    const slotIndex = slotsForDay.findIndex((s) => s.id === slot.id);
    if (slotIndex === -1) {
      return {
        success: false,
        error: 'That appointment slot was just booked by someone else. Please choose another time.',
      };
    }

    const capacity = slotsForDay[slotIndex].concurrent_capacity || 1;
    const bookedCount = slotsForDay[slotIndex].booked_count || 0;
    if (bookedCount >= capacity) {
      return {
        success: false,
        error: 'That appointment slot was just booked by someone else. Please choose another time.',
      };
    }

    // Reserve one unit of slot capacity.
    const newRequestId = `req-apt-${Date.now()}`;
    slotsForDay[slotIndex] = {
      ...slotsForDay[slotIndex],
      is_available: bookedCount + 1 < capacity,
      booked_count: bookedCount + 1,
      booked_by_request_id: bookedCount === 0 ? newRequestId : slotsForDay[slotIndex].booked_by_request_id,
    };
    allSlots[key] = slotsForDay;
    localStorage.setItem(DEMO_SLOTS_KEY, JSON.stringify(allSlots));
    window.dispatchEvent(new CustomEvent('vaango-slots-changed', { detail: { shopId, dateStr: slot.slot_date } }));

    // Create Request
    const createdRequest: Request = {
      id: newRequestId,
      customer_id: customerId,
      shop_id: shopId,
      workflow_group_code: 'APPOINTMENT',
      current_state: 'REQUESTED',
      reference_code: referenceCode,
      total_estimate: service.base_price || service.min_price || 0,
      customer_paid: false,
      notes: JSON.stringify(appointmentPayload),
      scheduled_for: `${slot.slot_date} ${slot.start_time}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingRequests: Request[] = JSON.parse(localStorage.getItem(DEMO_REQUESTS_KEY) || '[]');
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify([createdRequest, ...existingRequests]));
    window.dispatchEvent(new CustomEvent('vaango-requests-changed', { detail: { newRequest: createdRequest } }));

    // Audit Event
    const existingEvents: RequestEvent[] = JSON.parse(
      localStorage.getItem(DEMO_REQUEST_EVENTS_KEY) || '[]'
    );
    existingEvents.push({
      id: `evt-${Date.now()}`,
      request_id: newRequestId,
      from_state: null,
      to_state: 'REQUESTED',
      actor_id: customerId,
      actor_role: 'customer',
      notes: `Customer requested appointment for ${service.name} at ${slot.start_time}`,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(DEMO_REQUEST_EVENTS_KEY, JSON.stringify(existingEvents));

    return { success: true, request: createdRequest };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error processing appointment booking.';
    return { success: false, error: msg };
  }
};

/**
 * 4. Submit Service Request (Fixed or Range Pricing)
 */
export interface SubmitServiceParams {
  shopId: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  service: ShopService;
  customerId: string;
  customerName: string;
  customerPhone: string;
  notes?: string;
}

export const submitServiceRequest = async (
  params: SubmitServiceParams
): Promise<{ success: boolean; request?: Request; error?: string }> => {
  const {
    shopId,
    shopName,
    shopAddress,
    shopPhone,
    service,
    customerId,
    customerName,
    customerPhone,
    notes,
  } = params;

  const referenceCode = `SRV-${Math.floor(1000 + Math.random() * 9000)}`;

  const servicePayload = {
    service_id: service.id,
    service_name: service.name,
    service_category: service.service_category,
    provider_name: service.provider_name,
    price_type: service.price_type,
    estimated_price: service.base_price,
    min_price: service.min_price,
    max_price: service.max_price,
    confirmed_price: service.price_type === 'fixed' ? service.base_price : null,
    customer_name: customerName,
    customer_phone: customerPhone,
    notes: notes?.trim() || null,
    shop_name: shopName,
    shop_address: shopAddress,
    shop_phone: shopPhone,
  };

  const initialEstimate = service.base_price || service.min_price || 0;

  if (isSupabaseConfigured) {
    try {
      const { data: reqData, error: reqErr } = await supabase
        .from('requests')
        .insert({
          reference_code: referenceCode,
          customer_id: customerId,
          shop_id: shopId,
          workflow_group_code: 'SERVICE',
          current_state: 'REQUESTED',
          total_estimate: initialEstimate,
          notes: JSON.stringify(servicePayload),
        })
        .select()
        .single();

      if (reqErr || !reqData) {
        throw new Error(reqErr?.message || 'Failed to submit service request.');
      }

      await supabase.from('request_events').insert({
        request_id: reqData.id,
        from_state: null,
        to_state: 'REQUESTED',
        actor_id: customerId,
        actor_role: 'customer',
        notes: `Customer requested service: ${service.name} (${service.price_type === 'range' ? `Est ₹${service.min_price}–₹${service.max_price}` : `₹${service.base_price}`})`,
      });

      return { success: true, request: reqData as Request };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error submitting service.';
      return { success: false, error: msg };
    }
  }

  // Mock / Demo Mode
  try {
    const newRequestId = `req-srv-${Date.now()}`;
    const createdRequest: Request = {
      id: newRequestId,
      customer_id: customerId,
      shop_id: shopId,
      workflow_group_code: 'SERVICE',
      current_state: 'REQUESTED',
      reference_code: referenceCode,
      total_estimate: initialEstimate,
      customer_paid: false,
      notes: JSON.stringify(servicePayload),
      scheduled_for: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingRequests: Request[] = JSON.parse(localStorage.getItem(DEMO_REQUESTS_KEY) || '[]');
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify([createdRequest, ...existingRequests]));
    window.dispatchEvent(new CustomEvent('vaango-requests-changed', { detail: { newRequest: createdRequest } }));

    const existingEvents: RequestEvent[] = JSON.parse(
      localStorage.getItem(DEMO_REQUEST_EVENTS_KEY) || '[]'
    );
    existingEvents.push({
      id: `evt-${Date.now()}`,
      request_id: newRequestId,
      from_state: null,
      to_state: 'REQUESTED',
      actor_id: customerId,
      actor_role: 'customer',
      notes: `Customer requested service: ${service.name} (${service.price_type === 'range' ? `Est ₹${service.min_price}–₹${service.max_price}` : `₹${service.base_price}`})`,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(DEMO_REQUEST_EVENTS_KEY, JSON.stringify(existingEvents));

    return { success: true, request: createdRequest };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error submitting service request.';
    return { success: false, error: msg };
  }
};

/**
 * 5. Confirm Authoritative Final Price for Service (by Shopkeeper upon Accept or Ready)
 */
export const confirmServicePrice = async (
  requestId: string,
  confirmedPrice: number,
  actorId: string
): Promise<{ success: boolean; request?: Request; error?: string }> => {
  if (confirmedPrice <= 0) {
    return { success: false, error: 'Confirmed price must be greater than 0.' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data: reqData, error: fetchErr } = await supabase
        .from('requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchErr || !reqData) {
        return { success: false, error: 'Request not found.' };
      }

      let payload: any = {};
      if (reqData.notes) {
        try {
          payload = JSON.parse(reqData.notes);
        } catch {
          payload = {};
        }
      }

      payload.confirmed_price = confirmedPrice;

      const { data: updatedReq, error: updateErr } = await supabase
        .from('requests')
        .update({
          total_estimate: confirmedPrice,
          notes: JSON.stringify(payload),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();

      if (updateErr || !updatedReq) {
        throw updateErr || new Error('Failed to update confirmed price.');
      }

      await supabase.from('request_events').insert({
        request_id: requestId,
        from_state: reqData.current_state,
        to_state: reqData.current_state,
        actor_id: actorId,
        actor_role: 'shopkeeper',
        notes: `Shopkeeper confirmed final service price: ₹${confirmedPrice}`,
      });

      return { success: true, request: updatedReq as Request };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error updating price.';
      return { success: false, error: msg };
    }
  }

  // Mock Mode
  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    const list: Request[] = raw ? JSON.parse(raw) : [];
    const index = list.findIndex((r) => r.id === requestId);
    if (index === -1) {
      return { success: false, error: 'Request not found.' };
    }

    const currentReq = list[index];
    let payload: any = {};
    if (currentReq.notes) {
      try {
        payload = JSON.parse(currentReq.notes);
      } catch {
        payload = {};
      }
    }

    payload.confirmed_price = confirmedPrice;

    const updated: Request = {
      ...currentReq,
      total_estimate: confirmedPrice,
      notes: JSON.stringify(payload),
      updated_at: new Date().toISOString(),
    };

    list[index] = updated;
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(list));

    const rawEvts = localStorage.getItem(DEMO_REQUEST_EVENTS_KEY);
    const evts: RequestEvent[] = rawEvts ? JSON.parse(rawEvts) : [];
    evts.push({
      id: `evt-${Date.now()}`,
      request_id: requestId,
      from_state: currentReq.current_state,
      to_state: currentReq.current_state,
      actor_id: actorId,
      actor_role: 'shopkeeper',
      notes: `Shopkeeper confirmed final service price: ₹${confirmedPrice}`,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(DEMO_REQUEST_EVENTS_KEY, JSON.stringify(evts));

    return { success: true, request: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating service price.';
    return { success: false, error: msg };
  }
};

/**
 * 6. Save or Update a Shop Service (Catalogue Management)
 */
export const saveShopService = async (
  shopId: string,
  service: Partial<ShopService> & {
    name: string;
    price_type: PriceType;
    item_type?: 'appointment' | 'service';
    slot_config?: SlotConfig;
  }
): Promise<{ success: boolean; service?: ShopService; error?: string }> => {
  if (!service.name?.trim()) {
    return { success: false, error: 'Service name is required.' };
  }

  if (service.price_type === 'range') {
    if (!service.min_price || !service.max_price || service.min_price <= 0 || service.max_price <= 0) {
      return { success: false, error: 'Minimum and maximum price must be greater than 0.' };
    }
    if (service.min_price >= service.max_price) {
      return { success: false, error: 'Minimum price must be less than maximum price.' };
    }
  } else {
    if (!service.base_price || service.base_price <= 0) {
      return { success: false, error: 'Fixed price must be greater than 0.' };
    }
  }

  // Sanitize payload: ONLY include valid database columns for public.shop_services table
  const dbPayload = {
    name: service.name.trim(),
    description: service.description ? service.description.trim() : null,
    price_type: service.price_type || 'fixed',
    base_price: service.price_type === 'fixed' ? (service.base_price ?? null) : (service.base_price ?? service.min_price ?? null),
    min_price: service.price_type === 'range' ? (service.min_price ?? null) : (service.base_price ?? null),
    max_price: service.price_type === 'range' ? (service.max_price ?? null) : (service.base_price ?? null),
    duration_minutes: service.duration_minutes ?? null,
    provider_name: service.provider_name ? service.provider_name.trim() : null,
    specialization: service.specialization ? service.specialization.trim() : null,
    service_category: service.service_category ? service.service_category.trim() : 'General',
    is_available: service.is_available ?? true,
  };

  const isUuid = Boolean(service.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.id));
  const isMockShop = shopId.startsWith('30000000-') || shopId.startsWith('shop-');

  if (isSupabaseConfigured && !isMockShop) {
    try {
      if (isUuid) {
        // Update existing service with strict ownership check
        const { data, error } = await supabase
          .from('shop_services')
          .update(dbPayload)
          .eq('id', service.id)
          .eq('shop_id', shopId)
          .select()
          .single();

        if (error || !data) {
          console.error('Supabase update shop_services error:', error);
          throw error || new Error('Failed to update service.');
        }
        return { success: true, service: data as ShopService };
      } else {
        // Insert new service with shop_id
        const { data, error } = await supabase
          .from('shop_services')
          .insert({ ...dbPayload, shop_id: shopId })
          .select()
          .single();

        if (error || !data) {
          console.error('Supabase insert shop_services error:', error);
          throw error || new Error('Failed to create service.');
        }
        return { success: true, service: data as ShopService };
      }
    } catch (err: unknown) {
      console.error('saveShopService Supabase error:', err);
      const msg = err instanceof Error ? err.message : 'Unable to save appointment. Please try again.';
      return { success: false, error: msg };
    }
  }

  // Mock Mode / Fallback
  try {
    const services = await fetchShopServices(shopId);
    let updatedService: ShopService;

    if (service.id) {
      const idx = services.findIndex((s) => s.id === service.id);
      updatedService = {
        ...(idx !== -1 ? services[idx] : ({} as ShopService)),
        ...dbPayload,
        id: service.id,
        shop_id: shopId,
        created_at: new Date().toISOString(),
      };
      const updatedList = idx !== -1
        ? services.map((s) => (s.id === service.id ? updatedService : s))
        : [updatedService, ...services];
      const raw = localStorage.getItem(DEMO_SERVICES_KEY);
      const allServices: Record<string, ShopService[]> = raw ? JSON.parse(raw) : {};
      allServices[shopId] = updatedList;
      localStorage.setItem(DEMO_SERVICES_KEY, JSON.stringify(allServices));
    } else {
      updatedService = {
        ...dbPayload,
        id: `srv-${Date.now()}`,
        shop_id: shopId,
        created_at: new Date().toISOString(),
      };
      const raw = localStorage.getItem(DEMO_SERVICES_KEY);
      const allServices: Record<string, ShopService[]> = raw ? JSON.parse(raw) : {};
      allServices[shopId] = [updatedService, ...(allServices[shopId] || [])];
      localStorage.setItem(DEMO_SERVICES_KEY, JSON.stringify(allServices));
    }

    return { success: true, service: updatedService };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving service.';
    return { success: false, error: msg };
  }
};

/**
 * 7. Delete / Deactivate a Shop Service
 * Preserves historical customer/appointment/order records.
 * If service has booked slots/appointments, safely deactivates (is_available = false).
 * If no dependent records exist, performs a clean hard delete.
 */
export const deleteShopService = async (
  shopId: string,
  serviceId: string
): Promise<{ success: boolean; error?: string }> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);
  const isMockShop = shopId.startsWith('30000000-') || shopId.startsWith('shop-');

  if (isSupabaseConfigured && !isMockShop && isUuid) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return { success: false, error: 'You must be signed in to manage services.' };
      }

      // Check for dependent booked appointment slots
      const { data: bookedSlots, error: slotCheckErr } = await supabase
        .from('appointment_slots')
        .select('id')
        .eq('service_id', serviceId)
        .not('booked_by_request_id', 'is', null)
        .limit(1);

      if (slotCheckErr) {
        console.warn('Could not inspect booked slots:', slotCheckErr);
      }

      const hasHistoricalBookings = Boolean(bookedSlots && bookedSlots.length > 0);

      if (hasHistoricalBookings) {
        // Safe soft-delete / deactivation: preserves historical appointments
        const { error: updateErr } = await supabase
          .from('shop_services')
          .update({ is_available: false })
          .eq('id', serviceId)
          .eq('shop_id', shopId);

        if (updateErr) throw updateErr;

        // Clean up unbooked future slots for this service
        await supabase
          .from('appointment_slots')
          .delete()
          .eq('service_id', serviceId)
          .is('booked_by_request_id', null);
      } else {
        // Safe hard delete: clean up unbooked slots first
        await supabase
          .from('appointment_slots')
          .delete()
          .eq('service_id', serviceId);

        const { error: delErr } = await supabase
          .from('shop_services')
          .delete()
          .eq('id', serviceId)
          .eq('shop_id', shopId);

        if (delErr) {
          // If foreign key constraint still blocks deletion (e.g. error code 23503),
          // fallback safely to deactivation so history is never broken or lost
          if (delErr.code === '23503') {
            const { error: softErr } = await supabase
              .from('shop_services')
              .update({ is_available: false })
              .eq('id', serviceId)
              .eq('shop_id', shopId);
            if (softErr) throw softErr;
          } else {
            throw delErr;
          }
        }
      }
    } catch (err: unknown) {
      console.error('Supabase deleteShopService failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete service.';
      return { success: false, error: msg };
    }
  }

  // Synchronize local cache / mock state in all cases (including mock IDs)
  try {
    const raw = localStorage.getItem(DEMO_SERVICES_KEY);
    if (raw) {
      const allServices: Record<string, ShopService[]> = JSON.parse(raw);
      if (allServices[shopId]) {
        allServices[shopId] = allServices[shopId].filter((s) => s.id !== serviceId);
        localStorage.setItem(DEMO_SERVICES_KEY, JSON.stringify(allServices));
      }
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting service.';
    return { success: false, error: msg };
  }
};

/**
 * 8. Cancel Customer Request (Safe Customer Cancellation with Automatic Slot Freeing)
 * Enforces least privilege: customer can only cancel their own request in eligible states.
 */
export const cancelCustomerRequest = async (
  requestId: string,
  customerId: string,
  reason?: string
): Promise<{ success: boolean; request?: Request; error?: string }> => {
  const cancelReason = reason?.trim() || 'Cancelled by customer';

  if (isSupabaseConfigured) {
    try {
      // 1. Fetch current request to verify ownership and eligibility
      const { data: req, error: fetchErr } = await supabase
        .from('requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchErr || !req) {
        return { success: false, error: 'Request not found.' };
      }

      if (req.customer_id !== customerId) {
        return { success: false, error: 'Access Denied: You can only cancel your own requests.' };
      }

      const eligibleStates = ['REQUESTED', 'ACCEPTED', 'CONFIRMED'];
      if (!eligibleStates.includes(req.current_state)) {
        return {
          success: false,
          error: `Cannot cancel request in ${req.current_state} state. The store has already begun fulfillment.`,
        };
      }

      // 2. Perform optimistic state update
      const { data: updatedReq, error: updateErr } = await supabase
        .from('requests')
        .update({
          current_state: 'CANCELLED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('current_state', req.current_state)
        .select()
        .single();

      if (updateErr || !updatedReq) {
        throw updateErr || new Error('Failed to update request state to CANCELLED.');
      }

      // 3. Free appointment slot if applicable
      if (req.workflow_group_code === 'APPOINTMENT') {
        await supabase
          .from('appointment_slots')
          .update({
            is_available: true,
            booked_by_request_id: null,
          })
          .eq('booked_by_request_id', requestId);
      }

      // 4. Log event
      await supabase.from('request_events').insert({
        request_id: requestId,
        from_state: req.current_state,
        to_state: 'CANCELLED',
        actor_id: customerId,
        actor_role: 'customer',
        notes: cancelReason,
      });

      return { success: true, request: updatedReq as Request };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel request.';
      return { success: false, error: msg };
    }
  }

  // Mock / Demo Mode
  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    const allReqs: Request[] = raw ? JSON.parse(raw) : [];
    const idx = allReqs.findIndex((r) => r.id === requestId);

    if (idx === -1) return { success: false, error: 'Request not found.' };

    const req = allReqs[idx];
    if (req.customer_id !== customerId) {
      return { success: false, error: 'Access Denied: You can only cancel your own requests.' };
    }

    const eligibleStates = ['REQUESTED', 'ACCEPTED', 'CONFIRMED'];
    if (!eligibleStates.includes(req.current_state)) {
      return {
        success: false,
        error: `Cannot cancel request in ${req.current_state} state. The store has already begun fulfillment.`,
      };
    }

    const fromState = req.current_state;
    allReqs[idx].current_state = 'CANCELLED';
    allReqs[idx].updated_at = new Date().toISOString();
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(allReqs));

    // Free slot in demo slots if appointment
    if (req.workflow_group_code === 'APPOINTMENT') {
      try {
        const slotsRaw = localStorage.getItem(DEMO_SLOTS_KEY);
        if (slotsRaw) {
          const allSlots: Record<string, AppointmentSlot[]> = JSON.parse(slotsRaw);
          for (const shopSlots of Object.values(allSlots)) {
            const slot = shopSlots.find((s) => s.booked_by_request_id === requestId);
            if (slot) {
              const bookedCount = Math.max((slot.booked_count || 1) - 1, 0);
              slot.booked_count = bookedCount;
              slot.is_available = bookedCount < (slot.concurrent_capacity || 1);
              slot.booked_by_request_id = bookedCount === 0 ? null : slot.booked_by_request_id;
            }
          }
          localStorage.setItem(DEMO_SLOTS_KEY, JSON.stringify(allSlots));
          window.dispatchEvent(new CustomEvent('vaango-slots-changed', { detail: { shopId: req.shop_id, dateStr: req.scheduled_for?.slice(0, 10) } }));
        }
      } catch (e) {
        console.error('Error freeing mock slot:', e);
      }
    }

    // Log event
    const existingEvents: RequestEvent[] = JSON.parse(
      localStorage.getItem(DEMO_REQUEST_EVENTS_KEY) || '[]'
    );
    existingEvents.push({
      id: `evt-${Date.now()}`,
      request_id: requestId,
      from_state: fromState,
      to_state: 'CANCELLED',
      actor_id: customerId,
      actor_role: 'customer',
      notes: cancelReason,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(DEMO_REQUEST_EVENTS_KEY, JSON.stringify(existingEvents));

    return { success: true, request: allReqs[idx] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error cancelling request.';
    return { success: false, error: msg };
  }
};


/**
 * Generate and synchronize appointment slots based on slot configuration
 */
export const generateAndSyncAppointmentSlots = async (
  shopId: string,
  serviceId: string | null | undefined,
  config: SlotConfig,
  daysToGenerate = 14
): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const ranges = config.ranges || [];
    const slotDuration = config.slotDurationMinutes || 30;
    const buffer = config.bufferMinutes || 0;
    const availableDays = config.availableDays || [1, 2, 3, 4, 5, 6];
    const breaks = (config.breaks || []).map((b) => ({
      start: parseTimeToMinutes(b.start),
      end: parseTimeToMinutes(b.end),
    }));

    if (ranges.length === 0 || availableDays.length === 0 || slotDuration <= 0) {
      return { success: true, count: 0 };
    }

    const today = new Date();
    const newSlots: Omit<AppointmentSlot, 'created_at'>[] = [];

    for (let dayOffset = 0; dayOffset < daysToGenerate; dayOffset++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + dayOffset);
      const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon ...
      if (!availableDays.includes(dayOfWeek)) continue;

      const dateStr = targetDate.toISOString().slice(0, 10);

      ranges.forEach((range) => {
        const startMin = parseTimeToMinutes(range.start);
        const endMin = parseTimeToMinutes(range.end);
        if (startMin >= endMin) return;

        let current = startMin;
        while (current + slotDuration <= endMin) {
          const slotStart = current;
          const slotEnd = current + slotDuration;

          // Check if slot overlaps any configured break
          const inBreak = breaks.some(
            (b) => slotStart < b.end && slotEnd > b.start
          );

          if (!inBreak) {
            newSlots.push({
              id: `slot-${shopId}-${dateStr}-${slotStart}`,
              shop_id: shopId,
              service_id: serviceId || null,
              slot_date: dateStr,
              start_time: minutesToFormattedTime(slotStart),
              end_time: minutesToFormattedTime(slotEnd),
              is_available: true,
              booked_by_request_id: null,
              concurrent_capacity: range.concurrent || 1,
              booked_count: 0,
            });
          }

          current += slotDuration + buffer;
        }
      });
    }

    if (isSupabaseConfigured) {
      const payload = newSlots.map((s) => ({
        shop_id: s.shop_id,
        service_id: s.service_id,
        slot_date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
        is_available: true,
        concurrent_capacity: s.concurrent_capacity || 1,
      }));

      for (let i = 0; i < payload.length; i += 50) {
        const chunk = payload.slice(i, i + 50);
        await supabase
          .from('appointment_slots')
          .upsert(chunk, { onConflict: 'shop_id,slot_date,start_time', ignoreDuplicates: true });
      }
    }

    // Always sync mock/localStorage representation
    try {
      const raw = localStorage.getItem(DEMO_SLOTS_KEY);
      const allSlots: Record<string, AppointmentSlot[]> = raw ? JSON.parse(raw) : {};

      newSlots.forEach((slot) => {
        const key = `${shopId}_${slot.slot_date}`;
        if (!allSlots[key]) allSlots[key] = [];
        const exists = allSlots[key].some((s) => s.start_time === slot.start_time);
        if (!exists) {
          allSlots[key].push({
            ...slot,
            created_at: new Date().toISOString(),
          });
        }
      });

      // Sort slots by start_time
      Object.keys(allSlots).forEach((k) => {
        if (k.startsWith(`${shopId}_`)) {
          allSlots[k].sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));
        }
      });

      localStorage.setItem(DEMO_SLOTS_KEY, JSON.stringify(allSlots));
      localStorage.setItem('vaango_demo_appointment_slots', JSON.stringify(allSlots));
      window.dispatchEvent(new CustomEvent('vaango-slots-changed', { detail: { shopId } }));
    } catch (e) {
      console.warn('Could not cache demo appointment slots:', e);
    }

    return { success: true, count: newSlots.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate appointment slots.';
    return { success: false, count: 0, error: msg };
  }
};



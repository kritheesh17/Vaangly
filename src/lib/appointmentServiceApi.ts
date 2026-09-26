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
          .select('notes, current_state, scheduled_for, payment_status, hold_expires_at')
          .eq('shop_id', shopId)
          .eq('workflow_group_code', 'APPOINTMENT')
          .not('current_state', 'in', '("CANCELLED","REJECTED","EXPIRED","NO_SHOW")');

        const bookedBySlot = new Map<string, number>();
        (requests || []).forEach((request) => {
          try {
            const slotId = JSON.parse(request.notes || '{}').slot_id;
            const isHoldActive = !request.hold_expires_at || new Date(request.hold_expires_at) >= new Date();
            if (slotId && isHoldActive) {
              bookedBySlot.set(slotId, (bookedBySlot.get(slotId) || 0) + 1);
            }
          } catch {
            // Ignore malformed legacy notes.
          }
        });

        return (data as AppointmentSlot[]).map((slot) => {
          const slotCapacity = slot.capacity || slot.concurrent_capacity || 1;
          const activeBooked = bookedBySlot.get(slot.id) ?? (slot.confirmed_count || 0);
          const remaining = Math.max(0, slotCapacity - activeBooked);
          return {
            ...slot,
            capacity: slotCapacity,
            concurrent_capacity: slotCapacity,
            booked_count: activeBooked,
            confirmed_count: activeBooked,
            is_available: remaining > 0,
          };
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
 * 3. Book Appointment Request (with atomic token assignment and double-booking concurrency prevention)
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
  paymentMethod?: 'pay_at_shop' | 'online' | 'cash' | 'upi';
  isOnlineHold?: boolean;
  holdMinutes?: number;
}

export interface BookAppointmentResponse {
  success: boolean;
  request?: Request;
  tokenNumber?: number | null;
  queueNumber?: string | null;
  customersAhead?: number;
  timeWindow?: string;
  isHold?: boolean;
  holdExpiresAt?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  price?: number;
  error?: string;
}

export const bookAppointmentRequest = async (
  params: BookAppointmentParams
): Promise<BookAppointmentResponse> => {
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
    paymentMethod = 'pay_at_shop',
    isOnlineHold = false,
    holdMinutes = 10,
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

      // Call database atomic function to lock slot, check capacity, and assign token
      const { data: res, error: rpcErr } = await supabase.rpc('book_appointment_with_token', {
        p_slot_id: slot.id,
        p_customer_id: customerId,
        p_customer_name: customerName,
        p_customer_phone: normalizedCustomerPhone,
        p_service_id: service.id,
        p_service_name: service.name,
        p_price: service.base_price || service.min_price || 0,
        p_payment_method: paymentMethod,
        p_notes: notes?.trim() || null,
        p_is_online_hold: Boolean(isOnlineHold),
        p_hold_minutes: holdMinutes,
      });

      if (rpcErr || !res?.success) {
        return {
          success: false,
          error: res?.error || rpcErr?.message || 'This interval is now full. Please choose another time.',
        };
      }

      // Fetch created request record
      const { data: reqData } = await supabase
        .from('requests')
        .select('*')
        .eq('id', res.request_id)
        .single();

      return {
        success: true,
        request: (reqData as Request) || {
          id: res.request_id,
          customer_id: customerId,
          shop_id: shopId,
          reference_code: res.reference_code,
          workflow_group_code: 'APPOINTMENT',
          current_state: res.is_hold ? 'REQUESTED' : 'CONFIRMED',
          total_estimate: res.price,
          customer_paid: res.payment_status === 'PAYMENT_VERIFIED',
          payment_method: res.payment_method === 'online' ? 'upi' : 'cash',
          payment_status: res.payment_status,
          token_number: res.token_number,
          hold_expires_at: res.hold_expires_at,
          notes: JSON.stringify(appointmentPayload),
          scheduled_for: `${slot.slot_date} ${slot.start_time}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Request,
        tokenNumber: res.token_number,
        queueNumber: res.queue_number,
        customersAhead: res.customers_ahead,
        timeWindow: res.time_window,
        isHold: res.is_hold,
        holdExpiresAt: res.hold_expires_at,
        paymentMethod: res.payment_method,
        paymentStatus: res.payment_status,
        price: res.price,
      };
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

    const capacity = slotsForDay[slotIndex].capacity || slotsForDay[slotIndex].concurrent_capacity || 1;
    const bookedCount = slotsForDay[slotIndex].booked_count || 0;
    if (bookedCount >= capacity) {
      return {
        success: false,
        error: 'This interval is now full. Please choose another time.',
      };
    }

    const nextToken = bookedCount + 1;
    const newRequestId = `req-apt-${Date.now()}`;
    const isHold = Boolean(isOnlineHold && (paymentMethod === 'online' || paymentMethod === 'upi'));
    const holdExpiresAt = isHold ? new Date(Date.now() + holdMinutes * 60000).toISOString() : null;
    const pMethod = paymentMethod === 'online' || paymentMethod === 'upi' ? 'upi' : 'cash';
    const pStatus = isHold ? 'PAYMENT_PENDING' : pMethod === 'cash' ? 'NOT_REQUIRED' : 'PAYMENT_PROOF_SUBMITTED';
    const currentState = isHold ? 'REQUESTED' : pMethod === 'cash' ? 'CONFIRMED' : 'REQUESTED';

    slotsForDay[slotIndex] = {
      ...slotsForDay[slotIndex],
      is_available: bookedCount + 1 < capacity,
      booked_count: bookedCount + 1,
      confirmed_count: bookedCount + 1,
      capacity,
      concurrent_capacity: capacity,
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
      current_state: currentState,
      reference_code: referenceCode,
      total_estimate: service.base_price || service.min_price || 0,
      customer_paid: false,
      payment_method: pMethod,
      payment_status: pStatus,
      token_number: isHold ? null : nextToken,
      hold_expires_at: holdExpiresAt,
      notes: JSON.stringify({ ...appointmentPayload, token_number: isHold ? null : nextToken }),
      scheduled_for: `${slot.slot_date} ${slot.start_time}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingRequests: Request[] = JSON.parse(localStorage.getItem(DEMO_REQUESTS_KEY) || '[]');
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify([createdRequest, ...existingRequests]));
    window.dispatchEvent(new CustomEvent('vaango-requests-changed', { detail: { newRequest: createdRequest } }));

    return {
      success: true,
      request: createdRequest,
      tokenNumber: isHold ? null : nextToken,
      queueNumber: isHold ? null : `#${nextToken}`,
      customersAhead: Math.max(0, nextToken - 1),
      timeWindow: `${slot.start_time} – ${slot.end_time}`,
      isHold,
      holdExpiresAt,
      paymentMethod,
      paymentStatus: pStatus,
      price: service.base_price || service.min_price || 0,
    };
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

  // Sanitize payload: include configurable capacity, interval, and payment requirement
  const dbPayload = {
    name: service.name.trim(),
    description: service.description ? service.description.trim() : null,
    price_type: service.price_type || 'fixed',
    base_price: service.price_type === 'fixed' ? (service.base_price ?? null) : (service.base_price ?? service.min_price ?? null),
    min_price: service.price_type === 'range' ? (service.min_price ?? null) : (service.base_price ?? null),
    max_price: service.price_type === 'range' ? (service.max_price ?? null) : (service.base_price ?? null),
    duration_minutes: service.duration_minutes ?? null,
    interval_minutes: service.interval_minutes ?? (service.slot_config?.slotDurationMinutes ?? 30),
    capacity_per_interval: service.capacity_per_interval ?? (service.slot_config?.capacityPerInterval ?? 1),
    buffer_minutes: service.buffer_minutes ?? (service.slot_config?.bufferMinutes ?? 0),
    advance_booking_days: service.advance_booking_days ?? (service.slot_config?.advanceBookingDays ?? 7),
    payment_requirement: service.payment_requirement ?? (service.slot_config?.paymentRequirement ?? 'flexible'),
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

        const rangeCapacity = config.capacityPerInterval || range.concurrent || 1;

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
              concurrent_capacity: rangeCapacity,
              capacity: rangeCapacity,
              booked_count: 0,
              confirmed_count: 0,
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
        capacity: s.capacity || s.concurrent_capacity || 1,
      }));

      for (let i = 0; i < payload.length; i += 50) {
        const chunk = payload.slice(i, i + 50);
        await supabase
          .from('appointment_slots')
          .upsert(chunk, { onConflict: 'shop_id,slot_date,start_time', ignoreDuplicates: false });
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

/**
 * 10. Confirm Online Appointment Payment and assign atomic token
 */
export const confirmAppointmentOnlinePayment = async (
  requestId: string,
  screenshotUrl: string
): Promise<{ success: boolean; tokenNumber?: number; queueNumber?: string; customersAhead?: number; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('confirm_appointment_online_payment', {
        p_request_id: requestId,
        p_screenshot_url: screenshotUrl,
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || error?.message || 'Failed to confirm payment.' };
      }

      return {
        success: true,
        tokenNumber: data.token_number,
        queueNumber: data.queue_number,
        customersAhead: data.customers_ahead,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error confirming payment.';
      return { success: false, error: msg };
    }
  }

  // Mock / Demo mode
  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    const allReqs: Request[] = raw ? JSON.parse(raw) : [];
    const idx = allReqs.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      const existingToken = allReqs[idx].token_number || 1;
      allReqs[idx] = {
        ...allReqs[idx],
        payment_status: 'PAYMENT_PROOF_SUBMITTED',
        payment_screenshot_url: screenshotUrl,
        token_number: existingToken,
        hold_expires_at: null,
      };
      localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(allReqs));
      return {
        success: true,
        tokenNumber: existingToken,
        queueNumber: `#${existingToken}`,
        customersAhead: Math.max(0, existingToken - 1),
      };
    }
    return { success: false, error: 'Request not found.' };
  } catch (e: unknown) {
    return { success: false, error: 'Failed to confirm demo payment.' };
  }
};

/**
 * 11. Mark Pay-at-Shop Appointment as Paid (Shopkeeper/Staff only)
 */
export const markAppointmentPaid = async (
  requestId: string
): Promise<{ success: boolean; paid_at?: string; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('mark_appointment_paid', {
        p_request_id: requestId,
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || error?.message || 'Failed to mark as paid.' };
      }

      return { success: true, paid_at: data.paid_at };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error marking payment.';
      return { success: false, error: msg };
    }
  }

  // Mock / Demo mode
  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    const allReqs: Request[] = raw ? JSON.parse(raw) : [];
    const idx = allReqs.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      allReqs[idx] = {
        ...allReqs[idx],
        customer_paid: true,
        payment_status: 'PAYMENT_VERIFIED',
        paid_at: new Date().toISOString(),
      };
      localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(allReqs));
      return { success: true, paid_at: allReqs[idx].paid_at || undefined };
    }
    return { success: false, error: 'Request not found.' };
  } catch (e: unknown) {
    return { success: false, error: 'Failed to mark demo payment.' };
  }
};

/**
 * 12. Update Appointment Queue Status (waiting, called, serving, completed, cancelled, no_show)
 */
export const updateAppointmentQueueStatus = async (
  requestId: string,
  status: 'waiting' | 'called' | 'serving' | 'completed' | 'cancelled' | 'no_show',
  notes?: string
): Promise<{ success: boolean; currentState?: string; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('update_appointment_queue_status', {
        p_request_id: requestId,
        p_status: status,
        p_notes: notes || null,
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || error?.message || 'Failed to update queue status.' };
      }

      return { success: true, currentState: data.current_state };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error updating status.';
      return { success: false, error: msg };
    }
  }

  // Mock mode
  return { success: true, currentState: status.toUpperCase() };
};

/**
 * 13. Fetch Appointment Queue for a shop and date
 */
export interface QueueIntervalBooking {
  request_id: string;
  reference_code: string;
  token_number: number;
  queue_number: string;
  customer_name: string;
  customer_phone?: string;
  service_name: string;
  current_state: string;
  queue_status: 'waiting' | 'called' | 'serving' | 'completed' | 'cancelled' | 'no_show';
  payment_method: string;
  payment_status: string;
  customer_paid: boolean;
  total_amount: number;
  paid_at?: string | null;
  customer_notes?: string | null;
}

export interface QueueInterval {
  slot_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  confirmed_count: number;
  is_available: boolean;
  bookings: QueueIntervalBooking[];
}

export const fetchShopAppointmentQueue = async (
  shopId: string,
  dateStr: string
): Promise<{ success: boolean; date?: string; intervals?: QueueInterval[]; error?: string }> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_shop_appointment_queue', {
        p_shop_id: shopId,
        p_date: dateStr,
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || error?.message || 'Failed to fetch queue.' };
      }

      return {
        success: true,
        date: data.date,
        intervals: data.intervals as QueueInterval[],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error fetching queue.';
      return { success: false, error: msg };
    }
  }

  return { success: true, date: dateStr, intervals: [] };
};



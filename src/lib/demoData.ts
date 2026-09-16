import { Request } from '../types/database';
import { MOCK_SHOPS } from '../data/mockData';

export const DEMO_REQUESTS_KEY = 'vaango_demo_requests';
export const DEMO_SHOPS_KEY = 'vaango_demo_shops';
export const DEMO_PRODUCTS_KEY = 'vaango_demo_products';
export const DEMO_SERVICES_KEY = 'vaango_demo_services';
export const DEMO_SLOTS_KEY = 'vaango_demo_slots';
export const DEMO_APPLICATIONS_KEY = 'vaango_demo_applications';

export const buildDefaultDemoRequests = (): Request[] => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  const customerId = 'c1111111-0000-0000-0000-000000000001';

  return [
    // 1. Group B Appointment: Confirmed for Today (Salon)
    {
      id: 'req-demo-apt-1',
      customer_id: customerId,
      shop_id: 'shop-chn-salon-1',
      workflow_group_code: 'APPOINTMENT',
      current_state: 'CONFIRMED',
      reference_code: 'APT-1042',
      total_estimate: 180,
      customer_paid: false,
      scheduled_for: `${todayStr} 03:00 PM`,
      notes: JSON.stringify({
        service_id: 'srv-chn-salon-1',
        service_name: 'Executive Haircut & Scalp Massage',
        provider_name: 'Karthi (Senior Stylist)',
        slot_id: `slot-chn-salon-${todayStr}-1`,
        slot_date: todayStr,
        start_time: '03:00 PM',
        end_time: '03:30 PM',
        duration_minutes: 30,
        price: 180,
        customer_name: 'Ananya Raman',
        customer_phone: '+91 98765 43210',
        notes: 'Please arrange stylish cut and scalp massage.',
      }),
      created_at: new Date(now.getTime() - 14400000).toISOString(),
      updated_at: new Date(now.getTime() - 7200000).toISOString(),
    },

    // 2. Group B Appointment: Requested / Pending (Clinic)
    {
      id: 'req-demo-apt-2',
      customer_id: customerId,
      shop_id: 'shop-chn-clinic-1',
      workflow_group_code: 'APPOINTMENT',
      current_state: 'REQUESTED',
      reference_code: 'APT-1088',
      total_estimate: 250,
      customer_paid: false,
      scheduled_for: `${tomorrowStr} 10:30 AM`,
      notes: JSON.stringify({
        service_id: 'srv-chn-clinic-1',
        service_name: 'General Physician Consultation',
        provider_name: 'Dr. R. Ramanathan, MBBS',
        slot_id: `slot-chn-clinic-${tomorrowStr}-1`,
        slot_date: tomorrowStr,
        start_time: '10:30 AM',
        end_time: '11:00 AM',
        duration_minutes: 20,
        price: 250,
        customer_name: 'Ananya Raman',
        customer_phone: '+91 98765 43210',
        notes: 'Routine health checkup and seasonal flu consultation.',
      }),
      created_at: new Date(now.getTime() - 3600000).toISOString(),
      updated_at: new Date(now.getTime() - 3600000).toISOString(),
    },

    // 3. Group B Appointment: Gobi / Kangeyam Salon
    {
      id: 'req-demo-apt-3',
      customer_id: customerId,
      shop_id: 'shop-gobi-salon-1',
      workflow_group_code: 'APPOINTMENT',
      current_state: 'CONFIRMED',
      reference_code: 'APT-2031',
      total_estimate: 150,
      customer_paid: false,
      scheduled_for: `${todayStr} 04:00 PM`,
      notes: JSON.stringify({
        service_id: 'srv-salon-1',
        service_name: 'Executive Haircut & Scalp Massage',
        provider_name: 'Karthi (Stylist)',
        slot_id: `slot-gobi-salon-${todayStr}-2`,
        slot_date: todayStr,
        start_time: '04:00 PM',
        end_time: '04:30 PM',
        duration_minutes: 30,
        price: 150,
        customer_name: 'Suresh Babu',
        customer_phone: '+91 98765 11223',
      }),
      created_at: new Date(now.getTime() - 18000000).toISOString(),
      updated_at: new Date(now.getTime() - 10000000).toISOString(),
    },

    // 4. Group A Order: Preparing in Chennai Grocery
    {
      id: 'req-demo-ord-1',
      customer_id: customerId,
      shop_id: 'shop-chn-grocery-1',
      workflow_group_code: 'ORDER',
      current_state: 'PREPARING',
      reference_code: 'ORD-5521',
      total_estimate: 440,
      customer_paid: false,
      fulfillment_type: 'parcel',
      scheduled_for: null,
      notes: JSON.stringify({
        items: [
          {
            product_id: 'prod-chn-g1',
            name: 'Ponni Boiled Rice (பொன்னி அரிசி)',
            price: 62,
            unit: 'kg',
            quantity: 5,
            billed_quantity: 5,
            effective_quantity: 5,
            subtotal: 310,
          },
          {
            product_id: 'prod-chn-g3',
            name: 'Traditional Country Tomatoes (நாட்டு தக்காளி)',
            price: 35,
            unit: 'kg',
            quantity: 2,
            billed_quantity: 2,
            effective_quantity: 2,
            subtotal: 70,
          },
          {
            product_id: 'prod-chn-g6',
            name: 'Degree Filter Coffee Powder',
            price: 60,
            unit: 'pack',
            quantity: 1,
            billed_quantity: 1,
            effective_quantity: 1,
            subtotal: 60,
          },
        ],
        shop_name: 'Mylapore Heritage Provisions',
        notes: 'Please pack in paper bags.',
        payment_method: 'upi',
      }),
      created_at: new Date(now.getTime() - 5400000).toISOString(),
      updated_at: new Date(now.getTime() - 1800000).toISOString(),
    },

    // 5. Group A Order: Ready in Murugan Supermarket
    {
      id: 'req-demo-ord-2',
      customer_id: customerId,
      shop_id: 'shop-gobi-grocery-1',
      workflow_group_code: 'ORDER',
      current_state: 'READY',
      reference_code: 'ORD-5544',
      total_estimate: 215,
      customer_paid: true,
      fulfillment_type: 'parcel',
      scheduled_for: null,
      notes: JSON.stringify({
        items: [
          {
            product_id: 'prod-gobi-g1',
            name: 'Ponni Boiled Rice (பொன்னி அரிசி)',
            price: 60,
            unit: '1 kg pack',
            quantity: 2,
            billed_quantity: 2,
            effective_quantity: 2,
            subtotal: 120,
          },
          {
            product_id: 'prod-gobi-g4',
            name: 'Organic Toor Dal (துவரம் பருப்பு)',
            price: 95,
            unit: '500g pack',
            quantity: 1,
            billed_quantity: 1,
            effective_quantity: 1,
            subtotal: 95,
          },
        ],
        shop_name: 'Murugan Supermarket & Spices',
        notes: 'Counter pickup requested.',
        payment_method: 'cash',
      }),
      created_at: new Date(now.getTime() - 10800000).toISOString(),
      updated_at: new Date(now.getTime() - 900000).toISOString(),
    },

    // 6. Group A Order: Bakery in Chennai
    {
      id: 'req-demo-ord-3',
      customer_id: customerId,
      shop_id: 'shop-chn-bakery-1',
      workflow_group_code: 'ORDER',
      current_state: 'ACCEPTED',
      reference_code: 'ORD-5589',
      total_estimate: 170,
      customer_paid: false,
      fulfillment_type: 'parcel',
      scheduled_for: null,
      notes: JSON.stringify({
        items: [
          {
            product_id: 'prod-chn-b1',
            name: 'Fresh Butter Milk Bread (ரொட்டி)',
            price: 45,
            unit: 'pack',
            quantity: 2,
            billed_quantity: 2,
            effective_quantity: 2,
            subtotal: 90,
          },
          {
            product_id: 'prod-chn-b2',
            name: 'Crispy Veg Puff (காய்கறி பப்ஸ்)',
            price: 20,
            unit: 'piece',
            quantity: 4,
            billed_quantity: 4,
            effective_quantity: 4,
            subtotal: 80,
          },
        ],
        shop_name: 'Adyar Hot Bakes & Cafe',
        payment_method: 'upi',
      }),
      created_at: new Date(now.getTime() - 1800000).toISOString(),
      updated_at: new Date(now.getTime() - 600000).toISOString(),
    },

    // 7. Group C Service: Tailor In Progress with Confirmed Price
    {
      id: 'req-demo-srv-1',
      customer_id: customerId,
      shop_id: 'shop-chn-tailor-1',
      workflow_group_code: 'SERVICE',
      current_state: 'IN_PROGRESS',
      reference_code: 'SRV-2210',
      total_estimate: 550,
      customer_paid: false,
      scheduled_for: null,
      notes: JSON.stringify({
        service_id: 'srv-chn-tailor-1',
        service_name: 'Designer Blouse Stitching',
        price_type: 'range',
        estimated_price: 450,
        min_price: 350,
        max_price: 750,
        confirmed_price: 550,
        customer_name: 'Ananya Raman',
        customer_phone: '+91 98765 43210',
        notes: 'Boat neck design with golden piping. Fitting trial scheduled.',
      }),
      created_at: new Date(now.getTime() - 86400000).toISOString(),
      updated_at: new Date(now.getTime() - 43200000).toISOString(),
    },

    // 8. Group C Service: Mobile Repair Requested
    {
      id: 'req-demo-srv-2',
      customer_id: customerId,
      shop_id: 'shop-chn-repair-1',
      workflow_group_code: 'SERVICE',
      current_state: 'REQUESTED',
      reference_code: 'SRV-2234',
      total_estimate: 1900,
      customer_paid: false,
      scheduled_for: null,
      notes: JSON.stringify({
        service_id: 'srv-chn-repair-1',
        service_name: 'Mobile Screen / Display Replacement',
        price_type: 'range',
        estimated_price: 1900,
        min_price: 1200,
        max_price: 2900,
        customer_name: 'Ananya Raman',
        customer_phone: '+91 98765 43210',
        notes: 'Touch screen glass cracked. Needs inspection.',
      }),
      created_at: new Date(now.getTime() - 7200000).toISOString(),
      updated_at: new Date(now.getTime() - 7200000).toISOString(),
    },

    // 9. Completed Past Appointment (Yesterday)
    {
      id: 'req-demo-apt-4',
      customer_id: customerId,
      shop_id: 'shop-chn-salon-1',
      workflow_group_code: 'APPOINTMENT',
      current_state: 'COMPLETED',
      reference_code: 'APT-0994',
      total_estimate: 120,
      customer_paid: true,
      scheduled_for: `${yesterdayStr} 05:00 PM`,
      notes: JSON.stringify({
        service_id: 'srv-chn-salon-2',
        service_name: 'Beard Trim & Royal Shave',
        provider_name: 'Karthi (Senior Stylist)',
        slot_date: yesterdayStr,
        start_time: '05:00 PM',
        end_time: '05:20 PM',
        price: 120,
        customer_name: 'Ananya Raman',
      }),
      created_at: new Date(yesterdayDate.getTime() - 36000000).toISOString(),
      updated_at: new Date(yesterdayDate.getTime()).toISOString(),
    },
  ];
};

/**
 * Returns stored demo requests or seeds them automatically if missing/empty.
 */
export const getStoredDemoRequests = (): Request[] => {
  try {
    const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
    if (raw) {
      const parsed: Request[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading demo requests, re-seeding:', err);
  }

  // Seed default demo requests
  const defaults = buildDefaultDemoRequests();
  try {
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(defaults));
  } catch (e) {
    console.error('Failed to store default demo requests:', e);
  }
  return defaults;
};

/**
 * Resets all demo shops, appointments, and requests back to initial rich mock data.
 */
export const resetDemoData = (): { success: boolean; message: string } => {
  try {
    const defaultRequests = buildDefaultDemoRequests();
    localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(defaultRequests));

    // Reset demo shops to all active base shops
    localStorage.setItem(DEMO_SHOPS_KEY, JSON.stringify(MOCK_SHOPS));

    // Clear any stuck application status
    localStorage.removeItem(DEMO_APPLICATIONS_KEY);
    localStorage.removeItem(DEMO_SLOTS_KEY);
    localStorage.removeItem(DEMO_PRODUCTS_KEY);
    localStorage.removeItem(DEMO_SERVICES_KEY);

    // Broadcast change events
    window.dispatchEvent(new CustomEvent('vaango-requests-changed', { detail: { count: defaultRequests.length } }));
    window.dispatchEvent(new CustomEvent('vaango-shops-changed'));
    window.dispatchEvent(new CustomEvent('vaango-products-changed', { detail: {} }));

    return {
      success: true,
      message: 'Restored verified demo shops, appointments, and requests!',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reset demo data';
    return { success: false, message: msg };
  }
};

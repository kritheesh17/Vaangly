import { Request, Shop } from '../types/database';
import {
  BusinessAnalyticsData,
  AnalyticsFilter,
  RevenueTrendPoint,
  PeakDayMetric,
  SalesOverview,
  ProductPerformance,
  VariantPerformance,
  SlowMovingProduct,
  CustomerMetrics,
  AppointmentAnalytics,
  CancellationMetrics,
  PaymentMethodMetrics,
  DateRangePreset,
} from '../types/analytics';
import { getShopRequests, getShopProductsList } from './shopkeeperApi';

/**
 * Authoritative Asia/Kolkata date string extractor (YYYY-MM-DD)
 * Guarantees that late-night and early-morning orders in India are accurately bucketed
 * regardless of the client machine's local timezone.
 */
export const getISTDateString = (input: string | Date | number): string => {
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

/**
 * Returns the hour of the day (0-23) in Asia/Kolkata timezone
 */
export const getISTHour = (input: string | Date | number): number => {
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  return hourPart ? parseInt(hourPart, 10) : 0;
};

/**
 * Generates an inclusive continuous list of YYYY-MM-DD date strings between start and end
 */
export const getCalendarDaysList = (startDateStr: string, endDateStr: string): string[] => {
  const dates: string[] = [];
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

  const current = new Date(Date.UTC(sYear, sMonth - 1, sDay, 12, 0, 0));
  const end = new Date(Date.UTC(eYear, eMonth - 1, eDay, 12, 0, 0));

  while (current.getTime() <= end.getTime()) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

/**
 * Calculates the exact prior comparison period for a given filter.
 * - 'this_month': compares Month-To-Date (e.g. Oct 1-5 compares with Sept 1-5).
 * - 'today': compares with yesterday.
 * - '7d', '30d', 'custom', etc.: compares with the preceding equal-duration window.
 */
export const getPreviousPeriod = (
  filter: AnalyticsFilter
): { startDate: string; endDate: string } => {
  const { preset, startDate, endDate } = filter;

  if (preset === 'this_month') {
    const [curYear, curMonth] = startDate.split('-').map(Number);
    const endDay = parseInt(endDate.split('-')[2], 10);
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevMonthStr = String(prevMonth).padStart(2, '0');
    const prevStartDate = `${prevYear}-${prevMonthStr}-01`;
    const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0, 12, 0, 0)).getUTCDate();
    const prevEndDay = Math.min(endDay, daysInPrevMonth);
    const prevEndDate = `${prevYear}-${prevMonthStr}-${String(prevEndDay).padStart(2, '0')}`;
    return { startDate: prevStartDate, endDate: prevEndDate };
  }

  if (preset === 'today') {
    const [y, m, d] = startDate.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
    const yStr = prevDate.getUTCFullYear();
    const mStr = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(prevDate.getUTCDate()).padStart(2, '0');
    const yesterdayStr = `${yStr}-${mStr}-${dStr}`;
    return { startDate: yesterdayStr, endDate: yesterdayStr };
  }

  // Preceding equal-duration window
  const [sY, sM, sD] = startDate.split('-').map(Number);
  const [eY, eM, eD] = endDate.split('-').map(Number);
  const sUtc = Date.UTC(sY, sM - 1, sD, 12, 0, 0);
  const eUtc = Date.UTC(eY, eM - 1, eD, 12, 0, 0);
  const numDays = Math.round((eUtc - sUtc) / (1000 * 60 * 60 * 24)) + 1;

  const pEndUtc = sUtc - 1000 * 60 * 60 * 24;
  const pStartUtc = pEndUtc - (numDays - 1) * 1000 * 60 * 60 * 24;
  const pStart = new Date(pStartUtc);
  const pEnd = new Date(pEndUtc);

  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;

  return { startDate: fmt(pStart), endDate: fmt(pEnd) };
};

/**
 * Calculates start and end ISO date strings for a given preset
 */
export const getDateRangeFromPreset = (
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string } => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (preset === 'custom' && customStart && customEnd) {
    return {
      startDate: customStart,
      endDate: customEnd,
    };
  }

  switch (preset) {
    case 'today':
      // start and end are already today (00:00:00 to 23:59:59.999)
      break;
    case '7d':
      start.setDate(end.getDate() - 6);
      break;
    case '30d':
      start.setDate(end.getDate() - 29);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    case '3m':
      start.setMonth(end.getMonth() - 3);
      break;
    case '6m':
      start.setMonth(end.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(end.getFullYear() - 1);
      break;
    default:
      start.setDate(end.getDate() - 29);
  }

  const formatLocalDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  };
};

/**
 * Helper to safely extract items/services payload from a request
 */
interface ParsedOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variant_id?: string;
  variant_label?: string;
  category?: string;
}

export const extractItemsFromRequest = (req: Request): ParsedOrderItem[] => {
  if (!req.notes) return [];
  try {
    const parsed = JSON.parse(req.notes);
    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed.items.map((item: any) => ({
        id: item.product_id || item.id || 'item-unknown',
        name: item.name || 'Product',
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
        variant_id: item.variant?.id,
        variant_label: item.variant?.label,
        category: item.category,
      }));
    }
    if (parsed.service_id) {
      return [
        {
          id: parsed.service_id,
          name: parsed.service_name || 'Service',
          price: Number(parsed.price) || Number(req.total_estimate) || 0,
          quantity: 1,
          category: parsed.specialization || 'Service',
        },
      ];
    }
  } catch {
    // Malformed legacy text notes
  }

  return [
    {
      id: req.id,
      name: `Order #${req.reference_code}`,
      price: req.total_estimate || 0,
      quantity: 1,
    },
  ];
};

/**
 * Maps authoritative payment_method database values to clean user-facing labels
 */
export const getPaymentMethodLabel = (methodCode?: string | null): string => {
  if (!methodCode || !methodCode.trim() || methodCode.trim().toLowerCase() === 'unspecified') {
    return 'Unspecified';
  }
  const code = methodCode.toLowerCase().trim();
  switch (code) {
    case 'cash':
      return 'Cash';
    case 'upi':
      return 'UPI / QR Code';
    case 'pay_at_shop':
      return 'Pay at Shop';
    case 'online':
      return 'Online Transfer';
    case 'card':
      return 'Card';
    default:
      return code
        .split(/[_\-\s]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
  }
};

/**
 * Extracts authoritative payment method code from Request or payload notes
 */
export const extractPaymentMethodCode = (r: Request): string => {
  if (r.payment_method) {
    return String(r.payment_method).toLowerCase().trim();
  }
  if (r.notes) {
    try {
      const parsed = JSON.parse(r.notes);
      if (parsed.payment_method) {
        return String(parsed.payment_method).toLowerCase().trim();
      }
    } catch {
      // not JSON notes
    }
  }
  return 'unspecified';
};

/**
 * Main Authoritative Analytics Calculation Engine
 */
export const calculateShopAnalytics = async (
  shop: Shop,
  filter: AnalyticsFilter
): Promise<BusinessAnalyticsData> => {
  const [allRequests, allProducts] = await Promise.all([
    getShopRequests(shop.id),
    getShopProductsList(shop.id),
  ]);

  const { startDate, endDate } = filter;

  // Filter requests for current selected window using IST calendar dates
  const currentRequests = allRequests.filter((r) => {
    const dStr = getISTDateString(r.created_at);
    return dStr >= startDate && dStr <= endDate;
  });

  // Calculate prior period for comparison
  const { startDate: prevStartDate, endDate: prevEndDate } = getPreviousPeriod(filter);
  const previousRequests = allRequests.filter((r) => {
    const dStr = getISTDateString(r.created_at);
    return dStr >= prevStartDate && dStr <= prevEndDate;
  });

  // 1. Sales & Revenue Metrics
  const completedCurrent = currentRequests.filter((r) => r.current_state === 'COMPLETED');
  const completedPrevious = previousRequests.filter((r) => r.current_state === 'COMPLETED');

  const totalSales = completedCurrent.reduce((sum, r) => sum + (r.total_estimate || 0), 0);
  const previousPeriodSales = completedPrevious.reduce((sum, r) => sum + (r.total_estimate || 0), 0);

  // Revenue stream disaggregation (guaranteed to sum to totalSales without double-counting)
  const productSales = completedCurrent
    .filter((r) => r.workflow_group_code === 'ORDER')
    .reduce((sum, r) => sum + (r.total_estimate || 0), 0);

  const serviceAppointmentSales = completedCurrent
    .filter((r) => r.workflow_group_code === 'APPOINTMENT' || r.workflow_group_code === 'SERVICE')
    .reduce((sum, r) => sum + (r.total_estimate || 0), 0);

  const totalOrders = currentRequests.length;
  const completedOrders = completedCurrent.length;
  const pendingOrders = currentRequests.filter((r) =>
    ['REQUESTED', 'ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY'].includes(r.current_state)
  ).length;

  const grossOrderValue = currentRequests
    .filter((r) => r.current_state !== 'REJECTED' && r.current_state !== 'CANCELLED')
    .reduce((sum, r) => sum + (r.total_estimate || 0), 0);

  const averageOrderValue = completedOrders > 0 ? Math.round(totalSales / completedOrders) : 0;

  let salesGrowthPct: number | null = null;
  if (previousPeriodSales > 0) {
    salesGrowthPct = Math.round(((totalSales - previousPeriodSales) / previousPeriodSales) * 100);
  }

  let ordersGrowthPct: number | null = null;
  if (completedPrevious.length > 0) {
    ordersGrowthPct = Math.round(
      ((completedOrders - completedPrevious.length) / completedPrevious.length) * 100
    );
  }

  const fulfillmentRatePct = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  const overview: SalesOverview = {
    total_sales: totalSales,
    total_orders: totalOrders,
    completed_orders: completedOrders,
    pending_orders: pendingOrders,
    average_order_value: averageOrderValue,
    gross_order_value: grossOrderValue,
    previous_period_sales: previousPeriodSales,
    sales_growth_pct: salesGrowthPct,
    previous_period_orders: completedPrevious.length,
    orders_growth_pct: ordersGrowthPct,
    product_sales: productSales,
    service_appointment_sales: serviceAppointmentSales,
    fulfillment_rate_pct: fulfillmentRatePct,
  };

  // 2. Revenue Trends Points (Continuous calendar days in IST)
  const currentDaysList = getCalendarDaysList(startDate, endDate);
  const prevDaysList = getCalendarDaysList(prevStartDate, prevEndDate);

  // Prior period daily map (indexed by relative calendar day)
  const prevDailyMap = new Map<string, number>();
  prevDaysList.forEach((dStr) => prevDailyMap.set(dStr, 0));
  completedPrevious.forEach((r) => {
    const dStr = getISTDateString(r.created_at);
    const existing = prevDailyMap.get(dStr) || 0;
    prevDailyMap.set(dStr, existing + (r.total_estimate || 0));
  });
  const prevDailyValues = prevDaysList.map((dStr) => prevDailyMap.get(dStr) || 0);
  const hasPreviousPeriodData = previousPeriodSales > 0 || completedPrevious.length > 0;

  // Current period trends map
  const trendsMap = new Map<
    string,
    { gross: number; completed: number; cancelled: number; verified: number; count: number }
  >();
  currentDaysList.forEach((dStr) => {
    trendsMap.set(dStr, { gross: 0, completed: 0, cancelled: 0, verified: 0, count: 0 });
  });

  currentRequests.forEach((r) => {
    const dStr = getISTDateString(r.created_at);
    const existing = trendsMap.get(dStr);
    if (!existing) return;
    const amt = r.total_estimate || 0;

    existing.count += 1;
    if (r.current_state !== 'REJECTED') {
      existing.gross += amt;
    }
    if (r.current_state === 'COMPLETED') {
      existing.completed += amt;
    }
    if (r.current_state === 'CANCELLED' || r.current_state === 'EXPIRED') {
      existing.cancelled += amt;
    }
    if (r.customer_paid) {
      existing.verified += amt;
    }
  });

  const revenueTrends: RevenueTrendPoint[] = currentDaysList.map((dStr, idx) => {
    const data = trendsMap.get(dStr) || { gross: 0, completed: 0, cancelled: 0, verified: 0, count: 0 };
    const [y, m, d] = dStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const label = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const fullDateLabel = dateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const prevSales =
      hasPreviousPeriodData && idx < prevDailyValues.length ? prevDailyValues[idx] : null;

    return {
      date: dStr,
      label,
      full_date_label: fullDateLabel,
      gross_order_value: data.gross,
      completed_sales: data.completed,
      cancelled_amount: data.cancelled,
      verified_payments: data.verified,
      order_count: data.count,
      previous_completed_sales: prevSales,
    };
  });

  // Peak day calculation strictly on completed/settled sales
  let peakDay: PeakDayMetric | null = null;
  let maxCompleted = 0;
  revenueTrends.forEach((p) => {
    if (p.completed_sales > maxCompleted) {
      maxCompleted = p.completed_sales;
      const [y, m, d] = p.date.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const formattedLabel = dateObj.toLocaleDateString('en-IN', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      peakDay = {
        date: p.date,
        label: formattedLabel,
        completed_sales: p.completed_sales,
        order_count: p.order_count,
      };
    }
  });

  // Average daily settled revenue across all calendar days in selected reporting window
  const calendarDaysCount = revenueTrends.length;
  const averageDailyRevenue =
    calendarDaysCount > 0 ? Math.round((totalSales / calendarDaysCount) * 100) / 100 : 0;

  // 3. Product & Variant Performance
  const productAgg = new Map<string, { name: string; category?: string; qty: number; sales: number }>();
  const variantAgg = new Map<
    string,
    {
      product_id: string;
      product_name: string;
      variant_id: string;
      variant_label: string;
      quantity_sold: number;
      sales_generated: number;
    }
  >();

  completedCurrent.forEach((req) => {
    const items = extractItemsFromRequest(req);
    items.forEach((item) => {
      // Product level
      const pEntry = productAgg.get(item.id) || {
        name: item.name,
        category: item.category,
        qty: 0,
        sales: 0,
      };
      pEntry.qty += item.quantity;
      pEntry.sales += item.price * item.quantity;
      productAgg.set(item.id, pEntry);

      // Variant level if exists
      if (item.variant_id && item.variant_label) {
        const vKey = `${item.id}__${item.variant_id}`;
        const vEntry = variantAgg.get(vKey) || {
          product_id: item.id,
          product_name: item.name,
          variant_id: item.variant_id,
          variant_label: item.variant_label,
          quantity_sold: 0,
          sales_generated: 0,
        };
        vEntry.quantity_sold += item.quantity;
        vEntry.sales_generated += item.price * item.quantity;
        variantAgg.set(vKey, vEntry);
      }
    });
  });

  const topProducts: ProductPerformance[] = Array.from(productAgg.entries())
    .map(([pId, data]) => ({
      product_id: pId,
      product_name: data.name,
      category: data.category,
      quantity_sold: data.qty,
      sales_generated: data.sales,
      percentage_of_total: totalSales > 0 ? Math.round((data.sales / totalSales) * 100) : 0,
    }))
    .sort((a, b) => b.sales_generated - a.sales_generated);

  const variantPerformance: VariantPerformance[] = Array.from(variantAgg.values()).sort(
    (a, b) => b.sales_generated - a.sales_generated
  );

  // 4. Slow-Moving Products Analysis
  // Products listed with <= 1 sales during active period (with >= 7 days history)
  const slowMovingProducts: SlowMovingProduct[] = allProducts.map((p) => {
    const soldData = productAgg.get(p.id);
    const unitsSold = soldData ? soldData.qty : 0;
    const daysListed = Math.max(
      1,
      Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24))
    );

    let status: 'slow' | 'healthy' | 'no_data' = 'healthy';
    if (daysListed < 5 && unitsSold === 0) {
      status = 'no_data'; // recently added
    } else if (daysListed >= 7 && unitsSold <= 1) {
      status = 'slow';
    }

    return {
      product_id: p.id,
      product_name: p.name,
      in_stock: p.is_available,
      price: p.price,
      units_sold: unitsSold,
      days_listed: daysListed,
      status,
    };
  });

  // 5. Customer Metrics (New vs Returning)
  // Determine returning customers based on lifetime completed orders prior to this window or overall
  const priorCompletedCustomerOrders = new Map<string, number>();
  allRequests
    .filter((r) => r.current_state === 'COMPLETED' && getISTDateString(r.created_at) < startDate)
    .forEach((r) => {
      priorCompletedCustomerOrders.set(r.customer_id, (priorCompletedCustomerOrders.get(r.customer_id) || 0) + 1);
    });

  const lifetimeCompleted = allRequests.filter((r) => r.current_state === 'COMPLETED');
  const completedCustomerOrders = new Map<string, number>();
  lifetimeCompleted.forEach((r) => {
    completedCustomerOrders.set(r.customer_id, (completedCustomerOrders.get(r.customer_id) || 0) + 1);
  });

  const currentCompletedCustomers = new Set<string>();
  let newCustomersCount = 0;
  let returningCustomersCount = 0;
  let repeatOrderCount = 0;

  completedCurrent.forEach((r) => {
    if (!currentCompletedCustomers.has(r.customer_id)) {
      currentCompletedCustomers.add(r.customer_id);
      const priorOrders = priorCompletedCustomerOrders.get(r.customer_id) || 0;
      const totalLifetimeOrders = completedCustomerOrders.get(r.customer_id) || 1;
      if (priorOrders > 0 || totalLifetimeOrders > 1) {
        returningCustomersCount += 1;
      } else {
        newCustomersCount += 1;
      }
    } else {
      repeatOrderCount += 1;
    }
  });

  const totalUniqueCustomers = currentCompletedCustomers.size;
  const returningPct = totalUniqueCustomers > 0 ? Math.round((returningCustomersCount / totalUniqueCustomers) * 100) : 0;

  const customerMetrics: CustomerMetrics = {
    new_customers: newCustomersCount,
    returning_customers: returningCustomersCount,
    total_completed_customers: totalUniqueCustomers,
    repeat_order_count: repeatOrderCount,
    returning_percentage: returningPct,
  };

  // 6. Peak Ordering Hours (0 to 23 in Asia/Kolkata business timezone)
  const hourBins = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    formatted_hour: `${h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}`,
    order_count: 0,
    completed_count: 0,
    revenue: 0,
  }));

  currentRequests.forEach((r) => {
    const hour = getISTHour(r.created_at);
    if (hourBins[hour]) {
      hourBins[hour].order_count += 1;
      if (r.current_state === 'COMPLETED') {
        hourBins[hour].completed_count += 1;
        hourBins[hour].revenue += r.total_estimate || 0;
      }
    }
  });

  // 7. Appointment Analytics
  const isAppointmentVertical = currentRequests.some((r) => r.workflow_group_code === 'APPOINTMENT');
  const appointmentRequests = currentRequests.filter((r) => r.workflow_group_code === 'APPOINTMENT');
  const aptCompleted = appointmentRequests.filter((r) => r.current_state === 'COMPLETED').length;
  const aptCancelled = appointmentRequests.filter((r) => r.current_state === 'CANCELLED').length;
  const aptRejected = appointmentRequests.filter((r) => r.current_state === 'REJECTED').length;

  const serviceBookings = new Map<
    string,
    {
      count: number;
      completed_count: number;
      settled_revenue: number;
      booked_value: number;
    }
  >();
  const slotBookings = new Map<string, number>();

  appointmentRequests.forEach((r) => {
    try {
      const parsed = JSON.parse(r.notes || '{}');
      if (parsed.service_name) {
        const entry = serviceBookings.get(parsed.service_name) || {
          count: 0,
          completed_count: 0,
          settled_revenue: 0,
          booked_value: 0,
        };
        entry.count += 1;
        const estimate = Number(r.total_estimate) || 0;
        entry.booked_value += estimate;
        if (r.current_state === 'COMPLETED') {
          entry.completed_count += 1;
          entry.settled_revenue += estimate;
        }
        serviceBookings.set(parsed.service_name, entry);
      }
      if (parsed.start_time) {
        slotBookings.set(parsed.start_time, (slotBookings.get(parsed.start_time) || 0) + 1);
      }
    } catch {
      // ignore
    }
  });

  const mostBookedServices = Array.from(serviceBookings.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      completed_count: data.completed_count,
      revenue: data.settled_revenue, // Strictly settled revenue from completed appointments
      booked_value: data.booked_value, // Total booked pipeline value across all appointments
    }))
    .sort((a, b) => b.count - a.count);

  const peakSlots = Array.from(slotBookings.entries())
    .map(([time, count]) => ({ time, count }))
    .sort((a, b) => b.count - a.count);

  const utilizationRate =
    appointmentRequests.length > 0 ? Math.round((aptCompleted / appointmentRequests.length) * 100) : 0;

  const appointments: AppointmentAnalytics = {
    has_appointment_vertical: isAppointmentVertical,
    total_appointments: appointmentRequests.length,
    completed: aptCompleted,
    cancelled: aptCancelled,
    rejected: aptRejected,
    utilization_rate: utilizationRate,
    most_booked_services: mostBookedServices,
    peak_slots: peakSlots,
  };

  // 8. Cancellation & Rejection Breakdown
  const custCancelled = currentRequests.filter(
    (r) => r.current_state === 'CANCELLED' && (!r.notes || !r.notes.includes('merchant'))
  ).length;
  const shopRejected = currentRequests.filter((r) => r.current_state === 'REJECTED').length;
  const shopCancelled = currentRequests.filter(
    (r) => r.current_state === 'CANCELLED' && r.notes && r.notes.includes('merchant')
  ).length;
  const systemExpired = currentRequests.filter((r) => r.current_state === 'EXPIRED').length;

  const totalCancellations = custCancelled + shopRejected + shopCancelled + systemExpired;
  const totalCount = currentRequests.length;
  const cancellationRate = totalCount > 0 ? Math.round((totalCancellations / totalCount) * 100) : 0;
  const rejectionRate = totalCount > 0 ? Math.round((shopRejected / totalCount) * 100) : 0;

  const cancellations: CancellationMetrics = {
    customer_cancelled: custCancelled,
    shop_rejected: shopRejected,
    shop_cancelled: shopCancelled,
    system_expired: systemExpired,
    total_cancellations: totalCancellations,
    cancellation_rate: cancellationRate,
    rejection_rate: rejectionRate,
  };

  // 9. Payment Methods Breakdown (Authoritative database field with settled revenue isolation)
  const paymentMap = new Map<
    string,
    {
      method_code: string;
      method: string;
      completed_count: number;
      settled_amount: number;
      verified_count: number;
      pending_count: number;
      cancelled_count: number;
    }
  >();

  currentRequests.forEach((r) => {
    const methodCode = extractPaymentMethodCode(r);
    const methodLabel = getPaymentMethodLabel(methodCode);

    const entry = paymentMap.get(methodCode) || {
      method_code: methodCode,
      method: methodLabel,
      completed_count: 0,
      settled_amount: 0,
      verified_count: 0,
      pending_count: 0,
      cancelled_count: 0,
    };

    const isCompleted = r.current_state === 'COMPLETED';
    const isPending = ['REQUESTED', 'ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY'].includes(
      r.current_state
    );
    const isCancelledOrRejected = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(r.current_state);

    if (isCompleted) {
      entry.completed_count += 1;
      entry.settled_amount += r.total_estimate || 0;
      if (r.customer_paid || r.payment_status === 'PAYMENT_VERIFIED' || r.payment_status === 'paid') {
        entry.verified_count += 1;
      }
    } else if (isPending) {
      entry.pending_count += 1;
    } else if (isCancelledOrRejected) {
      entry.cancelled_count += 1;
    }

    paymentMap.set(methodCode, entry);
  });

  const paymentMethods: PaymentMethodMetrics[] = Array.from(paymentMap.values())
    .filter((data) => data.completed_count > 0 || data.pending_count > 0 || data.cancelled_count > 0)
    .map((data) => ({
      method_code: data.method_code,
      method: data.method,
      count: data.completed_count,
      total_amount: data.settled_amount,
      verified_count: data.verified_count,
      unverified_count: data.pending_count,
      pending_count: data.pending_count,
      cancelled_count: data.cancelled_count,
    }))
    .sort((a, b) => b.total_amount - a.total_amount);

  return {
    tier: shop.subscription_tier || 'FREE',
    filter,
    overview,
    revenue_trends: revenueTrends,
    peak_day: peakDay,
    average_daily_revenue: averageDailyRevenue,
    has_previous_period_trend: hasPreviousPeriodData,
    top_products: topProducts,
    variant_performance: variantPerformance,
    slow_moving_products: slowMovingProducts,
    customer_metrics: customerMetrics,
    peak_hours: hourBins,
    appointments,
    cancellations,
    payment_methods: paymentMethods,
  };
};

/**
 * Generate CSV Report string and trigger browser download
 */
export const exportAnalyticsReportCsv = (shop: Shop, requests: Request[], filter: AnalyticsFilter) => {
  const headers = [
    'Date',
    'Order Reference',
    'Customer Ref',
    'Workflow Vertical',
    'Items or Service',
    'Order Value (INR)',
    'Payment Status',
    'Order Status',
    'Scheduled For',
    'Completed At',
  ];

  const rows = requests.map((req) => {
    const items = extractItemsFromRequest(req);
    const itemNames = items.map((i) => (i.variant_label ? `${i.name} (${i.variant_label}) x${i.quantity}` : `${i.name} x${i.quantity}`)).join('; ');
    const paymentStatus = req.customer_paid ? 'VERIFIED' : 'UNVERIFIED';
    const completedAt = req.current_state === 'COMPLETED' ? req.updated_at.slice(0, 19).replace('T', ' ') : '-';

    return [
      getISTDateString(req.created_at),
      req.reference_code,
      `CUST-${req.customer_id.slice(-6).toUpperCase()}`,
      req.workflow_group_code,
      `"${itemNames.replace(/"/g, '""')}"`,
      req.total_estimate || 0,
      paymentStatus,
      req.current_state,
      req.scheduled_for || '-',
      completedAt,
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `${shop.name.replace(/\s+/g, '_')}_Analytics_${filter.startDate}_to_${filter.endDate}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

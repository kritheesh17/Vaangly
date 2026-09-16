import { Request, Shop } from '../types/database';
import {
  BusinessAnalyticsData,
  AnalyticsFilter,
  RevenueTrendPoint,
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
    case '7d':
      start.setDate(end.getDate() - 6);
      break;
    case '30d':
      start.setDate(end.getDate() - 29);
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

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
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
  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59.999`).getTime();

  // Filter requests for current selected window
  const currentRequests = allRequests.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= startTs && t <= endTs;
  });

  // Calculate prior period for comparison
  const windowDuration = endTs - startTs;
  const prevStartTs = startTs - windowDuration;
  const prevEndTs = startTs - 1;
  const previousRequests = allRequests.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= prevStartTs && t <= prevEndTs;
  });

  // 1. Sales & Revenue Metrics
  const completedCurrent = currentRequests.filter((r) => r.current_state === 'COMPLETED');
  const completedPrevious = previousRequests.filter((r) => r.current_state === 'COMPLETED');

  const totalSales = completedCurrent.reduce((sum, r) => sum + (r.total_estimate || 0), 0);
  const previousPeriodSales = completedPrevious.reduce((sum, r) => sum + (r.total_estimate || 0), 0);

  const grossOrderValue = currentRequests
    .filter((r) => r.current_state !== 'REJECTED')
    .reduce((sum, r) => sum + (r.total_estimate || 0), 0);

  const averageOrderValue = completedCurrent.length > 0 ? Math.round(totalSales / completedCurrent.length) : 0;

  let salesGrowthPct: number | null = null;
  if (previousPeriodSales > 0) {
    salesGrowthPct = Math.round(((totalSales - previousPeriodSales) / previousPeriodSales) * 100);
  } else if (totalSales > 0 && previousPeriodSales === 0) {
    salesGrowthPct = 100;
  }

  let ordersGrowthPct: number | null = null;
  if (completedPrevious.length > 0) {
    ordersGrowthPct = Math.round(
      ((completedCurrent.length - completedPrevious.length) / completedPrevious.length) * 100
    );
  }

  const overview: SalesOverview = {
    total_sales: totalSales,
    completed_orders: completedCurrent.length,
    average_order_value: averageOrderValue,
    gross_order_value: grossOrderValue,
    previous_period_sales: previousPeriodSales,
    sales_growth_pct: salesGrowthPct,
    previous_period_orders: completedPrevious.length,
    orders_growth_pct: ordersGrowthPct,
  };

  // 2. Revenue Trends Points (Daily or Grouped)
  const trendsMap = new Map<
    string,
    { gross: number; completed: number; cancelled: number; verified: number; count: number }
  >();

  // Initialize dates in range for continuous chart rendering
  const cursor = new Date(startTs);
  while (cursor.getTime() <= endTs) {
    const dStr = cursor.toISOString().slice(0, 10);
    trendsMap.set(dStr, { gross: 0, completed: 0, cancelled: 0, verified: 0, count: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  currentRequests.forEach((r) => {
    const dStr = r.created_at.slice(0, 10);
    const existing = trendsMap.get(dStr) || { gross: 0, completed: 0, cancelled: 0, verified: 0, count: 0 };
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
    trendsMap.set(dStr, existing);
  });

  const revenueTrends: RevenueTrendPoint[] = Array.from(trendsMap.entries()).map(([dStr, data]) => {
    const dateObj = new Date(`${dStr}T00:00:00`);
    const label = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return {
      date: dStr,
      label,
      gross_order_value: data.gross,
      completed_sales: data.completed,
      cancelled_amount: data.cancelled,
      verified_payments: data.verified,
      order_count: data.count,
    };
  });

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
  // Determine returning customers based on lifetime completed orders prior to this order
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
      const totalLifetimeOrders = completedCustomerOrders.get(r.customer_id) || 1;
      if (totalLifetimeOrders > 1) {
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

  // 6. Peak Ordering Hours (0 to 23 in business timezone)
  const hourBins = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    formatted_hour: `${h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}`,
    order_count: 0,
    completed_count: 0,
    revenue: 0,
  }));

  currentRequests.forEach((r) => {
    const d = new Date(r.created_at);
    const hour = d.getHours(); // Local browser/business hour
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

  const serviceBookings = new Map<string, { count: number; revenue: number }>();
  const slotBookings = new Map<string, number>();

  appointmentRequests.forEach((r) => {
    try {
      const parsed = JSON.parse(r.notes || '{}');
      if (parsed.service_name) {
        const entry = serviceBookings.get(parsed.service_name) || { count: 0, revenue: 0 };
        entry.count += 1;
        entry.revenue += Number(r.total_estimate) || 0;
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
    .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
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

  // 9. Payment Methods Breakdown
  const paymentMap = new Map<string, { count: number; total: number; verified: number; unverified: number }>();
  currentRequests.forEach((r) => {
    let method = 'Cash / Direct Settlement';
    if (r.payment_screenshot_url || r.customer_paid) {
      method = 'UPI / Online Transfer';
    }

    const entry = paymentMap.get(method) || { count: 0, total: 0, verified: 0, unverified: 0 };
    entry.count += 1;
    entry.total += r.total_estimate || 0;
    if (r.customer_paid) {
      entry.verified += 1;
    } else {
      entry.unverified += 1;
    }
    paymentMap.set(method, entry);
  });

  const paymentMethods: PaymentMethodMetrics[] = Array.from(paymentMap.entries()).map(([method, data]) => ({
    method,
    count: data.count,
    total_amount: data.total,
    verified_count: data.verified,
    unverified_count: data.unverified,
  }));

  return {
    tier: shop.subscription_tier || 'FREE',
    filter,
    overview,
    revenue_trends: revenueTrends,
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
      req.created_at.slice(0, 10),
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

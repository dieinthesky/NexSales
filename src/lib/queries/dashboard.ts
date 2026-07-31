import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Sale } from '@/types/database'
import { startOfMonth, endOfMonth, subDays } from 'date-fns'
import { brDayRangeUTC, formatBRDayMonth, todayBRISO } from '@/lib/utils/datetime'
import { isElectron } from '@/lib/db/client'

export async function getDashboardMetrics() {
  if (isElectron()) {
    try {
      const { getDashboardMetrics: sqliteGet } = await import('@/lib/db/queries/dashboard')
      return sqliteGet()
    } catch (err) {
      console.warn('[electron] sqlite getDashboardMetrics failed, falling back to Supabase:', err)
    }
  }

  const supabase = await createClient()
  const now = new Date()
  const today = brDayRangeUTC(todayBRISO())

  const [todaySales, monthSales, allProducts, recentSales] = await Promise.all([
    supabase
      .from('sales')
      .select('total_amount')
      .gte('created_at', today.start)
      .lte('created_at', today.end),

    supabase
      .from('sales')
      .select('total_amount')
      .gte('created_at', startOfMonth(now).toISOString())
      .lte('created_at', endOfMonth(now).toISOString()),

    supabase
      .from('products')
      .select('stock_quantity, min_stock')
      .eq('is_active', true),

    supabase
      .from('sales')
      .select('id, total_amount, payment_method, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const todayTotal = (todaySales.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
  const monthTotal = (monthSales.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
  const todayCount = todaySales.data?.length ?? 0
  const monthCount = monthSales.data?.length ?? 0
  const avgTicket = monthCount > 0 ? monthTotal / monthCount : 0
  const lowStockCount = (allProducts.data ?? []).filter(
    (p) => p.stock_quantity <= p.min_stock
  ).length

  return {
    todayTotal,
    monthTotal,
    todayCount,
    monthCount,
    avgTicket,
    lowStockCount,
    recentSales: (recentSales.data ?? []) as Sale[],
  }
}

export async function getSalesLast30Days() {
  if (isElectron()) {
    try {
      const { getSalesLast30Days: sqliteGet } = await import('@/lib/db/queries/dashboard')
      return sqliteGet()
    } catch (err) {
      console.warn('[electron] sqlite getSalesLast30Days failed, falling back to Supabase:', err)
    }
  }

  const supabase = await createClient()
  const now = new Date()
  const from = subDays(now, 29)

  const { data, error } = await supabase
    .from('sales')
    .select('total_amount, created_at')
    .gte('created_at', from.toISOString())
    .order('created_at')

  if (error) throw new Error(error.message)

  const byDay: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    const day = formatBRDayMonth(subDays(now, 29 - i))
    byDay[day] = 0
  }

  for (const sale of data ?? []) {
    const day = formatBRDayMonth(sale.created_at)
    if (byDay[day] !== undefined) {
      byDay[day] += Number(sale.total_amount)
    }
  }

  return Object.entries(byDay).map(([date, total]) => ({ date, total }))
}

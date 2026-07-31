import 'server-only'
import { getDb } from '../client'
import { brDayRangeUTC, formatBRDayMonth, todayBRISO } from '@/lib/utils/datetime'
import { subDays } from 'date-fns'
import type { Sale } from '@/types/database'

interface SaleRow {
  id: string
  total_amount: number
  payment_method: string
  notes: string | null
  seller_id: string
  created_at: string
  client_uuid: string | null
  customer_id: string | null
}

interface ProductStockRow {
  stock_quantity: number
  min_stock: number
}

export function getDashboardMetrics() {
  const db = getDb()
  const today = brDayRangeUTC(todayBRISO())
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

  const todaySales = db
    .prepare(`SELECT total_amount FROM sales WHERE created_at >= ? AND created_at <= ?`)
    .all(today.start, today.end) as Pick<SaleRow, 'total_amount'>[]

  const monthSales = db
    .prepare(`SELECT total_amount FROM sales WHERE created_at >= ? AND created_at <= ?`)
    .all(monthStart, monthEnd) as Pick<SaleRow, 'total_amount'>[]

  const allProducts = db
    .prepare(
      `SELECT stock_quantity, min_stock FROM products
       WHERE is_active = 1 AND COALESCE(track_stock, 1) = 1`,
    )
    .all() as ProductStockRow[]

  const recentSales = db
    .prepare(
      `SELECT id, total_amount, payment_method, notes, seller_id, created_at, client_uuid, customer_id
       FROM sales ORDER BY created_at DESC LIMIT 10`,
    )
    .all() as SaleRow[]

  const todayTotal = todaySales.reduce((s, r) => s + r.total_amount, 0)
  const monthTotal = monthSales.reduce((s, r) => s + r.total_amount, 0)
  const todayCount = todaySales.length
  const monthCount = monthSales.length
  const avgTicket = monthCount > 0 ? monthTotal / monthCount : 0
  const lowStockCount = allProducts.filter((p) => p.stock_quantity <= p.min_stock).length

  return {
    todayTotal,
    monthTotal,
    todayCount,
    monthCount,
    avgTicket,
    lowStockCount,
    recentSales: recentSales as unknown as Sale[],
  }
}

export function getSalesLast30Days() {
  const db = getDb()
  const now = new Date()
  const from = subDays(now, 29).toISOString()

  const rows = db
    .prepare(`SELECT total_amount, created_at FROM sales WHERE created_at >= ? ORDER BY created_at`)
    .all(from) as Pick<SaleRow, 'total_amount' | 'created_at'>[]

  const byDay: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    byDay[formatBRDayMonth(subDays(now, 29 - i))] = 0
  }

  for (const sale of rows) {
    const day = formatBRDayMonth(sale.created_at)
    if (day in byDay) byDay[day] += sale.total_amount
  }

  return Object.entries(byDay).map(([date, total]) => ({ date, total }))
}

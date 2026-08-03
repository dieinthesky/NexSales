import 'server-only'
import { startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns'
import { applyStoreFilter, getAppDataContext } from '@/lib/supabase/app-data'

export type DREPeriod = 'this-month' | 'last-month' | 'last-30' | 'last-90'

export interface DREResult {
  revenue: number
  cost: number
  grossProfit: number
  grossMargin: number
  salesCount: number
  byPayment: Record<string, { revenue: number; count: number }>
  topProducts: Array<{
    name: string
    revenue: number
    cost: number
    profit: number
    margin: number
    quantity: number
  }>
}

export const PERIOD_LABELS: Record<DREPeriod, string> = {
  'this-month': 'Este mês',
  'last-month': 'Mês passado',
  'last-30': 'Últimos 30 dias',
  'last-90': 'Últimos 90 dias',
}

function periodRange(period: DREPeriod): { start: string; end: string } {
  const now = new Date()
  switch (period) {
    case 'this-month':
      return { start: startOfMonth(now).toISOString(), end: endOfMonth(now).toISOString() }
    case 'last-month': {
      const last = subMonths(now, 1)
      return { start: startOfMonth(last).toISOString(), end: endOfMonth(last).toISOString() }
    }
    case 'last-30':
      return { start: subDays(now, 29).toISOString(), end: now.toISOString() }
    case 'last-90':
      return { start: subDays(now, 89).toISOString(), end: now.toISOString() }
  }
}

type SaleItemRow = {
  quantity: number
  subtotal: number
  products: { cost_price: number; name: string } | null
}

type SaleRow = {
  id: string
  total_amount: number
  payment_method: string
  sale_items: SaleItemRow[]
}

export async function getDREReport(period: DREPeriod = 'this-month'): Promise<DREResult> {
  const ctx = await getAppDataContext()
  const { start, end } = periodRange(period)

  let query = ctx.client
    .from('sales')
    .select(
      'id, total_amount, payment_method, sale_items(quantity, subtotal, products(cost_price, name))',
    )
    .gte('created_at', start)
    .lte('created_at', end)
  query = applyStoreFilter(query, ctx)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const sales = (data ?? []) as SaleRow[]

  let revenue = 0
  let cost = 0
  const byPayment: Record<string, { revenue: number; count: number }> = {}
  const productMap: Record<
    string,
    { name: string; revenue: number; cost: number; quantity: number }
  > = {}

  for (const sale of sales) {
    revenue += Number(sale.total_amount)

    const pm = sale.payment_method
    if (!byPayment[pm]) byPayment[pm] = { revenue: 0, count: 0 }
    byPayment[pm].revenue += Number(sale.total_amount)
    byPayment[pm].count++

    for (const item of sale.sale_items ?? []) {
      const itemCost = item.quantity * (item.products?.cost_price ?? 0)
      cost += itemCost

      const name = item.products?.name ?? 'Produto removido'
      if (!productMap[name]) productMap[name] = { name, revenue: 0, cost: 0, quantity: 0 }
      productMap[name].revenue += Number(item.subtotal)
      productMap[name].cost += itemCost
      productMap[name].quantity += item.quantity
    }
  }

  const grossProfit = revenue - cost
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const topProducts = Object.values(productMap)
    .map((p) => ({
      name: p.name,
      revenue: p.revenue,
      cost: p.cost,
      profit: p.revenue - p.cost,
      margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      quantity: p.quantity,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  return {
    revenue,
    cost,
    grossProfit,
    grossMargin,
    salesCount: sales.length,
    byPayment,
    topProducts,
  }
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { brDayRangeUTC, todayBRISO } from '@/lib/utils/datetime'
import type { Database, PaymentMethod } from '@/types/database'

export interface PaymentBreakdown {
  method: PaymentMethod
  count: number
  total: number
}

export interface SaleItemSummary {
  productCode: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface SaleRow {
  id: string
  created_at: string
  total_amount: number
  payment_method: PaymentMethod
  notes: string | null
  items: SaleItemSummary[]
}

export interface CashCloseSummary {
  /** ISO date YYYY-MM-DD that was queried */
  date: string
  /** Number of sales in the window */
  count: number
  /** Sum of total_amount in the window */
  total: number
  /** Average ticket = total / count, or 0 when count is 0 */
  averageTicket: number
  /** Per-method aggregation, sorted by total desc */
  byPayment: PaymentBreakdown[]
  /** Raw sales list, each with its items */
  sales: SaleRow[]
}

interface RawProduct {
  name: string
  code: string
}

interface RawSaleItem {
  quantity: number
  unit_price: number
  subtotal: number
  products: RawProduct | null
}

interface RawSale {
  id: string
  created_at: string
  total_amount: number
  payment_method: string
  notes: string | null
  sale_items: RawSaleItem[] | null
}

/**
 * Aggregate all sales for a single local-day window (00:00 → 23:59:59.999),
 * including each sale's line items (product, quantity, prices).
 *
 * Pass an explicit `client` (e.g. the service-role client) for contexts that
 * have no user session — like the daily-report cron. Defaults to the
 * cookie-based server client used by the cash-close page.
 */
export async function getCashClose(
  localDate: string,
  client?: SupabaseClient<Database>,
): Promise<CashCloseSummary> {
  // localDate is the BRT calendar day the operator picked. Translate that
  // into the UTC instants that bound the day in São Paulo so the query
  // catches sales rung up after 21:00 local (which are already "tomorrow"
  // in UTC).
  const { start, end } = brDayRangeUTC(localDate)

  const supabase = client ?? (await createClient())
  let { data, error } = await supabase
    .from('sales')
    .select(
      'id, created_at, total_amount, payment_method, notes, sale_items(quantity, unit_price, subtotal, products(code, name)), sale_payments(payment_method, amount)',
    )
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true })

  // Antes da migração sale_payments, cai no select antigo.
  if (error?.message?.includes('sale_payments')) {
    ;({ data, error } = await supabase
      .from('sales')
      .select(
        'id, created_at, total_amount, payment_method, notes, sale_items(quantity, unit_price, subtotal, products(code, name))',
      )
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }))
  }

  if (error) throw new Error(error.message)

  type RawSaleWithPays = RawSale & {
    sale_payments?: { payment_method: PaymentMethod; amount: number }[] | null
  }
  const rows = (data ?? []) as unknown as RawSaleWithPays[]

  const sales: SaleRow[] = rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    total_amount: Number(row.total_amount),
    payment_method: row.payment_method as PaymentMethod,
    notes: row.notes,
    items: (row.sale_items ?? []).map((item) => ({
      productCode: item.products?.code ?? '—',
      productName: item.products?.name ?? '(produto removido)',
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  }))

  const byPaymentMap = new Map<PaymentMethod, PaymentBreakdown>()
  let total = 0
  for (const row of rows) {
    const saleTotal = Number(row.total_amount)
    total += saleTotal
    const pays = row.sale_payments ?? []
    if (pays.length > 0) {
      for (const pay of pays) {
        const method = pay.payment_method
        const amount = Number(pay.amount)
        const current = byPaymentMap.get(method) ?? { method, count: 0, total: 0 }
        byPaymentMap.set(method, {
          method,
          count: current.count + 1,
          total: current.total + amount,
        })
      }
    } else {
      const method = row.payment_method as PaymentMethod
      const current = byPaymentMap.get(method) ?? { method, count: 0, total: 0 }
      byPaymentMap.set(method, {
        method,
        count: current.count + 1,
        total: current.total + saleTotal,
      })
    }
  }

  const byPayment = Array.from(byPaymentMap.values()).sort((a, b) => b.total - a.total)
  const count = sales.length
  const averageTicket = count > 0 ? total / count : 0

  return { date: localDate, count, total, averageTicket, byPayment, sales }
}

/** YYYY-MM-DD of "today" in São Paulo, regardless of where the code runs. */
export function todayLocalISO(): string {
  return todayBRISO()
}

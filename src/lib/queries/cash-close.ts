import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { brDayRangeUTC, todayBRISO } from '@/lib/utils/datetime'
import type { Database, PaymentMethod } from '@/types/database'
import type { AppDataContext } from '@/lib/supabase/app-data'

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
  date: string
  count: number
  total: number
  averageTicket: number
  byPayment: PaymentBreakdown[]
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
  sale_payments?: { payment_method: PaymentMethod; amount: number }[] | null
}

/**
 * Fechamento de caixa de um dia (BRT). No .exe usa getAppDataContext (service role).
 */
export async function getCashClose(
  localDate: string,
  client?: SupabaseClient<Database>,
): Promise<CashCloseSummary> {
  const { start, end } = brDayRangeUTC(localDate)

  if (client) {
    return buildCashClose(localDate, start, end, client, null)
  }

  try {
    const { getAppDataContext } = await import('@/lib/supabase/app-data')
    const ctx = await getAppDataContext()
    return buildCashClose(localDate, start, end, ctx.client, ctx)
  } catch {
    const supabase = await createClient()
    return buildCashClose(localDate, start, end, supabase, null)
  }
}

async function buildCashClose(
  localDate: string,
  start: string,
  end: string,
  supabase: SupabaseClient<Database>,
  storeCtx: Pick<AppDataContext, 'mode' | 'storeId'> | null,
): Promise<CashCloseSummary> {
  let withPaymentsQ = supabase
    .from('sales')
    .select(
      'id, created_at, total_amount, payment_method, notes, sale_items(quantity, unit_price, subtotal, products(code, name)), sale_payments(payment_method, amount)',
    )
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true })

  if (storeCtx?.mode === 'service' && storeCtx.storeId) {
    withPaymentsQ = withPaymentsQ.eq('store_id', storeCtx.storeId)
  }

  const withPayments = await withPaymentsQ
  let rows: RawSale[]

  if (withPayments.error?.message?.includes('sale_payments')) {
    let legacyQ = supabase
      .from('sales')
      .select(
        'id, created_at, total_amount, payment_method, notes, sale_items(quantity, unit_price, subtotal, products(code, name))',
      )
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true })

    if (storeCtx?.mode === 'service' && storeCtx.storeId) {
      legacyQ = legacyQ.eq('store_id', storeCtx.storeId)
    }

    const legacy = await legacyQ
    if (legacy.error) throw new Error(legacy.error.message)
    rows = (legacy.data ?? []) as unknown as RawSale[]
  } else if (withPayments.error) {
    throw new Error(withPayments.error.message)
  } else {
    rows = (withPayments.data ?? []) as unknown as RawSale[]
  }

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

export function todayLocalISO(): string {
  return todayBRISO()
}

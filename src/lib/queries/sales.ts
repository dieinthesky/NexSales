import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { brDayRangeUTC } from '@/lib/utils/datetime'
import type { PaymentMethod, Sale, SaleWithItems } from '@/types/database'
import { isElectron } from '@/lib/db/client'

export interface SalesListParams {
  payment?: PaymentMethod
  /** Filtro de dia exato (YYYY-MM-DD em BRT). */
  day?: string
  page?: number
  pageSize?: number
}

export interface SalesListResult {
  items: Sale[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const DEFAULT_PAGE_SIZE = 25

async function getSalesPagedFromSupabase(
  params: SalesListParams = {},
): Promise<SalesListResult> {
  const supabase = await createClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))

  // Master vê todas as lojas — oculta vendas do catálogo modelo (ruído de testes).
  const { data: templates } = await supabase
    .from('stores')
    .select('id')
    .eq('is_template', true)
  const templateIds = (templates ?? []).map((t) => t.id)

  let query = supabase
    .from('sales')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (templateIds.length > 0) {
    query = query.not('store_id', 'in', `(${templateIds.join(',')})`)
  }

  if (params.payment) {
    query = query.eq('payment_method', params.payment)
  }

  if (params.day) {
    const { start, end } = brDayRangeUTC(params.day)
    query = query.gte('created_at', start).lte('created_at', end)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: (data ?? []) as Sale[],
    total,
    page,
    pageSize,
    totalPages,
  }
}

export async function getSalesPaged(
  params: SalesListParams = {},
): Promise<SalesListResult> {
  // Electron online: prefer Supabase so Histórico não fica defasado se o pull SQLite falhar
  if (isElectron()) {
    try {
      return await getSalesPagedFromSupabase(params)
    } catch (err) {
      console.warn('[electron] Supabase getSalesPaged failed, trying SQLite:', err)
      try {
        const { getSalesPaged: sqliteGet } = await import('@/lib/db/queries/sales')
        return sqliteGet(params)
      } catch (sqliteErr) {
        console.warn('[electron] sqlite getSalesPaged also failed:', sqliteErr)
        throw err
      }
    }
  }

  return getSalesPagedFromSupabase(params)
}

async function getSaleByIdFromSupabase(id: string): Promise<SaleWithItems | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*, products(*)), customers(full_name)')
    .eq('id', id)
    .single()

  if (error) return null
  return data as SaleWithItems
}

export async function getSaleById(id: string): Promise<SaleWithItems | null> {
  // Electron online: prefer Supabase so detalhe/recibo não mostram venda já cancelada
  // (ou omitem venda nova) enquanto o SQLite ainda não sincronizou.
  if (isElectron()) {
    try {
      const remote = await getSaleByIdFromSupabase(id)
      if (remote) return remote
    } catch (err) {
      console.warn('[electron] Supabase getSaleById failed, trying SQLite:', err)
    }
    try {
      const { getSaleById: sqliteGet } = await import('@/lib/db/queries/sales')
      return sqliteGet(id)
    } catch (sqliteErr) {
      console.warn('[electron] sqlite getSaleById also failed:', sqliteErr)
      return null
    }
  }

  return getSaleByIdFromSupabase(id)
}

export async function getTopProducts(limit = 5) {
  if (isElectron()) {
    const { getTopProducts: sqliteGet } = await import('@/lib/db/queries/sales')
    return sqliteGet(limit)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sale_items')
    .select('product_id, quantity, products(name, code)')
    .limit(500)

  if (error) throw new Error(error.message)

  const totals: Record<string, { name: string; code: string; total: number }> = {}

  for (const item of data ?? []) {
    const pid = item.product_id
    if (!totals[pid]) {
      totals[pid] = {
        name: (item.products as { name: string; code: string })?.name ?? '',
        code: (item.products as { name: string; code: string })?.code ?? '',
        total: 0,
      }
    }
    totals[pid].total += item.quantity
  }

  return Object.entries(totals)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

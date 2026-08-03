import 'server-only'
import { brDayRangeUTC } from '@/lib/utils/datetime'
import type { PaymentMethod, Sale, SaleWithItems } from '@/types/database'
import { isElectron } from '@/lib/db/client'
import {
  applyStoreFilter,
  assertStoreAccess,
  getAppDataContext,
  withAppDataOrSqlite,
} from '@/lib/supabase/app-data'

export interface SalesListParams {
  payment?: PaymentMethod
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

async function getSalesPagedFromCloud(
  params: SalesListParams = {},
): Promise<SalesListResult> {
  const ctx = await getAppDataContext()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))

  const { data: templates } = await ctx.client
    .from('stores')
    .select('id')
    .eq('is_template', true)
  const templateIds = (templates ?? []).map((t) => t.id)

  let query = ctx.client
    .from('sales')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  query = applyStoreFilter(query, ctx)

  if (templateIds.length > 0 && (ctx.role === 'master' || !ctx.storeId)) {
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
  return withAppDataOrSqlite(
    () => getSalesPagedFromCloud(params),
    async () => {
      const { getSalesPaged: sqliteGet } = await import('@/lib/db/queries/sales')
      return sqliteGet(params)
    },
  )
}

export async function getSaleById(id: string): Promise<SaleWithItems | null> {
  try {
    const ctx = await getAppDataContext()
    const { data, error } = await ctx.client
      .from('sales')
      .select('*, sale_items(*, products(*)), customers(full_name)')
      .eq('id', id)
      .maybeSingle()

    if (!error && data) {
      const sale = data as SaleWithItems
      if (!assertStoreAccess(ctx, sale.store_id)) return null
      return sale
    }
  } catch (err) {
    console.warn('[getSaleById] app-data failed:', err)
  }

  if (isElectron()) {
    try {
      const { getSaleById: sqliteGet } = await import('@/lib/db/queries/sales')
      return sqliteGet(id)
    } catch {
      return null
    }
  }

  return null
}

export async function getTopProducts(limit = 5) {
  return withAppDataOrSqlite(
    async () => {
      const ctx = await getAppDataContext()
      let query = ctx.client
        .from('sale_items')
        .select('product_id, quantity, products(name, code), sales!inner(store_id)')
        .limit(500)

      // filtro por loja nos itens via join sales quando service role
      if (ctx.mode === 'service' && ctx.storeId) {
        query = query.eq('sales.store_id', ctx.storeId)
      }

      const { data, error } = await query
      if (error) {
        // fallback sem join se o schema do join falhar
        const simple = await ctx.client
          .from('sale_items')
          .select('product_id, quantity, products(name, code)')
          .limit(500)
        if (simple.error) throw new Error(simple.error.message)
        return aggregateTop(simple.data ?? [], limit)
      }
      return aggregateTop(data ?? [], limit)
    },
    async () => {
      const { getTopProducts: sqliteGet } = await import('@/lib/db/queries/sales')
      return sqliteGet(limit)
    },
  )
}

function aggregateTop(
  data: Array<{
    product_id: string
    quantity: number
    products: { name: string; code: string } | null
  }>,
  limit: number,
) {
  const totals: Record<string, { name: string; code: string; total: number }> = {}

  for (const item of data) {
    const pid = item.product_id
    if (!totals[pid]) {
      totals[pid] = {
        name: item.products?.name ?? '',
        code: item.products?.code ?? '',
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

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Category, ProductWithCategory } from '@/types/database'
import { isElectron } from '@/lib/db/client'

export type StockFilter = 'all' | 'ok' | 'low' | 'out'

export interface ProductsListParams {
  search?: string
  categoryId?: string
  stock?: StockFilter
  page?: number
  pageSize?: number
}

export interface ProductsListResult {
  items: ProductWithCategory[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const DEFAULT_PAGE_SIZE = 20

export async function getProductsPaged(
  params: ProductsListParams = {},
): Promise<ProductsListResult> {
  // Electron reads directly from SQLite — always fresh (synced every 60 s),
  // instant, and immune to the tryQuery race condition where a hanging Supabase
  // TCP connection causes the 5-second fallback timer to fire before this
  // catch-block can return SQLite data.
  if (isElectron()) {
    try {
      const { getProductsPaged: sqliteGet } = await import('@/lib/db/queries/products')
      return sqliteGet(params)
    } catch (err) {
      console.warn('[electron] sqlite getProductsPaged failed, falling back to Supabase:', err)
    }
  }

  const supabase = await createClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))

  let query = supabase
    .from('products')
    .select('*, categories(id, name)', { count: 'exact' })
    .eq('is_active', true)
    .neq('code', '__PIX_LOJA__')
    .neq('code', '__ASSINATURA__')

  if (params.search) {
    const s = sanitizeForIlike(params.search)
    query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`)
  }

  if (params.categoryId) {
    query = query.eq('category_id', params.categoryId)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // low/ok precisam comparar stock vs min_stock (coluna a coluna) — PostgREST
  // não faz isso de forma estável. Para esses filtros, trazemos só produtos
  // com track_stock e paginamos em memória (catálogo típico de bairro é pequeno).
  if (params.stock === 'low' || params.stock === 'ok') {
    query = query.eq('track_stock', true).order('name')
    const { data, error } = await query
    if (error) throw new Error(error.message)

    let items = (data ?? []) as ProductWithCategory[]
    if (params.stock === 'low') {
      items = items.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock)
    } else {
      items = items.filter((p) => p.stock_quantity > p.min_stock)
    }

    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return {
      items: items.slice(from, from + pageSize),
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  if (params.stock === 'out') {
    query = query.eq('track_stock', true).lte('stock_quantity', 0)
  }

  query = query.order('name', { ascending: true }).order('code', { ascending: true }).range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  // Evita linha duplicada se o join de categoria vier instável
  const seen = new Set<string>()
  const items = ((data ?? []) as ProductWithCategory[]).filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  const total = count ?? items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { items, total, page, pageSize, totalPages }
}

export async function getLowStock(): Promise<ProductWithCategory[]> {
  if (isElectron()) {
    try {
      const { getLowStock: sqliteGet } = await import('@/lib/db/queries/products')
      return sqliteGet()
    } catch (err) {
      console.warn('[electron] sqlite getLowStock failed, falling back to Supabase:', err)
    }
  }

  const { getAdminDataClient } = await import('@/lib/supabase/admin-data')
  const supabase = await getAdminDataClient()

  const [{ data, error }, { data: templates }] = await Promise.all([
    supabase
      .from('products')
      .select('*, categories(id, name, store_id, created_at)')
      .eq('is_active', true)
      .eq('track_stock', true)
      .order('stock_quantity')
      .limit(200),
    supabase.from('stores').select('id').eq('is_template', true),
  ])

  if (error) throw new Error(error.message)

  const templateIds = new Set((templates ?? []).map((t) => t.id))

  return ((data ?? []) as ProductWithCategory[])
    .filter((p) => !templateIds.has(p.store_id))
    .filter((p) => p.stock_quantity <= p.min_stock)
}

export async function getCategories(): Promise<Category[]> {
  if (isElectron()) {
    try {
      const { getCategories: sqliteGet } = await import('@/lib/db/queries/products')
      return sqliteGet()
    } catch (err) {
      console.warn('[electron] sqlite getCategories failed, falling back to Supabase:', err)
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as Category[]
}

/** Escape characters that break PostgREST's `or()` filter syntax. */
function sanitizeForIlike(input: string): string {
  return input.replace(/[,()%]/g, ' ').trim()
}

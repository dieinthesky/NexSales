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

  if (params.search) {
    const s = sanitizeForIlike(params.search)
    query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`)
  }

  if (params.categoryId) {
    query = query.eq('category_id', params.categoryId)
  }

  if (params.stock === 'out') {
    query = query.lte('stock_quantity', 0)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.order('name').range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  let items = (data ?? []) as ProductWithCategory[]

  if (params.stock === 'low') {
    items = items.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock)
  } else if (params.stock === 'ok') {
    items = items.filter((p) => p.stock_quantity > p.min_stock)
  }

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

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id, name)')
    .eq('is_active', true)
    .order('stock_quantity')
    .limit(50)

  if (error) throw new Error(error.message)

  return ((data ?? []) as ProductWithCategory[]).filter(
    (p) => p.stock_quantity <= p.min_stock,
  )
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

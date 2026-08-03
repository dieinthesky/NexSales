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

/** Escape characters that break PostgREST's `or()` filter syntax. */
function sanitizeForIlike(input: string): string {
  return input.replace(/[,()%]/g, ' ').trim()
}

/**
 * Lista de produtos:
 * - Sempre tenta o catálogo na nuvem primeiro (igual ao site — contagem completa).
 * - No Electron, se offline/timeout, cai no SQLite local.
 */
export async function getProductsPaged(
  params: ProductsListParams = {},
): Promise<ProductsListResult> {
  try {
    return await getProductsPagedFromCloud(params)
  } catch (cloudErr) {
    if (isElectron()) {
      try {
        const { getProductsPaged: sqliteGet } = await import('@/lib/db/queries/products')
        return sqliteGet(params)
      } catch (err) {
        console.warn('[electron] cloud + sqlite getProductsPaged failed:', cloudErr, err)
      }
    }
    throw cloudErr
  }
}

async function getProductsPagedFromCloud(
  params: ProductsListParams,
): Promise<ProductsListResult> {
  // Desktop: service role + loja → mesma lista completa do site
  if (isElectron()) {
    try {
      return await getProductsPagedAdmin(params)
    } catch (err) {
      console.warn('[electron] admin product list failed, using user JWT:', err)
    }
  }

  return getProductsPagedUserClient(params)
}

async function getProductsPagedAdmin(
  params: ProductsListParams,
): Promise<ProductsListResult> {
  const { getCurrentUser } = await import('@/lib/auth/roles')
  const { getAdminDataClient, resolveAdminContext } = await import(
    '@/lib/supabase/admin-data'
  )
  const user = await getCurrentUser()
  if (!user) throw new Error('Não autenticado')
  const { storeId } = await resolveAdminContext(user)
  const supabase = await getAdminDataClient()

  return queryProductsPaged(supabase, params, storeId)
}

async function getProductsPagedUserClient(
  params: ProductsListParams,
): Promise<ProductsListResult> {
  const supabase = await createClient()
  return queryProductsPaged(supabase, params, null)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryProductsPaged(
  supabase: any,
  params: ProductsListParams,
  storeId: string | null,
): Promise<ProductsListResult> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))

  let query = supabase
    .from('products')
    .select('*, categories(id, name)', { count: 'exact' })
    .eq('is_active', true)
    .neq('code', '__PIX_LOJA__')
    .neq('code', '__ASSINATURA__')

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  if (params.search) {
    const s = sanitizeForIlike(params.search)
    query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`)
  }

  if (params.categoryId) {
    query = query.eq('category_id', params.categoryId)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

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
  try {
    if (isElectron()) {
      try {
        return await getLowStockAdmin()
      } catch {
        // fall through
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
  } catch (cloudErr) {
    if (isElectron()) {
      try {
        const { getLowStock: sqliteGet } = await import('@/lib/db/queries/products')
        return sqliteGet()
      } catch (err) {
        console.warn('[electron] getLowStock failed:', cloudErr, err)
      }
    }
    throw cloudErr
  }
}

async function getLowStockAdmin(): Promise<ProductWithCategory[]> {
  const { getCurrentUser } = await import('@/lib/auth/roles')
  const { getAdminDataClient, resolveAdminContext } = await import(
    '@/lib/supabase/admin-data'
  )
  const user = await getCurrentUser()
  if (!user) throw new Error('Não autenticado')
  const { storeId } = await resolveAdminContext(user)
  const supabase = await getAdminDataClient()

  let q = supabase
    .from('products')
    .select('*, categories(id, name, store_id, created_at)')
    .eq('is_active', true)
    .eq('track_stock', true)
    .order('stock_quantity')
    .limit(200)
  if (storeId) q = q.eq('store_id', storeId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as ProductWithCategory[]).filter(
    (p) => p.stock_quantity <= p.min_stock,
  )
}

export async function getCategories(): Promise<Category[]> {
  const { listCategoriesForCurrentStore } = await import('@/lib/queries/categories')

  // Sempre prefere nuvem (cura categorias / nomes). SQLite só se falhar offline.
  try {
    const cloud = await listCategoriesForCurrentStore()
    if (cloud.length > 0) return cloud
  } catch (err) {
    console.warn('[categories] cloud list failed:', err)
  }

  if (isElectron()) {
    try {
      const { getCategories: sqliteGet } = await import('@/lib/db/queries/products')
      return sqliteGet()
    } catch (err) {
      console.warn('[electron] sqlite getCategories failed:', err)
    }
  }

  return listCategoriesForCurrentStore()
}

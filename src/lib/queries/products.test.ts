/**
 * Verifies the Electron bypass: when isElectron() returns true the query
 * functions read from the local SQLite cache and never touch Supabase.
 *
 * This guards against the regression where the Supabase path was attempted
 * first, causing the tryQuery 3-second fallback timer to fire before the
 * catch block could return SQLite data — leaving Electron pages empty offline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Category, ProductWithCategory } from '@/types/database'

vi.mock('@/lib/db/client', () => ({ isElectron: vi.fn() }))
vi.mock('@/lib/db/queries/products', () => ({
  getProductsPaged: vi.fn(),
  getLowStock: vi.fn(),
  getCategories: vi.fn(),
}))
// Prevent any real Supabase client construction in non-Electron tests.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockRejectedValue(new Error('Supabase must not be called')),
}))

import { isElectron } from '@/lib/db/client'
import * as sqliteQueries from '@/lib/db/queries/products'
import { getProductsPaged, getLowStock, getCategories } from '@/lib/queries/products'

const isElectronMock = vi.mocked(isElectron)
const sqliteGetProductsPaged = vi.mocked(sqliteQueries.getProductsPaged)
const sqliteGetLowStock = vi.mocked(sqliteQueries.getLowStock)
const sqliteGetCategories = vi.mocked(sqliteQueries.getCategories)

const EMPTY_PAGED = { items: [] as ProductWithCategory[], total: 0, page: 1, pageSize: 20, totalPages: 1 }
const EMPTY_PRODUCTS: ProductWithCategory[] = []
const EMPTY_CATEGORIES: Category[] = []

beforeEach(() => {
  vi.clearAllMocks()
  isElectronMock.mockReturnValue(false)
})

describe('getProductsPaged — Electron path', () => {
  it('calls SQLite and returns its result', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetProductsPaged.mockResolvedValue(EMPTY_PAGED)

    const result = await getProductsPaged()

    expect(sqliteGetProductsPaged).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_PAGED)
  })

  it('forwards all params to the SQLite query', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetProductsPaged.mockResolvedValue(EMPTY_PAGED)

    const params = { search: 'café', page: 2, pageSize: 10 }
    await getProductsPaged(params)

    expect(sqliteGetProductsPaged).toHaveBeenCalledWith(params)
  })

  it('returns a non-empty list from SQLite when the cache has data', async () => {
    isElectronMock.mockReturnValue(true)
    const fakeProduct = {
      id: 'p-1', name: 'Café 500g', code: '001',
      sale_price: 12, cost_price: 6, stock_quantity: 30, min_stock: 5,
      is_active: true, track_stock: true, category_id: null, description: null, image_url: null,
      store_id: 'store-1', categories: null, created_at: '', updated_at: '',
    } satisfies ProductWithCategory
    sqliteGetProductsPaged.mockResolvedValue({
      items: [fakeProduct], total: 1, page: 1, pageSize: 20, totalPages: 1,
    })

    const result = await getProductsPaged({ search: 'café' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('Café 500g')
  })
})

describe('getLowStock — Electron path', () => {
  it('calls SQLite and returns its result', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetLowStock.mockResolvedValue(EMPTY_PRODUCTS)

    const result = await getLowStock()

    expect(sqliteGetLowStock).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_PRODUCTS)
  })
})

describe('getCategories — Electron path', () => {
  it('calls SQLite and returns its result', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetCategories.mockResolvedValue(EMPTY_CATEGORIES)

    const result = await getCategories()

    expect(sqliteGetCategories).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_CATEGORIES)
  })

  it('returns categories from SQLite', async () => {
    isElectronMock.mockReturnValue(true)
    const cats: Category[] = [
      { id: 'c-1', name: 'Bebidas', store_id: 'store-1', created_at: '2026-01-01T00:00:00Z' },
    ]
    sqliteGetCategories.mockResolvedValue(cats)

    const result = await getCategories()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bebidas')
  })
})
